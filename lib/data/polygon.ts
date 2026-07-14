// Polygon.io provider — retained for Phase 3 historical stock aggregates.
// Options chain is now served by AlpacaProvider (lib/data/alpaca.ts).
// Nothing imports this file yet; it will be wired in Phase 3 for
// historical close data via /v2/aggs/ticker/{ticker}/range.
//
// TIER NOTE: /v3/snapshot/options returns 403 on the free Polygon plan.
// Options chain was attempted here but proved unavailable on this tier.

import type { MarketDataProvider, OptionChain, OptionQuote } from "./types";

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
