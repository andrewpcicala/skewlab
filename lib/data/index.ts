import type { MarketDataProvider, OptionChain } from "./types";
import { AlpacaProvider } from "./alpaca";
import { getCachedChain, setCachedChain } from "./cache";

// The only place a concrete provider is referenced.
const provider = new AlpacaProvider();

// Cached wrapper — chain hits are instant; misses fetch + store.
const cachedProvider: MarketDataProvider = {
  async getChain(underlying: string): Promise<OptionChain> {
    const cached = getCachedChain(underlying);
    if (cached) return cached;
    const chain = await provider.getChain(underlying);
    setCachedChain(underlying, chain);
    return chain;
  },
  getSpot: provider.getSpot.bind(provider),
};

export function getProvider(): MarketDataProvider {
  return cachedProvider;
}

// Surface chain — separate cache key so chain and surface don't evict each other.
export async function getSurfaceChain(underlying: string): Promise<OptionChain> {
  const key = `surface:${underlying}`;
  const cached = getCachedChain(key);
  if (cached) return cached;
  const chain = await provider.getSurfaceChain(underlying);
  setCachedChain(key, chain);
  return chain;
}
