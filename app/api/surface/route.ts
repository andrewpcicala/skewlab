import { NextRequest, NextResponse } from "next/server";
import { getSurfaceChain } from "@/lib/data";
import { buildIvSurface } from "@/lib/pricing/surface";

const SYMBOL_RE = /^[A-Z]{1,5}$/;

export async function GET(req: NextRequest) {
  const rawSymbol = req.nextUrl.searchParams.get("symbol") ?? "SPY";
  const symbol = rawSymbol.toUpperCase().trim();

  if (!SYMBOL_RE.test(symbol)) {
    return NextResponse.json(
      { error: `Invalid symbol "${symbol}". Must be 1–5 uppercase letters.` },
      { status: 400 }
    );
  }

  try {
    const chain   = await getSurfaceChain(symbol);
    const surface = buildIvSurface(chain, chain.spot);

    return NextResponse.json({
      spot:   chain.spot,
      asOf:   chain.asOf,
      points: surface.points,
      stats:  surface.stats,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status  = message.includes("rate limit") ? 429 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
