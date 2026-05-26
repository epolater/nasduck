import axios from 'axios';
import { FINNHUB_BASE_URL, RATE_LIMIT_MS } from '../constants';
import { CandleData, ScanUniverseStock } from '../types';

let apiKey = '';

export function setApiKey(key: string) {
  apiKey = key;
}

export function getApiKey() {
  return apiKey;
}

function url(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams({
    token: apiKey,
    ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  });
  return `${FINNHUB_BASE_URL}${path}?${qs}`;
}

export async function fetchNasdaqSymbols(): Promise<ScanUniverseStock[]> {
  const { data } = await axios.get(url('/stock/symbol', { exchange: 'US' }));
  return (data as any[])
    .filter(
      (s) =>
        s.mic === 'XNAS' &&
        s.type === 'Common Stock' &&
        !s.symbol.includes('.') &&
        !s.symbol.includes('-') &&
        s.symbol.length <= 4,          // ≤4 chars = established liquid stocks
    )
    .map((s) => ({ symbol: s.symbol as string, name: s.description as string }));
}

// Uses Yahoo Finance (free, no API key) for historical daily candles.
// Finnhub free tier does not include the /stock/candle endpoint.
export async function fetchCandles(
  symbol: string,
  _resolution: string,
  _from: number,
  _to: number,
): Promise<CandleData | null> {
  try {
    const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
    const { data } = await axios.get(yahooUrl, { timeout: 10000 });
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps: number[] = result.timestamp;
    const q = result.indicators?.quote?.[0];
    if (!timestamps || !q) return null;
    // Filter out any null entries (market holidays can leave gaps)
    const filtered = timestamps.reduce(
      (acc, t, i) => {
        if (q.close[i] != null && q.open[i] != null && q.volume[i] != null) {
          acc.t.push(t * 1000);
          acc.o.push(q.open[i]);
          acc.h.push(q.high[i]);
          acc.l.push(q.low[i]);
          acc.c.push(q.close[i]);
          acc.v.push(q.volume[i]);
        }
        return acc;
      },
      { t: [] as number[], o: [] as number[], h: [] as number[], l: [] as number[], c: [] as number[], v: [] as number[] },
    );
    if (filtered.c.length === 0) return null;
    const m = result.meta ?? {};
    return {
      open: filtered.o,
      high: filtered.h,
      low: filtered.l,
      close: filtered.c,
      volume: filtered.v,
      timestamp: filtered.t,
      marketCap:              m.regularMarketCap ?? m.marketCap,
      longName:               m.longName ?? m.shortName,
      regularMarketPrice:     m.regularMarketPrice,
      regularMarketDayHigh:   m.regularMarketDayHigh,
      regularMarketDayLow:    m.regularMarketDayLow,
      regularMarketVolume:    m.regularMarketVolume,
      fiftyTwoWeekHigh:       m.fiftyTwoWeekHigh,
      fiftyTwoWeekLow:        m.fiftyTwoWeekLow,
    };
  } catch (_) {
    return null;
  }
}

export async function fetchQuote(symbol: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    const { data } = await axios.get(url('/quote', { symbol }));
    return { price: data.c, changePercent: data.dp };
  } catch (_) {
    return null;
  }
}

export async function fetchMarketCap(symbol: string): Promise<number | null> {
  try {
    // Finnhub profile2 returns marketCapitalization in millions USD
    const { data } = await axios.get(url('/stock/profile2', { symbol }), { timeout: 8000 });
    if (typeof data?.marketCapitalization === 'number' && data.marketCapitalization > 0) {
      return data.marketCapitalization * 1_000_000;
    }
    return null;
  } catch (_) {
    return null;
  }
}

export async function searchSymbol(query: string): Promise<ScanUniverseStock[]> {
  try {
    const { data } = await axios.get(url('/search', { q: query }));
    return (data.result || [])
      .filter((r: any) => r.type === 'Common Stock')
      .slice(0, 15)
      .map((r: any) => ({ symbol: r.symbol, name: r.description }));
  } catch (_) {
    return [];
  }
}

export async function validateApiKey(key: string): Promise<boolean> {
  try {
    const qs = new URLSearchParams({ token: key, symbol: 'AAPL' });
    const { data } = await axios.get(`${FINNHUB_BASE_URL}/quote?${qs}`, { timeout: 8000 });
    return typeof data.c === 'number' && data.c > 0;
  } catch (_) {
    return false;
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Bulk fetch market cap + name from Yahoo Finance for a list of symbols
// Returns a map of symbol → { marketCap, name }
export async function fetchYahooBulkQuotes(
  symbols: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, { marketCap: number | null; name: string }>> {
  const result = new Map<string, { marketCap: number | null; name: string }>();
  const BATCH = 100;

  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    try {
      const joined = batch.join(',');
      const { data } = await axios.get(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${joined}&fields=symbol,shortName,regularMarketCap`,
        { timeout: 15000 },
      );
      const quotes: any[] = data?.quoteResponse?.result ?? [];
      for (const q of quotes) {
        result.set(q.symbol, {
          marketCap: typeof q.regularMarketCap === 'number' ? q.regularMarketCap : null,
          name: q.shortName ?? q.symbol,
        });
      }
    } catch (_) {
      // batch failed — skip, symbols won't appear in result
    }
    onProgress?.(Math.min(i + BATCH, symbols.length), symbols.length);
    if (i + BATCH < symbols.length) await delay(300); // gentle rate limiting
  }

  return result;
}
