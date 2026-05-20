import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

let BackgroundService: any = null;
if (Platform.OS === 'android' && Constants.executionEnvironment !== 'storeClient') {
  try { BackgroundService = require('react-native-background-actions').default; } catch (_) {}
}
import { CRITERIA_WEIGHTS, RATE_LIMIT_MS, UNIVERSE_MIN_PRICE, UNIVERSE_MIN_VOLUME } from '../constants';
import { delay, fetchCandles, fetchMarketCap, fetchNasdaqSymbols, fetchQuote, getApiKey } from '../services/finnhub';
import { useCriteriaStore } from '../store/criteriaStore';
import { usePortfolioStore } from '../store/portfolioStore';
import { useScanStore } from '../store/scanStore';
import { useSettingsStore } from '../store/settingsStore';
import { useSignalsStore } from '../store/signalsStore';
import { Signal, ScanUniverseStock } from '../types';
import { evaluateCriteria, meetsUniverseFilter } from '../utils/technicalAnalysis';

let scanAbortFlag = false;
let universeBuildAbortFlag = false;

export function abortScan() {
  scanAbortFlag = true;
  if (Platform.OS === 'android' && BackgroundService?.isRunning()) {
    BackgroundService.stop().catch(() => {});
  }
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

async function interruptibleDelay(ms: number): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (scanAbortFlag) return;
    await delay(Math.min(100, end - Date.now()));
  }
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
  if (!getApiKey()) return false;
  const { setUniverseBuildStatus, setUniverse } = useScanStore.getState();
  universeBuildAbortFlag = false;

  try {
    setUniverseBuildStatus('running', 0, 0);
    const stocks = await fetchNasdaqSymbols();
    await setUniverse(stocks);
    setUniverseBuildStatus('idle');
    return true;
  } catch (_) {
    setUniverseBuildStatus('error', 0, 0, 'Failed to fetch symbols. Check your API key.');
    return false;
  }
}

export async function runDailyScan(): Promise<void> {
  if (!getApiKey()) return;

  if (Platform.OS === 'android' && BackgroundService) {
    try {
      if (BackgroundService.isRunning()) await BackgroundService.stop();
      await BackgroundService.start(
        async () => { await _runDailyScanCore(); },
        {
          taskName: 'NasduckScan',
          taskTitle: '📊 Nasduck — Scanning',
          taskDesc: 'Scanning NASDAQ for signals…',
          taskIcon: { name: 'ic_launcher', type: 'mipmap' },
          color: '#00d4aa',
          linkingURI: 'nasduck://',
          parameters: {},
        }
      );
      return;
    } catch (e) {
      console.warn('Background service failed, running normally:', e);
    }
  }

  await _runDailyScanCore();
}

export async function stopBackgroundService() {
  if (Platform.OS === 'android' && BackgroundService?.isRunning()) {
    try { await BackgroundService.stop(); } catch (_) {}
  }
}

async function _runDailyScanCore(): Promise<void> {

  scanAbortFlag = false;

  const { stocks: portfolioStocks } = usePortfolioStore.getState();
  const { setScanStatus, incrementScanCounters, markScanComplete, addToSkipList, saveResumeIndex, clearResumeIndex, resumeIndex } = useScanStore.getState();
  const { addSignal, persist, clear } = useSignalsStore.getState();
  const { minChangePct } = useSettingsStore.getState();

  // Read criteria fresh right now (not captured as a stale snapshot)
  const buyCriteria = useCriteriaStore.getState().enabledBuyCriteria();
  const sellCriteria = useCriteriaStore.getState().enabledSellCriteria();

  if (buyCriteria.length === 0 && sellCriteria.length === 0) return;
  if (useScanStore.getState().universe.stocks.length === 0) return;

  const portfolioSymbols = new Set(portfolioStocks.map((s) => s.symbol));
  const targets = buildTargets();

  // If starting fresh (no resume), clear previous signals and reset counters
  const startFrom = resumeIndex ?? 0;
  if (startFrom === 0) {
    await clear();
    setScanStatus('scanning', 0, targets.length); // resets counters to 0
    useScanStore.setState((s) => ({
      scan: { ...s.scan, evaluated: 0, noData: 0, filtered: 0 },
    }));
  }

  setScanStatus('scanning', startFrom, targets.length);

  const to = Math.floor(Date.now() / 1000);
  const from = to - 86400 * 260;

  const failedFilter: string[] = [];
  const marketCapCriteriaEnabled = buyCriteria.some(c => c.id === 'min_market_cap');

  for (let i = startFrom; i < targets.length; i++) {
    if (scanAbortFlag) {
      // Save where we stopped so we can resume
      await saveResumeIndex(i);
      await persist(); // flush signals found so far to storage
      setScanStatus('idle');
      return;
    }

    const stock = targets[i];
    setScanStatus('scanning', i + 1, targets.length);
    const [candles, stockMarketCap] = await Promise.all([
      fetchCandles(stock.symbol, 'D', from, to),
      marketCapCriteriaEnabled ? fetchMarketCap(stock.symbol) : Promise.resolve(null),
    ]);

    if (scanAbortFlag) {
      await saveResumeIndex(i);
      await persist();
      setScanStatus('idle');
      return;
    }

    if (!candles || candles.close.length < 20) {
      incrementScanCounters({ noData: 1 });
      await interruptibleDelay(RATE_LIMIT_MS);
      continue;
    }

    const isPortfolioStock = portfolioSymbols.has(stock.symbol);

    if (!isPortfolioStock && !meetsUniverseFilter(candles, UNIVERSE_MIN_PRICE, UNIVERSE_MIN_VOLUME)) {
      failedFilter.push(stock.symbol);
      incrementScanCounters({ filtered: 1 });
      await interruptibleDelay(RATE_LIMIT_MS);
      continue;
    }

    incrementScanCounters({ evaluated: 1 });

    const currentPrice = candles.close[candles.close.length - 1];
    const prevPrice = candles.close[candles.close.length - 2];
    const changePercent = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

    // Always read criteria fresh so changes take effect without restarting
    const { enabledBuyCriteria, enabledSellCriteria, matchMode } = useCriteriaStore.getState();
    const liveBuyCriteria = enabledBuyCriteria();
    const liveSellCriteria = enabledSellCriteria();

    const buyResults = liveBuyCriteria.map((c) => {
      if (c.id === 'min_market_cap') {
        const minCap = c.threshold * 1_000_000_000;
        const matched = stockMarketCap != null && stockMarketCap >= minCap;
        return {
          c,
          result: {
            matched,
            detail: stockMarketCap != null ? `Cap: $${(stockMarketCap / 1e9).toFixed(2)}B` : 'Cap: unknown',
          },
        };
      }
      return { c, result: evaluateCriteria(c, candles) };
    });
    const sellResults = isPortfolioStock
      ? liveSellCriteria.map((c) => ({ c, result: evaluateCriteria(c, candles) }))
      : [];

    // min_market_cap is a hard filter — must pass regardless of matchMode
    if (marketCapCriteriaEnabled && !isPortfolioStock) {
      const capResult = buyResults.find(r => r.c.id === 'min_market_cap');
      if (capResult && !capResult.result?.matched) {
        incrementScanCounters({ filtered: 1 });
        await interruptibleDelay(RATE_LIMIT_MS);
        continue;
      }
    }

    const matchedBuy = buyResults.filter((r) => r.result?.matched);
    const matchedSell = sellResults.filter((r) => r.result?.matched);

    // Apply match mode: 'any' = at least one match, 'all' = every enabled criteria matched
    const buyPassed = liveBuyCriteria.length === 0 ? false
      : matchMode === 'any' ? matchedBuy.length > 0
      : matchedBuy.length === liveBuyCriteria.length;

    const sellPassed = liveSellCriteria.length === 0 || !isPortfolioStock ? false
      : matchMode === 'any' ? matchedSell.length > 0
      : matchedSell.length === liveSellCriteria.length;

    if (Math.abs(changePercent) < minChangePct) {
      incrementScanCounters({ filtered: 1 });
      await interruptibleDelay(RATE_LIMIT_MS);
      continue;
    }

    const matchedCriteria: string[] = [
      ...matchedBuy.filter(r => r.c.id !== 'min_market_cap').map((r) => `${r.c.name}: ${r.result!.detail}`),
      ...matchedSell.map((r) => `${r.c.name}: ${r.result!.detail}`),
    ];

    if (buyPassed || sellPassed) {
      const hasSell = sellPassed;
      const allMatched = [...matchedBuy, ...matchedSell].filter(r => r.c.id !== 'min_market_cap');
      const score = Math.round(allMatched.reduce((sum, r) => {
        const baseWeight = CRITERIA_WEIGHTS[r.c.id] ?? 1;
        // trending_up/down: scale by price change % (min 1pt, no cap — bigger move = higher score)
        if ((r.c.id === 'trending_up' || r.c.id === 'trending_down') && r.result?.value != null) {
          const absPct = Math.abs(r.result.value);
          const dynamicWeight = Math.max(baseWeight, absPct / 2); // 2% move = 1pt, 10% = 5pts, etc.
          return sum + (r.c.id === 'trending_down' ? -dynamicWeight : dynamicWeight);
        }
        return sum + baseWeight;
      }, 0));
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
      };
      addSignal(signal); // shows up in the list immediately
    }

    await interruptibleDelay(RATE_LIMIT_MS);
  }

  if (failedFilter.length > 0) await addToSkipList(failedFilter);

  await persist(); // flush all signals to storage
  await clearResumeIndex();
  markScanComplete();

  const { signals } = useSignalsStore.getState();
  if (signals.length > 0) await sendScanNotification(signals);

  if (Platform.OS === 'android' && BackgroundService?.isRunning()) {
    try { await BackgroundService.stop(); } catch (_) {}
  }
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
