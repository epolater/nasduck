import axios from 'axios';

import { CandleData, ScanUniverseStock } from '../types';

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

// Yahoo Finance — live quote (latest close + change %)
export async function fetchQuote(symbol: string): Promise<{ price: number; changePercent: number } | null> {
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=5d`,
      { timeout: 8000 },
    );
    const m = data?.chart?.result?.[0]?.meta;
    if (!m) return null;
    const price = m.regularMarketPrice ?? m.previousClose;
    const prev = m.chartPreviousClose ?? m.previousClose;
    const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    return { price, changePercent };
  } catch (_) {
    return null;
  }
}

// Yahoo Finance — symbol search
export async function searchSymbol(query: string): Promise<ScanUniverseStock[]> {
  try {
    const { data } = await axios.get(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=US&quotesCount=15&newsCount=0&enableFuzzyQuery=false`,
      { timeout: 8000 },
    );
    return (data?.quotes ?? [])
      .filter((r: any) => r.quoteType === 'EQUITY' && !r.symbol?.includes('.'))
      .slice(0, 15)
      .map((r: any) => ({ symbol: r.symbol, name: r.longname ?? r.shortname ?? r.symbol }));
  } catch (_) {
    return [];
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

  // If no market cap filter, fetch all stocks without the marketcap query param
  const marketcapParam = minCapBillions > 0 ? `&marketcap=${tiers.join('%7C')}` : '';

  try {
    const { data } = await axios.get(
      `https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=9999&exchange=NASDAQ${marketcapParam}`,
      { timeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' } },
    );
    const rows: any[] = data?.data?.table?.rows ?? [];
    console.log(`[NasdaqScreener] Got ${rows.length} stocks${minCapBillions > 0 ? ` for tiers: ${tiers.join(',')}` : ' (no market cap filter)'}`);
    for (const row of rows) {
      if (row.symbol && !row.symbol.includes('/') && !row.symbol.includes('^')) {
        // Screener returns marketCap as a comma-separated string in dollars (e.g. "5,199,612,000,000")
        const raw = row.marketCap;
        const cap = typeof raw === 'string' ? Number(raw.replace(/[$,]/g, '')) : null;
        result.set(row.symbol, {
          marketCap: cap && cap > 0 ? cap : null,
          name: row.name ?? row.symbol,
        });
      }
    }
  } catch (e: any) {
    console.log('[NasdaqScreener] Error:', e?.response?.status, e?.message);
  }

  return result;
}
