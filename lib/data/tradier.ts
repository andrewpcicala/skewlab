// Swappable provider module. The rest of the app imports only the
// MarketDataProvider interface, never a concrete provider.
import type { MarketDataProvider, OptionChain } from "./types";

const _token = process.env.TRADIER_TOKEN;

export class TradierProvider implements MarketDataProvider {
  async getChain(_underlying: string): Promise<OptionChain> {
    throw new Error("Not implemented");
  }

  async getSpot(_underlying: string): Promise<number> {
    throw new Error("Not implemented");
  }
}
