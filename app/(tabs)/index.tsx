import { useRouter } from 'expo-router';
import { useKeepAwake } from 'expo-keep-awake';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

const ROW_H    = 40;
const HEADER_H = 36;
import { COLORS, CLOUD_SERVER_URL } from '../../constants';
import { getApiKey } from '../../services/finnhub';
import { useCriteriaStore } from '../../store/criteriaStore';
import { useScanStore } from '../../store/scanStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useSignalsStore } from '../../store/signalsStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { abortScan, isScanDue, restartScan, runDailyScan } from '../../tasks/dailyScanner';
import * as Notifications from 'expo-notifications';
import { triggerServerScan, stopServerScan, getCloudScanStatus, registerWithServer, getDeviceId } from '../../services/serverSync';
import { useServerLogStore } from '../../store/serverLogStore';
import { serverWakeupEmitter } from '../_layout';
import { Signal } from '../../types';
import Svg, { Path } from 'react-native-svg';

function CloudIcon({ size = 13, color = COLORS.primary }: { size?: number; color?: string }) {
  return (
    <Svg width={size * 1.4} height={size} viewBox="0 0 20 14" fill="none">
      <Path
        d="M15.5 13H5a4 4 0 1 1 .8-7.93A4.5 4.5 0 1 1 15.5 13z"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

// Column widths
const COL_SYMBOL   = 64;
const COL_SCORE    = 52;
const COL_PRICE    = 68;
const COL_PCT      = 60;
const COL_TREND    = 60;
const COL_CRITERIA = 44;

type SortDir = 'asc' | 'desc';
type SortCol = 'symbol' | 'score' | 'price' | 'pct' | 'trend' | string;

/** Extract trend % from matchedCriteria strings e.g. "Trending Up: 3 up days (+2.34%)" → 2.34 */
function extractTrendPct(matchedCriteria: string[]): number | null {
  for (const c of matchedCriteria) {
    if (c.startsWith('Trending Up:') || c.startsWith('Trending Down:')) {
      const m = c.match(/\(([+-]?\d+\.?\d*)%\)/);
      if (m) return parseFloat(m[1]);
    }
  }
  return null;
}

/** Turn "RSI Oversold" → "RSO", "Trending Up" → "TU" */
function initials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SignalsScreen() {
  const router = useRouter();
  const signals = useSignalsStore((s) => s.signals);
  const scan = useScanStore((s) => s.scan);
  const universe = useScanStore((s) => s.universe);
  const resumeIndex = useScanStore((s) => s.resumeIndex);
  const { scanHour, scanMinute, minScore, minMarketCap, serverRegistered } = useSettingsStore();
  const { criteria } = useCriteriaStore();
  const isWatched = useWatchlistStore((s) => s.has);
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<SortCol>('score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [cloudScanning, setCloudScanning] = useState(false);
  const [cloudPhase, setCloudPhase] = useState<string>('');
  const [cloudResumeIndex, setCloudResumeIndex] = useState<number | null>(null);
  const [cloudTotal, setCloudTotal] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { addLog } = useServerLogStore();
  const appState = useRef(AppState.currentState);

  // Animated values drive frozen column + header in sync
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const negX = useRef(Animated.multiply(scrollX, -1)).current;
  const negY = useRef(Animated.multiply(scrollY, -1)).current;

  const isScanning = scan.status === 'scanning';

  // Keep screen awake while scan is running
  useKeepAwake(isScanning ? 'nasduck-scan' : undefined);

  useEffect(() => { setActiveFilters(new Set()); setSortCol('score'); setSortDir('desc'); }, [tab]);

  function handleSort(col: SortCol) {
    setSortCol((prev) => {
      if (prev === col) {
        setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
        return col;
      }
      setSortDir(col === 'symbol' ? 'asc' : 'desc');
      return col;
    });
  }

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        if (serverRegistered) checkServerScanState();
        else checkAndRunScan();
      }
      appState.current = next;
    });
    if (serverRegistered) { checkServerScanState(); }
    else checkAndRunScan();
    return () => sub.remove();
  }, [scanHour, scanMinute, serverRegistered]);

  // On open/resume: sync with server state
  async function checkServerScanState() {
    addLog(`Checking server… (${CLOUD_SERVER_URL})`, 'info');
    const { data: status, error } = await getCloudScanStatus();

    if (!status) {
      addLog(`❌ ${error ?? 'No response'}`, 'err');
      // If 404 (not registered), auto-register and retry once
      if (error?.includes('404') || error?.includes('not registered')) {
        addLog('Device not registered — registering now…', 'info');
        const { universe } = useScanStore.getState();
        addLog(`Sending universe: ${universe.stocks.length} stocks`, 'info');
        const reg = await registerWithServer();
        addLog(reg.ok ? `✅ Registered: ${reg.message}` : `❌ Register failed: ${reg.error}`, reg.ok ? 'ok' : 'err');
        if (reg.ok) {
          const retry = await getCloudScanStatus();
          if (retry.data) {
            addLog('✅ Server reachable after re-register', 'ok');
          }
        }
      }
      return;
    }

    addLog(`scanning=${status.scanning}  phase=${status.phase ?? 'idle'}  ${status.progress}/${status.total}`, 'info');
    if (status.resumeIndex) {
      setCloudResumeIndex(status.resumeIndex);
      setCloudTotal(status.universeTotal);
      addLog(`⏸ Paused at ${status.resumeIndex}/${status.universeTotal} — tap Continue to resume`, 'info');
    }
    if (status.lastScanAt) {
      const d = new Date(status.lastScanAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      addLog(`Last scan: ${d}  (${status.lastSignals?.length ?? 0} signals)`, 'ok');
    } else if (!status.resumeIndex) {
      addLog('No previous scan on server', 'info');
    }

    if (status.scanning) {
      addLog('Server is already scanning — resuming…', 'info');
      setCloudScanning(true);
      startCloudPolling();
    } else {
      // Always sync signals and lastScanAt from server — covers crash/restart case
      if (status.lastSignals?.length > 0) {
        setSignals(status.lastSignals);
        addLog(`Loaded ${status.lastSignals.length} signals from server`, 'ok');
      }
      if (status.lastScanAt) {
        useScanStore.getState().markScanComplete();
        useScanStore.setState(s => ({ scan: { ...s.scan, lastScanAt: status.lastScanAt, status: 'done' } }));
      }
      checkAndRunScan();
    }
  }

  // Poll server for live progress while cloud scanning
  const setSignals = useSignalsStore((s) => s.setSignals);

  function startCloudPolling() {
    stopCloudPolling();
    let lastEvaluated = 0, lastNoData = 0, lastFiltered = 0;
    let lastPhase = '';
    let seenScanning = false;
    let pollCount = 0;

    useScanStore.getState().setScanStatus('scanning', 0, 0);
    addLog('Polling server for scan status…', 'info');

    pollRef.current = setInterval(async () => {
      pollCount++;
      const { data: status, error } = await getCloudScanStatus();

      if (!status) {
        addLog(`Poll #${pollCount}: ${error ?? 'no response'}`, 'err');
        return;
      }

      if (status.phase !== lastPhase) {
        const phaseLabel: Record<string, string> = {
          starting: 'Server starting scan…',
          loading_universe: `Loading stock universe…`,
          scanning: `Scan loop started (${status.total} stocks)`,
          idle: 'Scan idle',
        };
        addLog(phaseLabel[status.phase ?? ''] ?? `Phase: ${status.phase}`, 'info');
        lastPhase = status.phase ?? '';
      }

      const { setScanStatus, incrementScanCounters, markScanComplete } = useScanStore.getState();

      if (status.scanning) {
        seenScanning = true;
        setCloudPhase(status.phase ?? 'scanning');
        setScanStatus('scanning', status.progress, status.total);
        const dEval = status.evaluated - lastEvaluated;
        const dNoData = status.noData - lastNoData;
        const dFiltered = status.filtered - lastFiltered;
        if (dEval > 0 || dNoData > 0 || dFiltered > 0) {
          incrementScanCounters({ evaluated: dEval, noData: dNoData, filtered: dFiltered });
          lastEvaluated = status.evaluated;
          lastNoData = status.noData;
          lastFiltered = status.filtered;
        }
        if (status.signals?.length > 0) {
          setSignals(status.signals);
          addLog(`🎯 ${status.signals.length} match${status.signals.length !== 1 ? 'es' : ''} found so far`, 'ok');
        }
      } else if (seenScanning) {
        stopCloudPolling();
        setCloudScanning(false);
        setCloudResumeIndex(null);
        markScanComplete();
        if (status.lastSignals?.length > 0) {
          setSignals(status.lastSignals);
          addLog(`✅ Scan complete — ${status.lastSignals.length} signals found`, 'ok');
        } else {
          addLog('✅ Scan complete — no signals found', 'ok');
        }
        if (status.lastScanAt) {
          useScanStore.setState(s => ({ scan: { ...s.scan, lastScanAt: status.lastScanAt, status: 'done' } }));
        }
      }
    }, 2000);
  }

  function stopCloudPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  async function startCloudScan(fresh: boolean) {
    if (fresh) useServerLogStore.getState().clear();
    setCloudScanning(true);
    const { universe } = useScanStore.getState();
    addLog(fresh ? 'Starting fresh scan on server…' : 'Continuing scan on server…', 'info');
    addLog(`Device: ${getDeviceId()}`, 'info');
    let result = await triggerServerScan(fresh);
    if (!result.ok && result.error?.includes('404')) {
      addLog('Device not registered — re-registering…', 'info');
      addLog(`Sending universe: ${universe.stocks.length} stocks`, 'info');
      const regResult = await registerWithServer();
      addLog(regResult.ok ? `✅ Registered: ${regResult.message}` : `❌ Register failed: ${regResult.error}`, regResult.ok ? 'ok' : 'err');
      if (regResult.ok) result = await triggerServerScan(fresh);
    }
    if (result.ok) {
      addLog(`✅ Server accepted — ${result.resumeIndex ? `continuing from ${result.resumeIndex}/${result.total}` : 'fresh scan'}`, 'ok');
      if (fresh) setCloudResumeIndex(null);
      startCloudPolling();
    } else {
      addLog(`❌ Scan failed: ${result.error}`, 'err');
      setCloudScanning(false);
      useScanStore.getState().setScanStatus('error', 0, 0, result.error ?? 'Could not reach server');
    }
  }

  // Reset on unmount
  useEffect(() => () => stopCloudPolling(), []);

  // Listen for server wakeup — auto-start polling if scan kicked off while app is open
  useEffect(() => {
    const handler = () => {
      if (!cloudScanning) {
        addLog('📡 Scheduled scan started — showing live progress…', 'ok');
        setCloudScanning(true);
        startCloudPolling();
      }
    };
    serverWakeupEmitter.on('scanStarted', handler);
    return () => { serverWakeupEmitter.off('scanStarted', handler); };
  }, [cloudScanning]);

  // Push notification listener — react to scan completion notifications
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener(() => {
      stopCloudPolling();
      setCloudScanning(false);
      useScanStore.getState().markScanComplete();
    });
    return () => sub.remove();
  }, []);

  function checkAndRunScan() {
    if (serverRegistered) return; // server handles its own schedule
    if (!getApiKey()) return;
    if (isScanning) return;
    if (universe.stocks.length === 0) return;
    const { lastScanAt } = useScanStore.getState().scan;
    if (isScanDue(lastScanAt, scanHour, scanMinute)) {
      runDailyScan();
    }
  }

  function toggleFilter(name: string) {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }

  const buySignals  = signals.filter((s) => s.signal === 'buy');
  const sellSignals = signals.filter((s) => s.signal === 'sell');
  const tabSignals  = tab === 'buy' ? buySignals : sellSignals;
  const accentColor = tab === 'buy' ? COLORS.buy : COLORS.sell;

  // All criteria names that appear in the current tab's signals (column headers)
  const columns = useMemo(() => {
    const names = new Set<string>();
    tabSignals.forEach((s) =>
      s.matchedCriteria.forEach((c) => names.add(c.split(':')[0].trim()))
    );
    return Array.from(names).sort();
  }, [tabSignals]);

  // AND filter + sort
  const displayed = useMemo(() => {
    let rows = tabSignals;
    if (tab === 'buy') rows = rows.filter((s) => s.score >= minScore);
    if (minMarketCap > 0) {
      const minCapRaw = minMarketCap * 1_000_000_000;
      rows = rows.filter((s) => s.marketCap == null || s.marketCap >= minCapRaw);
    }
    if (activeFilters.size > 0) {
      rows = rows.filter((s) => {
        const matched = new Set(s.matchedCriteria.map((c) => c.split(':')[0].trim()));
        return [...activeFilters].every((f) => matched.has(f));
      });
    }
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      if (sortCol === 'symbol') return dir * a.symbol.localeCompare(b.symbol);
      if (sortCol === 'score')  return dir * (a.score - b.score);
      if (sortCol === 'price')  return dir * (a.price - b.price);
      if (sortCol === 'pct')    return dir * (a.changePercent - b.changePercent);
      if (sortCol === 'trend')  return dir * ((extractTrendPct(a.matchedCriteria) ?? -999) - (extractTrendPct(b.matchedCriteria) ?? -999));
      // criteria column: matched rows first
      const aHas = a.matchedCriteria.some((c) => c.split(':')[0].trim() === sortCol) ? 1 : 0;
      const bHas = b.matchedCriteria.some((c) => c.split(':')[0].trim() === sortCol) ? 1 : 0;
      return dir * (aHas - bHas);
    });
  }, [tabSignals, activeFilters, sortCol, sortDir, minScore, minMarketCap]);

  const lastScan = scan.lastScanAt
    ? new Date(scan.lastScanAt).toLocaleString([], {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      })
    : null;

  return (
    <View style={styles.container}>
      {/* ── Scan status bar ─────────────────────────────────────────── */}
      {isScanning ? (
        <View style={styles.scanningBar}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.scanningText}>
              {serverRegistered && <><CloudIcon />{' '}</>}
              {serverRegistered && (cloudPhase === 'loading_universe')
                ? 'Loading stock universe…'
                : serverRegistered && (cloudPhase === 'starting' || cloudPhase === '')
                ? 'Starting scan…'
                : `Scanning… ${scan.progress}/${scan.total}`}
              {(cloudPhase === 'scanning' || !serverRegistered) && scan.total > 0 && (
                <Text style={styles.scanningDetail}>
                  {'  '}✓{scan.evaluated} · ∅{scan.noData} · ⊘{scan.filtered}
                </Text>
              )}
            </Text>
            {signals.length > 0 && (
              <Text style={styles.scanningMatches}>
                🎯 {signals.length} match{signals.length !== 1 ? 'es' : ''} found so far
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={() => { if (serverRegistered) { stopServerScan(); stopCloudPolling(); setCloudScanning(false); useScanStore.getState().setScanStatus('idle'); } else restartScan(); }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.restartText}>{serverRegistered ? '' : '↺ Restart'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={async () => {
              if (serverRegistered) {
                const curProgress = useScanStore.getState().scan.progress;
                const curTotal = useScanStore.getState().scan.total;
                stopCloudPolling();
                setCloudScanning(false);
                useScanStore.getState().setScanStatus('idle');
                await stopServerScan();
                // Server will save resumeIndex — reflect it immediately in UI
                if (curProgress > 0) {
                  setCloudResumeIndex(curProgress);
                  setCloudTotal(curTotal);
                  addLog(`⏸ Stopped at ${curProgress}/${curTotal} — tap Continue to resume`, 'info');
                }
              } else abortScan();
            }}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={styles.stopText}>■ Stop</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.statusBar}>
          {!getApiKey() ? (
            <Text style={styles.warningText}>⚠️ Set your Finnhub API key in Settings</Text>
          ) : (!serverRegistered && universe.stocks.length === 0) ? (
            <Text style={styles.warningText}>⚠️ Build scan universe in Settings first</Text>
          ) : (
            <View style={{ flex: 1 }}>
              <Text style={styles.statusText}>
                {serverRegistered && <><CloudIcon color={COLORS.textMuted} />{' '}</>}
                {lastScan ? `Last scan: ${lastScan}` : 'No scan yet'}
                {scan.status === 'error' && (
                  <Text style={styles.errorText}>  ⚠️ {scan.error}</Text>
                )}
              </Text>
              {scan.evaluated > 0 && (
                <Text style={styles.scanSummary}>
                  ✓{scan.evaluated} evaluated · ∅{scan.noData} no data · ⊘{scan.filtered} filtered
                </Text>
              )}
            </View>
          )}
          {/* Restart button — local or cloud */}
          {((!serverRegistered && (resumeIndex != null || signals.length > 0)) ||
            (serverRegistered && cloudResumeIndex != null)) && (
            <TouchableOpacity
              style={styles.restartBtn}
              onPress={async () => {
                if (serverRegistered) {
                  setCloudResumeIndex(null);
                  await startCloudScan(true); // fresh=true
                } else {
                  restartScan();
                }
              }}
              disabled={!getApiKey() || (!serverRegistered && universe.stocks.length === 0)}
            >
              <Text style={styles.restartBtnText}>↺ Restart</Text>
            </TouchableOpacity>
          )}
          {/* Scan / Continue button */}
          <TouchableOpacity
            style={[styles.scanBtn,
              (!serverRegistered && resumeIndex != null) && styles.scanBtnResume,
              (serverRegistered && cloudResumeIndex != null) && styles.scanBtnResume,
            ]}
            onPress={() => serverRegistered ? startCloudScan(false) : runDailyScan()}
            disabled={!getApiKey() || (!serverRegistered && universe.stocks.length === 0)}
          >
            {serverRegistered ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <CloudIcon size={12} color="#000" />
                <Text style={styles.scanBtnText}>
                  {cloudResumeIndex != null ? `Continue (${cloudResumeIndex}/${cloudTotal})` : 'Scan Now'}
                </Text>
              </View>
            ) : (
              <Text style={styles.scanBtnText}>
                {resumeIndex != null
                  ? `▶ Continue (${resumeIndex}/${scan.total || universe.stocks.length})`
                  : 'Scan Now'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* ── Tab switcher ────────────────────────────────────────────── */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'buy' && styles.tabBtnActive]}
          onPress={() => setTab('buy')}
        >
          <Text style={[styles.tabBtnText, tab === 'buy' && styles.tabBtnTextBuy]}>
            🟢 Buy ({buySignals.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, tab === 'sell' && styles.tabBtnActive]}
          onPress={() => setTab('sell')}
        >
          <Text style={[styles.tabBtnText, tab === 'sell' && styles.tabBtnTextSell]}>
            🔴 Sell ({sellSignals.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Column filter chips ─────────────────────────────────────── */}
      {columns.length > 0 && (
        <View style={styles.filterBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
            {/* Custom filter button — long press to open picker */}
            <TouchableOpacity
              style={[styles.filterChip, styles.filterCustomBtn, activeFilters.size > 0 && styles.filterCustomBtnActive]}
              onLongPress={() => setFilterModalVisible(true)}
              onPress={() => activeFilters.size > 0 ? setActiveFilters(new Set()) : setFilterModalVisible(true)}
              delayLongPress={300}
            >
              <Text style={[styles.filterChipText, activeFilters.size > 0 && styles.filterChipTextActive]}>
                {activeFilters.size > 0 ? `⚙ ${activeFilters.size} filter${activeFilters.size > 1 ? 's' : ''} ✕` : '⚙ Filter'}
              </Text>
            </TouchableOpacity>

            {/* Active filter chips */}
            {[...activeFilters].map((name) => {
              const count = tabSignals.filter((s) =>
                s.matchedCriteria.some((c) => c.split(':')[0].trim() === name)
              ).length;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.filterChip, styles.filterChipActive]}
                  onPress={() => toggleFilter(name)}
                >
                  <Text style={[styles.filterChipText, styles.filterChipTextActive]}>
                    {name}
                    <Text style={styles.filterChipCount}> {count}</Text>
                    {'  ✕'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          {activeFilters.size > 0 && (
            <Text style={styles.filterResult}>
              {displayed.length} of {tabSignals.length} stocks match all selected
            </Text>
          )}
        </View>
      )}

      {/* ── Filter picker modal ──────────────────────────────────────── */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={() => setFilterModalVisible(false)}>
          <View style={styles.modalOverlay} />
        </TouchableWithoutFeedback>
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Filter by Criteria</Text>
          <Text style={styles.modalSubtitle}>Tap to toggle — all selected must match</Text>
          <ScrollView contentContainerStyle={styles.modalList}>
            {columns.map((name) => {
              const active = activeFilters.has(name);
              const count = tabSignals.filter((s) =>
                s.matchedCriteria.some((c) => c.split(':')[0].trim() === name)
              ).length;
              return (
                <TouchableOpacity
                  key={name}
                  style={[styles.modalRow, active && styles.modalRowActive]}
                  onPress={() => toggleFilter(name)}
                >
                  <View style={[styles.modalCheck, active && { backgroundColor: accentColor, borderColor: accentColor }]}>
                    {active && <Text style={styles.modalCheckMark}>✓</Text>}
                  </View>
                  <Text style={[styles.modalRowText, active && { color: accentColor }]}>{name}</Text>
                  <Text style={styles.modalRowCount}>{count} stock{count !== 1 ? 's' : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={[styles.modalDone, { backgroundColor: accentColor }]} onPress={() => setFilterModalVisible(false)}>
            <Text style={styles.modalDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── Table ───────────────────────────────────────────────────── */}
      {displayed.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>{tab === 'buy' ? '📈' : '📉'}</Text>
          <Text style={styles.emptyTitle}>
            {activeFilters.size > 0 ? 'No matches for selected filters' : `No ${tab} signals`}
          </Text>
          <Text style={styles.emptySubtitle}>
            {activeFilters.size > 0
              ? 'Try selecting fewer filter criteria or clear the filter.'
              : tab === 'buy'
              ? scan.lastScanAt
                ? 'No stocks matched your buy criteria in this scan.\nCheck the Criteria tab to make sure buy criteria are enabled.'
                : 'Run a scan to find matching buy opportunities across NASDAQ.'
              : 'No sell signals for your portfolio stocks. Add stocks in the Portfolio tab.'}
          </Text>
        </View>
      ) : (() => {
        const scrollableW = COL_SCORE + COL_PRICE + COL_PCT + COL_TREND + columns.length * COL_CRITERIA;
        const totalH = displayed.length * ROW_H;

        return (
          <View style={styles.tableOuter}>
            {/* ── Sticky header ── */}
            <View style={styles.headerRow}>
              {/* Frozen symbol header */}
              <TouchableOpacity style={styles.frozenHeaderCell} onPress={() => handleSort('symbol')}>
                <Text style={[styles.headerText, sortCol === 'symbol' && styles.headerTextActive]}>Symbol</Text>
                {sortCol === 'symbol' && <Text style={styles.sortArrow}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</Text>}
              </TouchableOpacity>

              {/* Scrollable headers — translated by scrollX on the native thread */}
              <View style={styles.headerClip}>
                <Animated.View style={[styles.headerScrollRow, { width: scrollableW, transform: [{ translateX: negX }] }]}>
                  {([
                    { col: 'score', label: 'Score', width: COL_SCORE, align: 'flex-end' },
                    { col: 'price', label: 'Price', width: COL_PRICE, align: 'flex-end' },
                    { col: 'pct',   label: 'Chg %', width: COL_PCT,   align: 'flex-end' },
                    { col: 'trend', label: 'Trend%', width: COL_TREND, align: 'flex-end' },
                  ] as const).map(({ col, label, width, align }) => (
                    <TouchableOpacity
                      key={col}
                      style={[styles.cell, { width, flexDirection: 'row', alignItems: 'center',
                        justifyContent: align === 'flex-end' ? 'flex-end' : 'flex-start' }]}
                      onPress={() => handleSort(col)}
                    >
                      <Text style={[styles.headerText, sortCol === col && styles.headerTextActive]}>{label}</Text>
                      {sortCol === col && <Text style={styles.sortArrow}>{sortDir === 'desc' ? ' ↓' : ' ↑'}</Text>}
                    </TouchableOpacity>
                  ))}
                  {columns.map((col) => (
                    <TouchableOpacity
                      key={col}
                      style={[styles.cell, styles.criteriaCell, { width: COL_CRITERIA },
                        activeFilters.has(col) && { backgroundColor: accentColor + '18' }]}
                      onPress={() => handleSort(col)}
                    >
                      <Text style={[styles.headerCriteriaText, sortCol === col && styles.headerTextActive,
                        activeFilters.has(col) && { color: accentColor }]} numberOfLines={1}>
                        {initials(col)}
                      </Text>
                      {sortCol === col && <Text style={[styles.sortArrow, { fontSize: 8 }]}>{sortDir === 'desc' ? '↓' : '↑'}</Text>}
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              </View>
            </View>

            {/* ── Body ── */}
            <View style={styles.tableBody}>
              {/* Frozen symbol column — translated by scrollY on native thread, no separate ScrollView */}
              <View style={styles.frozenCol}>
                <Animated.View style={{ height: totalH, transform: [{ translateY: negY }] }}>
                  {displayed.map((signal, rowIdx) => (
                    <TouchableOpacity
                      key={signal.id}
                      style={[styles.frozenCell, rowIdx % 2 === 1 && styles.rowAlt]}
                      activeOpacity={0.7}
                      onPress={() => router.push(`/stock/${signal.symbol}`)}
                    >
                      <Text style={styles.symbolText}>{signal.symbol}</Text>
                      <View style={styles.frozenBadges}>
                        {isWatched(signal.symbol) && (
                          <Text style={styles.starIcon}>★</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </Animated.View>
              </View>

              {/* Scrollable body — one horizontal ScrollView wrapping a vertical ScrollView */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ flex: 1 }}
                scrollEventThrottle={1}
                onScroll={Animated.event(
                  [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                  { useNativeDriver: false }
                )}
              >
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  scrollEventThrottle={1}
                  onScroll={Animated.event(
                    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
                    { useNativeDriver: false }
                  )}
                >
                  {displayed.map((signal, rowIdx) => {
                    const matched = new Set(signal.matchedCriteria.map((c) => c.split(':')[0].trim()));
                    const pct = signal.changePercent;
                    const pctColor = pct >= 0 ? COLORS.positive : COLORS.negative;
                    return (
                      <TouchableOpacity
                        key={signal.id}
                        activeOpacity={0.7}
                        onPress={() => router.push(`/stock/${signal.symbol}`)}
                      >
                        <View style={[styles.row, rowIdx % 2 === 1 && styles.rowAlt]}>
                          <View style={[styles.cell, { width: COL_SCORE, alignItems: 'flex-end' }]}>
                            <Text style={[styles.countText, { color: accentColor }]}>{signal.score}</Text>
                          </View>
                          <View style={[styles.cell, { width: COL_PRICE, alignItems: 'flex-end' }]}>
                            <Text style={styles.priceText}>${signal.price.toFixed(2)}</Text>
                          </View>
                          <View style={[styles.cell, { width: COL_PCT, alignItems: 'flex-end' }]}>
                            <Text style={[styles.pctText, { color: pctColor }]}>
                              {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
                            </Text>
                          </View>
                          <View style={[styles.cell, { width: COL_TREND, alignItems: 'flex-end' }]}>
                            {(() => {
                              const trendPct = extractTrendPct(signal.matchedCriteria) ?? signal.changePercent;
                              const tColor = trendPct >= 0 ? COLORS.positive : COLORS.negative;
                              return <Text style={[styles.pctText, { color: tColor }]}>{trendPct >= 0 ? '+' : ''}{trendPct.toFixed(2)}%</Text>;
                            })()}
                          </View>
                          {columns.map((col) => (
                            <View key={col} style={[styles.cell, styles.criteriaCell, { width: COL_CRITERIA },
                              activeFilters.has(col) && { backgroundColor: accentColor + '10' }]}>
                              {matched.has(col) && (
                                <View style={[styles.matchDot, { backgroundColor: accentColor }]} />
                              )}
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </ScrollView>
            </View>
          </View>
        );
      })()}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // ── Status / scan bars ─────────────────────────────────────────────
  scanningBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, padding: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  scanningText: { color: COLORS.text, fontSize: 13 },
  scanningDetail: { color: COLORS.textMuted, fontSize: 11 },
  scanningMatches: { color: COLORS.primary, fontSize: 11, marginTop: 1 },
  scanSummary: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  stopText: { color: COLORS.sell, fontWeight: '600', fontSize: 13 },
  restartText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  restartBtn: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.border, marginRight: 6,
  },
  restartBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 13 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  statusText: { flex: 1, color: COLORS.textSecondary, fontSize: 12 },
  warningText: { flex: 1, color: '#ffa502', fontSize: 12 },
  errorText: { color: COLORS.sell },
  scanBtn: {
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  scanBtnText: { color: '#000', fontWeight: '700', fontSize: 13 },
  scanBtnResume: { backgroundColor: COLORS.buy },

  // ── Tabs ───────────────────────────────────────────────────────────
  tabs: {
    flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tabBtn: {
    flex: 1, paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: COLORS.primary },
  tabBtnText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  tabBtnTextBuy: { color: COLORS.buy },
  tabBtnTextSell: { color: COLORS.sell },

  // ── Filter chips ───────────────────────────────────────────────────
  filterBar: {
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingVertical: 8,
  },
  filterScroll: { paddingHorizontal: 12, gap: 8 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  filterChipText: { color: COLORS.textSecondary, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.primary },
  filterChipCount: { color: COLORS.textMuted, fontWeight: '400' },
  filterCustomBtn: {
    backgroundColor: COLORS.surfaceAlt, borderColor: COLORS.border,
  },
  filterCustomBtnActive: {
    backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary,
  },
  filterResult: {
    color: COLORS.textMuted, fontSize: 11, textAlign: 'center', marginTop: 6, paddingHorizontal: 12,
  },

  // ── Filter modal ───────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 32, maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: COLORS.border, alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  modalTitle: {
    color: COLORS.text, fontSize: 16, fontWeight: '700',
    textAlign: 'center', marginTop: 8,
  },
  modalSubtitle: {
    color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 12,
  },
  modalList: { paddingHorizontal: 16, paddingBottom: 8 },
  modalRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalRowActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '0f' },
  modalCheck: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  modalCheckMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalRowText: { flex: 1, color: COLORS.text, fontSize: 14, fontWeight: '600' },
  modalRowCount: { color: COLORS.textMuted, fontSize: 12 },
  modalDone: {
    marginHorizontal: 16, marginTop: 8, paddingVertical: 13,
    borderRadius: 12, alignItems: 'center',
  },
  modalDoneText: { color: '#000', fontWeight: '700', fontSize: 15 },

  // ── Table ──────────────────────────────────────────────────────────
  tableOuter: { flex: 1 },
  tableBody: { flex: 1, flexDirection: 'row', overflow: 'hidden' },

  // Frozen column — clips the Animated.View so rows outside the viewport don't show
  frozenCol: {
    width: COL_SYMBOL, overflow: 'hidden',
    borderRightWidth: 2, borderRightColor: COLORS.border,
  },
  frozenHeaderCell: {
    width: COL_SYMBOL, height: HEADER_H,
    paddingHorizontal: 6, flexDirection: 'row',
    alignItems: 'center',
  },
  frozenCell: {
    width: COL_SYMBOL, height: ROW_H,
    paddingHorizontal: 6, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'space-between',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 2, borderBottomColor: COLORS.border,
    height: HEADER_H,
  },
  // Clips the Animated header so it doesn't overflow into the frozen column
  headerClip: { flex: 1, overflow: 'hidden' },
  headerScrollRow: { flexDirection: 'row', height: HEADER_H },

  row: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    height: ROW_H,
  },
  rowAlt: { backgroundColor: COLORS.surface + '80' },

  cell: {
    paddingHorizontal: 6, justifyContent: 'center',
    alignSelf: 'stretch',
  },
  criteriaCell: {
    alignItems: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.border,
  },

  headerText: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
  },
  headerTextActive: { color: COLORS.primary },
  headerCriteriaText: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700', textAlign: 'center',
  },
  sortArrow: { color: COLORS.primary, fontSize: 10, fontWeight: '700' },

  symbolText: { color: COLORS.text, fontWeight: '700', fontSize: 13 },
  frozenBadges: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  starIcon: { color: '#f5c518', fontSize: 11 },
  optionsBadge: { color: '#00d4aa', fontSize: 11 },
  priceText: { color: COLORS.text, fontSize: 12 },
  pctText: { fontSize: 12, fontWeight: '600' },
  countText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },

  matchDot: { width: 10, height: 10, borderRadius: 5 },

  // ── Cloud log panel ────────────────────────────────────────────────

  // ── Empty state ────────────────────────────────────────────────────
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, paddingBottom: 60,
  },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { color: COLORS.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
