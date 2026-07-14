export interface OptionQuote {
  symbol: string;
  underlying: string;
  strike: number;
  expiry: string; // ISO date string
  type: "call" | "put";
  bid: number | null;   // null on free tier — aggregates have no quote data
  ask: number | null;
  mid: number | null;   // (bid + ask) / 2 when both present, else null
  close: number | null; // prior-day close from aggregates
  last: number;
  volume: number;
  openInterest: number | null; // null when absent from feed (0 would be a false claim)
  iv: number | null;    // null until Phase 2 — never use a vendor's precomputed IV
}

export interface OptionChain {
  underlying: string;
  spot: number;
  asOf: string; // ISO string
  expiries: string[];
  quotes: OptionQuote[];
  dataQuality: "live" | "delayed" | "eod";
  quoteBasis: "mid" | "close"; // which field downstream pricing should use as market price
  truncated: boolean;          // true when more contracts exist than were fetched
}

export interface MarketDataProvider {
  getChain(underlying: string): Promise<OptionChain>;
  getSpot(underlying: string): Promise<number>;
}
