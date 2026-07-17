// Volatility Risk Premium (VRP) study.
//
// The VRP is defined as the difference between implied volatility and the
// realized volatility that actually occurred over the same horizon:
//
//   VRP(t) = IV(t) − RV_forward(t)
//
// where:
//   IV(t)           = VIX close on date t (30-day implied vol for S&P 500, %)
//   RV_forward(t)   = annualized realized vol of SPY over the NEXT 21 trading
//                     days starting from t (the "realized outcome"), in %
//
// When VRP > 0, the market paid more for insurance than the hedged event cost.
// The mean is structurally positive — option sellers earn a risk premium for
// bearing jump and gap risk that buyers are willing to overpay to shed.
//
// IV PROXY: VIX measures 30-day expected vol for the S&P 500 index, not SPY
// specifically. SPY is an ETF that tracks the S&P 500 with a small tracking
// error, so VIX is the standard and defensible proxy for SPY's implied vol.
// The documented limitation: VIX uses SPX options (European, cash-settled);
// SPY options are American and may diverge slightly near ex-dividend dates.

import { dailyLogReturns } from "../pricing/realizedVol";
import type { DailyClose } from "../data/polygon";
import type { VixClose }   from "../data/vix";

export interface VrpPoint {
  date:  string;  // calendar date of the IV observation (start of forward window)
  iv30:  number;  // VIX close on this date (%)
  rv30:  number;  // realized vol over the next 21 trading days (%)
  vrp:   number;  // iv30 − rv30 (percentage points)
}

export interface VrpEpisode {
  date: string;
  vrp:  number;
}

export interface VrpStats {
  mean:          number;       // mean VRP across all observations (pct pts)
  pctPositive:   number;       // % of dates where VRP > 0
  max:           VrpEpisode;   // most positive VRP (IV overestimated the most)
  min:           VrpEpisode;   // most negative VRP (market underestimated vol)
  worstEpisodes: VrpEpisode[]; // 5 largest negative VRP — stress events
}

export interface VrpResult {
  series: VrpPoint[];
  stats:  VrpStats;
}

// ── buildVrpSeries ────────────────────────────────────────────────────────────
//
// Alignment:
//   closes[i]   → date closeDates[i]
//   returns[i]  = ln(closes[i+1] / closes[i]) — the return realized on day i+1
//   forward RV at date closeDates[i] = annualized stdev of returns[i..i+20]
//                                     (the next 21 trading days' realized moves)
//
// Valid VRP dates: closeDates[0] through closeDates[N-22], where N = closes.length-1.
// Total observations: N - 21  (the last 21 closes are consumed by the forward window).
export function buildVrpSeries(
  spyCloses: DailyClose[],
  vixCloses: VixClose[],
): VrpResult {
  const empty: VrpResult = {
    series: [],
    stats:  { mean: 0, pctPositive: 0, max: { date: "", vrp: 0 }, min: { date: "", vrp: 0 }, worstEpisodes: [] },
  };
  if (spyCloses.length < 23) return empty; // need at least 22 closes → 21 returns

  const vixByDate = new Map<string, number>();
  for (const v of vixCloses) vixByDate.set(v.date, v.vix);

  const closePrices = spyCloses.map(c => c.close);
  const closeDates  = spyCloses.map(c => c.date);
  const returns     = dailyLogReturns(closePrices); // length N (= spyCloses.length - 1)

  const series: VrpPoint[] = [];
  const N = spyCloses.length;

  for (let i = 0; i + 21 < N; i++) {
    const date = closeDates[i];
    const iv30 = vixByDate.get(date);
    if (iv30 === undefined) continue; // no VIX on this date (holiday / weekend)

    // Forward 21 returns: returns[i] through returns[i+20]
    let sumSq = 0;
    for (let j = i; j < i + 21; j++) sumSq += returns[j] ** 2;
    const rv30 = Math.sqrt((sumSq / 21) * 252) * 100; // annualized, in %

    series.push({ date, iv30, rv30, vrp: iv30 - rv30 });
  }

  if (!series.length) return empty;

  const vrps = series.map(p => p.vrp);
  const mean = vrps.reduce((a, b) => a + b, 0) / vrps.length;
  const pctPositive = (vrps.filter(v => v > 0).length / vrps.length) * 100;

  let maxPt = series[0];
  let minPt = series[0];
  for (const p of series) {
    if (p.vrp > maxPt.vrp) maxPt = p;
    if (p.vrp < minPt.vrp) minPt = p;
  }

  const worstEpisodes = [...series]
    .sort((a, b) => a.vrp - b.vrp)
    .slice(0, 5)
    .map(p => ({ date: p.date, vrp: p.vrp }));

  return {
    series,
    stats: {
      mean,
      pctPositive,
      max: { date: maxPt.date, vrp: maxPt.vrp },
      min: { date: minPt.date, vrp: minPt.vrp },
      worstEpisodes,
    },
  };
}
