import type { MarketDataProvider, OptionChain } from "./types";
import { PolygonProvider } from "./polygon";
import { getCachedChain, setCachedChain } from "./cache";

// The only place a concrete provider is referenced.
const provider = new PolygonProvider();

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
