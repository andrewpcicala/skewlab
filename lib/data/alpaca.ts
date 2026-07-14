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

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
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
        expiration_date_gte: isoToday(),
      });
      if (pageToken) params.set("page_token", pageToken);

      const page = await this.apiFetch<SnapshotsPage>(
        `${DATA_BASE}/v1beta1/options/snapshots/${underlying}?${params}`
      );

      for (const [ticker, snap] of Object.entries(page.snapshots)) {
        const parsed = parseTicker(ticker, underlying);
        if (!parsed) continue;

        const bid  = snap.latestQuote?.bp && snap.latestQuote.bp > 0
          ? snap.latestQuote.bp : null;
        const ask  = snap.latestQuote?.ap && snap.latestQuote.ap > 0
          ? snap.latestQuote.ap : null;
        const mid  = bid !== null && ask !== null ? (bid + ask) / 2 : null;
        const last = snap.latestTrade?.p ?? null; // null when untraded; never fall back to close

        quotes.push({
          symbol:       ticker,
          underlying,
          strike:       parsed.strike,
          expiry:       parsed.expiry,
          type:         parsed.type,
          bid,
          ask,
          mid,
          close:        snap.dailyBar?.c ?? null,
          last,
          volume:       snap.dailyBar?.v ?? 0,
          openInterest: null, // not in Alpaca snapshot response
          iv:           null, // vendor IV deliberately ignored — all pricing math
                              // in this app is hand-written (/lib/pricing)
        });
      }

      pages++;
      pageToken = page.next_page_token;
      if (pageToken && pages >= MAX_PAGES) {
        truncated = true;
        break;
      }
    } while (pageToken);

    // quoteBasis: "mid" when >50% of contracts have non-null mids, else "close"
    const withMid = quotes.filter((q) => q.mid !== null).length;
    const quoteBasis: "mid" | "close" = withMid > quotes.length / 2 ? "mid" : "close";

    const expiries = [...new Set(quotes.map((q) => q.expiry))].sort();

    console.log(
      `[alpaca] ${underlying}: ${quotes.length} contracts, ` +
      `${expiries.length} expiries, ${pages} page(s), quoteBasis=${quoteBasis}` +
      (truncated ? " [TRUNCATED]" : "")
    );

    return {
      underlying,
      spot,
      asOf:        new Date().toISOString(),
      expiries,
      quotes,
      dataQuality: "delayed",
      quoteBasis,
      truncated,
    };
  }
}
