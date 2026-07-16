import { bsPrice, type BSInputs } from "./blackScholes";

export interface IVResult {
  iv:         number | null;
  iterations: number;
  method:     "newton" | "bisection" | null;
  reason?:    string;
}

// Solve for the implied volatility that makes BS price equal the market price.
// Returns null when no finite vol can satisfy the constraint (arbitrage violation,
// expired option, or degenerate geometry).
export function solveImpliedVol(
  type:        "call" | "put",
  marketPrice: number,
  i:           Omit<BSInputs, "vol">
): IVResult {
  const { spot: S, strike: K, rate: r, divYield: q, timeYears: T } = i;

  // ── Pre-checks ─────────────────────────────────────────────────────────────

  // A zero or negative market price has no implied vol; it is either a quote error
  // or the option is worthless (which would have an infinite-range IV problem).
  if (marketPrice <= 0) {
    return { iv: null, iterations: 0, method: null, reason: "invalid price" };
  }

  // An expired option has no time value left; IV is undefined.
  if (T <= 0) {
    return { iv: null, iterations: 0, method: null, reason: "expired" };
  }

  // Forward intrinsic: the BS price at vol → 0.
  // If the market price is BELOW this value, no vol in [0,∞) can produce it —
  // the position is in arbitrage (you can buy and immediately exercise for a profit).
  const eNegQT = Math.exp(-q * T);
  const eNegRT = Math.exp(-r * T);
  const intrinsic = type === "call"
    ? Math.max(S * eNegQT - K * eNegRT, 0)
    : Math.max(K * eNegRT - S * eNegQT, 0);

  if (marketPrice < intrinsic - 1e-6) {
    return { iv: null, iterations: 0, method: null, reason: "below intrinsic" };
  }

  // ── Newton-Raphson ─────────────────────────────────────────────────────────
  // Solve f(σ) = BS(σ) − target = 0 by iterating: σ_new = σ_old − f/f'
  // where f'(σ) = ∂BS/∂σ = raw annual vega.
  //
  // Starting guess 0.20 (20%) works well for equities; most real IV is 5–150%.

  const CONV = 1e-6;  // price-space convergence threshold
  const NMAX = 20;
  let vol = 0.20;

  for (let n = 0; n < NMAX; n++) {
    const res  = bsPrice(type, { ...i, vol });
    const diff = res.price - marketPrice;

    if (Math.abs(diff) < CONV) {
      return { iv: vol, iterations: n + 1, method: "newton" };
    }

    // TRAP: bsResult.vega is ∂price/∂(one vol POINT), i.e. scaled by 1/100.
    // Newton needs the raw annual vega: ∂price/∂σ where σ is a decimal.
    // Recover it by multiplying back: rawVega = vega × 100.
    // Using res.vega directly would make each step 100× too small.
    const rawVega = res.vega * 100;

    // Vega → 0 near expiry or deep ITM/OTM: Newton's division blows up.
    // Break out and let bisection handle it — bisection needs no derivative.
    if (Math.abs(rawVega) < 1e-10) break;

    vol = Math.min(5.0, Math.max(0.001, vol - diff / rawVega));
  }

  // ── Bisection fallback ─────────────────────────────────────────────────────
  // Bisection is slower (linear convergence, O(log₂) iterations per decimal of
  // accuracy) but unconditionally convergent given a bracketing interval.
  // BS price is strictly monotone in vol (vega > 0), so [0.001, 5.0] brackets
  // every sensible real-world IV.

  let lo = 0.001, hi = 5.0;
  const pLo = bsPrice(type, { ...i, vol: lo }).price;
  const pHi = bsPrice(type, { ...i, vol: hi }).price;

  // Verify the interval actually brackets the target.
  // pLo > target can happen if price is very close to forward intrinsic;
  // pHi < target would mean IV > 500%, which is not a real market scenario.
  if (pLo > marketPrice + 1e-8 || pHi < marketPrice - 1e-8) {
    return { iv: null, iterations: NMAX, method: null, reason: "no bracket" };
  }

  for (let n = 0; n < 100; n++) {
    const mid  = (lo + hi) / 2;
    const pMid = bsPrice(type, { ...i, vol: mid }).price;

    if (Math.abs(pMid - marketPrice) < CONV) {
      return { iv: mid, iterations: NMAX + n + 1, method: "bisection" };
    }

    if (pMid < marketPrice) lo = mid; else hi = mid;
  }

  // Bisection ran to completion: return the midpoint (error < 5/2^100 ≈ 0)
  return { iv: (lo + hi) / 2, iterations: NMAX + 100, method: "bisection" };
}
