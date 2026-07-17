import { NextResponse } from "next/server";
import { getDailyCloses } from "@/lib/data/polygon";
import { getVixCloses }   from "@/lib/data/vix";
import { buildVrpSeries } from "@/lib/study/vrp";

// Two-year lookback — the full range available on Polygon free tier.
// Effective VRP series is ~21 trading days shorter (the forward RV window).
const FROM = "2024-07-01";

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const to = toIso(new Date());

    const [spyCloses, vixCloses] = await Promise.all([
      getDailyCloses("SPY", FROM, to),
      getVixCloses(FROM, to),
    ]);

    const { series, stats } = buildVrpSeries(spyCloses, vixCloses);

    const dataRange = series.length
      ? { from: series[0].date, to: series[series.length - 1].date }
      : { from: "", to: "" };

    return NextResponse.json({
      series,
      stats,
      meta: {
        dataRange,
        seriesLength: series.length,
        source:  "VIX proxy — CBOE Volatility Index (FRED VIXCLS) vs SPY 21-day forward realized vol (Polygon)",
        caveats: [
          "VIX measures SPX implied vol (European, cash-settled); SPY options are American — small divergence near ex-dividend dates.",
          "Realized vol uses mean-zero estimator over 21 trading days; window mismatch with VIX's 30-calendar-day horizon introduces noise.",
          "Polygon free tier limits SPY history to ~2 years; longer samples would tighten the estimates.",
          "Data is delayed (Polygon free tier); VRP values for the final 21 trading days are excluded (forward window incomplete).",
        ],
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
