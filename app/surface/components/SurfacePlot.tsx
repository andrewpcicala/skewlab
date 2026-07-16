"use client";
import { useEffect, useRef } from "react";
import { useMotionSafe } from "@/lib/motion";
import type { SurfacePoint } from "@/lib/pricing/surface";

// ── Camera constants ──────────────────────────────────────────────────────────
const EYE_D  = { x: 1.5, y: -1.5, z: 0.8 };
const UP     = { x: 0, y: 0, z: 1 };
const CTR    = { x: 0, y: 0, z: 0 };
const ORBIT_MS = 60_000;
const EASE_MS  = 600;
const ORBIT_R  = Math.sqrt(EYE_D.x ** 2 + EYE_D.y ** 2);
const ORBIT_A0 = Math.atan2(EYE_D.y, EYE_D.x);

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
};

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

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
}

export default function SurfacePlot({ points, ticker }: Props) {
  const { reduced } = useMotionSafe();
  const divRef   = useRef<HTMLDivElement>(null);
  const seqRef   = useRef(0);
  const stateRef = useRef({
    P:     null as unknown,
    ready: false,
    cam: {
      paused:    false,
      easing:    false,
      easeStart: 0,
      easeFrom:  { ...EYE_D },
      orbitT0:   0,
      rafId:     0,
      stops:     [] as (() => void)[],
    },
  });

  // Purge on unmount only
  useEffect(() => {
    return () => {
      const { P, cam } = stateRef.current;
      cancelAnimationFrame(cam.rafId);
      cam.stops.forEach(f => f());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (P && divRef.current) (P as any).purge(divRef.current);
      stateRef.current.ready = false;
    };
  }, []);

  // Plot / update whenever points change
  useEffect(() => {
    if (!points.length) return;
    const seq = ++seqRef.current;

    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let P = stateRef.current.P as any;
      if (!P) {
        const mod = await import("plotly.js-dist-min");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        P = (mod as any).default ?? mod;
        stateRef.current.P = P;
      }
      if (seqRef.current !== seq || !divRef.current) return;

      const div      = divRef.current;
      const { cam, ready: isUpdate } = stateRef.current;

      // Snapshot camera before re-plotting (for ease-from on ticker switch)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const prevEye = isUpdate ? ((div as any)._fullLayout?.scene?.camera?.eye ?? EYE_D) : EYE_D;

      // Kill previous orbit before starting new one
      cancelAnimationFrame(cam.rafId);
      cam.stops.forEach(f => f());
      cam.stops = [];

      const { strikes, dtes, z } = buildGrid(points);

      const trace = {
        type:       "surface",
        x:          strikes,
        y:          dtes,
        z,
        colorscale: COLORSCALE,
        showscale:  true,
        colorbar: {
          title:       { text: "IV %", font: TITLE_FONT, side: "right" },
          tickfont:    AXIS_FONT,
          tickformat:  ".0f",
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
        connectgaps: false,
        opacity:     0.95,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const layout: any = {
        paper_bgcolor: "transparent",
        plot_bgcolor:  "transparent",
        margin:        { l: 0, r: 40, t: 0, b: 0 },
        scene: {
          bgcolor: "rgba(0,0,0,0)",
          xaxis:   { ...AXIS_STYLE, title: { text: "STRIKE", font: TITLE_FONT } },
          yaxis:   { ...AXIS_STYLE, title: { text: "DTE",    font: TITLE_FONT } },
          zaxis:   { ...AXIS_STYLE, title: { text: "IV %",   font: TITLE_FONT } },
        },
        font:     { family: MONO, color: "#8A8A93" },
        autosize: true,
      };

      // Set default camera on first load; preserve current on update
      if (!isUpdate) {
        layout.scene.camera = { eye: { ...EYE_D }, up: UP, center: CTR };
      }

      await P.react(div, [trace], layout, {
        displaylogo:          false,
        displayModeBar:       "hover",
        modeBarButtonsToKeep: ["resetCameraLastSave3d"],
        responsive:           true,
      });

      if (seqRef.current !== seq) return;
      stateRef.current.ready = true;

      // ── Orbit / ease camera ─────────────────────────────────────────────
      if (!reduced) {
        if (isUpdate) {
          cam.easeFrom  = { x: prevEye.x, y: prevEye.y, z: prevEye.z };
          cam.easeStart = performance.now();
          cam.easing    = true;
          cam.paused    = false;
        } else {
          cam.easing  = false;
          cam.paused  = false;
          cam.orbitT0 = performance.now();
        }

        const tick = (now: number) => {
          if (!divRef.current) return;
          if (cam.easing) {
            const t   = Math.min((now - cam.easeStart) / EASE_MS, 1);
            const e   = easeOutCubic(t);
            const eye = {
              x: cam.easeFrom.x + (EYE_D.x - cam.easeFrom.x) * e,
              y: cam.easeFrom.y + (EYE_D.y - cam.easeFrom.y) * e,
              z: cam.easeFrom.z + (EYE_D.z - cam.easeFrom.z) * e,
            };
            P.relayout(div, { "scene.camera": { eye, up: UP, center: CTR } });
            if (t >= 1) {
              cam.easing  = false;
              cam.paused  = false;
              cam.orbitT0 = now;
            }
          } else if (!cam.paused) {
            const ang = ORBIT_A0 + ((now - cam.orbitT0) / ORBIT_MS) * 2 * Math.PI;
            P.relayout(div, {
              "scene.camera": {
                eye:    { x: ORBIT_R * Math.cos(ang), y: ORBIT_R * Math.sin(ang), z: EYE_D.z },
                up:     UP,
                center: CTR,
              },
            });
          }
          cam.rafId = requestAnimationFrame(tick);
        };
        cam.rafId = requestAnimationFrame(tick);

        const stop = () => { cam.paused = true; };
        div.addEventListener("pointerdown", stop);
        div.addEventListener("wheel",      stop, { passive: true });
        div.addEventListener("touchstart", stop, { passive: true });
        cam.stops = [
          () => div.removeEventListener("pointerdown", stop),
          () => div.removeEventListener("wheel",       stop),
          () => div.removeEventListener("touchstart",  stop),
        ];
      }
    })();
  // points reference is stable between renders (parent setState); ticker
  // drives re-fetch so new points always arrive with new ticker
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, ticker, reduced]);

  return <div ref={divRef} style={{ width: "100%", height: "70vh" }} />;
}
