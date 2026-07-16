// Swappable provider module. The rest of the app imports only the
// MarketDataProvider interface, never a concrete provider.

import type { MarketDataProvider, OptionChain, OptionQuote } from "./types";

const DATA_BASE = "https://data.alpaca.markets";
const MAX_PAGES = 5;

// ── Raw Alpaca response shapes ─────────────────────────────────────────────

interface AlpacaTrade { p: number; s: number; t: string }
interface AlpacaQuote { ap: number; as: number; bp: number; bs: number; t: string }
interface AlpacaBar   { c: number; h: number; l: number; o: number; v: number; t: string; n: number }

// Vendor greeks and impliedVolatility are deliberately NOT typed here.
// All pricing math in this app is hand-written (/lib/pricing). They
// are present in the wire response but must never be stored or used.
interface AlpacaSnapshot {
  dailyBar?:     AlpacaBar;
  latestQuote?:  AlpacaQuote;
  latestTrade?:  AlpacaTrade;
  minuteBar?:    AlpacaBar;
  prevDailyBar?: AlpacaBar;
}

interface SnapshotsPage {
  snapshots: Record<string, AlpacaSnapshot>;
  next_page_token: string | null;
}

// ── Ticker parsing ─────────────────────────────────────────────────────────
// Alpaca format: SPY260714C00749000  (no "O:" prefix, unlike Polygon)
function parseTicker(
  ticker: string,
  underlying: string
): { expiry: string; type: "call" | "put"; strike: number } | null {
  const suffix = ticker.slice(underlying.length);
  const m = suffix.match(/^(\d{2})(\d{2})(\d{2})(C|P)(\d{8})$/);
  if (!m) return null;
  const [, yy, mm, dd, cp, sp] = m;
  return {
    expiry: `20${yy}-${mm}-${dd}`,
    type: cp === "C" ? "call" : "put",
    strike: Number(sp) / 1000,
  };
}

function isoTodayET(): string {
  // en-CA gives ISO YYYY-MM-DD; America/New_York handles EST/EDT automatically
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// ── Provider ───────────────────────────────────────────────────────────────

export class AlpacaProvider implements MarketDataProvider {
  private readonly headers: Record<string, string>;

  constructor() {
    const id  = process.env.ALPACA_API_KEY_ID;
    const sec = process.env.ALPACA_API_SECRET_KEY;
    if (!id || !sec)
      throw new Error("ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY must be set");
    this.headers = {
      "APCA-API-KEY-ID":     id,
      "APCA-API-SECRET-KEY": sec,
      "Accept": "application/json",
    };
  }

  private async apiFetch<T>(url: string): Promise<T> {
    const attempt = async (retry: number): Promise<Response> => {
      const r = await fetch(url, { headers: this.headers });
      if (r.status === 429) {
        if (retry >= 1)
          throw new Error("Alpaca rate limit — data is cached, try again shortly");
        await new Promise((res) => setTimeout(res, 15_000));
        return attempt(retry + 1);
      }
      return r;
    };
    const r = await attempt(0);
    if (!r.ok) {
      const j = await r.json().catch(() => ({})) as { message?: string };
      throw new Error(`Alpaca ${r.status}: ${j.message ?? r.statusText}`);
    }
    return r.json();
  }

  async getSpot(underlying: string): Promise<number> {
    const data = await this.apiFetch<{ trade: { p: number } }>(
      `${DATA_BASE}/v2/stocks/${underlying}/trades/latest`
    );
    return data.trade.p;
  }

  // ── Quote mapper ──────────────────────────────────────────────────────────
  // Shared by getChain and getSurfaceChain — converts a raw snapshot entry
  // to an OptionQuote, returning null when the ticker is unparseable.
  private mapQuote(
    ticker: string,
    snap:   AlpacaSnapshot,
    underlying: string
  ): OptionQuote | null {
    const parsed = parseTicker(ticker, underlying);
    if (!parsed) return null;
    const bid  = snap.latestQuote?.bp && snap.latestQuote.bp > 0 ? snap.latestQuote.bp : null;
    const ask  = snap.latestQuote?.ap && snap.latestQuote.ap > 0 ? snap.latestQuote.ap : null;
    const mid  = bid !== null && ask !== null ? (bid + ask) / 2 : null;
    const last = snap.latestTrade?.p && snap.latestTrade.p > 0 ? snap.latestTrade.p : null;
    return {
      symbol:       ticker,
      underlying,
      strike:       parsed.strike,
      expiry:       parsed.expiry,
      type:         parsed.type,
      bid, ask, mid,
      close:        snap.dailyBar?.c ?? null,
      last,
      volume:       snap.dailyBar?.v ?? 0,
      openInterest: null,
      iv:           null,
    };
  }

  // ── Surface chain ──────────────────────────────────────────────────────────
  // Fetches the option chain expiry-by-expiry, selecting expiries spread across
  // the term structure rather than the nearest cluster of weeklies. This ensures
  // the surface shows term structure (how vol changes with time to expiry), not
  // just the front-week smile.
  //
  // Strategy:
  //   1. Discovery fetch — tight ATM strike range + 260-DTE cap to enumerate
  //      the full set of available expiries in one pass with minimal bandwidth.
  //   2. Target-DTE selection — for each target in [7,14,30,60,90,120,180,252]
  //      pick the available expiry whose actual DTE is nearest; deduplicate so
  //      the same expiry is only fetched once even if two targets map to it.
  //   3. Per-expiry fetch — exact expiration_date= param, strike ±20%, paginated.
  //
  // API probe confirmed: expiration_date= (exact) is a valid filter param.
  async getSurfaceChain(underlying: string): Promise<OptionChain> {
    const spot = await this.getSpot(underlying);

    // ── 1. Discovery: enumerate expiries in [3 DTE, 260 DTE] ──────────────
    const makeRelDate = (daysAhead: number) => {
      const d = new Date();
      d.setDate(d.getDate() + daysAhead);
      return d.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
    };
    const minExpiry = makeRelDate(3);
    const maxExpiry = makeRelDate(260); // cap covers the 252-DTE target with margin

    // Tight ATM range (floor → ceil+1) gives 2-6 contracts per expiry.
    // limit=500 covers ~80-120 expiries in one page — sufficient for any
    // liquid underlying. Paginate once more as a safety net.
    const allExpiriesSet = new Set<string>();
    let discoveryToken: string | null = null;
    let discoveryPages = 0;
    do {
      const dp = new URLSearchParams({
        feed:                "indicative",
        limit:               "500",
        expiration_date_gte: minExpiry,
        expiration_date_lte: maxExpiry,
        strike_price_gte:    String(Math.floor(spot)),
        strike_price_lte:    String(Math.ceil(spot) + 1),
      });
      if (discoveryToken) dp.set("page_token", discoveryToken);
      const disc = await this.apiFetch<SnapshotsPage>(
        `${DATA_BASE}/v1beta1/options/snapshots/${underlying}?${dp}`
      );
      for (const t of Object.keys(disc.snapshots)) {
        const exp = parseTicker(t, underlying)?.expiry;
        if (exp) allExpiriesSet.add(exp);
      }
      discoveryToken = disc.next_page_token;
      discoveryPages++;
    } while (discoveryToken && discoveryPages < 2);

    const allExpiries = [...allExpiriesSet].sort();

    // ── 2. Target-DTE selection ────────────────────────────────────────────
    // Spread across the curve so the surface shows term structure, not just
    // the front.  For each target, find the nearest available expiry by
    // calendar days; deduplicate via Set (two targets can converge to one
    // expiry when coverage is sparse at the far end).
    const TARGET_DTES = [7, 14, 30, 60, 90, 120, 180, 252];
    const todayMs = new Date(isoTodayET() + "T00:00:00Z").getTime();
    const calDte = (exp: string) =>
      (new Date(exp + "T00:00:00Z").getTime() - todayMs) / 86_400_000;

    const targetSet = new Set<string>();
    for (const tgt of TARGET_DTES) {
      if (allExpiries.length === 0) break;
      const nearest = allExpiries.reduce((best, exp) =>
        Math.abs(calDte(exp) - tgt) < Math.abs(calDte(best) - tgt) ? exp : best
      );
      targetSet.add(nearest);
    }
    const targetExpiries = [...targetSet].sort();

    if (targetExpiries.length === 0) {
      return {
        underlying, spot, asOf: new Date().toISOString(),
        expiries: [], quotes: [], dataQuality: "delayed",
        quoteBasis: "mid", truncated: false,
      };
    }

    // ── 2. Per-expiry fetch: strike ±20%, sequential ───────────────────────
    const lo = Math.round(spot * 0.80);
    const hi = Math.round(spot * 1.20);

    const allQuotes: OptionQuote[] = [];
    let truncated = false;

    for (const expiry of targetExpiries) {
      let pageToken: string | null = null;
      let pages = 0;

      do {
        const params = new URLSearchParams({
          feed:             "indicative",
          limit:            "500",
          expiration_date:  expiry,
          strike_price_gte: String(lo),
          strike_price_lte: String(hi),
        });
        if (pageToken) params.set("page_token", pageToken);

        const page = await this.apiFetch<SnapshotsPage>(
          `${DATA_BASE}/v1beta1/options/snapshots/${underlying}?${params}`
        );

        for (const [ticker, snap] of Object.entries(page.snapshots)) {
          const q = this.mapQuote(ticker, snap, underlying);
          if (q) allQuotes.push(q);
        }

        pages++;
        pageToken = page.next_page_token;
        if (pageToken && pages >= MAX_PAGES) { truncated = true; break; }
      } while (pageToken);
    }

    // Post-filter: drop any expiry now before today-ET (stale cache guard)
    const today = isoTodayET();
    const liveQuotes = allQuotes.filter(q => q.expiry >= today);

    const withMid = liveQuotes.filter(q => q.mid !== null).length;
    const quoteBasis: "mid" | "close" =
      withMid > liveQuotes.length / 2 ? "mid" : "close";

    const expiries = [...new Set(liveQuotes.map(q => q.expiry))].sort();

    console.log(
      `[alpaca] surface ${underlying}: ${liveQuotes.length} contracts, ` +
      `${expiries.length} expiries` +
      (truncated ? " [TRUNCATED]" : "")
    );

    return {
      underlying, spot,
      asOf:        new Date().toISOString(),
      expiries,
      quotes:      liveQuotes,
      dataQuality: "delayed",
      quoteBasis,
      truncated,
    };
  }

  async getChain(underlying: string): Promise<OptionChain> {
    const spot = await this.getSpot(underlying);

    // Strike window: spot ±25%, rounded to nearest $5
    const lo = Math.ceil((spot * 0.75) / 5) * 5;
    const hi = Math.floor((spot * 1.25) / 5) * 5;

    const quotes: OptionQuote[] = [];
    let pageToken: string | null = null;
    let pages = 0;
    let truncated = false;

    do {
      const params = new URLSearchParams({
        feed:               "indicative",
        limit:              "100",
        strike_price_gte:   String(lo),
        strike_price_lte:   String(hi),
        expiration_date_gte: isoTodayET(),
      });
      if (pageToken) params.set("page_token", pageToken);

      const page = await this.apiFetch<SnapshotsPage>(
        `${DATA_BASE}/v1beta1/options/snapshots/${underlying}?${params}`
      );

      for (const [ticker, snap] of Object.entries(page.snapshots)) {
        const q = this.mapQuote(ticker, snap, underlying);
        if (q) quotes.push(q);
      }

      pages++;
      pageToken = page.next_page_token;
      if (pageToken && pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    } while (pageToken);

    // Drop any expiry that is strictly before today in ET.
    // The API query already filters this, but the server-side cache can serve
    // data fetched earlier in the day that contained today's (now-expired) expiry.
    const today = isoTodayET();
    const liveQuotes = quotes.filter((q) => q.expiry >= today);

    // quoteBasis: "mid" when >50% of contracts have non-null mids, else "close"
    const withMid = liveQuotes.filter((q) => q.mid !== null).length;
    const quoteBasis: "mid" | "close" = withMid > liveQuotes.length / 2 ? "mid" : "close";

    const expiries = [...new Set(liveQuotes.map((q) => q.expiry))].sort();

    console.log(
      `[alpaca] ${underlying}: ${liveQuotes.length} contracts, ` +
      `${expiries.length} expiries, ${pages} page(s), quoteBasis=${quoteBasis}` +
      (truncated ? " [TRUNCATED]" : "")
    );

    return {
      underlying,
      spot,
      asOf:        new Date().toISOString(),
      expiries,
      quotes:      liveQuotes,
      dataQuality: "delayed",
      quoteBasis,
      truncated,
    };
  }
}
