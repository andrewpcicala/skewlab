"use client";
import { useRef, useEffect, Fragment } from "react";
import { motion } from "framer-motion";
import { useMotionSafe, EASE_OUT } from "@/lib/motion";
import type { OptionQuote } from "@/lib/data/types";

export interface ChainRow {
  strike: number;
  call: OptionQuote | undefined;
  put: OptionQuote | undefined;
}

interface Props {
  ticker:   string;
  rows:     ChainRow[];
  spot:     number;
  selected: OptionQuote | null;
  onSelect: (q: OptionQuote) => void;
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

// ── Cells ──────────────────────────────────────────────────────────────────

function PriceCell({
  value,
  colorClass,
  align,
}: {
  value: number | null | undefined;
  colorClass?: string;
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
  const isZero = value === 0;
  return (
    <span
      className={`num text-sm ${align === "right" ? "block text-right" : "block text-left"} ${
        isNull ? "text-label" : isZero ? "opacity-70" : ""
      }`}
    >
      {fmtVol(value)}
    </span>
  );
}

// ── Spot level-line ────────────────────────────────────────────────────────
// Zero-height row inserted between the two rows that bracket spot.
// An absolutely-positioned <div> draws the 1px rule across the full column
// span — avoids border-collapse conflicts entirely. The label sits on the
// rule at the right edge with a bg-colored backing so the line never strikes
// through text.

function SpotLevelLine({ colCount, spot }: { colCount: number; spot: number }) {
  return (
    <tr
      aria-hidden
      style={{ height: 0, borderTop: "none", borderBottom: "none" }}
    >
      <td
        colSpan={colCount}
        style={{
          padding:    0,
          height:     0,
          lineHeight: "0",
          fontSize:   "0",
          border:     "none",
          position:   "relative",
        }}
      >
        {/* 1px accent rule spanning full table width */}
        <div
          style={{
            position:        "absolute",
            left:            "0",
            right:           "0",
            top:             "0",
            height:          "1px",
            transform:       "translateY(-50%)",
            backgroundColor: "var(--color-accent)",
            zIndex:          5,
          }}
        />
        {/* Label at right edge, centered on the rule; bg backing prevents text/line collision */}
        <span
          className="label-caps text-accent"
          style={{
            position:        "absolute",
            right:           "8px",
            top:             "0",
            transform:       "translateY(-50%)",
            fontSize:        "10px",
            lineHeight:      "1",
            backgroundColor: "var(--color-bg)",
            padding:         "0 4px",
            whiteSpace:      "nowrap",
            zIndex:          6,
          }}
        >
          SPOT {spot.toFixed(2)}
        </span>
      </td>
    </tr>
  );
}

// ── Animated tbody rows ────────────────────────────────────────────────────
// Rows animate once on first ticker load only. key={ticker} on this component
// forces a remount on ticker change, resetting isFirstRender.

interface AnimBodyProps {
  rows:     ChainRow[];
  spot:     number;
  selected: OptionQuote | null;
  onSelect: (q: OptionQuote) => void;
}

function AnimatedBody({ rows, spot, selected, onSelect }: AnimBodyProps) {
  const { reduced }      = useMotionSafe();
  const isFirstRender    = useRef(true);
  const shouldAnimate    = isFirstRender.current && !reduced;
  const scrollTargetRef  = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  // Scroll the nearest-to-spot row to center on mount (once per ticker)
  useEffect(() => {
    if (scrollTargetRef.current) {
      scrollTargetRef.current.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, []);

  // Nearest strike — used for centering the initial scroll position
  const scrollStrike = rows.reduce(
    (best, r) => (Math.abs(r.strike - spot) < Math.abs(best - spot) ? r.strike : best),
    rows[0]?.strike ?? spot
  );

  // First strike strictly ABOVE spot — level line is inserted before this row
  // so the rule falls between the lower-bracket row and this row.
  const upperBracket = rows.find(r => r.strike > spot)?.strike;

  return (
    <>
      {rows.map((row, i) => {
        const callOTM = row.strike > spot;
        const putOTM  = row.strike < spot;
        const callDim = callOTM ? "opacity-70" : "";
        const putDim  = putOTM  ? "opacity-70" : "";

        const isCallSelected = selected !== null && selected.symbol === row.call?.symbol;
        const isPutSelected  = selected !== null && selected.symbol === row.put?.symbol;

        const callOuterCls = isCallSelected
          ? "border-l-2 border-accent pl-[10px] pr-3"
          : "px-3";
        const putOuterCls = isPutSelected
          ? "border-r-2 border-accent pr-[10px] pl-3"
          : "px-3";

        const clickCall = row.call ? () => onSelect(row.call!) : undefined;
        const clickPut  = row.put  ? () => onSelect(row.put!)  : undefined;
        const callPtr   = row.call ? "cursor-pointer" : "";
        const putPtr    = row.put  ? "cursor-pointer" : "";

        return (
          <Fragment key={row.strike}>
            {/* Level line: inserted immediately before the upper bracket row */}
            {row.strike === upperBracket && upperBracket !== undefined && (
              <SpotLevelLine colCount={11} spot={spot} />
            )}

            <motion.tr
              ref={row.strike === scrollStrike ? scrollTargetRef : undefined}
              initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.25,
                delay:    shouldAnimate ? i * 0.02 : 0,
                ease:     EASE_OUT,
              }}
              className="h-8 hover:bg-[#101014] transition-colors duration-[100ms]"
            >
              {/* ── CALLS ──────────────────────────────────────── */}
              <td className={`${callOuterCls} ${callDim} ${callPtr}`} onClick={clickCall}>
                <VolCell value={row.call?.volume} align="right" />
              </td>
              <td className={`px-3 ${callDim} ${callPtr}`} onClick={clickCall}>
                <PriceCell value={row.call?.last} align="right" />
              </td>
              <td className={`px-3 ${callDim} ${callPtr}`} onClick={clickCall}>
                <PriceCell value={row.call?.mid} align="right" />
              </td>
              <td className={`px-3 ${callDim} ${callPtr}`} onClick={clickCall}>
                <PriceCell value={row.call?.ask} colorClass="text-neg" align="right" />
              </td>
              <td className={`px-3 ${callDim} ${callPtr}`} onClick={clickCall}>
                <PriceCell value={row.call?.bid} colorClass="text-pos" align="right" />
              </td>

              {/* ── STRIKE (old floating label removed) ────────── */}
              <td className="px-4 text-center border-l border-r border-edge">
                <span className="num text-sm text-[#E7E7EA]">{fmtStrike(row.strike)}</span>
              </td>

              {/* ── PUTS ───────────────────────────────────────── */}
              <td className={`px-3 ${putDim} ${putPtr}`} onClick={clickPut}>
                <PriceCell value={row.put?.bid} colorClass="text-pos" align="left" />
              </td>
              <td className={`px-3 ${putDim} ${putPtr}`} onClick={clickPut}>
                <PriceCell value={row.put?.ask} colorClass="text-neg" align="left" />
              </td>
              <td className={`px-3 ${putDim} ${putPtr}`} onClick={clickPut}>
                <PriceCell value={row.put?.mid} align="left" />
              </td>
              <td className={`px-3 ${putDim} ${putPtr}`} onClick={clickPut}>
                <PriceCell value={row.put?.last} align="left" />
              </td>
              <td className={`${putOuterCls} ${putDim} ${putPtr}`} onClick={clickPut}>
                <VolCell value={row.put?.volume} align="left" />
              </td>
            </motion.tr>
          </Fragment>
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

export default function ChainTable({ ticker, rows, spot, selected, onSelect }: Props) {
  if (rows.length === 0) return null;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-bg z-10">
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
          <AnimatedBody
            key={ticker}
            rows={rows}
            spot={spot}
            selected={selected}
            onSelect={onSelect}
          />
        </tbody>
      </table>
    </div>
  );
}
