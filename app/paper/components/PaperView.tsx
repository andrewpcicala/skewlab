"use client";
import { useState, useEffect, useMemo } from "react";
import { STRATEGIES } from "@/lib/paper/strategies";
import type { Position } from "@/lib/paper/ledger";
import BlotterTable, { positionPnl } from "./BlotterTable";
import PositionPanel from "./PositionPanel";
import PageLoader from "@/app/components/PageLoader";

// ── Types ──────────────────────────────────────────────────────────────────

interface Stats {
  totalPnl:    number | null;
  openCount:   number;
  closedCount: number;
  winRate:     number | null;
  worst:       number | null;
}

interface PaperData {
  positions:   Position[];
  lastMarkAt:  string | null;
  stats:       Stats;
}

// ── Formatting ─────────────────────────────────────────────────────────────

function fmtUSD(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (n >= 0 ? "+" : "−") + "$" + abs;
}

function fmtWinRate(n: number | null): string {
  if (n === null) return "—";
  return (n * 100).toFixed(1) + "%";
}

function fmtMarkAt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric", timeZone: "UTC",
  }).toUpperCase();
}

function isStale(lastMarkAt: string | null): boolean {
  if (!lastMarkAt) return true;
  return Date.now() - new Date(lastMarkAt).getTime() > 8 * 24 * 60 * 60 * 1000;
}

function pnlColorClass(n: number | null): string {
  if (n === null) return "text-label";
  return n >= 0 ? "text-pos" : "text-neg";
}

// ── Tape stat ──────────────────────────────────────────────────────────────

function TapeStat({
  label,
  value,
  colorClass,
  title,
}: {
  label:      string;
  value:      string;
  colorClass?: string;
  title?:     string;
}) {
  return (
    <span className="flex flex-col gap-1" title={title}>
      <span className="label-caps">{label}</span>
      <span className={`num text-base ${colorClass ?? "text-[#E7E7EA]"}`}>{value}</span>
    </span>
  );
}

// ── Strategy rules string ──────────────────────────────────────────────────

function rulesString(strat: typeof STRATEGIES[number]): string {
  const { rules } = strat;
  const side      = rules.side.toUpperCase();
  const delta     = Math.round(Math.abs(rules.targetDelta) * 100);
  const type      = rules.type.toUpperCase();
  const dteMin    = rules.dteRange[0];
  const dteMax    = rules.dteRange[1];
  const take      = rules.exit.profitTakePctOfCredit;
  const closeDte  = rules.exit.closeAtDte;
  return `${side} ${delta}Δ ${type} · ${dteMin}–${dteMax} DTE · TAKE ${take}% OF CREDIT · CLOSE AT ${closeDte} DTE`;
}

// ── PaperView ──────────────────────────────────────────────────────────────

export default function PaperView() {
  const [data,     setData]     = useState<PaperData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [selected, setSelected] = useState<Position | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r    = await fetch("/api/paper");
        const json = await r.json();
        if (!r.ok) { setError((json as { error?: string }).error ?? `HTTP ${r.status}`); return; }
        setData(json as PaperData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Strategy P&L: sum of all position P&Ls for a given strategy
  const stratPnl = useMemo(() => {
    if (!data) return new Map<string, number | null>();
    return new Map(
      STRATEGIES.map(s => {
        const pnls = data.positions
          .filter(p => p.strategyId === s.id)
          .map(positionPnl)
          .filter((v): v is number => v !== null);
        return [s.id, pnls.length > 0 ? pnls.reduce((a, b) => a + b, 0) : null];
      })
    );
  }, [data]);

  // Sync selected position: if data refreshes, keep selection if id still exists
  useEffect(() => {
    if (!data || !selected) return;
    const found = data.positions.find(p => p.id === selected.id);
    if (found) setSelected(found);
    else       setSelected(null);
  }, [data, selected]);

  // ── Loading / error ──────────────────────────────────────────────────────

  if (loading) {
    return <PageLoader label="LOADING BOOK" />;
  }

  if (error || !data) {
    return (
      <div style={{ height: "60vh", display: "flex", alignItems: "center" }}>
        <span className="label-caps">{error ?? "No data"}</span>
      </div>
    );
  }

  const { positions, lastMarkAt, stats } = data;
  const stale    = isStale(lastMarkAt);
  const isEmpty  = positions.length === 0;

  // ── Empty-state overrides ────────────────────────────────────────────────
  // When no positions exist, tape shows "—" for every value per spec §6.1

  const tapeTotalPnl = isEmpty ? null : stats.totalPnl;
  const tapeOpen     = isEmpty ? null : stats.openCount;
  const tapeClosed   = isEmpty ? null : stats.closedCount;
  const tapeWinRate  = isEmpty ? null : stats.winRate;
  const tapeWorst    = isEmpty ? null : stats.worst;

  return (
    <div>

      {/* ── 1. HEADER ──────────────────────────────────────────────────── */}
      <div
        style={{
          borderBottom:  "1px solid var(--color-edge)",
          paddingBottom: "24px",
          marginBottom:  "24px",
        }}
      >
        <div className="flex items-baseline justify-between">
          {/* Left: title + disclaimer */}
          <div>
            <h1
              className="label-caps text-[#E7E7EA]"
              style={{ fontSize: "20px", fontWeight: "normal", marginBottom: "8px" }}
            >
              PAPER BOOK
            </h1>
            <p className="label-caps">
              LIVE FORWARD EXPERIMENT · SIMULATED FILLS CROSS THE SPREAD · NOT REAL MONEY · NOT ADVICE
            </p>
          </div>

          {/* Right: mark date */}
          <div className="text-right shrink-0 ml-8">
            <span className="label-caps">MARKED </span>
            <span className="num text-sm">{fmtMarkAt(lastMarkAt)}</span>
            {stale && stats.openCount > 0 && (
              <span className="label-caps text-neg"> · STALE</span>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. TAPE — summary stats ─────────────────────────────────────── */}
      <div
        style={{
          display:       "flex",
          flexWrap:      "wrap",
          gap:           "0 3rem",
          borderBottom:  "1px solid var(--color-edge)",
          paddingBottom: "24px",
          marginBottom:  "24px",
        }}
      >
        <TapeStat
          label="TOTAL P&L"
          value={fmtUSD(tapeTotalPnl)}
          colorClass={pnlColorClass(tapeTotalPnl)}
        />
        <TapeStat
          label="OPEN"
          value={tapeOpen === null ? "—" : String(tapeOpen)}
        />
        <TapeStat
          label="CLOSED"
          value={tapeClosed === null ? "—" : String(tapeClosed)}
        />
        <TapeStat
          label="WIN RATE"
          value={fmtWinRate(tapeWinRate)}
          title="Closed positions only; open positions are not wins yet."
        />
        <TapeStat
          label="WORST"
          value={fmtUSD(tapeWorst)}
          colorClass={pnlColorClass(tapeWorst)}
          title="Largest loss is displayed with the same prominence as any gain."
        />
      </div>

      {/* ── 3. STRATEGY LEDGER LINES ────────────────────────────────────── */}
      <div style={{ marginBottom: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
        {STRATEGIES.map(s => {
          const spnl      = stratPnl.get(s.id) ?? null;
          const spnlColor = pnlColorClass(isEmpty ? null : spnl);
          return (
            <div
              key={s.id}
              style={{
                border:  "1px solid var(--color-edge)",
                padding: "16px",
              }}
            >
              <div className="flex items-baseline justify-between mb-2">
                <span className="label-caps text-[#E7E7EA]">{s.name}</span>
                <span className={`num text-base ${spnlColor}`}>
                  {fmtUSD(isEmpty ? null : spnl)}
                </span>
              </div>
              <p className="label-caps">{rulesString(s)}</p>
            </div>
          );
        })}
      </div>

      {/* ── 4. BLOTTER ──────────────────────────────────────────────────── */}
      <div
        style={{
          borderTop:    "1px solid var(--color-edge)",
          paddingTop:   "24px",
          marginBottom: "24px",
        }}
      >
        <div className="flex items-start gap-6">
          {/* Table */}
          <div className="flex-1 min-w-0">
            <BlotterTable
              positions={positions}
              selected={selected}
              onSelect={setSelected}
            />
          </div>

          {/* Panel */}
          <PositionPanel
            position={selected}
            onClose={() => setSelected(null)}
          />
        </div>
      </div>

      {/* ── 5. PROVENANCE ───────────────────────────────────────────────── */}
      <div
        style={{
          borderTop:   "1px solid var(--color-edge)",
          paddingTop:  "16px",
          marginTop:   "8px",
        }}
      >
        <span className="label-caps">
          Append-only ledger. Repository history is the audit trail.
          {" · "}
          <a
            href="https://github.com/andrewpcicala/skewlab/blob/main/data/paper/ledger.json"
            target="_blank"
            rel="noreferrer"
            className="text-accent"
            style={{ textDecoration: "none" }}
            onMouseEnter={e => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={e => (e.currentTarget.style.textDecoration = "none")}
          >
            VIEW LEDGER ON GITHUB
          </a>
        </span>
      </div>

    </div>
  );
}
