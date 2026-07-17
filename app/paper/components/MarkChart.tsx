"use client";
import { useEffect, useRef } from "react";
import type { MarkEvent } from "@/lib/paper/ledger";

const MONO      = "JetBrains Mono, monospace";
const AXIS_FONT = { family: MONO, size: 10, color: "#8A8A93" };
const HOVER_LBL = {
  bgcolor:     "#141418",
  bordercolor: "#26262C",
  font:        { family: MONO, size: 11, color: "#E7E7EA" },
};
const LAYOUT = {
  paper_bgcolor: "transparent",
  plot_bgcolor:  "transparent",
  font:          { family: MONO, color: "#8A8A93" },
  margin:        { l: 56, r: 12, t: 8, b: 32 },
  autosize:      true,
};
const CFG = { displaylogo: false, displayModeBar: false, responsive: true };

interface Props {
  openedAt: string;
  marks:    MarkEvent[];
}

export default function MarkChart({ openedAt, marks }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Pl  = useRef<any>(null);
  const ref = useRef<HTMLDivElement>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!ref.current) return;
    const mySeq = ++seq.current;

    (async () => {
      if (!Pl.current) {
        const mod = await import("plotly.js-dist-min");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        Pl.current = (mod as any).default ?? mod;
      }
      if (seq.current !== mySeq || !ref.current) return;

      const P  = Pl.current;
      // Prepend the origin: entry at t=openedAt with pnl=0
      const xs = [openedAt, ...marks.map(m => m.at)];
      const ys = [0,        ...marks.map(m => m.pnl)];

      await P.react(ref.current, [
        {
          type:          "scatter",
          mode:          "lines",
          x:             xs,
          y:             ys,
          line:          { color: "#E7E7EA", width: 1 },
          hovertemplate: "%{x|%b %d · %H:%M}  $%{y:+.2f}<extra></extra>",
          hoverlabel:    HOVER_LBL,
        },
      ], {
        ...LAYOUT,
        xaxis: {
          type:         "date",
          gridcolor:    "#26262C",
          zeroline:     false,
          showzeroline: false,
          tickfont:     AXIS_FONT,
          nticks:       4,
        },
        yaxis: {
          gridcolor:    "#26262C",
          zeroline:     false,
          showzeroline: false,
          tickfont:     AXIS_FONT,
          nticks:       5,
          tickprefix:   "$",
          tickformat:   "+.0f",
        },
        shapes: [
          {
            type: "line",
            xref: "paper", x0: 0, x1: 1,
            yref: "y",     y0: 0, y1: 0,
            line: { color: "#26262C", width: 1 },
          },
        ],
      }, CFG);
    })();
  }, [openedAt, marks]);

  useEffect(() => {
    return () => {
      const P = Pl.current;
      if (P && ref.current) P.purge(ref.current);
    };
  }, []);

  return <div ref={ref} style={{ width: "100%", height: "180px" }} />;
}
