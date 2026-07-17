"use client";
import dynamic from "next/dynamic";
import { useState, useEffect } from "react";
import type { VrpPoint, VrpStats } from "@/lib/study/vrp";

const DIVIDER: React.CSSProperties = {
  borderTop:   "1px solid var(--color-edge)",
  marginTop:   "48px",
  paddingTop:  "48px",
};

// Chart loading placeholder preserves vertical space so the page doesn't reflow
function ChartPlaceholder() {
  return (
    <div style={{ height: "calc(80vh + 60px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span className="label-caps">LOADING</span>
    </div>
  );
}

const FindingsCharts = dynamic(() => import("./FindingsCharts"), {
  ssr:     false,
  loading: ChartPlaceholder,
});

interface FindingsData {
  series: VrpPoint[];
  stats:  VrpStats;
  meta: {
    dataRange:    { from: string; to: string };
    seriesLength: number;
    source:       string;
    caveats:      string[];
  };
}

function signed(n: number, digits = 1): string {
  return (n >= 0 ? "+" : "") + n.toFixed(digits);
}

function scrollToMethodology(e: React.MouseEvent) {
  e.preventDefault();
  document.getElementById("methodology")?.scrollIntoView({ behavior: "smooth" });
}

function AnalysisPlaceholder() {
  return (
    <p style={{ marginTop: "16px", fontSize: "13px", lineHeight: "1.7", color: "var(--color-label)", fontStyle: "italic" }}>
      [ ANALYSIS — to be written by the author ]
    </p>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <span className="label-caps" style={{ color: "#E7E7EA", display: "block" }}>
      {children}
    </span>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function FindingsView() {
  const [data,    setData]    = useState<FindingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r    = await fetch("/api/findings");
        const json = await r.json();
        if (!r.ok) {
          setError((json as { error?: string }).error ?? `HTTP ${r.status}`);
          return;
        }
        setData(json as FindingsData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center" }}>
        <span className="label-caps">LOADING</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center" }}>
        <span className="label-caps">{error ?? "No data"}</span>
      </div>
    );
  }

  const { series, stats, meta } = data;

  return (
    <div>
      {/* ── Title block ──────────────────────────────────────────────────── */}
      <div style={{ borderBottom: "1px solid var(--color-edge)", paddingBottom: "28px", marginBottom: "28px" }}>
        <h1
          className="label-caps"
          style={{ fontSize: "15px", color: "#E7E7EA", marginBottom: "12px", fontWeight: "normal" }}
        >
          The Volatility Risk Premium in SPY
        </h1>
        <div className="label-caps" style={{ display: "flex", flexWrap: "wrap", gap: "0 1rem", lineHeight: "1.8" }}>
          <span>{meta.dataRange.from} → {meta.dataRange.to}</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>{meta.seriesLength} observations</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <span>SPY: Polygon · VIX: FRED · RV: 21-day realized, hand-computed</span>
          <span style={{ opacity: 0.35 }}>·</span>
          <a
            href="#methodology"
            onClick={scrollToMethodology}
            style={{ color: "var(--color-accent)", textDecoration: "none" }}
          >
            METHODOLOGY ↓
          </a>
        </div>
      </div>

      {/* ── Headline stats row ───────────────────────────────────────────── */}
      <div
        style={{
          display:       "flex",
          flexWrap:      "wrap",
          gap:           "0.5rem 2.5rem",
          borderBottom:  "1px solid var(--color-edge)",
          paddingBottom: "28px",
          marginBottom:  "40px",
        }}
      >
        {[
          { label: "MEAN VRP",  val: signed(stats.mean) + " pts",                          color: "#E7E7EA",             sub: null },
          { label: "POSITIVE",  val: stats.pctPositive.toFixed(1) + "% of days",           color: "#E7E7EA",             sub: null },
          { label: "MAX",       val: signed(stats.max.vrp) + " pts",                        color: "#E7E7EA",             sub: stats.max.date },
          { label: "WORST",     val: signed(stats.min.vrp) + " pts",                        color: "var(--color-neg)",    sub: stats.min.date },
        ].map(({ label, val, color, sub }) => (
          <span
            key={label}
            style={{ color: "var(--color-label)", fontSize: "13px", textTransform: "uppercase", letterSpacing: "0.08em" }}
          >
            {label}{" "}
            <span className="num" style={{ color, fontSize: "15px" }}>{val}</span>
            {sub && (
              <span style={{ opacity: 0.45, fontSize: "11px" }}>{" "}({sub})</span>
            )}
          </span>
        ))}
      </div>

      {/* ── Charts (both rendered by FindingsCharts; labels are internal) ─── */}
      <FindingsCharts series={series} max={stats.max} min={stats.min} />

      {/* ── Analysis: what the premium pays ─────────────────────────────── */}
      <div style={DIVIDER}>
        <SectionHead>What the premium pays</SectionHead>
        <AnalysisPlaceholder />
      </div>

      {/* ── Analysis: when it inverts ────────────────────────────────────── */}
      <div style={DIVIDER}>
        <SectionHead>When it inverts</SectionHead>
        <AnalysisPlaceholder />
      </div>

      {/* ── Analysis: what this means for selling vol ────────────────────── */}
      <div style={DIVIDER}>
        <SectionHead>What this means for selling vol</SectionHead>
        <AnalysisPlaceholder />
      </div>

      {/* ── Methodology ──────────────────────────────────────────────────── */}
      <div id="methodology" style={DIVIDER}>
        <SectionHead>Methodology</SectionHead>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px", marginTop: "24px" }}>
          <MethodBlock heading="How realized volatility is computed">
            Daily log returns r<sub>t</sub> = ln(P<sub>t</sub> / P<sub>t−1</sub>) are computed from
            adjusted SPY closes. Log returns are time-additive — summing them gives the
            cumulative log return over any sub-period exactly, without path dependence.
            A 21-trading-day rolling window matches the VIX 30-calendar-day horizon
            (4.2 weeks × 5 days). Annualization applies × √252 (252 trading days per
            year by convention; variance scales linearly with time, so vol scales with
            √time). The mean-zero estimator RV = √(Σr²/n × 252) is used throughout:
            at daily frequencies, true drift ≈ 0.012% per day is negligible against
            daily vol ≈ 1%, and estimating drift from a 21-day window adds more noise
            than it removes. This is the convention in the original CBOE VIX white paper.
          </MethodBlock>

          <MethodBlock heading="The VIX as implied-vol proxy">
            VIX (CBOE Volatility Index) is a model-free measure of 30-day expected
            volatility for the S&P 500, derived from a strip of SPX options across all
            available strikes. SPY tracks the S&P 500 with tracking error below 0.05%,
            making VIX the standard proxy for SPY implied vol. Known limits: VIX uses
            SPX options (European, cash-settled); SPY options are American and may
            diverge by 1–3 vol points near ex-dividend dates. The 30-calendar-day vs.
            21-trading-day window mismatch introduces minor noise near holidays.
            Source: FRED series VIXCLS (daily close, no API key required).
          </MethodBlock>

          <MethodBlock heading="Forward alignment">
            VRP(t) = VIX(t) − RV_forward(t), where RV_forward(t) is the realized vol
            of the 21 trading days beginning on date t. This is forward-looking: each
            observation answers "what did the market charge on this date, and what
            volatility actually occurred?" Dates without a VIX close (weekends and FRED
            non-trading days) are skipped. The last 21 trading days of the SPY close
            series are consumed by the forward window and excluded from the VRP series.
          </MethodBlock>

          <MethodBlock heading="Data caveats">
            Polygon free tier limits SPY history to approximately two years (sample:{" "}
            {meta.dataRange.from} → {meta.dataRange.to}, {meta.seriesLength} VRP
            observations). The sample excludes a 2020-class crisis and the 2022
            rate-shock bear market; the worst episode here (March 2025 tariff shock,
            VRP −34 pts) is severe but likely not the tail bound over a longer sample.
            Realized vol estimates from a 21-day window carry standard error ≈ σ/√(2n)
            ≈ 15% of true vol, so individual VRP readings are noisy; the mean and
            distributional statistics are stable across the sample.
          </MethodBlock>
        </div>
      </div>

      {/* ── Disclaimer footer ────────────────────────────────────────────── */}
      <div style={{ borderTop: "1px solid var(--color-edge)", marginTop: "48px", paddingTop: "16px" }}>
        <span className="label-caps">
          Analytics only. Nothing on this page is investment advice.
        </span>
      </div>
    </div>
  );
}

function MethodBlock({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label-caps" style={{ display: "block", marginBottom: "8px" }}>
        {heading}
      </span>
      <p style={{ fontSize: "13px", lineHeight: "1.85", color: "var(--color-label)", maxWidth: "700px", margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
