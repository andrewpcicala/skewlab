// Plain assert script — run with: npx tsx lib/pricing/blackScholes.test.ts
// No test framework. Node's built-in assert throws on failure.
import assert from "node:assert/strict";
import { bsPrice } from "./blackScholes";

// ── 1. Reference values ────────────────────────────────────────────────────
// Published ATM call/put: S=100 K=100 T=1 r=5% q=0 σ=20%
// Expected: call ≈ 10.4506, put ≈ 5.5735  (tolerance 1e-3)
{
  const call = bsPrice("call", { spot: 100, strike: 100, timeYears: 1, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(
    Math.abs(call.price - 10.4506) < 1e-3,
    `ATM call: expected ~10.4506, got ${call.price.toFixed(6)}`
  );

  const put = bsPrice("put", { spot: 100, strike: 100, timeYears: 1, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(
    Math.abs(put.price - 5.5735) < 1e-3,
    `ATM put: expected ~5.5735, got ${put.price.toFixed(6)}`
  );
}

// ── 2. OTM call verified against put via put-call parity ──────────────────
// S=100 K=110 T=0.5 r=5% q=0 σ=25%
// parity: C - P = S·e^(-qT) - K·e^(-rT)
{
  const inp = { spot: 100, strike: 110, timeYears: 0.5, rate: 0.05, vol: 0.25, divYield: 0 };
  const call = bsPrice("call", inp);
  const put  = bsPrice("put",  inp);
  const lhs  = call.price - put.price;
  const rhs  = 100 - 110 * Math.exp(-0.05 * 0.5);
  assert(
    Math.abs(lhs - rhs) < 1e-9,
    `OTM parity: lhs=${lhs.toFixed(12)} rhs=${rhs.toFixed(12)}`
  );
}

// ── 3. Put-call parity across a grid of 20 input sets ─────────────────────
for (let n = 0; n < 20; n++) {
  const S = 50  + n * 10;
  const K = 45  + n * 9;
  const T = 0.1 + n * 0.15;
  const r = 0.02 + n * 0.003;
  const q = n * 0.001;
  const v = 0.10 + n * 0.015;
  const call = bsPrice("call", { spot: S, strike: K, timeYears: T, rate: r, vol: v, divYield: q });
  const put  = bsPrice("put",  { spot: S, strike: K, timeYears: T, rate: r, vol: v, divYield: q });
  const parity = call.price - put.price - (S * Math.exp(-q * T) - K * Math.exp(-r * T));
  assert(
    Math.abs(parity) < 1e-9,
    `Parity grid[${n}]: error=${parity}`
  );
}

// ── 4. Greek sanity checks ─────────────────────────────────────────────────
{
  const call = bsPrice("call", { spot: 100, strike: 100, timeYears: 1, rate: 0.05, vol: 0.20, divYield: 0 });
  const put  = bsPrice("put",  { spot: 100, strike: 100, timeYears: 1, rate: 0.05, vol: 0.20, divYield: 0 });

  assert(call.delta > 0 && call.delta < 1,  `Call delta in (0,1): ${call.delta}`);
  assert(put.delta  > -1 && put.delta < 0,  `Put delta in (-1,0): ${put.delta}`);
  assert(call.gamma > 0,                    `Gamma > 0: ${call.gamma}`);
  assert(call.vega  > 0,                    `Vega > 0: ${call.vega}`);
  // Gamma and vega are the same for calls and puts (model identity)
  assert(Math.abs(call.gamma - put.gamma) < 1e-12, `Gamma call≡put`);
  assert(Math.abs(call.vega  - put.vega)  < 1e-12, `Vega call≡put`);
}

// ATM 30-day call theta is negative (time costs money for the option buyer)
{
  const atm30 = bsPrice("call", { spot: 100, strike: 100, timeYears: 30 / 365, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(atm30.theta < 0, `ATM 30d theta < 0: ${atm30.theta}`);
}

// Deep ITM call delta → e^(-qT)  (N(d1) ≈ 1 when S >> K)
{
  const deepItm = bsPrice("call", { spot: 200, strike: 50, timeYears: 1, rate: 0.05, vol: 0.20, divYield: 0.012 });
  const expected = Math.exp(-0.012 * 1);
  assert(
    Math.abs(deepItm.delta - expected) < 1e-4,
    `Deep ITM delta: got ${deepItm.delta}, expected ${expected}`
  );
}

// ── 5. Edge: T=0 returns intrinsic value exactly ──────────────────────────
{
  const itmCall = bsPrice("call", { spot: 105, strike: 100, timeYears: 0, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(itmCall.price === 5, `T=0 ITM call intrinsic: ${itmCall.price}`);
  assert(itmCall.delta === 1, `T=0 ITM call delta=1: ${itmCall.delta}`);

  const otmCall = bsPrice("call", { spot: 95, strike: 100, timeYears: 0, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(otmCall.price === 0, `T=0 OTM call worthless: ${otmCall.price}`);
  assert(otmCall.delta === 0, `T=0 OTM call delta=0: ${otmCall.delta}`);

  const itmPut = bsPrice("put", { spot: 95, strike: 100, timeYears: 0, rate: 0.05, vol: 0.20, divYield: 0 });
  assert(itmPut.price === 5,  `T=0 ITM put intrinsic: ${itmPut.price}`);
  assert(itmPut.delta === -1, `T=0 ITM put delta=-1: ${itmPut.delta}`);

  // All greeks zero at expiry
  assert(itmCall.gamma === 0 && itmCall.vega === 0 && itmCall.theta === 0, `T=0 greeks are zero`);
}

console.log("All tests passed.");
