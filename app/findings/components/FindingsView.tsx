"use client";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef } from "react";
import PageLoader from "@/app/components/PageLoader";
import type { VrpPoint, VrpStats } from "@/lib/study/vrp";

const DIVIDER: React.CSSProperties = {
  borderTop:  "1px solid var(--color-edge)",
  marginTop:  "48px",
  paddingTop: "32px",
};

const BODY: React.CSSProperties = {
  fontSize:   "15px",
  lineHeight: "1.6",
  color:      "var(--color-label)",
  maxWidth:   "68ch",
  margin:     0,
};

const FindingsCharts = dynamic(() => import("./FindingsCharts"), {
  ssr:     false,
  loading: () => <PageLoader label="LOADING STUDY" />,
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

// Inline math: mono rendering for formulas
function M({ children }: { children: React.ReactNode }) {
  return <span className="num">{children}</span>;
}

// Body paragraph
function P({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <p style={{ ...BODY, ...style }}>{children}</p>;
}

// Display equation: centered on its own line with right-aligned number
function Eq({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        display:             "grid",
        gridTemplateColumns: "1fr auto 1fr",
        alignItems:          "center",
        margin:              "20px 0",
        maxWidth:            "68ch",
      }}
    >
      <span />
      <span
        className="num"
        style={{ fontSize: "16px", color: "#E7E7EA", textAlign: "center" }}
      >
        {children}
      </span>
      <span
        className="label-caps"
        style={{ textAlign: "right", paddingRight: "4px" }}
      >
        ({n})
      </span>
    </div>
  );
}

// Section heading
function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="label-caps"
      style={{ color: "#E7E7EA", display: "block", marginBottom: "12px" }}
    >
      {children}
    </span>
  );
}

// Methodology subsection
function MethodSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="label-caps" style={{ display: "block", marginBottom: "8px" }}>
        {heading}
      </span>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {children}
      </div>
    </div>
  );
}

// Contents rail — desktop only (≥1100px), sticky, IntersectionObserver-driven
const CONTENTS = [
  { id: "section-premium",     label: "What the premium pays" },
  { id: "section-inverts",     label: "When it inverts"       },
  { id: "section-selling-vol", label: "What this means for selling vol" },
  { id: "methodology",         label: "Methodology"           },
];

function ContentsRail({ activeId }: { activeId: string | null }) {
  return (
    <aside
      style={{
        position:  "sticky",
        top:       "88px",
        width:     "160px",
        flexShrink: 0,
        display:   "flex",
        flexDirection: "column",
        gap:       "10px",
      }}
    >
      <span className="label-caps" style={{ marginBottom: "4px" }}>CONTENTS</span>
      {CONTENTS.map(({ id, label }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
            style={{
              background:    "none",
              border:        "none",
              padding:       0,
              cursor:        "pointer",
              textAlign:     "left",
              fontSize:      "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color:         isActive ? "#E7E7EA" : "var(--color-label)",
              opacity:       isActive ? 1 : 0.6,
              transition:    "color 0.15s, opacity 0.15s",
            }}
          >
            {label}
          </button>
        );
      })}
    </aside>
  );
}

const LINKEDIN  = "https://www.linkedin.com/in/andrewcicala/";
const GITHUB    = "https://github.com/andrewpcicala/skewlab";
const CONTACT   = "mailto:andrewpcicala@gmail.com";
const PUBLISHED = "JULY 2026";

// ── Main view ─────────────────────────────────────────────────────────────────
export default function FindingsView({ buildDate }: { buildDate: string }) {
  const [data,     setData]     = useState<FindingsData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [errSrc,   setErrSrc]   = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const observerRef             = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15_000);

    (async () => {
      try {
        const r    = await fetch("/api/findings", { signal: ctrl.signal });
        const json = await r.json();
        if (!r.ok) {
          setErrSrc((json as { source?: string }).source ?? "EXTERNAL SOURCE");
          return;
        }
        setData(json as FindingsData);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setErrSrc("SERVER");
        } else {
          setErrSrc("EXTERNAL SOURCE");
        }
      } finally {
        clearTimeout(tid);
        setLoading(false);
      }
    })();

    return () => { ctrl.abort(); clearTimeout(tid); };
  }, []);

  // Wire IntersectionObserver after data resolves (loading done → sections rendered)
  useEffect(() => {
    if (loading) return;

    const intersecting = new Map<string, boolean>();

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          intersecting.set(entry.target.id, entry.isIntersecting);
        }
        // First intersecting section in DOM order wins
        const first = CONTENTS.find(({ id }) => intersecting.get(id));
        setActiveId(first?.id ?? null);
      },
      { rootMargin: "0px 0px -50% 0px" }
    );

    for (const { id } of CONTENTS) {
      const el = document.getElementById(id);
      if (el) observerRef.current.observe(el);
    }

    return () => { observerRef.current?.disconnect(); };
  }, [loading]);

  if (loading) return <PageLoader label="LOADING STUDY" />;

  const isError = data === null;
  const meta    = data?.meta;
  const stats   = data?.stats;

  const statItems = [
    { label: "MEAN VRP",  val: stats ? signed(stats.mean) + " pts"                : "—", color: "#E7E7EA" as const,          sub: null },
    { label: "POSITIVE",  val: stats ? stats.pctPositive.toFixed(1) + "% of days" : "—", color: "#E7E7EA" as const,          sub: null },
    { label: "MAX",       val: stats ? signed(stats.max.vrp) + " pts"              : "—", color: "#E7E7EA" as const,          sub: stats?.max.date ?? null },
    { label: "WORST",     val: stats ? signed(stats.min.vrp) + " pts"              : "—", color: "var(--color-neg)" as const, sub: stats?.min.date ?? null },
  ];

  return (
    // Outer flex: main column + contents rail (rail hidden < 1100px via media query)
    <div style={{ display: "flex", gap: "48px", alignItems: "flex-start" }}>

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

        {/* Title block */}
        <div style={{ borderBottom: "1px solid var(--color-edge)", paddingBottom: "24px", marginBottom: "24px" }}>
          <h1
            className="label-caps"
            style={{ fontSize: "15px", color: "#E7E7EA", marginBottom: "8px", fontWeight: "normal" }}
          >
            The Volatility Risk Premium in SPY
          </h1>

          {/* Byline */}
          <div style={{ marginBottom: "10px" }}>
            <div className="label-caps" style={{ color: "var(--color-label)", marginBottom: "4px" }}>
              ANDREW CICALA · INDUSTRIAL ENGINEERING, RUTGERS UNIVERSITY
            </div>
            <div
              style={{
                display:        "flex",
                justifyContent: "space-between",
                alignItems:     "baseline",
                flexWrap:       "wrap",
                gap:            "2px 0",
              }}
            >
              <span
                className="num"
                style={{ fontSize: "11px", color: "var(--color-label)", letterSpacing: "0.04em" }}
              >
                PUBLISHED {PUBLISHED} · UPDATED {buildDate}
              </span>
              <span className="label-caps">
                <a href={LINKEDIN} target="_blank" rel="noreferrer" className="link-accent">LINKEDIN</a>
                {" · "}
                <a href={CONTACT} className="link-accent">CONTACT</a>
              </span>
            </div>
          </div>

          <div className="label-caps" style={{ display: "flex", flexWrap: "wrap", gap: "0 1rem", lineHeight: "1.8" }}>
            <span>{meta?.dataRange.from ?? "—"} → {meta?.dataRange.to ?? "—"}</span>
            <span style={{ opacity: 0.35 }}>·</span>
            <span>{meta?.seriesLength ?? "—"} observations</span>
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

        {/* Headline stats row */}
        <div
          style={{
            display:       "flex",
            flexWrap:      "wrap",
            gap:           "0.5rem 2.5rem",
            borderBottom:  "1px solid var(--color-edge)",
            paddingBottom: "24px",
            marginBottom:  "32px",
          }}
        >
          {statItems.map(({ label, val, color, sub }) => (
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

        {/* Error banner OR Charts */}
        {isError ? (
          <div style={{ marginBottom: "32px" }}>
            <span className="label-caps" style={{ color: "var(--color-label)" }}>
              STUDY DATA TEMPORARILY UNAVAILABLE — {errSrc} DID NOT RESPOND
            </span>
          </div>
        ) : (
          <FindingsCharts series={data.series} max={data.stats.max} min={data.stats.min} />
        )}

        {/* Analysis: what the premium pays */}
        <div id="section-premium" style={DIVIDER}>
          <SectionHead>What the premium pays</SectionHead>
          <P>
            [ ANALYSIS — to be written by the author ]
          </P>
        </div>

        {/* Analysis: when it inverts */}
        <div id="section-inverts" style={DIVIDER}>
          <SectionHead>When it inverts</SectionHead>
          <P>
            [ ANALYSIS — to be written by the author ]
          </P>
        </div>

        {/* Analysis: what this means for selling vol */}
        <div id="section-selling-vol" style={DIVIDER}>
          <SectionHead>What this means for selling vol</SectionHead>
          <P>
            [ ANALYSIS — to be written by the author ]
          </P>
        </div>

        {/* Methodology */}
        <div id="methodology" style={DIVIDER}>
          <SectionHead>Methodology</SectionHead>

          <div style={{ display: "flex", flexDirection: "column", gap: "40px", marginTop: "24px" }}>

            <MethodSection heading="Realized volatility">
              <P>
                Daily log returns are computed from adjusted SPY closes. Log returns are
                time-additive — summing them gives the cumulative log return over any
                sub-period exactly, without path dependence.
              </P>
              <Eq n={1}>
                r<sub>t</sub> = ln(P<sub>t</sub> / P<sub>t−1</sub>)
              </Eq>
              <P>
                A 21-trading-day rolling window matches the VIX 30-calendar-day horizon
                (4.2 weeks × 5 days). Annualization applies <M>× √252</M> — variance
                scales linearly with time, so vol scales with <M>√time</M>. The
                mean-zero estimator is used throughout: at daily frequencies, true drift
                ≈ 0.012% per day is negligible against daily vol ≈ 1%, and estimating
                drift from a 21-day window adds more noise than it removes.
              </P>
              <Eq n={2}>
                RV = √(Σr²/n × 252)
              </Eq>
              <P>
                This is the convention in the original CBOE VIX white paper.
              </P>
            </MethodSection>

            <MethodSection heading="The VIX as implied-vol proxy">
              <P>
                VIX (CBOE Volatility Index) is a model-free measure of 30-day expected
                volatility for the S&P 500, derived from a strip of SPX options across
                all available strikes. SPY tracks the S&P 500 with tracking error below
                0.05%, making VIX the standard proxy for SPY implied vol.
              </P>
              <P>
                Known limits: VIX uses SPX options (European, cash-settled); SPY options
                are American and may diverge by 1–3 vol points near ex-dividend dates.
                The 30-calendar-day vs. 21-trading-day window mismatch introduces minor
                noise near holidays. Source: FRED series VIXCLS (daily close).
              </P>
            </MethodSection>

            <MethodSection heading="Forward alignment">
              <P>
                Each observation answers: "what did the market charge on this date, and
                what volatility actually occurred?" VIX is sampled at date <M>t</M>;
                realized vol is computed over the 21 trading days beginning on <M>t</M>.
              </P>
              <Eq n={3}>
                VRP(t) = VIX(t) − RV<sub>forward</sub>(t)
              </Eq>
              <P>
                Dates without a VIX close (weekends and FRED non-trading days) are
                skipped. The last 21 trading days of the SPY close series are consumed
                by the forward window and excluded from the VRP series.
              </P>
            </MethodSection>

            <MethodSection heading="Data caveats">
              <P>
                Polygon free tier limits SPY history to approximately two years (sample:{" "}
                {meta?.dataRange.from ?? "—"} → {meta?.dataRange.to ?? "—"},{" "}
                {meta?.seriesLength ?? "—"} VRP observations).
              </P>
              <P>
                The sample excludes a 2020-class crisis and the 2022 rate-shock bear
                market; the worst episode here (March 2025 tariff shock, VRP −34 pts)
                is severe but likely not the tail bound over a longer sample.
              </P>
              <P>
                Realized vol estimates from a 21-day window carry standard error
                approximately <M>σ/√(2n) ≈ 15%</M> of true vol, so individual VRP
                readings are noisy; the mean and distributional statistics are stable
                across the sample.
              </P>
            </MethodSection>

          </div>
        </div>

        {/* Colophon */}
        <div style={{ borderTop: "1px solid var(--color-edge)", marginTop: "48px", paddingTop: "32px" }}>
          <span
            className="label-caps"
            style={{ color: "#E7E7EA", display: "block", marginBottom: "12px" }}
          >
            ABOUT THIS PROJECT
          </span>
          <P>
            SkewLab is an independent research project by Andrew Cicala (Industrial
            Engineering, Rutgers University). All pricing and volatility mathematics —
            Black-Scholes, the Greeks, the Newton-Raphson implied-vol solver, realized
            volatility — are hand-written in TypeScript with no pricing libraries.
            Ongoing work: a live rule-based paper-trading experiment harvesting the
            premium measured above.
          </P>
          <div style={{ marginTop: "12px" }} className="label-caps">
            <a href={LINKEDIN} target="_blank" rel="noreferrer" className="link-accent">LINKEDIN</a>
            {" · "}
            <a href={GITHUB} target="_blank" rel="noreferrer" className="link-accent">GITHUB</a>
            {" · "}
            <a href={CONTACT} className="link-accent">CONTACT</a>
          </div>
        </div>

        {/* Disclaimer footer */}
        <div style={{ borderTop: "1px solid var(--color-edge)", marginTop: "48px", paddingTop: "16px" }}>
          <span className="label-caps">
            Analytics only. Nothing on this page is investment advice.
          </span>
        </div>

      </div>

      {/* ── Contents rail (desktop ≥1100px) ──────────────────────────────── */}
      <div className="findings-rail">
        <ContentsRail activeId={activeId} />
      </div>

    </div>
  );
}
