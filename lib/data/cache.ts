import type { OptionChain } from "./types";

const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours — EOD data doesn't change intraday

interface CacheEntry {
  chain: OptionChain;
  fetchedAt: number; // Date.now()
}

// Module-level cache — lives for the lifetime of the Node.js process
const chainCache = new Map<string, CacheEntry>();

export function getCachedChain(underlying: string): OptionChain | null {
  const entry = chainCache.get(underlying);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) {
    chainCache.delete(underlying);
    return null;
  }
  console.log(`[cache] HIT ${underlying} (age ${Math.round((Date.now() - entry.fetchedAt) / 60_000)}m)`);
  return entry.chain;
}

export function setCachedChain(underlying: string, chain: OptionChain): void {
  chainCache.set(underlying, { chain, fetchedAt: Date.now() });
}
