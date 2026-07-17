// Realized volatility from daily closing prices.
//
// Conventions (each choice is stated with its rationale):
//
// LOG RETURNS: r_t = ln(P_t / P_{t-1})
//   Log returns are time-additive: ln(P_3/P_1) = ln(P_3/P_2) + ln(P_2/P_1).
//   This lets you sum daily log returns to get the cumulative return over any
//   sub-period without path dependence. Simple returns (P/P_0 - 1) are not
//   additive and make multi-day aggregation inconsistent.
//
// WINDOW: 21 trading days ≈ 1 calendar month
//   The VIX measures implied vol for the next 30 calendar days. 21 trading
//   days is the standard equvalent in trading-day terms (≈ 4.2 weeks × 5
//   days). Matching the realized window to the implied window makes the
//   VRP comparison apples-to-apples.
//
// ANNUALIZATION: × √252
//   There are 252 trading days per year by convention. To convert daily vol
//   (the stdev of one day's log return) to annualized vol, multiply by √252.
//   This follows from the fact that variance scales linearly with time and
//   vol (stdev) scales with √time under IID returns.
//
// MEAN-ZERO CONVENTION: assumes E[r_t] = 0
//   The standard estimator subtracts the sample mean before squaring. At
//   daily frequencies this adds noise: the true daily drift μ ≈ 0.03/252 ≈
//   0.012% is negligible compared to daily vol σ ≈ 1%. Estimating μ from an
//   n=21 window is noisy (standard error = σ/√21 ≈ 22% of σ), and subtracting
//   a noisy mean estimate inflates the variance of σ̂. The mean-zero estimator
//   RV = √(Σr²/n × 252) has lower MSE than the sample-mean-adjusted version
//   for typical equity return parameters. Used by industry standard (e.g.,
//   the VIX methodology white paper uses mean-zero for the realized variance).

// ── dailyLogReturns ───────────────────────────────────────────────────────────

// Returns ln(P_t / P_{t-1}) for each consecutive pair of closes.
// Output length: closes.length - 1.
export function dailyLogReturns(closes: number[]): number[] {
  const out: number[] = new Array(closes.length - 1);
  for (let i = 1; i < closes.length; i++) {
    out[i - 1] = Math.log(closes[i] / closes[i - 1]);
  }
  return out;
}

// ── realizedVol ───────────────────────────────────────────────────────────────

// Rolling annualized realized volatility using the mean-zero estimator.
//
//   RV_i = √( (1/window) × Σ_{j=i}^{i+window-1} r_j² × 252 )
//
// Output length: max(0, returns.length - window + 1).
// rv[i] corresponds to the window returns[i .. i+window-1].
// Output is in decimal form: 0.18 means 18% annualized vol.
export function realizedVol(returns: number[], window = 21): number[] {
  if (returns.length < window) return [];
  const out: number[] = new Array(returns.length - window + 1);
  for (let i = 0; i <= returns.length - window; i++) {
    let sumSq = 0;
    for (let j = i; j < i + window; j++) sumSq += returns[j] ** 2;
    out[i] = Math.sqrt((sumSq / window) * 252);
  }
  return out;
}
