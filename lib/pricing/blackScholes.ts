import { normCdf, normPdf } from "./math";

export interface BSInputs {
  spot:      number; // S — current underlying price
  strike:    number; // K
  timeYears: number; // T — time to expiry in years (ACT/365)
  rate:      number; // r — continuous risk-free rate (e.g. 0.045)
  vol:       number; // σ — implied volatility as a decimal (e.g. 0.20 for 20%)
  divYield:  number; // q — continuous dividend yield (Merton 1973 adjustment)
}

export interface BSResult {
  price:  number;
  delta:  number;
  gamma:  number;
  theta:  number; // per calendar day
  vega:   number; // per 1 vol point (0.01 move in σ)
  rho:    number; // per 1% move in r
  vanna:  number; // ∂delta/∂vol, per vol point
  charm:  number; // ∂delta/∂time, per calendar day
  d1:     number;
  d2:     number;
}

// ACT/365, assumes 16:00 ET expiry (= 21:00 UTC, EST convention).
// Ignores trading-day calendars and daylight-saving shifts — stated simplification.
export function timeToExpiryYears(expiry: string): number {
  const expiryMs = new Date(`${expiry}T21:00:00Z`).getTime();
  const days = (expiryMs - Date.now()) / (1000 * 60 * 60 * 24);
  return Math.max(0, days / 365);
}

export function bsPrice(type: "call" | "put", i: BSInputs): BSResult {
  const { spot: S, strike: K, rate: r, divYield: q } = i;
  // Floor vol at a tiny epsilon to prevent division-by-zero without introducing NaNs
  const vol = Math.max(i.vol, 1e-8);
  const T   = Math.max(i.timeYears, 0);

  // ── Edge case: option has expired ─────────────────────────────────────────
  if (T === 0) {
    const intrinsic = type === "call" ? Math.max(S - K, 0) : Math.max(K - S, 0);
    const delta     = type === "call" ? (S >= K ? 1 : 0) : (S <= K ? -1 : 0);
    return { price: intrinsic, delta, gamma: 0, theta: 0, vega: 0, rho: 0, vanna: 0, charm: 0, d1: 0, d2: 0 };
  }

  const sqrtT  = Math.sqrt(T);
  const eNegQT = Math.exp(-q * T);
  const eNegRT = Math.exp(-r * T);

  // ── Merton (1973) dividend-adjusted Black-Scholes ─────────────────────────
  // q shifts the forward price down by the present value of dividends paid
  const d1 = (Math.log(S / K) + (r - q + 0.5 * vol * vol) * T) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;

  // ── Price ─────────────────────────────────────────────────────────────────
  const price = type === "call"
    ? S * eNegQT * normCdf(d1) - K * eNegRT * normCdf(d2)
    : K * eNegRT * normCdf(-d2) - S * eNegQT * normCdf(-d1);

  // ── Delta — ∂price/∂S ─────────────────────────────────────────────────────
  // e^(-qT) discount because dividends reduce the effective stock exposure
  const delta = type === "call"
    ? eNegQT * normCdf(d1)
    : eNegQT * (normCdf(d1) - 1);

  // ── Gamma — ∂delta/∂S (same sign for calls and puts) ─────────────────────
  // Measures curvature: how fast the hedge ratio drifts per $1 move
  const gamma = eNegQT * normPdf(d1) / (S * vol * sqrtT);

  // ── Theta — daily P&L from time decay ─────────────────────────────────────
  // Compute annual form first, then divide by 365 for the daily-decay convention.
  // The -S·e^(-qT)·n(d1)·σ/(2√T) term is the same for calls and puts;
  // the remaining terms differ because calls and puts respond differently to
  // the passage of time and the opportunity cost of holding the strike.
  const thetaCommon = -S * eNegQT * normPdf(d1) * vol / (2 * sqrtT);
  const theta = type === "call"
    ? (thetaCommon - r * K * eNegRT * normCdf(d2)  + q * S * eNegQT * normCdf(d1))  / 365
    : (thetaCommon + r * K * eNegRT * normCdf(-d2) - q * S * eNegQT * normCdf(-d1)) / 365;

  // ── Vega — ∂price/∂σ per vol point (i.e. per 0.01 change in σ) ───────────
  // Peaks ATM and for long-dated options; identical for calls and puts
  const vega = S * eNegQT * normPdf(d1) * sqrtT / 100;

  // ── Rho — ∂price/∂r per 1% rate move ─────────────────────────────────────
  // Calls benefit from higher rates (deferred payment of strike); puts hurt
  const rho = type === "call"
    ?  K * T * eNegRT * normCdf(d2)  / 100
    : -K * T * eNegRT * normCdf(-d2) / 100;

  // ── Vanna — ∂delta/∂σ per vol point ──────────────────────────────────────
  // Derived: ∂/∂σ [e^(-qT)·N(d1)] = e^(-qT)·n(d1)·(∂d1/∂σ), and ∂d1/∂σ = -d2/σ
  // Same value for calls and puts (put delta is N(d1)-1, the -1 is constant)
  const vanna = -eNegQT * normPdf(d1) * d2 / vol / 100;

  // ── Charm — daily change in delta as time passes ──────────────────────────
  // ∂d1/∂T = -d1/(2T) + (r - q + σ²/2)/(σ√T)
  const dd1dT = -d1 / (2 * T) + (r - q + 0.5 * vol * vol) / (vol * sqrtT);
  // ∂delta/∂T per year; negate and scale by 1/365 for "per calendar day passing"
  const dDeltadT = type === "call"
    ? -q * eNegQT * normCdf(d1)       + eNegQT * normPdf(d1) * dd1dT
    : -q * eNegQT * (normCdf(d1) - 1) + eNegQT * normPdf(d1) * dd1dT;
  const charm = -dDeltadT / 365;

  return { price, delta, gamma, theta, vega, rho, vanna, charm, d1, d2 };
}
