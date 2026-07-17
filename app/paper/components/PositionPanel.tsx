"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { panelVariants, SPRING_PANEL, EASE_OUT, useMotionSafe } from "@/lib/motion";
import type { Position } from "@/lib/paper/ledger";

const MarkChart = dynamic(() => import("./MarkChart"), {
  ssr:     false,
  loading: () => (
    <div style={{ height: "180px", display: "flex", alignItems: "center" }}>
      <span className="label-caps">LOADING</span>
    </div>
  ),
});

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtUSD(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n >= 0 ? "+" : "−") + "$" + abs;
}

function fmtAt(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${date} · ${time}`;
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

// ── Event row ──────────────────────────────────────────────────────────────

function EventRow({ left, right, pnl }: { left: string; right: string; pnl?: number | null }) {
  const pnlColor = pnl === undefined || pnl === null ? "" : pnl >= 0 ? "text-pos" : "text-neg";
  return (
    <div className="flex items-baseline justify-between py-1 border-b border-edge">
      <span className="label-caps">{left}</span>
      <span className="label-caps text-right">
        {right}
        {pnl !== undefined && pnl !== null && (
          <span className={`num ml-2 ${pnlColor}`}>{fmtUSD(pnl)}</span>
        )}
      </span>
    </div>
  );
}

// ── Panel content (crossfades per position) ────────────────────────────────

interface ContentProps {
  pos:     Position;
  onClose: () => void;
  reduced: boolean;
}

function PanelContent({ pos, onClose, reduced }: ContentProps) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const lastMark  = pos.marks[pos.marks.length - 1];
  const latestPnl = lastMark?.pnl ?? null;
  const lastClose = pos.closes[pos.closes.length - 1];
  const pnlColor  = latestPnl === null ? "text-label" : latestPnl >= 0 ? "text-pos" : "text-neg";

  // Marks to display as MARKED events: all except the final mark if closed
  // (final mark is tied to the close event and shown there instead)
  const markEvents = pos.status === "closed"
    ? pos.marks.slice(0, -1)
    : pos.marks;

  return (
    <motion.div
      className="w-[360px] border-l border-edge pl-6 flex flex-col h-full"
      variants={panelVariants}
      initial={reduced ? false : "initial"}
      animate="animate"
      exit={{ opacity: 0, transition: { duration: 0.1 } }}
    >
      {/* Close */}
      <div className="flex justify-end pt-0.5 mb-4">
        <button
          onClick={onClose}
          className="label-caps text-label hover:text-accent transition-colors duration-[100ms] cursor-pointer"
        >
          CLOSE
        </button>
      </div>

      <div className="flex flex-col gap-6 overflow-y-auto pb-6">
        {/* Header */}
        <div>
          <span className="num text-sm text-[#E7E7EA]">{contractLabel(pos)}</span>
          <div className="flex items-baseline gap-3 mt-1">
            <span className={`num text-base ${pnlColor}`}>{fmtUSD(latestPnl)}</span>
            <span className="label-caps">{pos.status === "open" ? "OPEN" : "CLOSED"}</span>
          </div>
        </div>

        {/* Events */}
        <div className="border-t border-edge pt-4">
          <p className="label-caps mb-3">EVENTS</p>
          <EventRow left="OPENED" right={fmtAt(pos.openedAt)} />
          {markEvents.map((m, i) => (
            <EventRow key={i} left="MARKED" right={fmtAt(m.at)} pnl={m.pnl} />
          ))}
          {pos.status === "closed" && lastClose && (
            <EventRow
              left={`CLOSED · ${lastClose.reason.toUpperCase().replace("-", " ")}`}
              right={fmtAt(lastClose.at)}
              pnl={latestPnl}
            />
          )}
        </div>

        {/* Mark-to-market chart */}
        {pos.marks.length > 0 ? (
          <div className="border-t border-edge pt-4">
            <p className="label-caps mb-3">MARK-TO-MARKET P&L</p>
            <MarkChart openedAt={pos.openedAt} marks={pos.marks} />
          </div>
        ) : (
          <div className="border-t border-edge pt-4">
            <p className="label-caps">NO MARK DATA</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── PositionPanel ──────────────────────────────────────────────────────────

interface Props {
  position: Position | null;
  onClose:  () => void;
}

export default function PositionPanel({ position, onClose }: Props) {
  const { reduced } = useMotionSafe();
  return (
    <AnimatePresence>
      {position && (
        <motion.div
          key="panel"
          initial={{ width: 0 }}
          animate={{
            width:      384,
            transition: reduced ? { duration: 0 } : SPRING_PANEL,
          }}
          exit={{
            width:      0,
            transition: reduced ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT },
          }}
          className="shrink-0 overflow-hidden"
          style={{ minWidth: 0 }}
        >
          <AnimatePresence mode="wait">
            <PanelContent
              key={position.id}
              pos={position}
              onClose={onClose}
              reduced={reduced}
            />
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
