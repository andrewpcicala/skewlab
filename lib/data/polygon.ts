// Polygon.io provider — Phase 3: historical stock aggregates (getDailyCloses).
// Options chain is served by AlpacaProvider (lib/data/alpaca.ts).
//
// TIER NOTE: /v3/snapshot/options returns 403 on the free Polygon plan.
// I:VIX (index aggregates) is NOT_AUTHORIZED on free tier — VIX sourced from
// FRED VIXCLS instead (see lib/data/vix.ts).
// Free tier data range: ~2 years back (verified: 501 trading days available).

import type { MarketDataProvider, OptionChain, OptionQuote } from "./types";
import { makeTtlCache } from "./cache";

const BASE = "https://api.polygon.io";
const BATCH_SIZE = 5;
const MAX_BATCHES = 4; // cap: 20 contract fetches + 1 spot = 21 total calls
const BATCH_DELAY_MS = 13_000; // ~4.6 batches/min — stays safely under free-tier limit

// Raw shape returned by /v2/aggs/ticker/{ticker}/prev
interface PolyBar {
  T: string;  // ticker
  v: number;  // volume
  vw: number; // VWAP
  o: number;  // open
  c: number;  // close  ← the "market price" we use for EOD analytics
  h: number;  // high
  l: number;  // low
  t: number;  // unix ms timestamp
  n: number;  // number of transactions
}
interface PolyAggResponse {
  results?: PolyBar[];
  status: string;
}

// Shape returned by /v2/aggs/ticker/{sym}/range/1/day/{from}/{to}
interface PolyRangeResponse {
  results?:  PolyBar[];
  status:    string;
  next_url?: string;
}

// ── getDailyCloses ────────────────────────────────────────────────────────────

export interface DailyClose {
  date:  string;  // YYYY-MM-DD (UTC calendar date of bar)
  close: number;
}

// 24-hour TTL — historical closes are immutable once the day is settled
const closeCache = makeTtlCache<DailyClose[]>(24 * 60 * 60 * 1000);

export async function getDailyCloses(
  symbol: string,
  from:   string,  // YYYY-MM-DD inclusive
  to:     string,  // YYYY-MM-DD inclusive
  signal?: AbortSignal,
): Promise<DailyClose[]> {
  const cacheKey = `${symbol}:${from}:${to}`;
  const cached = closeCache.get(cacheKey);
  if (cached) {
    console.log(`[cache] HIT ${symbol} closes ${from}→${to}`);
    return cached;
  }

  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error("POLYGON_API_KEY is not set");

  const results: DailyClose[] = [];
  // next_url from Polygon already contains all query params except apiKey
  let url: string | null =
    `${BASE}/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}` +
    `?adjusted=true&sort=asc&limit=5000&apiKey=${apiKey}`;

  while (url) {
    const r = await fetch(url, signal ? { signal } : undefined);
    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { message?: string };
      throw new Error(`Polygon ${r.status}: ${j.message ?? r.statusText}`);
    }
    const j = await r.json() as PolyRangeResponse;
    for (const bar of j.results ?? []) {
      // bar.t is Unix ms at midnight UTC for the session date
      results.push({ date: new Date(bar.t).toISOString().slice(0, 10), close: bar.c });
    }
    url = j.next_url ? `${j.next_url}&apiKey=${apiKey}` : null;
  }

  closeCache.set(cacheKey, results);
  console.log(`[polygon] ${symbol} closes: ${results.length} bars ${from}→${to}`);
  return results;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Parse Polygon option ticker: O:SPY260918C00700000
function parseTicker(ticker: string): {
  underlying: string;
  expiry: string;
  type: "call" | "put";
  strike: number;
} | null {
  const m = ticker.match(/^O:([A-Z]{1,6})(\d{2})(\d{2})(\d{2})(C|P)(\d{8})$/);
  if (!m) return null;
  const [, underlying, yy, mm, dd, cp, strikePart] = m;
  return {
    underlying,
    expiry: `20${yy}-${mm}-${dd}`,
    type: cp === "C" ? "call" : "put",
    strike: Number(strikePart) / 1000,
  };
}

// Third Friday of the month — standard US equity option expiry
function thirdFriday(year: number, month: number): Date {
  // month is 0-indexed
  const dayOfWeek = new Date(year, month, 1).getDay(); // 0=Sun
  const daysToFriday = (5 - dayOfWeek + 7) % 7;
  return new Date(year, month, 1 + daysToFriday + 14);
}

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function nextMonthlyExpiries(count: number): string[] {
  const out: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let mo = now.getMonth();
  while (out.length < count) {
    const exp = thirdFriday(y, mo);
    if (exp > now) out.push(isoDate(exp));
    mo++;
    if (mo > 11) { mo = 0; y++; }
  }
  return out;
}

// Strikes from spot × 0.75 to spot × 1.25, rounded to nearest $step
function strikeRange(spot: number, step: number): number[] {
  const lo = Math.ceil((spot * 0.75) / step) * step;
  const hi = Math.floor((spot * 1.25) / step) * step;
  const out: number[] = [];
  for (let s = lo; s <= hi; s += step) out.push(s);
  return out;
}

function buildTicker(
  underlying: string,
  expiry: string,
  type: "C" | "P",
  strike: number
): string {
  const [y, mm, dd] = expiry.split("-");
  const strikePart = String(Math.round(strike * 1000)).padStart(8, "0");
  return `O:${underlying}${y.slice(2)}${mm}${dd}${type}${strikePart}`;
}

export class PolygonProvider implements MarketDataProvider {
  private readonly apiKey: string;

  constructor() {
    const key = process.env.POLYGON_API_KEY;
    if (!key) throw new Error("POLYGON_API_KEY is not set");
    this.apiKey = key;
  }

  private async fetchAgg(ticker: string): Promise<PolyAggResponse> {
    const url = `${BASE}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${this.apiKey}`;
    const attempt = async (retry: number): Promise<Response> => {
      const r = await fetch(url);
      if (r.status === 429) {
        if (retry >= 1)
          throw new Error("Polygon rate limit — data is cached, try again shortly");
        await delay(15_000);
        return attempt(retry + 1);
      }
      return r;
    };
    const r = await attempt(0);
    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { message?: string };
      throw new Error(`Polygon ${r.status}: ${j.message ?? r.statusText}`);
    }
    return r.json();
  }

  async getSpot(underlying: string): Promise<number> {
    const data = await this.fetchAgg(underlying);
    const bar = data.results?.[0];
    if (!bar) throw new Error(`No prev-close data for ${underlying}`);
    return bar.c;
  }

  async getChain(underlying: string): Promise<OptionChain> {
    const spot = await this.getSpot(underlying);

    // Generate tickers for 4 monthly expiries, spot ±25% in $5 steps
    const expiries = nextMonthlyExpiries(4);
    const strikes = strikeRange(spot, 5);
    const allTickers: string[] = [];
    for (const exp of expiries) {
      for (const strike of strikes) {
        allTickers.push(buildTicker(underlying, exp, "C", strike));
        allTickers.push(buildTicker(underlying, exp, "P", strike));
      }
    }

    // Sort by proximity to ATM so the most useful contracts are fetched first
    allTickers.sort((a, b) => {
      const pa = parseTicker(a)!;
      const pb = parseTicker(b)!;
      return Math.abs(pa.strike - spot) - Math.abs(pb.strike - spot);
    });

    const fetchTicker = async (ticker: string): Promise<OptionQuote | null> => {
      try {
        const data = await this.fetchAgg(ticker);
        const bar = data.results?.[0];
        if (!bar) return null; // contract didn't trade yesterday — skip
        const parsed = parseTicker(ticker);
        if (!parsed) return null;
        return {
          symbol: ticker,
          underlying: parsed.underlying,
          strike: parsed.strike,
          expiry: parsed.expiry,
          type: parsed.type,
          bid: null,       // not in aggregates endpoint on free tier
          ask: null,
          mid: null,
          close: bar.c,
          last: bar.c,     // best EOD proxy for last price
          volume: bar.v,
          openInterest: 0, // not in aggregates endpoint
          iv: null,        // computed in Phase 2 — never use vendor IV
        };
      } catch {
        return null;
      }
    };

    const quotes: OptionQuote[] = [];
    const maxFetch = MAX_BATCHES * BATCH_SIZE;

    for (let b = 0; b < MAX_BATCHES; b++) {
      const batch = allTickers.slice(b * BATCH_SIZE, (b + 1) * BATCH_SIZE);
      if (batch.length === 0) break;
      if (b > 0) await delay(BATCH_DELAY_MS);

      const results = await Promise.allSettled(batch.map(fetchTicker));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value !== null) quotes.push(r.value);
      }
    }

    const expiriesPresent = [...new Set(quotes.map((q) => q.expiry))].sort();
    const truncated = allTickers.length > maxFetch;

    console.log(
      `[polygon] ${underlying}: ${quotes.length} contracts across ${expiriesPresent.length} expiries` +
        (truncated ? ` (truncated — ${allTickers.length - maxFetch} tickers not fetched)` : "")
    );

    return {
      underlying,
      spot,
      asOf: new Date().toISOString(),
      expiries: expiriesPresent,
      quotes,
      dataQuality: "eod",
      quoteBasis: "close",
      truncated,
    };
  }
}
