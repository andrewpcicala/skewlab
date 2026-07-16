# SkewLab — Finance Notes
Living interview-prep document. Every finance concept implemented in this
codebase gets a plain-English entry here at the time it is built.

## Entries

---

### Black-Scholes: what it says and what it assumes

Black-Scholes prices an option by constructing a replicating portfolio — a
continuously rebalanced position in the underlying and a risk-free bond that
produces exactly the same payoff as the option at every moment until expiry.
If such a portfolio can be built, its cost today must equal the option price or
a riskless arbitrage exists.

The five inputs: spot price (S), strike (K), time to expiry (T), risk-free
rate (r), and volatility (σ). Four are directly observable; σ is the only
unobservable. The market quotes σ implicitly — traders back it out from option
prices, which is why "implied volatility" is the quantity that actually trades.

**Where each assumption breaks:**

- **Constant vol.** The model uses a single σ for the life of the option. Real
  markets show a volatility smile and skew — OTM puts trade at higher implied
  vol than ATM because traders price in fat left tails (crashes). If BS held
  exactly, all strikes on the same expiry would share one IV. They don't.

- **Continuous trading, no jumps.** The replication argument requires
  instantaneous delta-hedging. Real prices jump (earnings, macro prints,
  geopolitical shocks); the hedge cannot track a discontinuous path. This is
  why realized vol after a gap exceeds what the model assumed.

- **American exercise on SPY.** Black-Scholes solves for European options
  (exercised only at expiry). SPY options are American; early exercise can
  be optimal for puts when rates are high or for calls just before an
  ex-dividend date. The model ignores this — a stated approximation.

- **Dividends.** Handled here via continuous dividend yield q (Merton 1973).
  Actual SPY dividends are discrete quarterly cash payments; the continuous
  approximation smooths them into a rate, which slightly misprices options
  that straddle an ex-date.

---

### The Greeks

**Delta** is the first derivative of option price with respect to the
underlying price: a call with delta 0.60 gains roughly $0.60 per $1 rise in
the stock. Loosely interpreted as the risk-neutral probability of expiring
in-the-money (the exact probability is N(d2) for a European call, but delta ≈
probability is the intuition traders use). Delta hedging means holding -delta
shares of the underlying to create a position that is (instantaneously)
insensitive to small price moves.

**Gamma** is the rate at which delta changes per $1 move in the underlying —
the curvature of the option's value curve. High gamma means a delta-hedge
becomes stale quickly and requires constant rebalancing. Gamma peaks at ATM
and explodes near expiration. Long gamma is the core of the "vol buyer" trade:
you want the stock to move a lot.

**Theta** is the daily P&L from the passage of time — the "rent" paid to own
optionality. Almost always negative for long positions: time erodes the
probability of the stock reaching your strike. Theta and gamma are two sides
of the same trade: long gamma / short theta (you want moves but pay daily
decay) versus short gamma / long theta (you collect premium but bleed if the
market moves hard).

**Vega** is the sensitivity of the option price to a one-point change in
implied volatility (here: 1 percentage point, e.g. 20% → 21%). Vega peaks for
ATM options and for long-dated options — both have the most sensitivity to the
vol input. The entire skew trade is fundamentally a vega/vol trade.

**Rho** is the sensitivity to a one-percentage-point change in the risk-free
rate. Small relative to the other greeks in most regimes, but meaningful for
long-dated options or in environments where rates move dramatically (2022 was
a stark reminder).

**Vanna** is the cross-partial ∂delta/∂σ (equivalently ∂vega/∂S). It tells
you how much your delta exposure shifts when implied vol moves. Matters in
books that are simultaneously exposed to directional and vol risk: a vol spike
can change your hedge ratio significantly if vanna is large.

**Charm** is the daily change in delta as time passes (∂delta/∂time). An
in-the-money call's delta drifts toward 1 as expiry approaches; an OTM call's
delta drifts toward 0. Knowing charm lets you anticipate how much your hedge
will need to change overnight even if the stock does nothing.

**The gamma/theta tradeoff** is the central tension of options trading.
Buying options gives you positive gamma — your delta improves in your favor
when the stock moves, regardless of direction. But you pay theta every
calendar day you hold the position. Selling options is the mirror: you collect
theta continuously but are short gamma, so large moves hurt you. There is no
free optionality.

---

### Conventions chosen

Every number the pricing engine produces reflects a deliberate convention.
These are simplifications a real desk would not make, stated explicitly so
they can be revisited.

- **Theta per calendar day** (annual theta ÷ 365). Traders want the daily
  decay number. Some desks use 252 trading days; using 365 gives a slightly
  smaller daily theta, which is the more conservative number for a long
  position. This implementation uses 365 throughout.

- **Vega per vol point** (annual vega ÷ 100). One vol point = 1 percentage
  point of implied volatility (e.g. 20% → 21%). Dividing by 100 gives the
  direct P&L per point, which is how vega is quoted at most desks.

- **Rho per 1% rate move** (annual rho ÷ 100). Same convention — stated as
  P&L per 100bp move in the risk-free rate, consistent with how rate moves
  are discussed in practice.

- **ACT/365 time to expiry.** Calendar days from now to 4 PM ET on the
  expiry date, divided by 365. Ignores trading-day calendars, holidays, and
  the distinction between EDT and EST. A real desk uses ACT/252 or a
  bespoke trading-day calendar.

- **Flat 4.5% risk-free rate.** A snapshot of 3-month T-bill yields at
  implementation time. A live system would interpolate from a current
  yield curve at the option's maturity.

- **1.2% continuous dividend yield.** SPY's rough trailing 12-month yield
  treated as a constant continuous rate (Merton model). Actual quarterly
  dividends require discrete dividend adjustments and differ across expiries
  that straddle an ex-date.

---

### Implied volatility & Newton-Raphson

Implied volatility is the unique σ that makes the Black-Scholes formula
reproduce the observed market price. It is not a volatility forecast — it is
the market's consensus about expected future volatility, embedded in what
people are actually willing to pay for the option right now. Because σ is the
only unobservable input, IV is the quantity that actually matters to traders:
the "price of vol" expressed in the same units as the BS model's σ parameter.

**Why there is no closed form.** The BS price function C(σ) is smooth and
strictly increasing in σ (vega > 0 everywhere), but cannot be inverted
analytically. To find IV you solve the equation C(σ) = market price
numerically.

**Newton-Raphson.** Starting from an initial guess σ₀, each iteration is:

    σ_{n+1} = σ_n − (C(σ_n) − target) / C′(σ_n)

where C′(σ) = ∂C/∂σ = vega. Newton converges quadratically when vega is
large (ATM options, long dated) and can diverge or stall when vega is near
zero (deep ITM or OTM near expiry, where the price is essentially pinned at
intrinsic regardless of σ).

**The vega scaling trap.** In this codebase, `bsResult.vega` is annual vega
divided by 100 — the P&L per one vol *point* (1 percentage-point move in σ).
Newton's update needs the raw partial ∂C/∂σ where σ is a decimal fraction
(0.20, not 20). That raw vega is `bsResult.vega × 100`. Using `bsResult.vega`
directly would make each Newton step 100× too conservative, slowing convergence
by two orders of magnitude.

**Bisection fallback.** When Newton stalls (vega < 1e-10), the solver falls
back to bisection on the interval [0.1%, 500%]. Bisection is unconditionally
convergent given a bracketing interval and requires no derivative. Because BS
price is strictly monotone in σ, [0.1%, 500%] always brackets any real-market
IV. Bisection converges linearly (~3.3 bits per iteration), so 100 iterations
give precision of 500/2¹⁰⁰ ≈ machine zero.

**Pre-checks.** Three cases have no finite IV and are detected before entering
the solver: (1) market price ≤ 0 — a quote error or a worthless option;
(2) T ≤ 0 — the option is expired; (3) market price below forward intrinsic
(= max(S·e^{−qT} − K·e^{−rT}, 0) for a call) — this is an arbitrage
violation; no σ in [0, ∞) can produce it.

---

### Why the smile exists

Black-Scholes assumes a constant, log-normally distributed return process with
no jumps. Real equity prices can gap down catastrophically (crashes, macro
prints, earnings). Out-of-the-money put buyers are paying for protection against
those left-tail events; sellers demand a premium above what a log-normal model
would predict. This extra premium shows up as higher implied volatility for
low-strike puts relative to ATM. The resulting shape — IV falling as you move
from low-strike puts to ATM, then rising again for high-strike calls — is called
the volatility smile; for equity indices the left side is dramatically steeper,
which traders call the skew or smirk.

The shape varies by expiry (the term structure of vol): short-dated options
near a known event (earnings, Fed meeting) spike because the expected move
is compressed into a short window. Long-dated options have smoother, flatter
smiles because random events average out over time and the known catalysts are
diluted across many days.

---

### Why the surface uses OTM contracts only

The vol surface maps (strike, expiry) → implied vol. For any given (strike,
expiry) there are two contracts: a call and a put. By put-call parity they must
imply the same vol in a perfect market; in practice microstructure noise makes
them differ slightly. Using both would mean picking one or averaging — adding
unnecessary complexity and potentially introducing inconsistencies.

Convention chooses OTM because OTM contracts have the most vol content per
dollar of premium. An ITM call is largely intrinsic value; its small time-value
component means its market quote is dominated by spot exposure rather than vol
expectations, and a $0.01 bid-ask spread is a much larger fraction of the
time-value, amplifying IV noise. OTM options spend their entire market value
on time value and vol, so their quotes are efficient vol signals. In practice,
the ITM put and the OTM call at the same (strike, expiry) imply nearly the same
IV anyway — using OTM loses almost no information and gains cleaner data.

---

### Why IVs are solved from mid, and why no-mid contracts are excluded

Mid = (bid + ask) / 2 is the best available estimate of fair value when both
sides are live. It anchors the IV to current market consensus: a market maker
quoting a tight spread is expressing a confident view on fair vol.

Close prices are the previous day's settlement. They carry yesterday's vol
expectations, yesterday's spot level, and yesterday's rates. After a large
overnight move in the underlying, stale closes are simply wrong as proxies
for current IV; a contract that closed at $2.50 yesterday when SPY was at 750
now has a completely different theoretical value if SPY opened at 730. Building
a surface from stale closes produces a scrambled, self-inconsistent patchwork
of old and new data — particularly harmful at wings where volume is sparse and
the last trade could be hours old. The surface code requires a live mid
precisely to avoid this. Contracts without a live two-sided market are excluded
rather than approximated.
