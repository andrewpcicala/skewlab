// Plain assert script — run with: npx tsx lib/paper/engine.test.ts
import assert from "node:assert/strict";
import type { OptionChain, OptionQuote } from "../data/types";
import { fillPrice, markPosition, checkExits } from "./engine";
import type { Position } from "./ledger";
import { STRATEGIES } from "./strategies";

const strategy = STRATEGIES.find(s => s.id === "spy-30d-put")!;

// ── Helpers ───────────────────────────────────────────────────────────────────

// All expiries are computed at test-run time so these tests never rely on
// hardcoded future dates — a date that was "30d away" at write time becomes
// a past date six months later and silently breaks tests.
function daysFromNow(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// expiry 30d from now — comfortably outside the DTE-7 close trigger
const FAR_EXPIRY = daysFromNow(30);
const FAR_SYM    = "SPY_FAR_TEST";

function makeQuote(overrides: Partial<OptionQuote>): OptionQuote {
  return {
    symbol:       FAR_SYM,
    underlying:   "SPY",
    strike:       575,
    expiry:       FAR_EXPIRY,
    type:         "put",
    bid:          2.40,
    ask:          2.60,
    mid:          2.50,
    close:        2.48,
    last:         2.45,
    volume:       1200,
    openInterest: null,
    iv:           null,
    ...overrides,
  };
}

function makeChain(quotes: OptionQuote[]): OptionChain {
  return {
    underlying:  "SPY",
    spot:        580,
    asOf:        new Date().toISOString(),
    expiries:    [FAR_EXPIRY],
    quotes,
    dataQuality: "delayed",
    quoteBasis:  "mid",
    truncated:   false,
  };
}

function makePosition(overrides: Partial<Position> = {}): Position {
  return {
    id:          "pos-test",
    strategyId:  "spy-30d-put",
    openedAt:    new Date().toISOString(),
    contract: {
      symbol: FAR_SYM,
      strike: 575,
      expiry: FAR_EXPIRY,
      type:   "put",
    },
    side:        "sell",
    qty:         1,
    entryFill:   2.50,
    entrySpread: { bid: 2.50, ask: 2.60 },
    entryDelta:  -0.28,
    entryIv:     0.184,
    status:      "open",
    closes:      [],
    marks:       [],
    ...overrides,
  };
}

// ── 1. fillPrice: sell fills at bid ──────────────────────────────────────────
// Sell crosses to the bid — receives less than mid to model realistic execution.
// bid=2.40, ask=2.60 → sell fill = 2.40, not mid 2.50.
{
  const q = makeQuote({ bid: 2.40, ask: 2.60 });
  assert.equal(fillPrice("sell", q), 2.40, `sell: expected bid 2.40`);
}

// ── 2. fillPrice: buy fills at ask ────────────────────────────────────────────
// Buy crosses to the ask — pays more than mid. Same spread, opposite direction.
// bid=2.40, ask=2.60 → buy fill = 2.60.
{
  const q = makeQuote({ bid: 2.40, ask: 2.60 });
  assert.equal(fillPrice("buy", q), 2.60, `buy: expected ask 2.60`);
}

// ── 3. fillPrice: null bid/ask propagates ─────────────────────────────────────
{
  const q = makeQuote({ bid: null, ask: null });
  assert.equal(fillPrice("sell", q), null, "null bid → null sell fill");
  assert.equal(fillPrice("buy",  q), null, "null ask → null buy fill");
}

// ── 4. markPosition win: pnl = +$125 ─────────────────────────────────────────
// Entry: short 1 contract at $2.50 → credit = $250.
// Mark drops to $1.25 (put decayed to half its value).
// pnl = (entryFill − mark) × 100 × qty = (2.50 − 1.25) × 100 × 1 = $125.
{
  const chain  = makeChain([makeQuote({ mid: 1.25 })]);
  const result = markPosition(makePosition(), chain);
  assert(result !== null, "win: null result");
  assert.equal(result!.mark, 1.25);
  assert(Math.abs(result!.pnl - 125) < 0.01, `win pnl: expected 125, got ${result!.pnl}`);
}

// ── 5. markPosition loss: pnl = −$250 ────────────────────────────────────────
// Entry at $2.50; mark rises to $5.00 (put doubled against the seller).
// pnl = (2.50 − 5.00) × 100 × 1 = −$250. Loss equals original credit.
{
  const chain  = makeChain([makeQuote({ mid: 5.00 })]);
  const result = markPosition(makePosition(), chain);
  assert(result !== null, "loss: null result");
  assert.equal(result!.mark, 5.00);
  assert(Math.abs(result!.pnl - (-250)) < 0.01, `loss pnl: expected -250, got ${result!.pnl}`);
}

// ── 6. markPosition: null when contract not found ─────────────────────────────
{
  const chain = makeChain([makeQuote({ symbol: "SPY_DIFFERENT" })]);
  assert.equal(markPosition(makePosition(), chain), null, "missing symbol → null");
}

// ── 7. checkExits: profit-take triggers at exactly 50% of credit ──────────────
// Credit = 2.50 × 100 × 1 = $250. Target = 50% = $125.
// Mark at $1.25 → pnl = (2.50 − 1.25) × 100 = $125 = target → EXIT.
// FAR_EXPIRY (30d out) ensures DTE check does not fire first.
{
  const chain  = makeChain([makeQuote({ mid: 1.25 })]);
  const signal = checkExits(makePosition(), chain, strategy);
  assert(signal !== null,                    "50% exact: expected signal");
  assert.equal(signal!.reason, "profit-take", `50% exact: reason = ${signal!.reason}`);
  assert(Math.abs(signal!.pnl - 125) < 0.01, `50% exact: pnl = ${signal!.pnl}`);
}

// ── 8. checkExits: profit-take does NOT fire just below 50% ──────────────────
// Mark at $1.26 → pnl = (2.50 − 1.26) × 100 = $124 < $125 → NO EXIT.
{
  const chain  = makeChain([makeQuote({ mid: 1.26 })]);
  const signal = checkExits(makePosition(), chain, strategy);
  assert.equal(signal, null, `below 50%: expected null, got ${signal?.reason}`);
}

// ── 9. checkExits: DTE ≤ 7 forces close regardless of P&L (at a loss) ────────
// Expiry 6 calendar days from now → DTE ≈ 6 ≤ 7 → dte-close.
// Mark at $4.50 (deeply offside) — DTE close fires before any profit check.
{
  const sym    = "SPY_DTE6_TEST";
  const expiry = daysFromNow(6);
  const pos    = makePosition({ contract: { symbol: sym, strike: 575, expiry, type: "put" } });
  const chain  = makeChain([makeQuote({ symbol: sym, expiry, mid: 4.50 })]);
  const signal = checkExits(pos, chain, strategy);
  assert(signal !== null,                  "DTE 6: expected signal");
  assert.equal(signal!.reason, "dte-close", `DTE 6: reason = ${signal!.reason}`);
}

// ── 10. checkExits: DTE = 8 does NOT trigger DTE close ───────────────────────
// 8 calendar days away → DTE ≈ 8 > 7. Mark at breakeven → no profit exit either.
{
  const sym    = "SPY_DTE8_TEST";
  const expiry = daysFromNow(8);
  const pos    = makePosition({ contract: { symbol: sym, strike: 575, expiry, type: "put" } });
  const chain  = makeChain([makeQuote({ symbol: sym, expiry, mid: 2.50 })]);
  const signal = checkExits(pos, chain, strategy);
  assert.equal(signal, null, `DTE 8: expected null, got ${signal?.reason}`);
}

// ── 11. checkExits: null when contract absent from chain ─────────────────────
{
  const signal = checkExits(makePosition(), makeChain([]), strategy);
  assert.equal(signal, null, "empty chain → null");
}

console.log("All paper engine tests passed.");
