export interface ExitRules {
  // Close when unrealized P&L reaches this % of the original credit collected.
  // 50% is the documented sweet spot: captures most theta decay while
  // avoiding the widening bid-ask spreads and gamma spikes of the final week.
  profitTakePctOfCredit: number;

  // Close (at a loss if necessary) when DTE reaches this level.
  // Avoids gamma week: the final 7 DTE carries disproportionate pin risk and
  // event risk relative to the remaining theta that would be earned by holding.
  closeAtDte: number;
}

export interface StrategyRules {
  side:           "sell" | "buy";
  type:           "put" | "call";

  // Delta of the target contract (negative for puts under Black-Scholes convention).
  // Computed via our BS engine at the contract's solved IV — not taken from vendor data.
  targetDelta:    number;

  // Accept contracts with |delta − targetDelta| ≤ deltaTolerance.
  // Necessary because the strike grid is coarse relative to delta spacing,
  // especially for near-term puts where a $1 move in strike shifts delta ~0.02-0.04.
  deltaTolerance: number;

  targetDte:      number;
  dteRange:       [number, number];  // [min, max] calendar days; contracts outside are skipped

  entryCadence: "manual";  // human decides when; no automated entry
  exit:         ExitRules;
}

export interface Strategy {
  id:         string;
  name:       string;
  underlying: string;
  rules:      StrategyRules;
}

export const STRATEGIES: Strategy[] = [
  {
    id:         "spy-30d-put",
    name:       "SPY ~30-DELTA PUT SELL",
    underlying: "SPY",
    rules: {
      side: "sell",
      type: "put",

      // −0.30 delta: classic premium-harvest position.
      //
      // Why 30-delta, not 20 or 40?
      //   20-delta: cheap, high win rate, but credit is thin (~$0.50 on SPY).
      //     The VRP doesn't compensate well at these strikes — even a small vol
      //     spike erases months of premium. Capital efficiency is poor.
      //   40-delta: meaty credit, but assignment probability becomes significant
      //     even accounting for the VRP. You're practically a market-maker in
      //     equity exposure at this point.
      //   30-delta is the established trade-off: ~$1-3 credit on SPY, risk-neutral
      //     assignment probability ~30% (real probability lower given VRP), and
      //     ~3-5% OTM — enough distance to survive a typical one-sigma drawdown.
      targetDelta: -0.30,

      // ±0.08 tolerance: accepts deltas in [−0.38, −0.22].
      // The strike grid is $1-$5 near ATM; without tolerance, many market
      // conditions produce zero viable candidates. 0.08 captures the nearest
      // liquid strike without drifting into fundamentally different risk territory.
      deltaTolerance: 0.08,

      targetDte: 30,

      // 21-45 DTE: the theta-acceleration window.
      //   Below 21: gamma spikes sharply; the final week (gamma week) can wipe
      //     months of premium overnight on an unexpected gap. Risk/reward inverts.
      //   Above 45: theta is slow; capital is tied up for longer per unit of
      //     premium collected; vol exposure is dominated by vega, not theta.
      //   21-45 captures fast post-30d theta decay with manageable gamma.
      dteRange: [21, 45],

      entryCadence: "manual",

      exit: {
        // 50% profit target: take half the credit and reset.
        // Research (TastyTrade, CBOE) documents that ~80% of 30-delta puts
        // reach 50% profit before DTE 7 under normal conditions. Closing early
        // restores buying power for the next cycle and avoids gamma week exposure.
        profitTakePctOfCredit: 50,

        // DTE 7: mandatory close regardless of P&L.
        // The remaining time value in the final week doesn't justify the tail
        // exposure. Any gap, pin, or sharp move in the last 5 trading days
        // carries consequences disproportionate to the remaining theta.
        closeAtDte: 7,
      },
    },
  },
];
