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

---

### Realized volatility — how and why

Realized volatility (RV) is the volatility that actually occurred over some
historical window, measured from prices. It is the empirical counterpart to
implied volatility: IV is what the market expected; RV is what happened.

**Log returns.** We compute daily log returns r_t = ln(P_t / P_{t-1}) rather
than simple returns (P_t/P_{t-1} − 1). Log returns are time-additive:
ln(P_3/P_1) = ln(P_3/P_2) + ln(P_2/P_1). This makes multi-day aggregation
exact — sum the daily log returns and you get the log return over the full
period. Simple returns are not additive and compound in a path-dependent way.

**Window: 21 trading days.** The VIX measures implied vol for the next 30
calendar days. 21 trading days ≈ 30 calendar days (4.2 weeks × 5 days), so
using 21-day forward RV matches the VIX horizon and makes the IV−RV comparison
consistent. Deviations from exactly 30 calendar days introduce some noise.

**Annualization: × √252.** Variance scales linearly with time under IID
returns; volatility (standard deviation) therefore scales with √time. There
are 252 trading days per year by convention, so multiplying the daily stdev
by √252 converts it to an annualized figure, the same units as VIX.

**Mean-zero convention.** The standard sample variance estimator subtracts the
sample mean before squaring. For daily log returns this is a mistake: the true
daily drift μ ≈ 0.03/252 ≈ 0.012% is negligible relative to daily vol σ ≈ 1%.
Estimating μ from a 21-day window is noisy (standard error ≈ σ/√21 ≈ 22% of
σ), and subtracting a noisy mean estimate inflates the estimator's variance.
The mean-zero estimator RV = √(Σr²/n × 252) has provably lower mean squared
error for typical equity parameters. It is also the convention used by CBOE
in the original VIX methodology white paper.

---

### The VIX-as-IV proxy — what it is and its limits

VIX (CBOE Volatility Index) is the market's real-time estimate of 30-day
expected volatility for the S&P 500 index. It is calculated from a strip of
SPX option prices — specifically, it uses a model-free formula that integrates
across all available strikes (not just ATM) to extract the market's consensus
variance expectation for the next 30 calendar days. The result is then
annualized and expressed as a percentage.

**Why it's a defensible SPY proxy.** SPY tracks the S&P 500 with tracking
error typically below 0.05%. VIX is defined on the same index, so the implied
vols should be nearly identical. In practice traders use VIX as the IV proxy
for SPY without qualification — this is standard industry usage.

**Known limits:**

- *Instrument mismatch.* VIX uses SPX options, which are European and
  cash-settled. SPY options are American and share-settled. American options
  have early exercise value (puts can be worth exercising early when rates are
  high; calls when a large dividend is imminent). Near ex-dividend dates, SPY
  IV can diverge from VIX by 1–3 vol points.

- *Model-free vs. model-dependent.* VIX's strip-of-options formula makes no
  distributional assumptions — it measures the risk-neutral variance directly.
  The implied vols we solve from individual SPY options (via Black-Scholes) are
  model-dependent. The two should agree on average but differ strike by strike.

- *30-day vs. 21-day mismatch.* VIX measures vol for 30 calendar days; we
  compare it to 21 trading-day forward RV. The two windows differ by a small
  amount that introduces noise, particularly around three-day weekends and
  holiday-dense months where the trading-day/calendar-day ratio is not 252/365.

These are documented, accepted approximations. The VRP finding — that mean VRP
is positive and large — is robust to all of them; they affect precision, not
the sign or order of magnitude of the result.

---

### The volatility risk premium — definition and intuition

The volatility risk premium (VRP) is the excess return earned by systematically
selling options on an index:

   VRP(t) = IV(t) − RV_forward(t)

where IV(t) is the implied vol (VIX) at date t and RV_forward(t) is the
realized vol over the next 21 trading days. When VRP > 0, option sellers
collected more premium than the hedged moves cost them.

**The insurance margin analogy.** An option seller is an insurance company.
The premium collected is the policy price (IV); the claims paid are the actual
losses covered (RV). A well-run insurer prices above expected claims to earn a
margin. The volatility risk premium is that margin: option buyers structurally
overpay for insurance relative to realized outcomes because they are paying not
just for expected vol but for the right to be hedged against tail scenarios
they are not equipped to absorb. The seller bears the risk of a catastrophic
event that would wipe out many months of premium in one day — the premium is
compensation for that optionality.

**The empirical finding in this dataset (2024-07-16 → 2026-06-12, 480 obs):**

- Mean VRP: +3.99 percentage points. Option sellers earned 4 vol points above
  realized outcomes on average — a material edge over 480 trading-day obs.
- 85.6% of days had positive VRP — sellers won most of the time.
- Maximum VRP: +22.74 pts on 2024-08-05 ("Vol Monday"). VIX spiked to 38.6%
  on the yen-carry-trade unwind but SPY's actual 21-day RV was only 15.8%.
  The panic was priced at 2.4× the realized vol that followed.
- Worst episode: −34.13 pts on 2025-03-25 (Trump tariff shock). VIX was 17.1%
  — the market saw low vol — but SPY realized 51.3% over the next 21 days as
  the initial tariff announcements hit. This is the classic tail risk that the
  VRP compensates for: rare, large, and unforeseeable from current IV levels.

**Why the premium persists.** If markets were complete and agents risk-neutral,
VRP would be zero: rational sellers would compete away any excess premium.
VRP persists because:
1. Jump and gap risk cannot be replicated by continuous delta-hedging — sellers
   face discrete losses at earnings, macro prints, and geopolitical shocks.
2. Demand for protection is structurally higher than the supply of risk capital
   willing to bear it — pension funds, endowments, and corporations are
   structural put buyers; dedicated vol sellers are smaller in aggregate.
3. Left-tail risk (crashes) is psychologically costly beyond its actuarial
   value — investors pay a fear premium above the mathematically fair price.

The risk is real, as March 2025 showed: a seller who was short vol through the
tariff shock absorbed a ~34-point loss in a single 21-day window.
