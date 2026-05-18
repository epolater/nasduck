import { CandleData, CriteriaId, ScreenerCriteria } from '../types';

export interface IndicatorResult {
  matched: boolean;
  detail: string;
  value?: number; // optional numeric value for dynamic scoring (e.g. price change %)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function avgVolume(volume: number[], days: number): number {
  const slice = volume.slice(-days);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function computeSMA(closes: number[], period: number): number | null {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// Returns full EMA array aligned to closes[period-1 .. end]
function computeEMAFull(closes: number[], period: number): number[] {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const result: number[] = [];
  let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function computeRSI(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const gains = changes.map((c) => Math.max(0, c));
  const losses = changes.map((c) => Math.max(0, -c));
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < changes.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// MACD: returns { macd, signal } arrays (same length, aligned to end of input)
function computeMACD(closes: number[], fastP = 12, slowP = 26, signalP = 9) {
  const fast = computeEMAFull(closes, fastP);
  const slow = computeEMAFull(closes, slowP);
  // Align: slow starts at index slowP-1, fast starts at fastP-1
  // slow is shorter; macd line starts where both exist
  const offset = slowP - fastP; // slow is shorter by this many
  const macdLine = slow.map((s, i) => fast[i + offset] - s);
  const signalLine = computeEMAFull(macdLine, signalP);
  // signalLine is shorter than macdLine by signalP-1
  const sigOffset = signalP - 1;
  return { macdLine: macdLine.slice(sigOffset), signalLine };
}

// Stochastic %K and %D
function computeStoch(closes: number[], highs: number[], lows: number[], kPeriod = 14, dPeriod = 3) {
  const kArr: number[] = [];
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const highSlice = highs.slice(i - kPeriod + 1, i + 1);
    const lowSlice = lows.slice(i - kPeriod + 1, i + 1);
    const hh = Math.max(...highSlice);
    const ll = Math.min(...lowSlice);
    kArr.push(hh === ll ? 50 : ((closes[i] - ll) / (hh - ll)) * 100);
  }
  // %D = SMA of %K over dPeriod
  const dArr: number[] = [];
  for (let i = dPeriod - 1; i < kArr.length; i++) {
    dArr.push(kArr.slice(i - dPeriod + 1, i + 1).reduce((a, b) => a + b, 0) / dPeriod);
  }
  return { kArr: kArr.slice(dPeriod - 1), dArr };
}

// ATR array
function computeATR(closes: number[], highs: number[], lows: number[], period = 14): number[] {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  if (trs.length < period) return [];
  // Wilder smoothing
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  const result = [atr];
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
    result.push(atr);
  }
  return result;
}

// OBV array
function computeOBV(closes: number[], volumes: number[]): number[] {
  const obv: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[obv.length - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[obv.length - 1] - volumes[i]);
    else obv.push(obv[obv.length - 1]);
  }
  return obv;
}

// ADX
function computeADX(closes: number[], highs: number[], lows: number[], period = 14): number | null {
  if (closes.length < period * 2) return null;
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  const tr: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  // Wilder smoothing
  let smTR = tr.slice(0, period).reduce((a, b) => a + b, 0);
  let smPDM = plusDM.slice(0, period).reduce((a, b) => a + b, 0);
  let smMDM = minusDM.slice(0, period).reduce((a, b) => a + b, 0);
  const dxArr: number[] = [];
  for (let i = period; i < tr.length; i++) {
    smTR = smTR - smTR / period + tr[i];
    smPDM = smPDM - smPDM / period + plusDM[i];
    smMDM = smMDM - smMDM / period + minusDM[i];
    const pdi = smTR === 0 ? 0 : (smPDM / smTR) * 100;
    const mdi = smTR === 0 ? 0 : (smMDM / smTR) * 100;
    const sum = pdi + mdi;
    dxArr.push(sum === 0 ? 0 : (Math.abs(pdi - mdi) / sum) * 100);
  }
  if (dxArr.length < period) return null;
  return dxArr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// ── Evaluator ────────────────────────────────────────────────────────────────

export function evaluateCriteria(
  criteria: ScreenerCriteria,
  candles: CandleData,
): IndicatorResult | null {
  const { close, high, low, open, volume } = candles;
  const n = close.length;
  if (n < 2) return null;

  const current = close[n - 1];
  const prev = close[n - 2];

  switch (criteria.id as CriteriaId) {

    // ── Original criteria ──────────────────────────────────────────────────

    case 'trending_up': {
      const days = Math.round(criteria.threshold);
      if (n < days + 1) return null;
      const slice = close.slice(-(days + 1));
      const matched = slice.every((v, i) => i === 0 || v > slice[i - 1]);
      if (!matched) return null;
      // pct from first day of the N-day window (slice[1]) so it matches the 1W/period chart
      const pctChange = slice[1] > 0 ? ((slice[slice.length - 1] - slice[1]) / slice[1]) * 100 : 0;
      return { matched: true, detail: `${days} up days (+${pctChange.toFixed(2)}%)`, value: pctChange };
    }

    case 'trending_down': {
      const days = Math.round(criteria.threshold);
      if (n < days + 1) return null;
      const slice = close.slice(-(days + 1));
      const matched = slice.every((v, i) => i === 0 || v < slice[i - 1]);
      if (!matched) return null;
      // pct from first day of the N-day window (slice[1]) so it matches the 1W/period chart
      const pctChange = slice[1] > 0 ? ((slice[slice.length - 1] - slice[1]) / slice[1]) * 100 : 0;
      return { matched: true, detail: `${days} down days (${pctChange.toFixed(2)}%)`, value: pctChange };
    }

    case 'rsi_oversold': {
      const rsi = computeRSI(close);
      if (rsi == null) return null;
      return rsi < criteria.threshold
        ? { matched: true, detail: `RSI ${rsi.toFixed(1)} < ${criteria.threshold}` }
        : null;
    }

    case 'rsi_overbought': {
      const rsi = computeRSI(close);
      if (rsi == null) return null;
      return rsi > criteria.threshold
        ? { matched: true, detail: `RSI ${rsi.toFixed(1)} > ${criteria.threshold}` }
        : null;
    }

    case 'above_sma50': {
      const period = Math.round(criteria.threshold);
      const sma = computeSMA(close, period);
      const smaPrev = computeSMA(close.slice(0, -1), period);
      if (sma == null || smaPrev == null) return null;
      return current > sma && prev <= smaPrev
        ? { matched: true, detail: `Crossed above SMA${period} ($${sma.toFixed(2)})` }
        : null;
    }

    case 'below_sma50': {
      const period = Math.round(criteria.threshold);
      const sma = computeSMA(close, period);
      const smaPrev = computeSMA(close.slice(0, -1), period);
      if (sma == null || smaPrev == null) return null;
      return current < sma && prev >= smaPrev
        ? { matched: true, detail: `Crossed below SMA${period} ($${sma.toFixed(2)})` }
        : null;
    }

    case 'volume_spike': {
      if (volume.length < 21) return null;
      const avg = avgVolume(volume.slice(0, -1), 20);
      const todayVol = volume[n - 1];
      return todayVol > avg * criteria.threshold
        ? { matched: true, detail: `Volume ${(todayVol / avg).toFixed(1)}× 20-day avg` }
        : null;
    }

    case 'new_52w_high': {
      const lookback = Math.round(criteria.threshold);
      if (n < lookback + 1) return null;
      const prevHigh = Math.max(...close.slice(-(lookback + 1), -1));
      return current > prevHigh
        ? { matched: true, detail: `New ${lookback}-day high ($${current.toFixed(2)})` }
        : null;
    }

    case 'new_52w_low': {
      const lookback = Math.round(criteria.threshold);
      if (n < lookback + 1) return null;
      const prevLow = Math.min(...close.slice(-(lookback + 1), -1));
      return current < prevLow
        ? { matched: true, detail: `New ${lookback}-day low ($${current.toFixed(2)})` }
        : null;
    }

    case 'price_surge': {
      const period = Math.round(criteria.threshold2 ?? 5);
      if (n < period + 1) return null;
      const startPrice = close[n - 1 - period];
      if (startPrice <= 0) return null;
      const gainPct = ((current - startPrice) / startPrice) * 100;
      return gainPct >= criteria.threshold
        ? { matched: true, detail: `+${gainPct.toFixed(1)}% over ${period} days` }
        : null;
    }

    // ── MACD ──────────────────────────────────────────────────────────────

    case 'macd_crossover_up': {
      const sigP = Math.round(criteria.threshold);
      const { macdLine, signalLine } = computeMACD(close, 12, 26, sigP);
      if (macdLine.length < 2 || signalLine.length < 2) return null;
      const ml = macdLine, sl = signalLine;
      const crossedAbove = ml[ml.length - 1] > sl[sl.length - 1] &&
                           ml[ml.length - 2] <= sl[sl.length - 2];
      return crossedAbove
        ? { matched: true, detail: `MACD crossed above signal (${ml[ml.length - 1].toFixed(3)})` }
        : null;
    }

    case 'macd_crossover_down': {
      const sigP = Math.round(criteria.threshold);
      const { macdLine, signalLine } = computeMACD(close, 12, 26, sigP);
      if (macdLine.length < 2 || signalLine.length < 2) return null;
      const ml = macdLine, sl = signalLine;
      const crossedBelow = ml[ml.length - 1] < sl[sl.length - 1] &&
                           ml[ml.length - 2] >= sl[sl.length - 2];
      return crossedBelow
        ? { matched: true, detail: `MACD crossed below signal (${ml[ml.length - 1].toFixed(3)})` }
        : null;
    }

    // ── EMA Crossover ─────────────────────────────────────────────────────

    case 'ema_crossover_up': {
      const shortP = Math.round(criteria.threshold);
      const longP = Math.round(criteria.threshold2 ?? 21);
      const shortEMA = computeEMAFull(close, shortP);
      const longEMA = computeEMAFull(close, longP);
      if (shortEMA.length < 2 || longEMA.length < 2) return null;
      const offset = shortEMA.length - longEMA.length;
      const s = shortEMA, l = longEMA;
      const crossedAbove = s[s.length - 1] > l[l.length - 1] &&
                           s[s.length - 2 + offset] - offset <= l[l.length - 2];
      // simpler: just check last two aligned points
      const sLen = longEMA.length;
      const sAligned = shortEMA.slice(-sLen);
      const crossed = sAligned[sLen - 1] > longEMA[sLen - 1] &&
                      sAligned[sLen - 2] <= longEMA[sLen - 2];
      return crossed
        ? { matched: true, detail: `EMA${shortP} crossed above EMA${longP}` }
        : null;
    }

    case 'ema_crossover_down': {
      const shortP = Math.round(criteria.threshold);
      const longP = Math.round(criteria.threshold2 ?? 21);
      const shortEMA = computeEMAFull(close, shortP);
      const longEMA = computeEMAFull(close, longP);
      if (shortEMA.length < 2 || longEMA.length < 2) return null;
      const sLen = longEMA.length;
      const sAligned = shortEMA.slice(-sLen);
      const crossed = sAligned[sLen - 1] < longEMA[sLen - 1] &&
                      sAligned[sLen - 2] >= longEMA[sLen - 2];
      return crossed
        ? { matched: true, detail: `EMA${shortP} crossed below EMA${longP}` }
        : null;
    }

    // ── Price vs EMA ──────────────────────────────────────────────────────

    case 'price_vs_ema_above': {
      const period = Math.round(criteria.threshold2 ?? 20);
      const ema = computeEMAFull(close, period);
      if (ema.length === 0) return null;
      const emaVal = ema[ema.length - 1];
      const pctAbove = ((current - emaVal) / emaVal) * 100;
      return pctAbove >= criteria.threshold
        ? { matched: true, detail: `${pctAbove.toFixed(1)}% above EMA${period} ($${emaVal.toFixed(2)})` }
        : null;
    }

    case 'price_vs_ema_below': {
      const period = Math.round(criteria.threshold2 ?? 20);
      const ema = computeEMAFull(close, period);
      if (ema.length === 0) return null;
      const emaVal = ema[ema.length - 1];
      const pctBelow = ((emaVal - current) / emaVal) * 100;
      return pctBelow >= criteria.threshold
        ? { matched: true, detail: `${pctBelow.toFixed(1)}% below EMA${period} ($${emaVal.toFixed(2)})` }
        : null;
    }

    // ── Bollinger Bands ───────────────────────────────────────────────────

    case 'bollinger_breakout_up':
    case 'bollinger_breakout_down': {
      const period = Math.round(criteria.threshold);
      const mult = criteria.threshold2 ?? 2;
      if (n < period) return null;
      const slice = close.slice(-period);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period);
      const upper = mean + mult * std;
      const lower = mean - mult * std;
      if (criteria.id === 'bollinger_breakout_up') {
        return current > upper
          ? { matched: true, detail: `Above upper BB ($${upper.toFixed(2)})` }
          : null;
      } else {
        return current < lower
          ? { matched: true, detail: `Below lower BB ($${lower.toFixed(2)})` }
          : null;
      }
    }

    // ── ATR Spike ─────────────────────────────────────────────────────────

    case 'atr_spike': {
      const period = Math.round(criteria.threshold2 ?? 14);
      const atrArr = computeATR(close, high, low, period);
      if (atrArr.length < 2) return null;
      const avgATR = atrArr.slice(-period - 1, -1).reduce((a, b) => a + b, 0) /
                     Math.min(period, atrArr.length - 1);
      const todayATR = atrArr[atrArr.length - 1];
      return todayATR > avgATR * criteria.threshold
        ? { matched: true, detail: `ATR ${(todayATR / avgATR).toFixed(1)}× avg (${todayATR.toFixed(2)})` }
        : null;
    }

    // ── Volume Dry-Up ─────────────────────────────────────────────────────

    case 'volume_dryup': {
      if (volume.length < 21) return null;
      const avg = avgVolume(volume.slice(0, -1), 20);
      const todayVol = volume[n - 1];
      const pct = (todayVol / avg) * 100;
      return pct <= criteria.threshold
        ? { matched: true, detail: `Volume at ${pct.toFixed(0)}% of 20-day avg` }
        : null;
    }

    // ── OBV Trend ─────────────────────────────────────────────────────────

    case 'obv_trend_up': {
      const days = Math.round(criteria.threshold);
      if (n < days + 1) return null;
      const obv = computeOBV(close, volume);
      const slice = obv.slice(-(days + 1));
      const trending = slice.every((v, i) => i === 0 || v > slice[i - 1]);
      return trending
        ? { matched: true, detail: `OBV rising ${days} consecutive days` }
        : null;
    }

    case 'obv_trend_down': {
      const days = Math.round(criteria.threshold);
      if (n < days + 1) return null;
      const obv = computeOBV(close, volume);
      const slice = obv.slice(-(days + 1));
      const trending = slice.every((v, i) => i === 0 || v < slice[i - 1]);
      return trending
        ? { matched: true, detail: `OBV falling ${days} consecutive days` }
        : null;
    }

    // ── Inside Bar ────────────────────────────────────────────────────────

    case 'inside_bar': {
      if (n < 2) return null;
      const prevRange = high[n - 2] - low[n - 2];
      const prevRangePct = prev > 0 ? (prevRange / prev) * 100 : 0;
      const isInside = high[n - 1] <= high[n - 2] && low[n - 1] >= low[n - 2];
      return isInside && prevRangePct >= criteria.threshold
        ? { matched: true, detail: `Inside bar (prev range ${prevRangePct.toFixed(1)}%)` }
        : null;
    }

    // ── Gap Up / Down ─────────────────────────────────────────────────────

    case 'gap_up': {
      if (n < 2 || open.length < n) return null;
      const gapPct = ((open[n - 1] - close[n - 2]) / close[n - 2]) * 100;
      return gapPct >= criteria.threshold
        ? { matched: true, detail: `Gapped up ${gapPct.toFixed(1)}% at open` }
        : null;
    }

    case 'gap_down': {
      if (n < 2 || open.length < n) return null;
      const gapPct = ((close[n - 2] - open[n - 1]) / close[n - 2]) * 100;
      return gapPct >= criteria.threshold
        ? { matched: true, detail: `Gapped down ${gapPct.toFixed(1)}% at open` }
        : null;
    }

    // ── Stochastic ────────────────────────────────────────────────────────

    case 'stoch_oversold': {
      const kP = Math.round(criteria.threshold2 ?? 14);
      const { kArr, dArr } = computeStoch(close, high, low, kP);
      if (kArr.length < 2 || dArr.length < 2) return null;
      const kNow = kArr[kArr.length - 1], kPrev = kArr[kArr.length - 2];
      const dNow = dArr[dArr.length - 1], dPrev = dArr[dArr.length - 2];
      const crossed = kNow > dNow && kPrev <= dPrev && kNow < criteria.threshold;
      return crossed
        ? { matched: true, detail: `%K(${kNow.toFixed(1)}) crossed above %D in oversold` }
        : null;
    }

    case 'stoch_overbought': {
      const kP = Math.round(criteria.threshold2 ?? 14);
      const { kArr, dArr } = computeStoch(close, high, low, kP);
      if (kArr.length < 2 || dArr.length < 2) return null;
      const kNow = kArr[kArr.length - 1], kPrev = kArr[kArr.length - 2];
      const dNow = dArr[dArr.length - 1], dPrev = dArr[dArr.length - 2];
      const crossed = kNow < dNow && kPrev >= dPrev && kNow > criteria.threshold;
      return crossed
        ? { matched: true, detail: `%K(${kNow.toFixed(1)}) crossed below %D in overbought` }
        : null;
    }

    // ── ADX ───────────────────────────────────────────────────────────────

    case 'adx_strong': {
      const period = Math.round(criteria.threshold2 ?? 14);
      const adx = computeADX(close, high, low, period);
      if (adx == null) return null;
      return adx >= criteria.threshold
        ? { matched: true, detail: `ADX ${adx.toFixed(1)} ≥ ${criteria.threshold}` }
        : null;
    }

    default:
      return null;
  }
}

export function meetsUniverseFilter(candles: CandleData, minPrice: number, minAvgVolume: number): boolean {
  const n = candles.close.length;
  if (n === 0) return false;
  const price = candles.close[n - 1];
  if (price < minPrice) return false;
  if (candles.volume.length >= 20) {
    const avg = avgVolume(candles.volume, 20);
    if (avg < minAvgVolume) return false;
  }
  return true;
}
