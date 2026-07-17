"use client";
import { useEffect, useRef } from "react";
import type { VrpPoint, VrpEpisode } from "@/lib/study/vrp";

const MONO        = "JetBrains Mono, monospace";
const AXIS_FONT   = { family: MONO, size: 10, color: "#8A8A93" };
const HOVER_LABEL = {
  bgcolor:     "#141418",
  bordercolor: "#26262C",
  font:        { family: MONO, size: 11, color: "#E7E7EA" },
};
const AXIS_BASE = {
  gridcolor:    "#26262C",
  showzeroline: false,
  zeroline:     false,
  tickfont:     AXIS_FONT,
};
const DATE_AXIS = { ...AXIS_BASE, type: "date" as const, nticks: 8 };
const NUM_AXIS  = { ...AXIS_BASE, nticks: 6 };
const LAYOUT_BASE = {
  paper_bgcolor: "transparent",
  plot_bgcolor:  "transparent",
  font:          { family: MONO, color: "#8A8A93" },
  margin:        { l: 48, r: 16, t: 8, b: 40 },
  autosize:      true,
};
const PLOTLY_CFG = { displaylogo: false, displayModeBar: false, responsive: true };

interface Props {
  series: VrpPoint[];
  max:    VrpEpisode;
  min:    VrpEpisode;
}

export default function FindingsCharts({ series, max, min }: Props) {
  const ref1 = useRef<HTMLDivElement>(null);
  const ref2 = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Pl   = useRef<any>(null);
  const seq  = useRef(0);

  useEffect(() => {
    if (!series.length) return;
    const mySeq = ++seq.current;

    (async () => {
      if (!Pl.current) {
        const mod = await import("plotly.js-dist-min");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Pl.current = (mod as any).default ?? mod;
      }
      if (seq.current !== mySeq || !ref1.current || !ref2.current) return;

      const P     = Pl.current;
      const dates = series.map(p => p.date);
      const ivs   = series.map(p => p.iv30);
      const rvs   = series.map(p => p.rv30);
      const vrps  = series.map(p => p.vrp);

      // ── Chart 1: IV vs Forward RV ──────────────────────────────────────────
      await P.react(ref1.current, [
        {
          type:          "scatter",
          mode:          "lines",
          x:             dates,
          y:             ivs,
          name:          "VIX (implied)",
          line:          { color: "#E7E7EA", width: 1 },
          hovertemplate: "%{x|%Y-%m-%d}  VIX %{y:.1f}%<extra></extra>",
          hoverlabel:    HOVER_LABEL,
        },
        {
          type:          "scatter",
          mode:          "lines",
          x:             dates,
          y:             rvs,
          name:          "RV 21d (realized)",
          line:          { color: "#8A8A93", width: 1 },
          hovertemplate: "%{x|%Y-%m-%d}  RV %{y:.1f}%<extra></extra>",
          hoverlabel:    HOVER_LABEL,
        },
      ], {
        ...LAYOUT_BASE,
        showlegend: true,
        legend: {
          font:    AXIS_FONT,
          bgcolor: "transparent",
          x:       0.01,
          y:       0.98,
          xanchor: "left",
          yanchor: "top",
        },
        xaxis: DATE_AXIS,
        yaxis: { ...NUM_AXIS, ticksuffix: "%" },
      }, PLOTLY_CFG);

      // ── Chart 2: VRP with zero rule and negative fill ──────────────────────
      await P.react(ref2.current, [
        // Clip to min(vrp, 0) and fill tozeroy — paints only the below-zero region
        {
          type:      "scatter",
          mode:      "lines",
          x:         dates,
          y:         vrps.map(v => Math.min(v, 0)),
          fill:      "tozeroy",
          fillcolor: "rgba(239,68,68,0.15)",
          line:      { width: 0, color: "rgba(0,0,0,0)" },
          hoverinfo: "skip",
          showlegend: false,
        },
        // VRP line on top
        {
          type:          "scatter",
          mode:          "lines",
          x:             dates,
          y:             vrps,
          line:          { color: "#3B82F6", width: 1 },
          hovertemplate: "%{x|%Y-%m-%d}  VRP %{y:+.1f} pts<extra></extra>",
          hoverlabel:    HOVER_LABEL,
          showlegend:    false,
        },
      ], {
        ...LAYOUT_BASE,
        shapes: [
          {
            type: "line",
            xref: "paper", x0: 0, x1: 1,
            yref: "y",     y0: 0, y1: 0,
            line: { color: "#26262C", width: 1 },
          },
        ],
        annotations: [
          {
            x:           max.date,
            y:           max.vrp,
            text:        max.date,
            showarrow:   true,
            arrowhead:   0,
            arrowcolor:  "#8A8A93",
            arrowwidth:  1,
            ax:          0,
            ay:          -28,
            font:        AXIS_FONT,
            bgcolor:     "transparent",
            borderwidth: 0,
          },
          {
            x:           min.date,
            y:           min.vrp,
            text:        min.date,
            showarrow:   true,
            arrowhead:   0,
            arrowcolor:  "#8A8A93",
            arrowwidth:  1,
            ax:          0,
            ay:          28,
            font:        AXIS_FONT,
            bgcolor:     "transparent",
            borderwidth: 0,
          },
        ],
        xaxis: DATE_AXIS,
        yaxis: { ...NUM_AXIS, ticksuffix: " pts" },
      }, PLOTLY_CFG);
    })();
  }, [series, max, min]);

  useEffect(() => {
    return () => {
      const P = Pl.current;
      if (P) {
        if (ref1.current) P.purge(ref1.current);
        if (ref2.current) P.purge(ref2.current);
      }
    };
  }, []);

  return (
    <>
      {/* Chart 1 */}
      <span className="label-caps" style={{ display: "block", marginBottom: "12px" }}>
        IV vs Realized Vol
      </span>
      <div ref={ref1} style={{ width: "100%", height: "40vh" }} />

      {/* Chart 2 */}
      <span className="label-caps" style={{ display: "block", marginTop: "40px", marginBottom: "12px" }}>
        The Volatility Risk Premium
      </span>
      <div ref={ref2} style={{ width: "100%", height: "40vh" }} />
    </>
  );
}
