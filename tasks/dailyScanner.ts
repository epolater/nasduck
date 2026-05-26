import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { CRITERIA_WEIGHTS, RATE_LIMIT_MS, UNIVERSE_MIN_PRICE, UNIVERSE_MIN_VOLUME } from '../constants';
import { delay, fetchCandles, fetchNasdaqByMarketCap } from '../services/finnhub';
import { fetchOptionsData } from '../services/options';
import { useCriteriaStore } from '../store/criteriaStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useScanStore } from '../store/scanStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSignalsStore } from '../store/signalsStore';
import { Signal, ScanUniverseStock } from '../types';
import { evaluateCriteria, meetsUniverseFilter } from '../utils/technicalAnalysis';

// Foreground service — keeps Android from killing the app during long scans
// register() MUST be called at module level before start() is ever called
let ForegroundService: any = null;
if (Platform.OS === 'android') {
  ForegroundService = (require('@supersami/rn-foreground-service') as any).default;
  // Register the headless JS task that the native service runner expects.
  // Without this, runTask() (called internally by start()) silently fails.
  try {
    ForegroundService.register({ config: { alert: false } });
    console.log('[FG] Registered foreground task');
  } catch (e) {
    console.log('[FG] Register error:', e);
  }
}

async function startForegroundService(current: number, total: number) {
  if (!ForegroundService) return;
  try {
    await ForegroundService.start({
      id: 1,
      title: 'Nasduck — Scanning',
      message: `Scanning ${current}/${total} stocks…`,
      importance: 'high',
      ServiceType: 'dataSync',
      visibility: 'public',
      number: `${current}`,
      ongoing: true,
    });
    console.log('[FG] Foreground service started');
  } catch (e) { console.log('[FG] Start error:', e); }
}

async function updateForegroundService(current: number, total: number, signals: number) {
  if (!ForegroundService) return;
  try {
    await ForegroundService.update({
      id: 1,
      title: 'Nasduck — Scanning',
      message: `Scanning ${current}/${total} stocks… ${signals} signals`,
      ServiceType: 'dataSync',
      ongoing: true,
    });
  } catch (_) {}
}

async function stopForegroundService() {
  if (!ForegroundService) return;
  try { await ForegroundService.stop(); } catch (_) {}
}

let scanAbortFlag = false;
let universeBuildAbortFlag = false;

export function abortScan() {
  scanAbortFlag = true;
}

export async function restartScan() {
  // Abort any running scan, clear resume index + signals, then start fresh
  scanAbortFlag = true;
  // Give the running loop one tick to notice the flag before we reset state
  await new Promise((r) => setTimeout(r, 150));
  const { clearResumeIndex } = useScanStore.getState();
  await clearResumeIndex();
  const { clear } = useSignalsStore.getState();
  await clear();
  scanAbortFlag = false;
  runDailyScan();
}

export function abortUniverseBuild() {
  universeBuildAbortFlag = true;
}

function buildTargets(): ScanUniverseStock[] {
  const { universe, skipList } = useScanStore.getState();
  const { enabledBuyCriteria, enabledSellCriteria } = useCriteriaStore.getState();
  const { stocks: portfolioStocks } = usePortfolioStore.getState();

  const allSymbols = new Map<string, string>();

  if (enabledBuyCriteria().length > 0) {
    universe.stocks
      .filter((s) => !skipList.has(s.symbol))
      .forEach((s) => allSymbols.set(s.symbol, s.name));
  }

  if (enabledSellCriteria().length > 0) {
    portfolioStocks.forEach((s) => allSymbols.set(s.symbol, s.name));
  }

  return Array.from(allSymbols.entries()).map(([symbol, name]) => ({ symbol, name }));
}

export async function buildUniverse(): Promise<boolean> {
  const { setUniverseBuildStatus, setUniverse } = useScanStore.getState();
  universeBuildAbortFlag = false;

  try {
    const { universeTier } = useSettingsStore.getState();
    setUniverseBuildStatus('running', 0, 1);

    // Use NASDAQ screener tiers for coarse universe filtering
    const nasdaqData = await fetchNasdaqByMarketCap(universeTier);
    console.log(`[Universe] NASDAQ screener returned ${nasdaqData.size} stocks (tier >$${universeTier}B)`);

    const stocks = Array.from(nasdaqData.entries()).map(([symbol, v]) => ({ symbol, name: v.name }));
    console.log(`[Universe] Built ${stocks.length} stocks`);

    await setUniverse(stocks);
    setUniverseBuildStatus('idle');
    return true;
  } catch (e: any) {
    setUniverseBuildStatus('error', 0, 0, 'Failed to fetch symbols from NASDAQ screener.');
    return false;
  }
}

// ── Scan loop state — held outside any closure so each headless-task tick can
//    pick up where the previous one left off ────────────────────────────────
type ScanCtx = {
  targets: ScanUniverseStock[];
  portfolioSymbols: Set<string>;
  from: number;
  to: number;
  marketCapFilterEnabled: boolean;
  minMarketCap: number;
  minChangePct: number;
  failedFilter: string[];
  i: number;
  isRunning: boolean; // reentrancy guard — taskRunner fires every 500ms
};

let scanCtx: ScanCtx | null = null;
const SCAN_TASK_ID = 'nasduck-scan';

export async function runDailyScan(): Promise<void> {
  scanAbortFlag = false;

  const { stocks: portfolioStocks } = usePortfolioStore.getState();
  const { setScanStatus } = useScanStore.getState();
  const { clear } = useSignalsStore.getState();
  const { minChangePct, minMarketCap } = useSettingsStore.getState();

  const buyCriteria = useCriteriaStore.getState().enabledBuyCriteria();
  const sellCriteria = useCriteriaStore.getState().enabledSellCriteria();

  if (buyCriteria.length === 0 && sellCriteria.length === 0) return;
  if (useScanStore.getState().universe.stocks.length === 0) return;

  const targets = buildTargets();
  const { resumeIndex } = useScanStore.getState();
  const startFrom = resumeIndex ?? 0;

  if (startFrom === 0) {
    await clear();
    setScanStatus('scanning', 0, targets.length);
    useScanStore.setState((s) => ({
      scan: { ...s.scan, evaluated: 0, noData: 0, filtered: 0 },
    }));
  }

  setScanStatus('scanning', startFrom, targets.length);

  scanCtx = {
    targets,
    portfolioSymbols: new Set(portfolioStocks.map((s) => s.symbol)),
    from: Math.floor(Date.now() / 1000) - 86400 * 260,
    to: Math.floor(Date.now() / 1000),
    marketCapFilterEnabled: minMarketCap > 0,
    minMarketCap,
    minChangePct,
    failedFilter: [],
    i: startFrom,
    isRunning: false,
  };

  await startForegroundService(startFrom, targets.length);

  if (ForegroundService) {
    try {
      // Remove any leftover task from a previous run
      ForegroundService.remove_task(SCAN_TASK_ID);
    } catch (_) {}
    try {
      ForegroundService.add_task(scanOneIteration, {
        delay: RATE_LIMIT_MS,
        onLoop: true,
        taskId: SCAN_TASK_ID,
        onError: (e: any) => console.log('[SCAN] task error', e),
      });
      console.log(`[SCAN] add_task registered — looping every ${RATE_LIMIT_MS}ms`);
    } catch (e) {
      console.log('[SCAN] add_task failed', e);
    }
  } else {
    // iOS / dev fallback — run synchronously
    while (scanCtx && !scanAbortFlag && scanCtx.i < scanCtx.targets.length) {
      await scanOneIteration();
      await delay(RATE_LIMIT_MS);
    }
    await finalizeScan();
  }
}

async function scanOneIteration(): Promise<void> {
  const ctx = scanCtx;
  if (!ctx) return;
  if (ctx.isRunning) return; // taskRunner ticks every 500ms; skip if previous still in flight
  ctx.isRunning = true;

  try {
    if (scanAbortFlag) {
      const { saveResumeIndex } = useScanStore.getState();
      await saveResumeIndex(ctx.i);
      await useSignalsStore.getState().persist();
      useScanStore.getState().setScanStatus('idle');
      await teardownScanTask();
      return;
    }

    if (ctx.i >= ctx.targets.length) {
      await finalizeScan();
      return;
    }

    console.log(`[SCAN] tick i=${ctx.i}/${ctx.targets.length}`);

    const { incrementScanCounters, setScanStatus } = useScanStore.getState();
    const { addSignal } = useSignalsStore.getState();
    const stock = ctx.targets[ctx.i];

    setScanStatus('scanning', ctx.i + 1, ctx.targets.length);
    const signalCount = useSignalsStore.getState().signals.length;
    await updateForegroundService(ctx.i + 1, ctx.targets.length, signalCount);

    const fetchStart = Date.now();
    const candles = await fetchCandles(stock.symbol, 'D', ctx.from, ctx.to);
    const fetchMs = Date.now() - fetchStart;
    if (fetchMs > 15000) console.warn(`[SCAN] fetchCandles(${stock.symbol}) took ${fetchMs}ms`);

    const stockMarketCap = candles?.marketCap ?? null;

    if (!candles || candles.close.length < 20) {
      incrementScanCounters({ noData: 1 });
      ctx.i++;
      return;
    }

    const isPortfolioStock = ctx.portfolioSymbols.has(stock.symbol);

    if (!isPortfolioStock && !meetsUniverseFilter(candles, UNIVERSE_MIN_PRICE, UNIVERSE_MIN_VOLUME)) {
      ctx.failedFilter.push(stock.symbol);
      incrementScanCounters({ filtered: 1 });
      ctx.i++;
      return;
    }

    if (ctx.marketCapFilterEnabled && !isPortfolioStock) {
      const minCap = ctx.minMarketCap * 1_000_000_000;
      if (!stockMarketCap || stockMarketCap < minCap) {
        incrementScanCounters({ filtered: 1 });
        ctx.i++;
        return;
      }
    }

    incrementScanCounters({ evaluated: 1 });

    const currentPrice = candles.close[candles.close.length - 1];
    const prevPrice = candles.close[candles.close.length - 2];
    const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    const { enabledBuyCriteria, enabledSellCriteria, matchMode } = useCriteriaStore.getState();
    const liveBuyCriteria = enabledBuyCriteria();
    const liveSellCriteria = enabledSellCriteria();

    const buyResults = liveBuyCriteria.map((c) => ({ c, result: evaluateCriteria(c, candles) }));
    const sellResults = isPortfolioStock
      ? liveSellCriteria.map((c) => ({ c, result: evaluateCriteria(c, candles) }))
      : [];

    const matchedBuy = buyResults.filter((r) => r.result?.matched);
    const matchedSell = sellResults.filter((r) => r.result?.matched);

    const buyPassed = liveBuyCriteria.length === 0 ? false
      : matchMode === 'any' ? matchedBuy.length > 0
      : matchedBuy.length === liveBuyCriteria.length;

    const sellPassed = liveSellCriteria.length === 0 || !isPortfolioStock ? false
      : matchMode === 'any' ? matchedSell.length > 0
      : matchedSell.length === liveSellCriteria.length;

    if (Math.abs(changePercent) < ctx.minChangePct) {
      incrementScanCounters({ filtered: 1 });
      ctx.i++;
      return;
    }

    const matchedCriteria: string[] = [
      ...matchedBuy.filter((r) => r.c.id !== 'min_market_cap').map((r) => `${r.c.name}: ${r.result!.detail}`),
      ...matchedSell.map((r) => `${r.c.name}: ${r.result!.detail}`),
    ];

    if (buyPassed || sellPassed) {
      const hasSell = sellPassed;
      const allMatched = [...matchedBuy, ...matchedSell].filter((r) => r.c.id !== 'min_market_cap');
      const weights = { ...CRITERIA_WEIGHTS, ...useSettingsStore.getState().criteriaWeights };
      let score = Math.round(allMatched.reduce((sum, r) => {
        const baseWeight = weights[r.c.id] ?? 1;
        if ((r.c.id === 'trending_up' || r.c.id === 'trending_down') && r.result?.value != null) {
          const absPct = Math.abs(r.result.value);
          const dynamicWeight = Math.max(baseWeight, absPct / 2);
          return sum + (r.c.id === 'trending_down' ? -dynamicWeight : dynamicWeight);
        }
        return sum + baseWeight;
      }, 0));

      let optionsData = undefined;
      try {
        optionsData = await fetchOptionsData(stock.symbol);
        const optionsCriteria = enabledBuyCriteria().filter((c) =>
          ['put_call_ratio_low', 'put_call_ratio_high', 'high_iv', 'near_max_pain'].includes(c.id)
        );
        for (const c of optionsCriteria) {
          let matched = false;
          let detail = '';
          if (c.id === 'put_call_ratio_low' && optionsData.pcr != null) {
            matched = optionsData.pcr < 0.7;
            detail = `PCR: ${optionsData.pcr.toFixed(2)}`;
          } else if (c.id === 'put_call_ratio_high' && optionsData.pcr != null) {
            matched = optionsData.pcr > 1.0;
            detail = `PCR: ${optionsData.pcr.toFixed(2)}`;
          } else if (c.id === 'high_iv' && optionsData.ivAvg != null) {
            matched = optionsData.ivAvg > 0.4;
            detail = `IV: ${(optionsData.ivAvg * 100).toFixed(1)}%`;
          } else if (c.id === 'near_max_pain' && optionsData.maxPain != null) {
            matched = Math.abs(currentPrice - optionsData.maxPain) / optionsData.maxPain < 0.03;
            detail = `MaxPain: $${optionsData.maxPain.toFixed(2)}`;
          }
          if (matched) {
            matchedCriteria.push(`${c.name}: ${detail}`);
            score += weights[c.id] ?? 1;
          }
        }
      } catch (_) {}

      const signal: Signal = {
        id: `${stock.symbol}-${Date.now()}`,
        symbol: stock.symbol,
        name: stock.name,
        signal: hasSell ? 'sell' : 'buy',
        matchedCriteria,
        score,
        price: currentPrice,
        changePercent,
        generatedAt: Date.now(),
        marketCap: stockMarketCap ?? candles.marketCap ?? null,
        optionsData,
      };
      addSignal(signal);
    }

    ctx.i++;
  } finally {
    if (scanCtx) scanCtx.isRunning = false;
  }
}

async function finalizeScan() {
  const ctx = scanCtx;
  if (!ctx) return;
  const { addToSkipList, markScanComplete, clearResumeIndex } = useScanStore.getState();
  const { persist } = useSignalsStore.getState();

  if (ctx.failedFilter.length > 0) await addToSkipList(ctx.failedFilter);
  await persist();
  await clearResumeIndex();
  markScanComplete();

  await teardownScanTask();

  const { signals } = useSignalsStore.getState();
  if (signals.length > 0) await sendScanNotification(signals);
}

async function teardownScanTask() {
  scanCtx = null;
  if (ForegroundService) {
    try { ForegroundService.remove_task(SCAN_TASK_ID); } catch (_) {}
  }
  await stopForegroundService();
}

async function sendScanNotification(signals: Signal[]) {
  const buyCount = signals.filter((s) => s.signal === 'buy').length;
  const sellCount = signals.filter((s) => s.signal === 'sell').length;
  const parts: string[] = [];
  if (buyCount > 0) parts.push(`${buyCount} buy signal${buyCount > 1 ? 's' : ''}`);
  if (sellCount > 0) parts.push(`${sellCount} sell signal${sellCount > 1 ? 's' : ''}`);

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📊 Nasduck — Signals found',
        body: `${parts.join(', ')}. Tap to review.`,
        data: { screen: 'signals' },
        sound: 'default',
      },
      trigger: null,
    });
  } catch (_) {}
}

export function isScanDue(lastScanAt: number | null, scanHour: number, scanMinute: number): boolean {
  const now = new Date();
  const todaysScanTime = new Date();
  todaysScanTime.setHours(scanHour, scanMinute, 0, 0);

  if (now < todaysScanTime) return false;
  if (lastScanAt === null) return true;

  const lastScan = new Date(lastScanAt);
  if (lastScan >= todaysScanTime && lastScan.toDateString() === now.toDateString()) {
    return false;
  }
  return true;
}

export async function scheduleDailyNotification(hour: number, minute: number) {
  await Notifications.cancelAllScheduledNotificationsAsync();
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '⏰ Nasduck Daily Scan',
        body: 'Open Nasduck to run your daily stock scan.',
        data: { screen: 'signals' },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (_) {}
}
