"use client";
import { useRef, useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import {
  EASE_OUT,
  NUMBER_ROLL_DURATION,
  priceFlash,
  useMotionSafe,
} from "@/lib/motion";
import { timeToExpiryYears } from "@/lib/pricing/blackScholes";
import type { Position } from "@/lib/paper/ledger";

// ── Derived value helpers ──────────────────────────────────────────────────

export function positionPnl(pos: Position): number | null {
  if (pos.status === "closed") {
    const evt = pos.closes[pos.closes.length - 1];
    return evt ? (pos.entryFill - evt.fill) * 100 * pos.qty : null;
  }
  return pos.marks[pos.marks.length - 1]?.pnl ?? null;
}

function positionMark(pos: Position): number | null {
  if (pos.status === "closed") return pos.closes[pos.closes.length - 1]?.fill ?? null;
  return pos.marks[pos.marks.length - 1]?.mid ?? null;
}

function positionDte(pos: Position): number | null {
  if (pos.status === "open") {
    const t = timeToExpiryYears(pos.contract.expiry) * 365;
    return t >= 0 ? t : null;
  }
  const evt = pos.closes[pos.closes.length - 1];
  if (!evt) return null;
  const days = (new Date(pos.contract.expiry + "T00:00:00Z").getTime() - new Date(evt.at).getTime()) / 86_400_000;
  return Math.max(days, 0);
}

function positionPnlPct(pos: Position): number | null {
  const pnl    = positionPnl(pos);
  if (pnl === null) return null;
  const credit = pos.entryFill * 100 * pos.qty;
  return credit !== 0 ? (pnl / credit) * 100 : null;
}

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtUSD(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n >= 0 ? "+" : "−") + "$" + abs;
}

function fmtPct(n: number | null): string {
  if (n === null) return "—";
  return (n >= 0 ? "+" : "−") + Math.abs(n).toFixed(1) + "%";
}

function fmtPrice(n: number | null): string {
  if (n === null) return "—";
  return "$" + n.toFixed(2);
}

function fmtDte(n: number | null): string {
  if (n === null) return "—";
  return n.toFixed(1);
}

function fmtOpenedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase()
    + " · "
    + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
}

function contractLabel(pos: Position): string {
  const underlying = pos.contract.symbol.match(/^[A-Z]+/)?.[0] ?? "";
  const type       = pos.contract.type === "put" ? "P" : "C";
  const strike     = pos.contract.strike % 1 === 0 ? String(pos.contract.strike) : pos.contract.strike.toFixed(2);
  const expiry     = new Date(pos.contract.expiry + "T12:00:00Z")
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
  return `${underlying} ${strike} ${type} · ${expiry}`;
}

// ── Rolling P&L cell (rolls + flashes on value change) ────────────────────

function PnlUsdCell({ value, right = true }: { value: number | null; right?: boolean }) {
  const { reduced }  = useMotionSafe();
  const safeVal      = value ?? 0;
  const [disp, setDisp] = useState(safeVal);
  const prevRef      = useRef(safeVal);
  const rafRef       = useRef(0);
  const controls     = useAnimationControls();

  useEffect(() => {
    const prev   = prevRef.current;
    const target = value ?? 0;
    if (prev === target) return;
    prevRef.current = target;

    if (!reduced) {
      const dir = target > prev ? "up" : "down";
      const { backgroundColor, transition } = priceFlash(dir);
      controls.start({ backgroundColor, transition });

      cancelAnimationFrame(rafRef.current);
      const t0  = performance.now();
      const dur = NUMBER_ROLL_DURATION * 1000;
      const step = (now: number) => {
        const p = Math.min((now - t0) / dur, 1);
        setDisp(prev + (target - prev) * (1 - (1 - p) ** 3));
        if (p < 1) rafRef.current = requestAnimationFrame(step);
        else        setDisp(target);
      };
      rafRef.current = requestAnimationFrame(step);
      return () => cancelAnimationFrame(rafRef.current);
    } else {
      setDisp(target);
    }
  }, [value, reduced, controls]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  const align    = right ? "text-right" : "text-left";
  const color    = value === null ? "text-label" : value >= 0 ? "text-pos" : "text-neg";
  const abs      = Math.abs(disp).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign     = disp >= 0 ? "+" : "−";
  const text     = value === null ? "—" : `${sign}$${abs}`;

  return (
    <motion.span animate={controls} className={`num text-sm ${color} block ${align}`}>
      {text}
    </motion.span>
  );
}

// ── Column header helpers ──────────────────────────────────────────────────

const TH = "label-caps font-normal py-2 whitespace-nowrap";

// ── AnimatedBody ───────────────────────────────────────────────────────────

interface BodyProps {
  rows:     Position[];
  selected: Position | null;
  onSelect: (p: Position) => void;
}

function AnimatedBody({ rows, selected, onSelect }: BodyProps) {
  const { reduced }      = useMotionSafe();
  const isFirstRender    = useRef(true);
  const shouldAnimate    = isFirstRender.current && !reduced;

  useEffect(() => { isFirstRender.current = false; }, []);

  return (
    <>
      {rows.map((pos, i) => {
        const isClosed   = pos.status === "closed";
        const isSelected = selected?.id === pos.id;
        const pnl        = positionPnl(pos);
        const pct        = positionPnlPct(pos);
        const mark       = positionMark(pos);
        const dte        = positionDte(pos);
        const pctColor   = pct === null ? "text-label" : pct >= 0 ? "text-pos" : "text-neg";

        return (
          <motion.tr
            key={pos.id}
            initial={shouldAnimate ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: isClosed ? 0.7 : 1, y: 0 }}
            transition={{
              duration: 0.25,
              delay:    shouldAnimate ? i * 0.03 : 0,
              ease:     EASE_OUT,
            }}
            onClick={() => onSelect(pos)}
            className="h-8 cursor-pointer hover:bg-[#101014] transition-colors duration-[100ms]"
            style={isSelected ? { borderLeft: "2px solid var(--color-accent)" } : undefined}
          >
            {/* OPENED */}
            <td className="pl-3 pr-2 whitespace-nowrap">
              <span className="num text-sm">{fmtOpenedAt(pos.openedAt)}</span>
            </td>

            {/* CONTRACT */}
            <td className="px-2 whitespace-nowrap">
              <span className="num text-sm text-[#E7E7EA]">{contractLabel(pos)}</span>
            </td>

            {/* SIDE / QTY */}
            <td className="px-2 whitespace-nowrap">
              <span className="label-caps">{pos.side.toUpperCase()} {pos.qty}</span>
            </td>

            {/* ENTRY FILL */}
            <td className="px-2 text-right whitespace-nowrap">
              <span className="num text-sm">{fmtPrice(pos.entryFill)}</span>
            </td>

            {/* ENTRY SPREAD — honesty receipt */}
            <td className="px-2 text-right whitespace-nowrap">
              <span className="label-caps">
                {pos.entrySpread.bid.toFixed(2)} / {pos.entrySpread.ask.toFixed(2)}
              </span>
            </td>

            {/* MARK / EXIT */}
            <td className="px-2 text-right whitespace-nowrap">
              <span className="num text-sm">{fmtPrice(mark)}</span>
            </td>

            {/* P&L $ */}
            <td className="px-2 text-right whitespace-nowrap">
              <PnlUsdCell value={pnl} />
            </td>

            {/* P&L % */}
            <td className="px-2 text-right whitespace-nowrap">
              <span className={`num text-sm ${pctColor}`}>{fmtPct(pct)}</span>
            </td>

            {/* STATUS */}
            <td className="px-2 whitespace-nowrap">
              <span className="label-caps text-[#E7E7EA]">{pos.status.toUpperCase()}</span>
            </td>

            {/* DTE */}
            <td className="pl-2 pr-3 text-right whitespace-nowrap">
              <span className="num text-sm">{fmtDte(dte)}</span>
            </td>
          </motion.tr>
        );
      })}
    </>
  );
}

// ── BlotterTable ───────────────────────────────────────────────────────────

interface Props {
  positions: Position[];
  selected:  Position | null;
  onSelect:  (p: Position) => void;
}

export default function BlotterTable({ positions, selected, onSelect }: Props) {
  // Open positions first (oldest-opened first), closed in reverse-chron
  const open   = [...positions.filter(p => p.status === "open")]
    .sort((a, b) => new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime());
  const closed = [...positions.filter(p => p.status === "closed")]
    .sort((a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime());
  const rows   = [...open, ...closed];

  if (rows.length === 0) {
    return (
      <div className="flex justify-center py-8">
        <span className="label-caps">NO POSITIONS · FIRST ENTRY PENDING</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" style={{ minWidth: "900px" }}>
        <thead className="sticky top-0 bg-bg z-10">
          <tr className="border-b border-edge">
            <th className={`${TH} text-left  pl-3 pr-2`}>OPENED</th>
            <th className={`${TH} text-left  px-2`}>CONTRACT</th>
            <th className={`${TH} text-left  px-2`}>SIDE / QTY</th>
            <th className={`${TH} text-right px-2`}>ENTRY FILL</th>
            <th className={`${TH} text-right px-2`}>ENTRY SPREAD</th>
            <th className={`${TH} text-right px-2`}>MARK / EXIT</th>
            <th className={`${TH} text-right px-2`}>P&L $</th>
            <th className={`${TH} text-right px-2`}>P&L %</th>
            <th className={`${TH} text-left  px-2`}>STATUS</th>
            <th className={`${TH} text-right pl-2 pr-3`}>DTE</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-edge">
          <AnimatedBody rows={rows} selected={selected} onSelect={onSelect} />
        </tbody>
      </table>
    </div>
  );
}
