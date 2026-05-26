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

// Fetch NASDAQ stocks filtered by market cap using NASDAQ's own screener API
// marketCap: 'mega' (>200B), 'large' (10-200B), 'mid' (2-10B), 'small' (300M-2B)
export async function fetchNasdaqByMarketCap(
  minCapBillions: number,
): Promise<Map<string, { marketCap: number | null; name: string }>> {
  const result = new Map<string, { marketCap: number | null; name: string }>();

  // Determine which tiers to include based on minimum cap
  const tiers: string[] = [];
  if (minCapBillions >= 200) tiers.push('mega');
  else if (minCapBillions >= 10) { tiers.push('mega'); tiers.push('large'); }
  else if (minCapBillions >= 2) { tiers.push('mega'); tiers.push('large'); tiers.push('mid'); }
  else { tiers.push('mega'); tiers.push('large'); tiers.push('mid'); tiers.push('small'); }

  const marketcap = tiers.join('%7C'); // URL-encode |

  try {
    const { data } = await axios.get(
      `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=9999&exchange=NASDAQ&marketcap=${marketcap}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } },
    );
    const rows: any[] = data?.data?.table?.rows ?? [];
    console.log(`[NasdaqScreener] Got ${rows.length} stocks for tiers: ${tiers.join(',')}`);
    for (const row of rows) {
      if (row.symbol && !row.symbol.includes('/') && !row.symbol.includes('^')) {
        result.set(row.symbol, {
          marketCap: null, // not needed, already filtered by tier
          name: row.name ?? row.symbol,
        });
      }
    }
  } catch (e: any) {
    console.log('[NasdaqScreener] Error:', e?.response?.status, e?.message);
  }

  return result;
}
