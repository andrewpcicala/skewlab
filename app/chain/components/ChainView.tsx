"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SPRING_PANEL, EASE_OUT, useMotionSafe } from "@/lib/motion";
import PageLoader from "@/app/components/PageLoader";
import TickerInput from "./TickerInput";
import StatusLine from "./StatusLine";
import ExpiryTabs from "./ExpiryTabs";
import ChainTable, { type ChainRow } from "./ChainTable";
import BreakdownPanel from "./BreakdownPanel";
import type { OptionChain, OptionQuote } from "@/lib/data/types";

// Cache TTL matches the server-side cache (15 min). After this, show REFRESH.
const STALE_MS = 15 * 60 * 1000;

interface Props {
  initialTicker?:  string;
  initialExpiry?:  string;
  initialStrike?:  number;
}

export default function ChainView({
  initialTicker  = "SPY",
  initialExpiry,
  initialStrike,
}: Props) {
  const { reduced } = useMotionSafe();
  const router      = useRouter();

  const [symbol,        setSymbol]        = useState(initialTicker);
  const [chain,         setChain]         = useState<OptionChain | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [showAll,       setShowAll]       = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<OptionQuote | null>(null);
  const [fetchedAt,     setFetchedAt]     = useState<number | null>(null);

  const fetchChain = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setShowAll(false);
    setSelectedQuote(null);
    try {
      const r    = await fetch(`/api/chain?symbol=${encodeURIComponent(sym)}`);
      const data = await r.json();
      if (!r.ok) {
        setError((data as { error?: string }).error ?? `HTTP ${r.status}`);
        setChain(null);
        return;
      }
      const c = data as OptionChain;
      setChain(c);
      setFetchedAt(Date.now());
      setSelectedExpiry(prev =>
        c.expiries.includes(prev) ? prev : (c.expiries[0] ?? "")
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setChain(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchChain(symbol); }, [symbol, fetchChain]);

  const handleSubmit = useCallback((sym: string) => {
    if (sym !== symbol) {
      setSymbol(sym);
      router.replace(`/chain?s=${sym}`, { scroll: false });
    }
  }, [symbol, router]);

  const handleExpirySelect = useCallback((exp: string) => {
    setSelectedExpiry(exp);
    setSelectedQuote(null);
  }, []);

  // ←/→ keyboard: switch expiry when no input is focused
  useEffect(() => {
    if (!chain) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      const idx = chain.expiries.indexOf(selectedExpiry);
      if (e.key === "ArrowLeft"  && idx > 0)
        handleExpirySelect(chain.expiries[idx - 1]);
      if (e.key === "ArrowRight" && idx < chain.expiries.length - 1)
        handleExpirySelect(chain.expiries[idx + 1]);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [chain, selectedExpiry, handleExpirySelect]);

  // Auto-select expiry + open breakdown panel from URL params (surface → chain link)
  useEffect(() => {
    if (!chain || !initialExpiry) return;
    if (!chain.expiries.includes(initialExpiry)) return;
    setSelectedExpiry(initialExpiry);
    if (initialStrike !== undefined) {
      // Prefer the put that best matches the clicked contract
      const quote =
        chain.quotes.find(q =>
          q.expiry === initialExpiry &&
          q.strike === initialStrike &&
          q.type   === "put"
        ) ??
        chain.quotes.find(q =>
          q.expiry === initialExpiry &&
          q.strike === initialStrike
        );
      if (quote) setSelectedQuote(quote);
    }
  // Run once when chain first loads; initialExpiry/initialStrike are stable props.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);

  // Staleness: data older than STALE_MS triggers the REFRESH affordance
  const isStale = fetchedAt !== null && Date.now() - fetchedAt > STALE_MS;

  const handleRefresh = useCallback(() => { fetchChain(symbol); }, [fetchChain, symbol]);

  // Build T-table rows for the selected expiry
  const allRows: ChainRow[] = (() => {
    if (!chain || !selectedExpiry) return [];
    const quotes  = chain.quotes.filter(q => q.expiry === selectedExpiry);
    const strikes = [...new Set(quotes.map(q => q.strike))].sort((a, b) => a - b);
    return strikes.map(strike => ({
      strike,
      call: quotes.find(q => q.strike === strike && q.type === "call"),
      put:  quotes.find(q => q.strike === strike && q.type === "put"),
    }));
  })();

  // Default ±15% window; expand with SHOW ALL
  const rows = showAll || !chain
    ? allRows
    : allRows.filter(
        r => r.strike >= chain.spot * 0.85 && r.strike <= chain.spot * 1.15
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
            isStale={isStale}
            onRefresh={handleRefresh}
          />
        )}
      </div>

      {/* Loading */}
      {loading && <PageLoader label="LOADING CHAIN" />}

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
                    width:      360,
                    transition: reduced ? { duration: 0 } : SPRING_PANEL,
                  }}
                  exit={{
                    width:      0,
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
