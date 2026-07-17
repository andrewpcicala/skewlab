// CBOE VIX daily closes via FRED (Federal Reserve Economic Data).
//
// Why FRED instead of Polygon:
//   Polygon's index aggregates endpoint (I:VIX) is NOT_AUTHORIZED on the free
//   plan. FRED provides the same CBOE VIXCLS series (official daily settlement)
//   at no cost with no API key required. The cosd/coed date range parameters
//   let us fetch exactly the window we need.
//
// Series: VIXCLS — CBOE Volatility Index (daily close), in percentage points.
//   e.g., a value of 18.5 means the market implies 18.5% annualized vol over
//   the next 30 calendar days for the S&P 500.

import { makeTtlCache } from "./cache";

const FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";

export interface VixClose {
  date: string;  // YYYY-MM-DD
  vix:  number;  // percentage points (18.5 = 18.5% annualized IV)
}

// 24-hour TTL — historical VIX closes are immutable; recent data changes at most once/day
const vixCache = makeTtlCache<VixClose[]>(24 * 60 * 60 * 1000);

export async function getVixCloses(from: string, to: string, signal?: AbortSignal): Promise<VixClose[]> {
  const cacheKey = `${from}:${to}`;
  const cached = vixCache.get(cacheKey);
  if (cached) {
    console.log(`[cache] HIT VIX closes ${from}→${to}`);
    return cached;
  }

  const url = `${FRED_URL}?id=VIXCLS&cosd=${from}&coed=${to}`;
  const r = await fetch(url, signal ? { signal } : undefined);
  if (!r.ok) throw new Error(`FRED ${r.status}: ${r.statusText}`);

  const text = await r.text();
  const lines = text.trim().split("\n");
  // Header: "observation_date,VIXCLS"
  const result: VixClose[] = [];
  for (const line of lines.slice(1)) {
    const [rawDate, rawVal] = line.trim().split(",");
    if (!rawDate || !rawVal || rawVal === ".") continue; // "." = missing obs in FRED
    const vix = parseFloat(rawVal);
    if (isNaN(vix)) continue;
    result.push({ date: rawDate.trim(), vix });
  }

  vixCache.set(cacheKey, result);
  console.log(`[fred] VIX closes: ${result.length} observations ${from}→${to}`);
  return result;
}
