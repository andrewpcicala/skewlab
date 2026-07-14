import type { MarketDataProvider } from "./types";
import { TradierProvider } from "./tradier";

// The only place a concrete provider is referenced.
export function getProvider(): MarketDataProvider {
  return new TradierProvider();
}
