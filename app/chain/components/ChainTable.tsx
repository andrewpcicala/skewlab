"use client";
import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useMotionSafe, EASE_OUT } from "@/lib/motion";
import type { OptionQuote } from "@/lib/data/types";

export interface ChainRow {
  strike: number;
  call: OptionQuote | undefined;
  put: OptionQuote | undefined;
}

interface Props {
  ticker: string; // changes on new ticker load → resets row animation
  rows: ChainRow[];
  spot: number;
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtPrice(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toFixed(2);
}

function fmtVol(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtStrike(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

// ── Cell ───────────────────────────────────────────────────────────────────

function PriceCell({
  value,
  colorClass,
  align,
}: {
  value: number | null | undefined;
  colorClass?: string; // e.g. "text-pos" or "text-neg" — only applied when non-null
  align: "right" | "left";
}) {
  const isNull = value === null || value === undefined;
  return (
    <span
      className={`num text-sm ${align === "right" ? "block text-right" : "block text-left"} ${
        isNull ? "text-label" : (colorClass ?? "")
      }`}
    >
      {fmtPrice(value)}
    </span>
  );
}

function VolCell({ value, align }: { value: number | null | undefined; align: "right" | "left" }) {
  const isNull = value === null || value === undefined;
  return (
    <span
      className={`num text-sm ${align === "right" ? "block text-right" : "block text-left"} ${
        isNull ? "text-label" : ""
      }`}
    >
      {fmtVol(value)}
    </span>
  );
}

// ── Animated tbody rows ────────────────────────────────────────────────────
// Rows animate once on first ticker load only, never on expiry switch.
// The `key={ticker}` on this component forces a remount on ticker change,
// resetting isFirstRender so the stagger runs exactly once per ticker.

interface AnimBodyProps {
  rows: ChainRow[];
  spot: number;
}

function AnimatedBody({ rows, spot }: AnimBodyProps) {
  const { reduced } = useMotionSafe();
  const isFirstRender = useRef(true);
  // Capture animate value before the effect sets isFirstRender to false
  const shouldAnimate = isFirstRender.current && !reduced;

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  const atmStrike = rows.reduce(
    (best, r) => (Math.abs(r.strike - spot) < Math.abs(best - spot) ? r.strike : best),
    rows[0]?.strike ?? spot
  );

  return (
    <>
      {rows.map((row, i) => {
        const isAtm = row.strike === atmStrike;
        const callOTM = row.strike > spot;
        const putOTM  = row.strike < spot;
        const callDim = callOTM ? "opacity-70" : "";
        const putDim  = putOTM  ? "opacity-70" : "";

        return (
          <motion.tr
            key={row.strike}
            initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.25,
              delay: shouldAnimate ? i * 0.02 : 0,
              ease: EASE_OUT,
            }}
            style={isAtm ? { borderTop: "1px solid var(--color-accent)" } : undefined}
            className="h-8"
          >
            {/* ── CALLS ──────────────────────────────────────── */}
            <td className={`px-3 ${callDim}`}>
              <VolCell value={row.call?.volume} align="right" />
            </td>
            <td className={`px-3 ${callDim}`}>
              <PriceCell value={row.call?.last} align="right" />
            </td>
            <td className={`px-3 ${callDim}`}>
              <PriceCell value={row.call?.mid} align="right" />
            </td>
            <td className={`px-3 ${callDim}`}>
              <PriceCell value={row.call?.ask} colorClass="text-neg" align="right" />
            </td>
            <td className={`px-3 ${callDim}`}>
              <PriceCell value={row.call?.bid} colorClass="text-pos" align="right" />
            </td>

            {/* ── STRIKE ─────────────────────────────────────── */}
            <td className="px-4 text-center border-l border-r border-edge">
              <span className="num text-sm text-[#E7E7EA]">{fmtStrike(row.strike)}</span>
            </td>

            {/* ── PUTS ───────────────────────────────────────── */}
            <td className={`px-3 ${putDim}`}>
              <PriceCell value={row.put?.bid} colorClass="text-pos" align="left" />
            </td>
            <td className={`px-3 ${putDim}`}>
              <PriceCell value={row.put?.ask} colorClass="text-neg" align="left" />
            </td>
            <td className={`px-3 ${putDim}`}>
              <PriceCell value={row.put?.mid} align="left" />
            </td>
            <td className={`px-3 ${putDim}`}>
              <PriceCell value={row.put?.last} align="left" />
            </td>
            <td className={`px-3 ${putDim}`}>
              <VolCell value={row.put?.volume} align="left" />
            </td>
          </motion.tr>
        );
      })}
    </>
  );
}

// ── Column header helpers ──────────────────────────────────────────────────

const TH_R = "label-caps text-right px-3 py-2 font-normal whitespace-nowrap";
const TH_L = "label-caps text-left  px-3 py-2 font-normal whitespace-nowrap";
const TH_C =
  "label-caps text-center px-4 py-2 font-normal border-l border-r border-edge whitespace-nowrap";

// ── ChainTable ─────────────────────────────────────────────────────────────

export default function ChainTable({ ticker, rows, spot }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-edge">
            {/* CALLS */}
            <th className={TH_R}>VOL</th>
            <th className={TH_R}>LAST</th>
            <th className={TH_R}>MID</th>
            <th className={`${TH_R} text-neg`}>ASK</th>
            <th className={`${TH_R} text-pos`}>BID</th>
            {/* STRIKE */}
            <th className={TH_C}>STRIKE</th>
            {/* PUTS */}
            <th className={`${TH_L} text-pos`}>BID</th>
            <th className={`${TH_L} text-neg`}>ASK</th>
            <th className={TH_L}>MID</th>
            <th className={TH_L}>LAST</th>
            <th className={TH_L}>VOL</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          <AnimatedBody key={ticker} rows={rows} spot={spot} />
        </tbody>
      </table>
    </div>
  );
}
