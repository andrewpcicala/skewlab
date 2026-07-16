"use client";
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SPRING_PANEL, EASE_OUT, useMotionSafe } from "@/lib/motion";
import TickerInput from "./TickerInput";
import StatusLine from "./StatusLine";
import ExpiryTabs from "./ExpiryTabs";
import ChainTable, { type ChainRow } from "./ChainTable";
import BreakdownPanel from "./BreakdownPanel";
import type { OptionChain, OptionQuote } from "@/lib/data/types";

export default function ChainView() {
  const { reduced } = useMotionSafe();
  const [symbol, setSymbol] = useState("SPY");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<OptionQuote | null>(null);

  const fetchChain = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setShowAll(false);
    setSelectedQuote(null);
    try {
      const r = await fetch(`/api/chain?symbol=${encodeURIComponent(sym)}`);
      const data = await r.json();
      if (!r.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${r.status}`);
        setChain(null);
        return;
      }
      const c = data as OptionChain;
      setChain(c);
      setSelectedExpiry((prev) =>
        c.expiries.includes(prev) ? prev : (c.expiries[0] ?? "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setChain(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchChain(symbol);
  }, [symbol, fetchChain]);

  const handleSubmit = useCallback(
    (sym: string) => { if (sym !== symbol) setSymbol(sym); },
    [symbol]
  );

  // Clear selection when expiry changes (selected contract is now off-screen)
  const handleExpirySelect = useCallback((exp: string) => {
    setSelectedExpiry(exp);
    setSelectedQuote(null);
  }, []);

  // Build T-table rows for the selected expiry
  const allRows: ChainRow[] = (() => {
    if (!chain || !selectedExpiry) return [];
    const quotes = chain.quotes.filter((q) => q.expiry === selectedExpiry);
    const strikes = [...new Set(quotes.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: quotes.find((q) => q.strike === strike && q.type === "call"),
      put:  quotes.find((q) => q.strike === strike && q.type === "put"),
    }));
  })();

  // Default ±15% window; expand with SHOW ALL
  const rows = showAll || !chain
    ? allRows
    : allRows.filter(
        (r) => r.strike >= chain.spot * 0.85 && r.strike <= chain.spot * 1.15
      );

  return (
    <div>
      {/* Top row: ticker + spot left, status right */}
      <div className="flex items-end justify-between border-b border-edge pb-6 mb-6">
        <div className="flex items-baseline gap-6">
          <TickerInput onSubmit={handleSubmit} />
          {chain && !loading && (
            <span className="label-caps">
              SPOT{" "}
              <span className="num text-[#E7E7EA]">{chain.spot.toFixed(2)}</span>
            </span>
          )}
        </div>
        {chain && !loading && (
          <StatusLine
            dataQuality={chain.dataQuality}
            quoteBasis={chain.quoteBasis}
            asOf={chain.asOf}
            truncated={chain.truncated}
          />
        )}
      </div>

      {/* Loading */}
      {loading && <p className="label-caps">LOADING CHAIN…</p>}

      {/* Error */}
      {!loading && error && <p className="text-label text-sm">{error}</p>}

      {/* Chain */}
      {!loading && !error && chain && (
        <>
          <div className="mb-6">
            <ExpiryTabs
              expiries={chain.expiries}
              selected={selectedExpiry}
              onSelect={handleExpirySelect}
            />
          </div>

          {/* Table + panel: panel animates its width to avoid layout jump */}
          <div className="flex items-start gap-6">
            <div className="flex-1 min-w-0">
              <ChainTable
                ticker={symbol}
                rows={rows}
                spot={chain.spot}
                selected={selectedQuote}
                onSelect={setSelectedQuote}
              />
              {!showAll && allRows.length > rows.length && (
                <div className="mt-4">
                  <button
                    onClick={() => setShowAll(true)}
                    className="label-caps text-accent hover:opacity-70 transition-opacity duration-[100ms]"
                  >
                    SHOW ALL STRIKES
                  </button>
                </div>
              )}
            </div>

            {/* Panel width animates 0 → 360px so the table shrinks smoothly */}
            <AnimatePresence>
              {selectedQuote && (
                <motion.div
                  key="panel"
                  initial={{ width: 0 }}
                  animate={{
                    width: 360,
                    transition: reduced ? { duration: 0 } : SPRING_PANEL,
                  }}
                  exit={{
                    width: 0,
                    transition: reduced
                      ? { duration: 0 }
                      : { duration: 0.2, ease: EASE_OUT },
                  }}
                  className="shrink-0 overflow-hidden"
                  style={{ minWidth: 0 }}
                >
                  <BreakdownPanel
                    quote={selectedQuote}
                    spot={chain.spot}
                    onClose={() => setSelectedQuote(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  );
}
