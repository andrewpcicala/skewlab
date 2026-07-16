"use client";
import type { OptionQuote } from "@/lib/data/types";

interface Props {
  modelPrice: number;
  quote:      OptionQuote;
  userVolPct: number;
  ivPct:      number | null;
}

export default function DivergenceRow({ modelPrice, quote, userVolPct, ivPct }: Props) {
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

  const diff  = modelPrice - marketPrice;
  const pct   = (diff / marketPrice) * 100;
  const isPos = diff >= 0;
  const colorClass = isPos ? "text-pos" : "text-neg";
  const sign  = isPos ? "+" : "−";

  const absDiff = Math.abs(diff).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const absPct = Math.abs(pct).toFixed(1);

  return (
    <div>
      <p className="label-caps mb-3">
        MODEL − MARKET <span className="text-label">{vsLabel}</span>
      </p>
      <div className="flex items-baseline gap-4 mb-3">
        <span className={`num text-2xl ${colorClass}`}>
          {sign}${absDiff}
        </span>
        <span className={`num text-sm ${colorClass}`}>
          {sign}{absPct}%
        </span>
      </div>
      <p className="label-caps text-label">
        YOUR VOL {userVolPct.toFixed(1)}%
        {ivPct !== null ? ` · MARKET ${ivPct.toFixed(1)}%` : ""}
      </p>
    </div>
  );
}
