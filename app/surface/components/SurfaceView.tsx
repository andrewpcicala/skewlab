"use client";
import dynamic from "next/dynamic";
import { useState, useEffect, useCallback, useMemo } from "react";
import TickerInput from "@/app/chain/components/TickerInput";
import type { SurfacePoint, SurfaceStats } from "@/lib/pricing/surface";

// SurfacePlot is browser-only (Plotly + WebGL); loading fallback shown inline
const SurfacePlot = dynamic(() => import("./SurfacePlot"), {
  ssr:     false,
  loading: () => <p className="label-caps" style={{ padding: "2rem 0" }}>SOLVING SURFACE…</p>,
});

interface SurfaceData {
  spot:   number;
  asOf:   string;
  points: SurfacePoint[];
  stats:  SurfaceStats;
}

// ── Skew readout ──────────────────────────────────────────────────────────────
// Finds front-expiry ATM IV and 10%-OTM put IV from solved surface points.
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
    dte:      Math.round(atm.dte),
    atmStrike: atm.strike,
    atmIv:    atm.iv * 100,
    otmStrike: otmPut.strike,
    otmIv:    otmPut.iv * 100,
    spread:   (otmPut.iv - atm.iv) * 100,
  };
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function SurfaceView() {
  const [ticker, setTicker]   = useState("SPY");
  const [data,   setData]     = useState<SurfaceData | null>(null);
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
      {/* Header row */}
      <div className="flex items-end justify-between border-b border-edge pb-6 mb-6">
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
          <span className="label-caps">
            {data.stats.solved} / {data.stats.attempted} CONTRACTS SOLVED
            {" · "}DELAYED
            {" · "}AS OF {time}
          </span>
        )}
      </div>

      {/* Loading */}
      {loading && !data && (
        <p className="label-caps">LOADING SURFACE…</p>
      )}

      {/* Error */}
      {!loading && error && (
        <p className="label-caps" style={{ color: "var(--color-neg)" }}>
          {error}
        </p>
      )}

      {/* Plot */}
      {data && !error && (
        <>
          <SurfacePlot
            points={data.points}
            ticker={ticker}
          />

          {/* Skew readout */}
          {skew && (
            <div
              className="label-caps"
              style={{ marginTop: "1.25rem", display: "flex", gap: "2rem" }}
            >
              <span>
                ATM{" "}
                <span className="num" style={{ color: "#E7E7EA", fontSize: "13px" }}>
                  {skew.atmIv.toFixed(1)}%
                </span>
                {" "}
                <span style={{ opacity: 0.5 }}>
                  ({skew.atmStrike} · {skew.dte}d)
                </span>
              </span>
              <span>
                10% OTM PUT{" "}
                <span className="num" style={{ color: "#E7E7EA", fontSize: "13px" }}>
                  {skew.otmIv.toFixed(1)}%
                </span>
                {" "}
                <span style={{ opacity: 0.5 }}>({skew.otmStrike})</span>
              </span>
              <span>
                SKEW{" "}
                <span className="num" style={{ color: "var(--color-accent)", fontSize: "13px" }}>
                  +{skew.spread.toFixed(1)} pts
                </span>
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
