"use client";
import { useEffect, useRef } from "react";
import { useMotionSafe } from "@/lib/motion";
import type { SurfacePoint } from "@/lib/pricing/surface";

// ── Camera constants ──────────────────────────────────────────────────────────
// Three-quarter view, ~30° elevation, low-strike/front-DTE corner nearest viewer.
// Angle: atan2(-1.5, -1.5) = -135°; elevation: atan2(1.22, √(1.5²+1.5²)) ≈ 30°.
const EYE_D  = { x: -1.5, y: -1.5, z: 1.22 };
const UP     = { x: 0, y: 0, z: 1 };
const CTR    = { x: 0, y: 0, z: 0 };

const ORBIT_MS = 60_000;
const EASE_MS  = 600;
const ORBIT_R  = Math.sqrt(EYE_D.x ** 2 + EYE_D.y ** 2);
const ORBIT_A0 = Math.atan2(EYE_D.y, EYE_D.x); // -135°

const COLORSCALE = [
  [0.0, "#141418"],
  [0.4, "#26262C"],
  [1.0, "#3B82F6"],
];

const MONO       = "JetBrains Mono, monospace";
const AXIS_FONT  = { family: MONO, size: 10, color: "#8A8A93" };
const TITLE_FONT = { family: MONO, size: 11, color: "#8A8A93" };
const AXIS_STYLE = {
  gridcolor:       "#26262C",
  showzeroline:    false,
  zeroline:        false,
  tickfont:        AXIS_FONT,
  backgroundcolor: "rgba(0,0,0,0)",
  nticks:          5,
};

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

function percentile(sorted: number[], p: number): number {
  const i  = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  return sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo);
}

// ── Grid builder ──────────────────────────────────────────────────────────────
function buildGrid(pts: SurfacePoint[]) {
  const expDte = new Map<string, number>();
  for (const p of pts) {
    if (!expDte.has(p.expiry)) expDte.set(p.expiry, p.dte);
  }
  const expiries = [...expDte.keys()].sort();
  const dtes     = expiries.map(e => Math.round(expDte.get(e)!));
  const strikes  = [...new Set(pts.map(p => p.strike))].sort((a, b) => a - b);

  const lu = new Map<string, number>();
  for (const p of pts) lu.set(`${p.expiry}:${p.strike}`, +(p.iv * 100).toFixed(2));

  const z = expiries.map(exp =>
    strikes.map(s => lu.get(`${exp}:${s}`) ?? null)
  );
  return { strikes, dtes, z };
}

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  points: SurfacePoint[];
  ticker: string;
  spot:   number;
}

// "entering" is intentionally absent: the surface renders at full opacity the
// moment data paints. The only animated transitions are the ticker-switch ease
// (camera → home over 600ms) and the idle orbit.
type Phase = "easing" | "orbiting" | "paused";

export default function SurfacePlot({ points, ticker, spot }: Props) {
  const { reduced } = useMotionSafe();
  const divRef   = useRef<HTMLDivElement>(null);
  const seqRef   = useRef(0);
  const stateRef = useRef({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    P:     null as any,
    ready: false,
    cam: {
      phase:      "paused" as Phase,
      phaseStart: 0,
      easeFrom:   { ...EYE_D },
      orbitT0:    0,
      rafId:      0,
      stops:      [] as (() => void)[],
    },
  });

  // Purge Plotly on component unmount only
  useEffect(() => {
    return () => {
      const { P, cam } = stateRef.current;
      cancelAnimationFrame(cam.rafId);
      cam.stops.forEach(f => f());
      if (P && divRef.current) P.purge(divRef.current);
      stateRef.current.ready = false;
    };
  }, []);

  // Rebuild whenever points change (new ticker data or first load)
  useEffect(() => {
    if (!points.length) return;
    const seq = ++seqRef.current;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let P: any = stateRef.current.P;
      if (!P) {
        const mod = await import("plotly.js-dist-min");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        P = (mod as any).default ?? mod;
        stateRef.current.P = P;
      }
      if (seqRef.current !== seq || !divRef.current) return;

      const div = divRef.current;
      const { cam, ready: isUpdate } = stateRef.current;

      // Snapshot camera before re-plotting (ease-from source on ticker switch)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevEye = isUpdate ? ((div as any)._fullLayout?.scene?.camera?.eye ?? EYE_D) : EYE_D;

      cancelAnimationFrame(cam.rafId);
      cam.stops.forEach(f => f());
      cam.stops = [];

      // ── Traces ──────────────────────────────────────────────────────────
      const { strikes, dtes, z } = buildGrid(points);

      const sortedIvs = points.map(p => p.iv * 100).sort((a, b) => a - b);
      const cmin = percentile(sortedIvs, 0.05);
      const cmax = percentile(sortedIvs, 0.95);
      const cmid = (cmin + cmax) / 2;

      const frontExp = points.reduce((b, p) => p.dte < b.dte ? p : b).expiry;
      const frontPts = points.filter(p => p.expiry === frontExp);
      const atmPt    = frontPts.reduce((b, p) =>
        Math.abs(p.strike - spot) < Math.abs(b.strike - spot) ? p : b
      );
      const atmIvPct = atmPt.iv * 100;

      const frontSmile = [...frontPts].sort((a, b) => a.strike - b.strike);
      const frontDte   = Math.round(frontSmile[0]?.dte ?? 0);

      const surfaceTrace = {
        type:        "surface",
        x:           strikes,
        y:           dtes,
        z,
        colorscale:  COLORSCALE,
        cmin,
        cmax,
        showscale:   true,
        connectgaps: true,
        opacity:     1.0,
        colorbar: {
          title:    { text: "IV %", font: TITLE_FONT, side: "right" },
          tickfont: AXIS_FONT,
          tickmode: "array",
          tickvals: [Math.round(cmin), Math.round(cmid), Math.round(cmax)],
          ticktext: [`${Math.round(cmin)}%`, `${Math.round(cmid)}%`, `${Math.round(cmax)}%`],
          thickness:   8,
          len:         0.5,
          bgcolor:     "rgba(0,0,0,0)",
          bordercolor: "#26262C",
          borderwidth: 1,
          xpad:        6,
        },
        hovertemplate: "%{x:.0f} · %{y:.0f} DTE · %{z:.1f}%<extra></extra>",
        hoverlabel: {
          bgcolor:     "#141418",
          bordercolor: "#26262C",
          font:        { family: MONO, size: 11, color: "#E7E7EA" },
        },
        lighting: {
          ambient:   0.85,
          diffuse:   0.4,
          specular:  0.05,
          roughness: 0.9,
          fresnel:   0.1,
        },
        lightposition: { x: 100, y: 100, z: 1000 },
        contours: {
          x: { show: false, highlight: false },
          y: { show: false, highlight: false },
          z: {
            show:        true,
            start:       atmIvPct,
            end:         atmIvPct + 0.001,
            size:        1,
            color:       "#26262C",
            width:       1,
            highlight:   false,
            usecolormap: false,
          },
        },
      };

      const smileTrace = {
        type:       "scatter3d",
        x:          frontSmile.map(p => p.strike),
        y:          frontSmile.map(() => frontDte),
        z:          frontSmile.map(p => +(p.iv * 100).toFixed(2)),
        mode:       "lines",
        line:       { color: "rgba(59,130,246,0.6)", width: 1.5 },
        hoverinfo:  "skip",
        showlegend: false,
      };

      // ── Layout ──────────────────────────────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layout: any = {
        paper_bgcolor: "transparent",
        plot_bgcolor:  "transparent",
        margin:        { l: 0, r: 48, t: 0, b: 0 },
        scene: {
          bgcolor: "rgba(0,0,0,0)",
          xaxis:   { ...AXIS_STYLE, title: { text: "STRIKE", font: TITLE_FONT } },
          yaxis:   { ...AXIS_STYLE, title: { text: "DTE",    font: TITLE_FONT } },
          zaxis:   { ...AXIS_STYLE, title: { text: "IV %",   font: TITLE_FONT } },
        },
        font:     { family: MONO, color: "#8A8A93" },
        autosize: true,
      };

      // First load: set camera to home. Ticker switch: omit camera so Plotly
      // preserves the current position for the ease-from snapshot.
      // Reduced motion: always pin camera to home.
      if (reduced || !isUpdate) {
        layout.scene.camera = { eye: { ...EYE_D }, up: UP, center: CTR };
      }

      await P.react(div, [surfaceTrace, smileTrace], layout, {
        displaylogo:          false,
        displayModeBar:       "hover",
        modeBarButtonsToKeep: ["resetCameraLastSave3d"],
        responsive:           true,
      });

      // Bail if a newer effect superseded this one
      if (seqRef.current !== seq) return;
      stateRef.current.ready = true;

      // No motion in reduced mode; surface is already at home from the layout above
      if (reduced) return;

      // ── Camera motion ────────────────────────────────────────────────────
      if (isUpdate) {
        // Ticker switch: ease from where the user left the camera back to home
        cam.easeFrom   = { x: prevEye.x, y: prevEye.y, z: prevEye.z };
        cam.phase      = "easing";
        cam.phaseStart = performance.now();
      } else {
        // First load: start orbiting from home immediately
        cam.phase   = "orbiting";
        cam.orbitT0 = performance.now();
      }

      const tick = (now: number) => {
        const d = divRef.current;
        if (!d) return;

        switch (cam.phase) {
          case "easing": {
            const t   = Math.min((now - cam.phaseStart) / EASE_MS, 1);
            const e   = easeOutCubic(t);
            const eye = {
              x: cam.easeFrom.x + (EYE_D.x - cam.easeFrom.x) * e,
              y: cam.easeFrom.y + (EYE_D.y - cam.easeFrom.y) * e,
              z: cam.easeFrom.z + (EYE_D.z - cam.easeFrom.z) * e,
            };
            P.relayout(d, { "scene.camera": { eye, up: UP, center: CTR } });
            if (t >= 1) { cam.phase = "orbiting"; cam.orbitT0 = now; }
            break;
          }
          case "orbiting": {
            const ang = ORBIT_A0 + ((now - cam.orbitT0) / ORBIT_MS) * 2 * Math.PI;
            P.relayout(d, {
              "scene.camera": {
                eye:    { x: ORBIT_R * Math.cos(ang), y: ORBIT_R * Math.sin(ang), z: EYE_D.z },
                up:     UP,
                center: CTR,
              },
            });
            break;
          }
          case "paused":
            break;
        }
        cam.rafId = requestAnimationFrame(tick);
      };
      cam.rafId = requestAnimationFrame(tick);

      const stop = () => { cam.phase = "paused"; };
      div.addEventListener("pointerdown", stop);
      div.addEventListener("wheel",       stop, { passive: true });
      div.addEventListener("touchstart",  stop, { passive: true });
      cam.stops = [
        () => div.removeEventListener("pointerdown", stop),
        () => div.removeEventListener("wheel",       stop),
        () => div.removeEventListener("touchstart",  stop),
      ];
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ticker, reduced, spot]);

  return <div ref={divRef} style={{ width: "100%", height: "70vh" }} />;
}
