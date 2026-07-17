// Plain assert script — run with: npx tsx lib/pricing/realizedVol.test.ts
import assert from "node:assert/strict";
import { dailyLogReturns, realizedVol } from "./realizedVol";

const SQRT252 = Math.sqrt(252);

// ── dailyLogReturns ───────────────────────────────────────────────────────────

// 1. Length is closes.length - 1
{
  const r = dailyLogReturns([100, 101, 102]);
  assert.equal(r.length, 2, `length: expected 2, got ${r.length}`);
}

// 2. Exact values: ln(101/100) and ln(102/101)
{
  const r = dailyLogReturns([100, 101, 102]);
  assert(
    Math.abs(r[0] - Math.log(101 / 100)) < 1e-12,
    `r[0]: expected ${Math.log(101 / 100)}, got ${r[0]}`
  );
  assert(
    Math.abs(r[1] - Math.log(102 / 101)) < 1e-12,
    `r[1]: expected ${Math.log(102 / 101)}, got ${r[1]}`
  );
}

// 3. Single pair
{
  const r = dailyLogReturns([50, 100]);
  assert(Math.abs(r[0] - Math.log(2)) < 1e-12, `ln(2): got ${r[0]}`);
}

// ── realizedVol ───────────────────────────────────────────────────────────────

// 4. Constant prices → RV = 0
// ln(P/P) = 0 for every bar; every return is zero; Σr² = 0.
{
  const closes = Array.from({ length: 22 }, () => 100);
  const returns = dailyLogReturns(closes); // 21 zeros
  const rv = realizedVol(returns, 21);
  assert.equal(rv.length, 1, `constant: expected 1 result, got ${rv.length}`);
  assert.equal(rv[0], 0, `constant: expected RV=0, got ${rv[0]}`);
}

// 5. Alternating ±δ returns → RV = δ × √252 (closed form)
//
//   returns = [δ, -δ, δ, -δ, ...], 21 values, δ = 0.01
//   All r² = δ² = 0.0001.
//   Σr²/window = 0.0001  →  RV = √(0.0001 × 252) = 0.01 × √252 ≈ 0.15875
//
{
  const delta = 0.01;
  const returns = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? delta : -delta));
  const rv = realizedVol(returns, 21);
  const expected = delta * SQRT252;
  assert(
    Math.abs(rv[0] - expected) < 1e-12,
    `alternating: expected ${expected}, got ${rv[0]}`
  );
}

// 6. Annualization sanity: daily stdev 1% → RV ≈ 15.87% ≈ 15.9%
//
//   21 returns all equal to 0.01.
//   Σr²/21 = 0.01² = 0.0001  →  RV = 0.01 × √252 = 0.158745...
//
{
  const returns = Array.from({ length: 21 }, () => 0.01);
  const rv = realizedVol(returns, 21);
  const expected = 0.01 * SQRT252; // 0.15874507...
  assert(
    Math.abs(rv[0] - expected) < 1e-12,
    `annualization: expected ${expected.toFixed(6)}, got ${rv[0].toFixed(6)}`
  );
  // Loose sanity: should round to 15.9% when expressed as percent
  assert(
    Math.abs(rv[0] * 100 - 15.9) < 0.1,
    `sanity: expected ~15.9%, got ${(rv[0] * 100).toFixed(2)}%`
  );
}

// 7. Rolling length: n returns with window w → n - w + 1 results
{
  const returns = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 0.01 : -0.01));
  const rv = realizedVol(returns, 21);
  assert.equal(rv.length, 10, `rolling length: expected 10, got ${rv.length}`);
}

// 8. Too few returns → empty array
{
  const returns = Array.from({ length: 10 }, () => 0.01);
  const rv = realizedVol(returns, 21);
  assert.equal(rv.length, 0, `too few: expected [], got length ${rv.length}`);
}

// 9. Window = 1: RV of a single return r is |r| × √252
{
  const r = 0.02;
  const rv = realizedVol([r], 1);
  assert.equal(rv.length, 1);
  assert(Math.abs(rv[0] - r * SQRT252) < 1e-12, `window=1: expected ${r * SQRT252}, got ${rv[0]}`);
}

// 10. Rolling values are independent: second window in alternating series
//     returns[1..21] = [-δ, δ, -δ, ...] (same squared magnitudes) → same RV
{
  const delta = 0.015;
  const returns = Array.from({ length: 42 }, (_, i) => (i % 2 === 0 ? delta : -delta));
  const rv = realizedVol(returns, 21); // length 22
  const expected = delta * SQRT252;
  for (let i = 0; i < rv.length; i++) {
    assert(
      Math.abs(rv[i] - expected) < 1e-12,
      `rolling[${i}]: expected ${expected}, got ${rv[i]}`
    );
  }
}

console.log("All realizedVol tests passed.");
