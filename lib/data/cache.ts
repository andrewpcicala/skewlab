import type { OptionChain } from "./types";

const TTL_MS = 15 * 60 * 1000; // 15 minutes — indicative feed is fresher than EOD

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

// ── Generic TTL cache ─────────────────────────────────────────────────────────

export interface TtlCache<V> {
  get(key: string): V | null;
  set(key: string, value: V): void;
}

export function makeTtlCache<V>(ttlMs: number): TtlCache<V> {
  const store = new Map<string, { value: V; at: number }>();
  return {
    get(key) {
      const e = store.get(key);
      if (!e) return null;
      if (Date.now() - e.at > ttlMs) { store.delete(key); return null; }
      return e.value;
    },
    set(key, value) {
      store.set(key, { value, at: Date.now() });
    },
  };
}
