export type SignalType = 'buy' | 'sell';

export type CriteriaId =
  | 'trending_up'
  | 'trending_down'
  | 'rsi_oversold'
  | 'rsi_overbought'
  | 'above_sma50'
  | 'below_sma50'
  | 'volume_spike'
  | 'new_52w_high'
  | 'new_52w_low'
  | 'price_surge'
  | 'macd_crossover_up'
  | 'macd_crossover_down'
  | 'ema_crossover_up'
  | 'ema_crossover_down'
  | 'price_vs_ema_above'
  | 'price_vs_ema_below'
  | 'bollinger_breakout_up'
  | 'bollinger_breakout_down'
  | 'atr_spike'
  | 'volume_dryup'
  | 'obv_trend_up'
  | 'obv_trend_down'
  | 'inside_bar'
  | 'gap_up'
  | 'gap_down'
  | 'stoch_oversold'
  | 'stoch_overbought'
  | 'adx_strong'
  | 'put_call_ratio_low'
  | 'put_call_ratio_high'
  | 'high_iv'
  | 'near_max_pain';

export interface ScreenerCriteria {
  id: CriteriaId;
  name: string;
  description: string;
  signal: SignalType;
  enabled: boolean;
  threshold: number;
  thresholdLabel: string;
  thresholdMin: number;
  thresholdMax: number;
  thresholdStep: number;
  thresholdSuffix?: string;
  // Optional second adjustable parameter
  threshold2?: number;
  threshold2Label?: string;
  threshold2Min?: number;
  threshold2Max?: number;
  threshold2Step?: number;
  threshold2Suffix?: string;
}

export interface PortfolioStock {
  symbol: string;
  name: string;
  addedAt: number;
}

export interface ScanUniverseStock {
  symbol: string;
  name: string;
}

export interface ScanUniverse {
  stocks: ScanUniverseStock[];
  lastUpdated: number;
}

export interface OptionsData {
  pcr: number | null;
  maxPain: number | null;
  ivAvg: number | null;
  ivRank: number | null;
  expiryDate: string | null;
}

export interface Signal {
  id: string;
  symbol: string;
  name: string;
  signal: SignalType;
  matchedCriteria: string[];
  score: number;        // weighted sum of matched criteria (higher = stronger conviction)
  price: number;
  changePercent: number;
  generatedAt: number;
  marketCap?: number | null;  // in raw dollars, used for dynamic filtering
  optionsData?: OptionsData;
}

export interface ScanState {
  status: 'idle' | 'building_universe' | 'scanning' | 'done' | 'error';
  progress: number;
  total: number;
  lastScanAt: number | null;
  error: string | null;
  evaluated: number;   // stocks that actually ran criteria
  noData: number;      // stocks skipped due to missing candle data
  filtered: number;    // stocks skipped by price/volume filter
}

export interface CandleData {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamp: number[];
  // Yahoo Finance meta fields (may be absent for some symbols)
  marketCap?: number;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
  regularMarketVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}
