"use client";
import { useState, useEffect, useCallback } from "react";
import TickerInput from "./TickerInput";
import StatusLine from "./StatusLine";
import ExpiryTabs from "./ExpiryTabs";
import ChainTable, { type ChainRow } from "./ChainTable";
import type { OptionChain } from "@/lib/data/types";

export default function ChainView() {
  const [symbol, setSymbol] = useState("SPY");
  const [chain, setChain] = useState<OptionChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("");
  const [showAll, setShowAll] = useState(false);

  const fetchChain = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
    setShowAll(false);
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
      // Default to nearest expiry; preserve selection if it still exists
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
    (sym: string) => {
      if (sym !== symbol) setSymbol(sym);
    },
    [symbol]
  );

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

  // Default ±15% window; expand to full chain with SHOW ALL
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
              onSelect={setSelectedExpiry}
            />
          </div>
          <ChainTable ticker={symbol} rows={rows} spot={chain.spot} />
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
        </>
      )}
    </div>
  );
}
