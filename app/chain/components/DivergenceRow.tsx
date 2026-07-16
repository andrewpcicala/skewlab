"use client";
import type { OptionQuote } from "@/lib/data/types";

interface Props {
  modelPrice: number;
  quote: OptionQuote;
}

export default function DivergenceRow({ modelPrice, quote }: Props) {
  // Prefer mid; fall back to close with a different label
  const marketPrice = quote.mid ?? quote.close;
  const vsLabel = quote.mid !== null ? "VS MID" : quote.close !== null ? "VS CLOSE" : null;

  if (marketPrice === null || vsLabel === null) {
    return (
      <div>
        <p className="label-caps mb-2">MODEL − MARKET</p>
        <p className="label-caps text-label">NO MARKET PRICE</p>
      </div>
    );
  }

  const diff = modelPrice - marketPrice;
  const pct  = (diff / marketPrice) * 100;
  const isPos = diff >= 0;
  const colorClass = isPos ? "text-pos" : "text-neg";
  const sign = isPos ? "+" : "";

  return (
    <div>
      <p className="label-caps mb-3">MODEL − MARKET <span className="text-label">{vsLabel}</span></p>
      <div className="flex items-baseline gap-4">
        <span className={`num text-2xl ${colorClass}`}>
          {sign}{diff.toFixed(2)}
        </span>
        <span className={`num text-sm ${colorClass}`}>
          {sign}{pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
