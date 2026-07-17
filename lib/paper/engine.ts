// Paper strategy engine — pure functions only; no I/O, no side effects.
// All pricing uses our hand-written BS engine, never vendor greeks or IV.

import { bsPrice, timeToExpiryYears }  from "../pricing/blackScholes";
import { solveImpliedVol }              from "../pricing/impliedVol";
import { RISK_FREE_RATE, DIV_YIELD_DEFAULT } from "../pricing/config";
import type { OptionChain, OptionQuote }     from "../data/types";
import type { Strategy }                     from "./strategies";
import type { Position }                     from "./ledger";

// ── findEntryContract ──────────────────────────────────────────────────────────
// From the current chain, find the contract nearest to targetDelta that also
// falls within the DTE range and delta tolerance defined in the strategy.
//
// For each candidate:
//   1. Solve IV from the contract's mid price using our Newton-Raphson solver.
//   2. Compute delta from that IV using our BS engine.
//
// This is the only correct way to get delta for a paper engine: the market mid
// price IS the vol signal; we back out IV and then derive all greeks from it.
// Using a vendor's precomputed delta would be using their pricing model, not ours.

export type EntryResult =
  | { ok: true;  quote: OptionQuote; delta: number; iv: number; dte: number }
  | { ok: false; reason: string };

export function findEntryContract(chain: OptionChain, strategy: Strategy): EntryResult {
  const { type, targetDelta, deltaTolerance, dteRange } = strategy.rules;
  const [minDte, maxDte] = dteRange;
  const spot = chain.spot;

  // Filter 1: correct option type + live mid + DTE in range
  const candidates = chain.quotes.filter(q => {
    if (q.type !== type)   return false;
    if (q.mid === null)    return false; // mid required; close-based IV is stale
    const dte = timeToExpiryYears(q.expiry) * 365;
    return dte >= minDte && dte <= maxDte;
  });

  if (candidates.length === 0) {
    return { ok: false, reason: `no ${type} with live mid in DTE [${minDte}–${maxDte}]` };
  }

  type Scored = { quote: OptionQuote; delta: number; iv: number; dte: number; dist: number };
  const scored: Scored[] = [];

  for (const q of candidates) {
    const timeYears = timeToExpiryYears(q.expiry);
    const bsInputs  = { spot, strike: q.strike, timeYears, rate: RISK_FREE_RATE, divYield: DIV_YIELD_DEFAULT };

    // Step 1: solve IV from mid price
    const ivResult = solveImpliedVol(q.type, q.mid!, bsInputs);
    if (ivResult.iv === null) continue; // skip if IV unsolvable (deep ITM, zero vega, etc.)

    // Step 2: compute delta from solved IV
    const { delta } = bsPrice(q.type, { ...bsInputs, vol: ivResult.iv });

    const dist = Math.abs(delta - targetDelta);
    if (dist > deltaTolerance) continue;

    scored.push({ quote: q, delta, iv: ivResult.iv, dte: timeYears * 365, dist });
  }

  if (scored.length === 0) {
    return { ok: false, reason: `no contract within ±${deltaTolerance} of delta ${targetDelta}` };
  }

  // Pick the contract whose delta is closest to target
  scored.sort((a, b) => a.dist - b.dist);
  const { quote, delta, iv, dte } = scored[0];
  return { ok: true, quote, delta, iv, dte };
}

// ── fillPrice ─────────────────────────────────────────────────────────────────
// The honesty rule: sells fill at the BID, buys fill at the ASK.
//
// In a real market, you cannot sell at mid — you sell to whoever bids. Using
// mid fills flatters paper P&L by assuming perfect execution. Crossing the
// spread is the minimum realistic transaction cost model. A short put at bid
// instead of mid loses $5-15 per contract on entry; over many cycles this is
// material and should be tracked honestly.

export function fillPrice(side: "sell" | "buy", quote: OptionQuote): number | null {
  if (side === "sell") return quote.bid; // seller receives the bid
  return quote.ask;                       // buyer pays the ask
}

// ── markPosition ──────────────────────────────────────────────────────────────
// Current mark is the best available price from the chain (mid preferred, close
// as fallback). Returns null when the contract is no longer in the chain
// (expired, or chain doesn't cover that strike/expiry).
//
// P&L convention for short options:
//   pnl = (entryFill − currentMark) × 100 × qty
//   Positive when the option's price fell (good for seller).
//   Negative when the price rose (loss for seller).

export function markPosition(
  position: Position,
  chain:    OptionChain,
): { mark: number; pnl: number } | null {
  const quote = chain.quotes.find(q => q.symbol === position.contract.symbol);
  if (!quote) return null;

  const mark = quote.mid ?? quote.close;
  if (mark === null) return null;

  const pnl = position.side === "sell"
    ? (position.entryFill - mark) * 100 * position.qty
    : (mark - position.entryFill) * 100 * position.qty;

  return { mark, pnl };
}

// ── checkExits ────────────────────────────────────────────────────────────────
// Returns an exit signal if any exit condition is met; null otherwise.
// Caller is responsible for actually writing the close event to the ledger.
//
// Exit priority:
//   1. DTE ≤ closeAtDte: mandatory — capital preservation over last few theta
//   2. P&L ≥ profitTakePctOfCredit of credit: optional early exit

export interface ExitSignal {
  reason: "profit-take" | "dte-close";
  mark:   number;
  pnl:    number;
}

export function checkExits(
  position: Position,
  chain:    OptionChain,
  strategy: Strategy,
): ExitSignal | null {
  const marked = markPosition(position, chain);
  if (!marked) return null;

  const { mark, pnl } = marked;
  const { exit }      = strategy.rules;

  // DTE check takes priority — close before gamma week regardless of P&L
  const dte = timeToExpiryYears(position.contract.expiry) * 365;
  if (dte <= exit.closeAtDte) return { reason: "dte-close", mark, pnl };

  // Profit-take: close when unrealized gain >= target fraction of credit
  const credit = position.entryFill * 100 * position.qty;
  const target = credit * (exit.profitTakePctOfCredit / 100);
  if (pnl >= target) return { reason: "profit-take", mark, pnl };

  return null;
}
