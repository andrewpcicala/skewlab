"use client";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useMemo } from "react";
import TickerInput from "@/app/chain/components/TickerInput";
import PageLoader from "@/app/components/PageLoader";
import type { SurfacePoint, SurfaceStats } from "@/lib/pricing/surface";

// SurfacePlot is browser-only (Plotly + WebGL); the PageLoader occupies the
// same 70vh space so the page doesn't reflow when the plot mounts.
const SurfacePlot = dynamic(() => import("./SurfacePlot"), {
  ssr:     false,
  loading: () => <PageLoader label="SOLVING SURFACE" />,
});

interface SurfaceData {
  spot:   number;
  asOf:   string;
  points: SurfacePoint[];
  stats:  SurfaceStats;
}

// ── Skew readout ──────────────────────────────────────────────────────────────
// Front-expiry ATM IV and 10%-OTM put IV from solved surface points.
function computeSkew(points: SurfacePoint[], spot: number) {
  if (!points.length) return null;

  const frontExp = points.reduce((b, p) => (p.dte < b.dte ? p : b)).expiry;
  const front    = points.filter(p => p.expiry === frontExp);
  if (front.length < 3) return null;

  const atm = front.reduce((b, p) =>
    Math.abs(p.strike - spot) < Math.abs(b.strike - spot) ? p : b
  );

  const otmTarget = spot * 0.90;
  const puts      = front.filter(p => p.type === "put");
  if (!puts.length) return null;
  const otmPut = puts.reduce((b, p) =>
    Math.abs(p.strike - otmTarget) < Math.abs(b.strike - otmTarget) ? p : b
  );

  return {
    dte:       Math.round(atm.dte),
    atmStrike: atm.strike,
    atmIv:     atm.iv * 100,
    otmStrike: otmPut.strike,
    otmIv:     otmPut.iv * 100,
    spread:    (otmPut.iv - atm.iv) * 100,
  };
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function SurfaceView() {
  const [ticker,  setTicker]  = useState("SPY");
  const [data,    setData]    = useState<SurfaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const fetchSurface = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    try {
      const r    = await fetch(`/api/surface?symbol=${encodeURIComponent(sym)}`);
      const json = await r.json();
      if (!r.ok) {
        setError((json as { error?: string }).error ?? `HTTP ${r.status}`);
        setData(null);
        return;
      }
      setData(json as SurfaceData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSurface(ticker); }, [ticker, fetchSurface]);

  const handleSubmit = useCallback(
    (sym: string) => { if (sym !== ticker) setTicker(sym); },
    [ticker]
  );

  const skew = useMemo(
    () => (data ? computeSkew(data.points, data.spot) : null),
    [data]
  );

  const time = data
    ? new Date(data.asOf).toLocaleTimeString("en-US", {
        hour: "2-digit", minute: "2-digit", hour12: false,
      })
    : null;

  return (
    <div>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      {/* flex-wrap so the status line drops below the ticker on narrow screens */}
      <div
        className="flex flex-wrap items-end justify-between gap-y-3 border-b border-edge"
        style={{ paddingBottom: "24px", marginBottom: "24px" }}
      >
        <div className="flex items-baseline gap-6">
          <TickerInput onSubmit={handleSubmit} />
          {data && !loading && (
            <span className="label-caps">
              SPOT{" "}
              <span className="num text-[#E7E7EA]">{data.spot.toFixed(2)}</span>
            </span>
          )}
        </div>
        {data && !loading && (
          <span
            className="label-caps"
            title="IVs solved per contract via Newton-Raphson from mid quotes."
          >
            {data.stats.solved} / {data.stats.attempted} CONTRACTS SOLVED
            {" · "}DELAYED
            {" · "}AS OF {time}
          </span>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────── */}
      {!loading && error && (
        <div style={{ height: "70vh", display: "flex", alignItems: "center" }}>
          <span className="label-caps" style={{ color: "var(--color-label)" }}>
            {error}
          </span>
        </div>
      )}

      {/* ── Plot ────────────────────────────────────────────────────────── */}
      {!error && (
        <>
          {(loading && !data) ? (
            <PageLoader label="SOLVING SURFACE" />
          ) : data ? (
            <SurfacePlot
              points={data.points}
              ticker={ticker}
              spot={data.spot}
            />
          ) : null}

          {/* ── Skew readout ───────────────────────────────────────────── */}
          {/* flexWrap: wrap so the three stats flow to a second line on mobile */}
          {skew && (
            <div
              style={{
                borderTop:     "1px solid var(--color-edge)",
                marginTop:     "24px",
                paddingTop:    "24px",
                display:       "flex",
                flexWrap:      "wrap",
                gap:           "0.75rem 2rem",
                fontSize:      "13px",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span style={{ color: "var(--color-label)" }}>
                ATM{" "}
                <span className="num" style={{ color: "#E7E7EA", fontSize: "13px" }}>
                  {skew.atmIv.toFixed(1)}%
                </span>
                {" "}
                <span style={{ opacity: 0.45, fontSize: "11px" }}>
                  ({skew.atmStrike} · {skew.dte}d)
                </span>
              </span>

              <span style={{ color: "var(--color-label)" }}>
                10% OTM PUT{" "}
                <span className="num" style={{ color: "#E7E7EA", fontSize: "13px" }}>
                  {skew.otmIv.toFixed(1)}%
                </span>
                {" "}
                <span style={{ opacity: 0.45, fontSize: "11px" }}>({skew.otmStrike})</span>
              </span>

              <span style={{ color: "var(--color-label)" }}>
                SKEW{" "}
                <span className="num" style={{ color: "var(--color-accent)", fontSize: "15px" }}>
                  +{skew.spread.toFixed(1)}
                </span>
                {" pts"}
              </span>
            </div>
          )}

          {/* ── Abstract ───────────────────────────────────────────────── */}
          <p
            style={{
              fontSize:   "15px",
              lineHeight: "1.6",
              color:      "var(--color-label)",
              maxWidth:   "68ch",
              margin:     "24px 0 0",
            }}
          >
            SkewLab is an options analytics workbench with hand-written pricing
            — no vendor Greeks. The surface fits implied volatility across
            strikes and expiries from live mid quotes. Findings studies the
            volatility risk premium in SPY: what the market charges for
            protection versus what actually occurs. Paper tracks simulated
            trades against live quotes in an append-only ledger.
          </p>
        </>
      )}
    </div>
  );
}
