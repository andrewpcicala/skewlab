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

  const fetchChain = useCallback(async (sym: string) => {
    setLoading(true);
    setError(null);
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
  const rows: ChainRow[] = (() => {
    if (!chain || !selectedExpiry) return [];
    const quotes = chain.quotes.filter((q) => q.expiry === selectedExpiry);
    const strikes = [...new Set(quotes.map((q) => q.strike))].sort((a, b) => a - b);
    return strikes.map((strike) => ({
      strike,
      call: quotes.find((q) => q.strike === strike && q.type === "call"),
      put:  quotes.find((q) => q.strike === strike && q.type === "put"),
    }));
  })();

  return (
    <div>
      {/* Top row: ticker input left, status right */}
      <div className="flex items-end justify-between mb-8">
        <TickerInput onSubmit={handleSubmit} />
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
        </>
      )}
    </div>
  );
}
