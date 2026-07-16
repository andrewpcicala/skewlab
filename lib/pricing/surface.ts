import { bsPrice, timeToExpiryYears } from "./blackScholes";
import { solveImpliedVol } from "./impliedVol";
import { RISK_FREE_RATE, DIV_YIELD_DEFAULT } from "./config";
import type { OptionChain } from "@/lib/data/types";

export interface SurfacePoint {
  strike: number;
  expiry: string;
  dte:    number;    // calendar days to expiry (float, can be fractional)
  iv:     number;    // decimal, e.g. 0.18 = 18%
  type:   "call" | "put";
}

export interface SurfaceStats {
  attempted: number;                // OTM contracts with a usable mid that entered the solver
  solved:    number;                // passed all quality gates
  skipped:   Record<string, number>; // reason → count (includes pre-solver filters)
}

export interface IvSurface {
  points: SurfacePoint[];
  stats:  SurfaceStats;
}

// ── buildIvSurface ────────────────────────────────────────────────────────────
// Pure function: takes an OptionChain (from getSurfaceChain) and the current
// spot price, returns solved IV for every OTM contract that passes quality gates.
//
// OTM contracts only — why:
//   (a) Vol information density: ATM options carry the most vega and tightest
//       spreads, but ITM options have vega that is increasingly dominated by
//       intrinsic value, making their IV noisy and spread-inflated. OTM options
//       are where vol traders actually price and hedge.
//   (b) Surface convention: the vol surface is always quoted as OTM IV vs strike.
//       Using ITM options to fill in the same strikes would double-count
//       (put-call parity means the ITM call and OTM put at the same strike must
//       imply the same vol in theory, but microstructure differences make them
//       differ in practice, poisoning the surface).
//
// Mid prices only — why:
//   Stale EOD closes reflect yesterday's sentiment; in fast-moving markets they
//   can be many vols away from fair value. Any IV solved from a stale close is
//   unreliable and can produce wildly inconsistent surfaces across strikes. Mid
//   requires both bid and ask to be live, which ensures the market is actively
//   quoting the contract.
export function buildIvSurface(chain: OptionChain, spot: number): IvSurface {
  const points: SurfacePoint[] = [];
  const stats: SurfaceStats = { attempted: 0, solved: 0, skipped: {} };

  const bump = (reason: string) => {
    stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
  };

  // ── Seam-stitch pre-pass ──────────────────────────────────────────────────
  // OTM puts (strike < spot) and OTM calls (strike > spot) leave a gap right
  // at ATM. To allow connectgaps:true to stitch the sheet across that seam,
  // include the single nearest-to-spot ITM contract on each side per expiry.
  // These bypass the OTM filter only; every other quality gate still applies.
  const seamSymbols = new Set<string>();
  const byExpiry = new Map<string, typeof chain.quotes>();
  for (const q of chain.quotes) {
    const arr = byExpiry.get(q.expiry) ?? [];
    arr.push(q);
    byExpiry.set(q.expiry, arr);
  }
  for (const quotes of byExpiry.values()) {
    // Nearest ITM call: highest call strike below spot
    const itmCalls = quotes.filter(q => q.type === "call" && q.strike < spot);
    if (itmCalls.length)
      seamSymbols.add(itmCalls.reduce((b, q) => q.strike > b.strike ? q : b).symbol);
    // Nearest ITM put: lowest put strike above spot
    const itmPuts = quotes.filter(q => q.type === "put" && q.strike > spot);
    if (itmPuts.length)
      seamSymbols.add(itmPuts.reduce((b, q) => q.strike < b.strike ? q : b).symbol);
  }

  for (const q of chain.quotes) {
    // ── OTM filter ────────────────────────────────────────────────────────
    // Puts below spot, calls above spot. ATM (strike === spot) excluded.
    // Seam-stitch contracts (nearest ITM each side per expiry) bypass this
    // filter to close the ATM gap; all other gates still apply.
    const isOtm  = (q.type === "call" && q.strike > spot) ||
                   (q.type === "put"  && q.strike < spot);
    const isSeam = seamSymbols.has(q.symbol);
    if (!isOtm && !isSeam) { bump("itm"); continue; }

    // ── Mid requirement ───────────────────────────────────────────────────
    // No close-based IVs on the surface. See function-level comment.
    if (q.mid === null) { bump("no mid"); continue; }

    stats.attempted++;

    const bsInputs = {
      spot,
      strike:    q.strike,
      timeYears: timeToExpiryYears(q.expiry),
      rate:      RISK_FREE_RATE,
      divYield:  DIV_YIELD_DEFAULT,
    };

    // ── IV solver ─────────────────────────────────────────────────────────
    const ivResult = solveImpliedVol(q.type, q.mid, bsInputs);

    if (ivResult.iv === null) {
      bump(ivResult.reason ?? "solver failed");
      continue;
    }

    // ── IV range gate ─────────────────────────────────────────────────────
    // [1%, 300%]: below 1% is sub-penny precision noise; above 300% is a
    // data artifact (stale or crossed quote). Real equity vol almost never
    // exceeds 200% even at earnings.
    if (ivResult.iv < 0.01 || ivResult.iv > 3.0) {
      bump("iv out of range");
      continue;
    }

    // ── Vega gate ─────────────────────────────────────────────────────────
    // If vega at the solved IV is near zero, the price function is flat and
    // the solver returned a numerically convenient vol rather than the true one.
    // This catches deep OTM near-expiry options where any vol in [0, ∞) gives
    // essentially the same price; their IV is undefined in a meaningful sense.
    const bsAtIv = bsPrice(q.type, { ...bsInputs, vol: ivResult.iv });
    if (bsAtIv.vega * 100 < 1e-4) {
      bump("low vega");
      continue;
    }

    const dte = Math.max(bsInputs.timeYears * 365, 0);
    points.push({
      strike: q.strike,
      expiry: q.expiry,
      dte,
      iv:     ivResult.iv,
      type:   q.type,
    });
    stats.solved++;
  }

  return { points, stats };
}
