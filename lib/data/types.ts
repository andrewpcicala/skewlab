export interface OptionQuote {
  symbol: string;
  underlying: string;
  strike: number;
  expiry: string; // ISO string
  type: "call" | "put";
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  openInterest: number;
}

export interface OptionChain {
  underlying: string;
  spot: number;
  asOf: string; // ISO string
  expiries: string[];
  quotes: OptionQuote[];
}

export interface MarketDataProvider {
  getChain(underlying: string): Promise<OptionChain>;
  getSpot(underlying: string): Promise<number>;
}
