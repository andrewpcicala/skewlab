// Ledger types — shared between the engine and the CLI scripts.

export interface ContractRef {
  symbol: string;   // exchange symbol, e.g. SPY260117P00575000
  strike: number;
  expiry: string;   // YYYY-MM-DD
  type:   "call" | "put";
}

export interface CloseEvent {
  at:     string;  // ISO timestamp of the fill
  fill:   number;  // execution price
  reason: "profit-take" | "dte-close" | "manual";
}

export interface MarkEvent {
  at:  string;  // ISO timestamp
  mid: number;  // current market mid (or close fallback)
  pnl: number;  // cumulative unrealized P&L at mark time (USD)
}

export interface Position {
  id:          string;            // timestamp-based unique ID
  strategyId:  string;
  openedAt:    string;            // ISO timestamp of entry fill
  contract:    ContractRef;
  side:        "sell" | "buy";
  qty:         number;            // number of contracts
  entryFill:   number;            // actual execution price (bid for sells, ask for buys)
  entrySpread: { bid: number; ask: number };  // spread at entry for audit
  entryDelta:  number;            // delta at entry from our BS engine
  entryIv:     number;            // IV at entry (decimal, e.g. 0.184 = 18.4%)
  status:      "open" | "closed";
  closes:      CloseEvent[];      // append-only; normally 0 or 1 entry
  marks:       MarkEvent[];       // append-only mark history
}

export interface Ledger {
  _comment:   string;
  positions:  Position[];
  lastMarkAt: string | null;  // ISO timestamp of most recent mark run
}
