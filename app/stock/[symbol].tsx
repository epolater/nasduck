import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Line, Polyline, Text as SvgText } from 'react-native-svg';
import { COLORS } from '../../constants';
import { fetchCandles, fetchMarketCap } from '../../services/finnhub';
import { analyzeStock } from '../../services/ai';
import { useAiAnalysisStore } from '../../store/aiAnalysisStore';
import { useCriteriaStore } from '../../store/criteriaStore';
import { useWatchlistStore } from '../../store/watchlistStore';
import { useSettingsStore } from '../../store/settingsStore';
import { CandleData } from '../../types';
import { evaluateCriteria } from '../../utils/technicalAnalysis';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// 16 (content padding) + 16 (card padding) on each side = 32 per side
const CHART_W = SCREEN_WIDTH - 64;
const CHART_H = 180;
const PAD = { top: 16, bottom: 28, left: 48, right: 12 };

type ChartRange = '1W' | '1M' | '3M' | '1Y';
const RANGE_DAYS: Record<ChartRange, number> = { '1W': 7, '1M': 30, '3M': 90, '1Y': 365 };

function PriceChart({ candles, range }: { candles: CandleData; range: ChartRange }) {
  const cutoff = Date.now() - RANGE_DAYS[range] * 86400 * 1000;
  const indices = candles.timestamp
    .map((t, i) => (t >= cutoff ? i : -1))
    .filter((i) => i >= 0);

  if (indices.length < 2) return (
    <View style={{ height: CHART_H, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Not enough data for this range</Text>
    </View>
  );

  const data  = indices.map((i) => candles.close[i]);
  const times = indices.map((i) => candles.timestamp[i]);

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range_ = max - min || 1;
  const iW = CHART_W - PAD.left - PAD.right;
  const iH = CHART_H - PAD.top - PAD.bottom;

  const xOf = (i: number) => PAD.left + (i / (data.length - 1)) * iW;
  const yOf = (v: number) => PAD.top + iH - ((v - min) / range_) * iH;

  const points = data.map((v, i) => `${xOf(i)},${yOf(v)}`).join(' ');
  const isPositive = data[data.length - 1] >= data[0];
  const lineColor = isPositive ? COLORS.positive : COLORS.negative;

  // Horizontal grid lines (4 levels)
  const hLines = [0, 0.25, 0.5, 0.75, 1];
  // Vertical grid lines — pick ~5 evenly spaced time labels
  const vCount = Math.min(5, data.length);
  const vIndices = Array.from({ length: vCount }, (_, k) =>
    Math.round((k / (vCount - 1)) * (data.length - 1))
  );

  function dateLabel(ts: number) {
    const d = new Date(ts);
    if (range === '1W') return d.toLocaleDateString([], { weekday: 'short' });
    if (range === '1M' || range === '3M') return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { month: 'short', year: '2-digit' });
  }

  return (
    <Svg width={CHART_W} height={CHART_H}>
      {/* Horizontal grid lines + Y labels */}
      {hLines.map((pct) => {
        const y = PAD.top + iH * (1 - pct);
        const val = min + range_ * pct;
        return (
          <React.Fragment key={pct}>
            <Line
              x1={PAD.left} y1={y} x2={PAD.left + iW} y2={y}
              stroke={COLORS.border} strokeWidth={1} opacity={0.6}
            />
            <SvgText x={PAD.left - 4} y={y + 4} textAnchor="end" fill={COLORS.textMuted} fontSize={9}>
              {val >= 1000 ? val.toFixed(0) : val.toFixed(2)}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Vertical grid lines + X labels */}
      {vIndices.map((di) => {
        const x = xOf(di);
        return (
          <React.Fragment key={di}>
            <Line
              x1={x} y1={PAD.top} x2={x} y2={PAD.top + iH}
              stroke={COLORS.border} strokeWidth={1} opacity={0.6}
            />
            <SvgText x={x} y={CHART_H - 4} textAnchor="middle" fill={COLORS.textMuted} fontSize={9}>
              {dateLabel(times[di])}
            </SvgText>
          </React.Fragment>
        );
      })}

      {/* Price line */}
      <Polyline
        points={points}
        fill="none"
        stroke={lineColor}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, color ? { color } : undefined]}>{value}</Text>
    </View>
  );
}

export default function StockDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const navigation = useNavigation();
  const { criteria } = useCriteriaStore();

  const [candles, setCandles] = useState<CandleData | null>(null);
  const [marketCap, setMarketCap] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRange>('3M');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const { aiModel, googleAiKey, groqKey } = useSettingsStore();
  const aiStore = useAiAnalysisStore();
  const aiEntry = aiStore.get(symbol);
  const aiResult = aiEntry?.result ?? null;
  const { add: addToWatchlist, remove: removeFromWatchlist, has: isWatched } = useWatchlistStore();
  const watched = isWatched(symbol);

  useLayoutEffect(() => {
    navigation.setOptions({ title: symbol });
  }, [symbol]);

  useEffect(() => {
    load();
  }, [symbol]);

  async function load() {
    setLoading(true);
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - 86400 * 260;
      const [c, cap] = await Promise.all([
        fetchCandles(symbol, 'D', from, to),
        fetchMarketCap(symbol),
      ]);
      setCandles(c);
      setMarketCap(cap);
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }

  // Strip today's incomplete candle so chart & recent closes only show finished trading days
  const displayCandles: CandleData | null = candles ? (() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const lastTs = candles.timestamp[candles.timestamp.length - 1];
    const trimLast = lastTs >= todayStart.getTime();
    if (!trimLast) return candles;
    const end = candles.close.length - 1;
    return {
      ...candles,
      open:      candles.open.slice(0, end),
      high:      candles.high.slice(0, end),
      low:       candles.low.slice(0, end),
      close:     candles.close.slice(0, end),
      volume:    candles.volume.slice(0, end),
      timestamp: candles.timestamp.slice(0, end),
    };
  })() : null;

  // Only matched criteria
  const matchedResults = candles
    ? criteria
        .map((c) => ({ criteria: c, result: evaluateCriteria(c, candles) }))
        .filter((r) => r.result?.matched)
    : [];

  const price = candles?.regularMarketPrice;
  // Determine if the market is currently open:
  // if regularMarketPrice ≈ last completed candle close, the session is closed (weekend/after-hours)
  const lastClose = displayCandles && displayCandles.close.length > 0
    ? displayCandles.close[displayCandles.close.length - 1]
    : undefined;
  const secondLastClose = displayCandles && displayCandles.close.length > 1
    ? displayCandles.close[displayCandles.close.length - 2]
    : undefined;
  const marketClosed = price != null && lastClose != null
    && Math.abs(price - lastClose) < 0.01;
  // When market is closed: price=lastClose, prevClose=day before. When open: prevClose=lastClose.
  const prevClose = marketClosed ? secondLastClose : lastClose;
  const displayPrice = marketClosed ? lastClose : price;
  const changeAmt = displayPrice != null && prevClose != null ? displayPrice - prevClose : null;
  const changePct = changeAmt != null && prevClose ? (changeAmt / prevClose) * 100 : null;
  const isUp = changePct != null ? changePct >= 0 : true;
  const changeColor = isUp ? COLORS.positive : COLORS.negative;

  async function handleAiAnalysis() {
    if (!displayCandles) return;
    setAiLoading(true);
    setAiError(null);
    aiStore.clear(symbol);
    try {
      const recentCloses = displayCandles.close.slice(-10);
      const result = await analyzeStock({
        symbol,
        name: candles?.longName ?? symbol,
        price: displayPrice ?? 0,
        changePct: changePct ?? 0,
        marketCap: marketCap,
        volume: candles?.regularMarketVolume ?? null,
        high52w: candles?.fiftyTwoWeekHigh ?? null,
        low52w: candles?.fiftyTwoWeekLow ?? null,
        recentCloses,
        matchedCriteria: matchedResults.map(r => `${r.criteria.name}: ${r.result?.detail ?? ''}`),
      }, aiModel, googleAiKey, groqKey);
      aiStore.set(symbol, result, aiModel);
    } catch (e: any) {
      setAiError(e?.message ?? 'Analysis failed');
    } finally {
      setAiLoading(false);
    }
  }

  function handleWatchlistToggle() {
    if (watched) {
      removeFromWatchlist(symbol);
    } else {
      addToWatchlist({
        symbol,
        name: candles?.longName ?? symbol,
        addedAt: Date.now(),
        price: displayPrice ?? 0,
        changePercent: changePct ?? 0,
      });
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {loading ? (
        <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* ── Header: long name + symbol ── */}
          <View style={styles.nameHeader}>
            <View style={{ flex: 1 }}>
              {candles?.longName && (
                <Text style={styles.longName}>{candles.longName}</Text>
              )}
            </View>
            <TouchableOpacity
              style={[styles.watchBtn, watched && styles.watchBtnActive]}
              onPress={handleWatchlistToggle}
            >
              <Text style={styles.watchBtnText}>
                {watched ? '★ Watching' : '☆ Watchlist'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Price card ── */}
          {displayPrice != null && (
            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <Text style={styles.price}>${displayPrice.toFixed(2)}</Text>
                {changePct != null && (
                  <View style={[styles.changeBadge, { backgroundColor: changeColor + '22', borderColor: changeColor + '55' }]}>
                    <Text style={[styles.changeBadgeText, { color: changeColor }]}>
                      {isUp ? '+' : ''}{changeAmt!.toFixed(2)}  {isUp ? '+' : ''}{changePct.toFixed(2)}%
                    </Text>
                    <Text style={[styles.changePeriod, { color: changeColor }]}>vs prev close</Text>
                  </View>
                )}
              </View>

              <View style={styles.statsGrid}>
                {candles?.fiftyTwoWeekHigh != null && (
                  <StatItem label="52W High" value={`$${candles.fiftyTwoWeekHigh.toFixed(2)}`} />
                )}
                {candles?.fiftyTwoWeekLow != null && (
                  <StatItem label="52W Low" value={`$${candles.fiftyTwoWeekLow.toFixed(2)}`} />
                )}
                {prevClose != null && (
                  <StatItem label="Prev Close" value={`$${prevClose.toFixed(2)}`} />
                )}
               {candles?.regularMarketVolume != null && (
                  <StatItem label="Volume" value={formatVol(candles.regularMarketVolume)} />
                )}
                {marketCap != null && (
                  <StatItem label="Market Cap" value={formatCap(marketCap)} />
                )}
              </View>
            </View>
          )}

          {/* ── Chart ── */}
          {displayCandles && (() => {
            const cutoff = Date.now() - RANGE_DAYS[chartRange] * 86400 * 1000;
            const rangeCloses = displayCandles.close.filter((_, i) => displayCandles.timestamp[i] >= cutoff);
            const rangeFirst = rangeCloses[0];
            const rangeLast  = rangeCloses[rangeCloses.length - 1];
            const rangePct   = rangeFirst && rangeLast && rangeFirst > 0
              ? ((rangeLast - rangeFirst) / rangeFirst) * 100
              : null;
            const rangeUp = rangePct != null ? rangePct >= 0 : true;
            return (
              <View style={styles.chartCard}>
                <View style={styles.chartHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.cardLabel}>PRICE</Text>
                    {rangePct != null && (
                      <Text style={[styles.rangePct, { color: rangeUp ? COLORS.positive : COLORS.negative }]}>
                        {rangeUp ? '+' : ''}{rangePct.toFixed(2)}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.rangeRow}>
                    {(['1W', '1M', '3M', '1Y'] as ChartRange[]).map((r) => (
                      <TouchableOpacity
                        key={r}
                        style={[styles.rangeBtn, chartRange === r && styles.rangeBtnActive]}
                        onPress={() => setChartRange(r)}
                      >
                        <Text style={[styles.rangeBtnText, chartRange === r && styles.rangeBtnTextActive]}>
                          {r}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
                <PriceChart candles={displayCandles} range={chartRange} />
              </View>
            );
          })()}

          {/* ── Matched criteria ── */}
          <View style={styles.criteriaCard}>
            <Text style={[styles.cardLabel, { marginBottom: 10 }]}>MATCHED CRITERIA</Text>
            {matchedResults.length === 0 ? (
              <Text style={styles.emptyText}>No criteria matched for this stock.</Text>
            ) : (
              matchedResults.map(({ criteria: c, result }) => (
                <View key={c.id} style={styles.criteriaRow}>
                  <View style={[styles.signalDot, { backgroundColor: c.signal === 'buy' ? COLORS.buy : COLORS.sell }]} />
                  <View style={styles.criteriaLeft}>
                    <Text style={styles.criteriaName}>{c.name}</Text>
                    {result?.detail ? (
                      <Text style={styles.criteriaDetail}>{result.detail}</Text>
                    ) : null}
                  </View>
                  <View style={[styles.badge, c.signal === 'buy' ? styles.badgeBuy : styles.badgeSell]}>
                    <Text style={[styles.badgeText, c.signal === 'buy' ? styles.badgeBuyText : styles.badgeSellText]}>
                      {c.signal === 'buy' ? '▲ BUY' : '▼ SELL'}
                    </Text>
                  </View>
                </View>
              ))
            )}
          </View>

          {/* ── AI Analysis ── */}
          <View style={styles.criteriaCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <View>
                <Text style={styles.cardLabel}>AI ANALYSIS</Text>
                {aiEntry && (
                  <Text style={{ color: COLORS.textMuted, fontSize: 10, marginTop: 2 }}>
                    {aiEntry.modelId} · {new Date(aiEntry.analyzedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                )}
              </View>
              <TouchableOpacity
                style={[styles.aiBtn, aiLoading && { opacity: 0.5 }]}
                onPress={handleAiAnalysis}
                disabled={aiLoading}
              >
                {aiLoading
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={styles.aiBtnText}>{aiResult ? '↺ Re-analyze' : '✦ Analyze'}</Text>}
              </TouchableOpacity>
            </View>

            {aiError && (
              <Text style={{ color: COLORS.sell, fontSize: 12 }}>{aiError}</Text>
            )}

            {aiResult && (() => {
              const sentimentColor = aiResult.sentiment === 'bullish' ? COLORS.positive : aiResult.sentiment === 'bearish' ? COLORS.negative : COLORS.textSecondary;
              const verdictColor = aiResult.verdict === 'Buy' ? COLORS.positive : aiResult.verdict === 'Sell' ? COLORS.negative : COLORS.textSecondary;
              return (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                    <View style={[styles.badge, { borderColor: verdictColor, backgroundColor: verdictColor + '22' }]}>
                      <Text style={[styles.badgeText, { color: verdictColor }]}>{aiResult.verdict}</Text>
                    </View>
                    <Text style={[{ fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }, { color: sentimentColor }]}>
                      {aiResult.sentiment}
                    </Text>
                  </View>
                  <Text style={{ color: COLORS.text, fontSize: 13, lineHeight: 20, marginBottom: 10 }}>
                    {aiResult.summary}
                  </Text>
                  <View style={{ backgroundColor: COLORS.surfaceAlt, borderRadius: 8, padding: 10 }}>
                    <Text style={{ color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 }}>RISKS</Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 12, lineHeight: 18 }}>{aiResult.risks}</Text>
                  </View>
                </>
              );
            })()}

            {!aiResult && !aiLoading && !aiError && (
              <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>
                Tap Analyze to get an AI-powered buy/sell assessment based on current technicals and price action.
              </Text>
            )}
          </View>

          {/* ── Recent prices ── */}
          {displayCandles && (
            <View style={styles.criteriaCard}>
              <Text style={[styles.cardLabel, { marginBottom: 10 }]}>RECENT CLOSES</Text>
              {displayCandles.close
                .slice(-5)
                .reverse()
                .map((p, i, arr) => {
                  const prev = arr[i + 1];
                  const up = prev !== undefined ? p >= prev : true;
                  const pct = prev != null && prev > 0 ? ((p - prev) / prev) * 100 : null;
                  const ts = displayCandles.timestamp[displayCandles.close.length - 1 - i];
                  const date = new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric' });
                  return (
                    <View key={i} style={styles.priceHistRow}>
                      <Text style={styles.priceDate}>{date}</Text>
                      <Text style={[styles.priceValue, up ? styles.positive : styles.negative]}>
                        ${p.toFixed(2)}
                      </Text>
                      {pct != null && (
                        <Text style={[styles.priceHistPct, up ? styles.positive : styles.negative]}>
                          {up ? '+' : ''}{pct.toFixed(2)}%
                        </Text>
                      )}
                    </View>
                  );
                })}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

function formatCap(n: number) {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9)  return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

function formatVol(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 16, paddingBottom: 40 },

  // ── Name header ──────────────────────────────────────────────────────
  nameHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 12,
  },
  longName: { color: COLORS.text, fontSize: 17, fontWeight: '700', marginBottom: 4 },
  symbolBadge: {
    alignSelf: 'flex-start',
    color: COLORS.primary, fontSize: 13, fontWeight: '800',
    backgroundColor: COLORS.primary + '18', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.primary + '44',
  },
  watchBtn: {
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.surface, alignItems: 'center',
  },
  watchBtnActive: {
    backgroundColor: '#f5c51822', borderColor: '#f5c518',
  },
  watchBtnText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '700' },

  // ── Price card ───────────────────────────────────────────────────────
  priceCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 18,
    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  price: { color: COLORS.text, fontSize: 34, fontWeight: '800' },
  changeBadge: {
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1,
  },
  changeBadgeText: { fontSize: 14, fontWeight: '700' },
  changePeriod: { fontSize: 9, fontWeight: '600', opacity: 0.7, marginTop: 2, textAlign: 'center' },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  statItem: {
    width: '33.33%', paddingVertical: 8, paddingRight: 8,
  },
  statLabel: { color: COLORS.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.4, marginBottom: 2 },
  statValue: { color: COLORS.text, fontSize: 14, fontWeight: '700' },

  positive: { color: COLORS.positive },
  negative: { color: COLORS.negative },

  // ── Chart ────────────────────────────────────────────────────────────
  chartCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden',
  },
  chartHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  cardLabel: {
    color: COLORS.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 1,
  },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
    backgroundColor: COLORS.surfaceAlt, borderWidth: 1, borderColor: COLORS.border,
  },
  rangeBtnActive: { backgroundColor: COLORS.primary + '22', borderColor: COLORS.primary },
  rangeBtnText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700' },
  rangeBtnTextActive: { color: COLORS.primary },
  rangePct: { fontSize: 13, fontWeight: '700' },

  // ── Criteria ─────────────────────────────────────────────────────────
  criteriaCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  emptyText: { color: COLORS.textMuted, fontSize: 13 },
  criteriaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  signalDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  criteriaLeft: { flex: 1 },
  criteriaName: { color: COLORS.text, fontWeight: '600', fontSize: 13 },
  criteriaDetail: { color: COLORS.textSecondary, fontSize: 11, marginTop: 2 },
  badge: {
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, minWidth: 60, alignItems: 'center',
  },
  badgeBuy:  { backgroundColor: COLORS.buy  + '22', borderColor: COLORS.buy },
  badgeSell: { backgroundColor: COLORS.sell + '22', borderColor: COLORS.sell },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeBuyText:  { color: COLORS.buy },
  badgeSellText: { color: COLORS.sell },

  // ── Recent prices ─────────────────────────────────────────────────────
  priceHistRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 8,
  },
  priceDate:    { color: COLORS.textSecondary, fontSize: 13, width: 60 },
  priceValue:   { fontWeight: '700', fontSize: 14 },
  priceHistPct: { fontSize: 12, fontWeight: '600', marginLeft: 'auto' },
  aiBtn: {
    backgroundColor: COLORS.primary + '18', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: COLORS.primary + '44',
  },
  aiBtnText: { color: COLORS.primary, fontSize: 12, fontWeight: '700' },
});
