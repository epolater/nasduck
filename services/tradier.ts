import axios from 'axios';

export interface OptionsData {
  pcr: number | null;         // put volume / call volume
  maxPain: number | null;     // strike where most options expire worthless
  ivAvg: number | null;       // average IV of ATM options (0-1, e.g. 0.45 = 45%)
  ivRank: number | null;      // approximated IV rank 0-100
  expiryDate: string | null;
}

const BASE = 'https://api.tradier.com/v1';

function nullResult(): OptionsData {
  return { pcr: null, maxPain: null, ivAvg: null, ivRank: null, expiryDate: null };
}

export async function fetchOptionsData(symbol: string, apiKey: string): Promise<OptionsData> {
  const headers = { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' };

  try {
    // 1. Get nearest expiry date
    const expRes = await axios.get(`${BASE}/markets/options/expirations`, {
      params: { symbol, includeAllRoots: true },
      headers, timeout: 10000,
    });
    const raw = expRes.data?.expirations?.date;
    if (!raw) return nullResult();
    const dates: string[] = Array.isArray(raw) ? raw : [raw];
    const nearest = dates[0];

    // 2. Get options chain with greeks
    const chainRes = await axios.get(`${BASE}/markets/options/chains`, {
      params: { symbol, expiration: nearest, greeks: true },
      headers, timeout: 10000,
    });
    const options: any[] = chainRes.data?.options?.option;
    if (!options?.length) return nullResult();

    const underlyingLast: number = options[0]?.underlying?.last ?? 0;
    const calls = options.filter(o => o.option_type === 'call');
    const puts  = options.filter(o => o.option_type === 'put');

    // PCR — put volume / call volume
    const callVol = calls.reduce((s: number, o: any) => s + (o.volume || 0), 0);
    const putVol  = puts.reduce((s: number, o: any) => s + (o.volume || 0), 0);
    const pcr = callVol > 0 ? putVol / callVol : null;

    // Max Pain — strike at which total option holder loss is minimised
    const strikes = [...new Set(options.map((o: any) => o.strike as number))].sort((a, b) => a - b);
    let maxPain: number | null = null;
    let minLoss = Infinity;
    for (const s of strikes) {
      const callLoss = calls.reduce((sum: number, o: any) => sum + (o.open_interest || 0) * Math.max(0, s - o.strike), 0);
      const putLoss  = puts.reduce((sum: number, o: any)  => sum + (o.open_interest || 0) * Math.max(0, o.strike - s), 0);
      const total = callLoss + putLoss;
      if (total < minLoss) { minLoss = total; maxPain = s; }
    }

    // IV Average — ATM options only (within 5% of current price)
    const atm = options.filter((o: any) =>
      underlyingLast > 0 && Math.abs(o.strike - underlyingLast) / underlyingLast < 0.05
    );
    const ivs = atm.map((o: any) => o.greeks?.mid_iv).filter((v: any) => v != null && v > 0) as number[];
    const ivAvg = ivs.length > 0 ? ivs.reduce((s, v) => s + v, 0) / ivs.length : null;

    // IV Rank — approximated (no historical data available on free tier)
    const ivRank = ivAvg != null
      ? ivAvg > 0.6 ? 80
      : ivAvg > 0.4 ? 60
      : ivAvg > 0.25 ? 40
      : 20
      : null;

    return { pcr, maxPain, ivAvg, ivRank, expiryDate: nearest };
  } catch {
    return nullResult();
  }
}
