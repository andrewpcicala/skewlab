import { NextResponse } from "next/server";
import { getDailyCloses } from "@/lib/data/polygon";
import { getVixCloses }   from "@/lib/data/vix";
import { buildVrpSeries } from "@/lib/study/vrp";

export const maxDuration = 30;    // raise Vercel serverless time budget above ~10s default
export const revalidate  = 86400; // Vercel edge cache: serve cached response for 24h after first success

// Two-year lookback — the full range available on Polygon free tier.
const FROM = "2024-07-01";

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ── Module-level payload cache ─────────────────────────────────────────────
// Survives across requests when the Lambda stays warm; edge cache (revalidate)
// handles the cold-start path after first success.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let moduleCache: { payload: unknown; expiresAt: number } | null = null;

// ── Per-source fetch timeout ───────────────────────────────────────────────
// Wraps a fetch-based operation with an AbortController timeout.
// Throws with the source name so the caller can label the error.
async function withTimeout<T>(
  source: string,
  fn: (signal: AbortSignal) => Promise<T>,
  ms = 8_000,
): Promise<T> {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch (e) {
    // Log the low-level reason; always surface the source name to the caller
    // so error routing in GET() can identify which upstream failed.
    const inner = ctrl.signal.aborted ? "timeout"
                : e instanceof Error ? e.message : "unknown";
    console.error(`[findings] ${source} error: ${inner}`);
    throw new Error(`${source} DID NOT RESPOND`);
  } finally {
    clearTimeout(id);
  }
}

export async function GET() {
  // Serve from module-level cache if still fresh
  if (moduleCache && Date.now() < moduleCache.expiresAt) {
    console.log("[findings] module cache HIT");
    return NextResponse.json(moduleCache.payload, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  }

  const t0 = Date.now();

  try {
    const to = toIso(new Date());

    // Stage 1 — SPY daily closes (Polygon)
    const t1 = Date.now();
    const spyCloses = await withTimeout("POLYGON", (signal) =>
      getDailyCloses("SPY", FROM, to, signal)
    );
    console.log(`[findings] SPY closes: ${Date.now() - t1}ms (${spyCloses.length} bars)`);

    // Stage 2 — VIX daily closes (FRED)
    const t2 = Date.now();
    const vixCloses = await withTimeout("FRED", (signal) =>
      getVixCloses(FROM, to, signal)
    );
    console.log(`[findings] VIX closes: ${Date.now() - t2}ms (${vixCloses.length} obs)`);

    // Stage 3 — RV compute + VRP series build (pure CPU, should be <10ms)
    const t3 = Date.now();
    const { series, stats } = buildVrpSeries(spyCloses, vixCloses);
    console.log(`[findings] series build: ${Date.now() - t3}ms (${series.length} VRP points)`);
    console.log(`[findings] total: ${Date.now() - t0}ms`);

    const dataRange = series.length
      ? { from: series[0].date, to: series[series.length - 1].date }
      : { from: "", to: "" };

    const payload = {
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
    };

    moduleCache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" },
    });
  } catch (e) {
    const msg    = e instanceof Error ? e.message : "Unknown error";
    const source = msg.includes("POLYGON") ? "POLYGON"
                 : msg.includes("FRED")    ? "FRED"
                 : "EXTERNAL SOURCE";
    console.error(`[findings] ERROR after ${Date.now() - t0}ms: ${msg}`);
    return NextResponse.json({ error: msg, source }, { status: 500 });
  }
}
