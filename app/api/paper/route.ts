import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import type { Ledger, Position } from "@/lib/paper/ledger";

const LEDGER_PATH = join(process.cwd(), "data/paper/ledger.json");

function positionPnl(pos: Position): number | null {
  if (pos.status === "closed") {
    const evt = pos.closes[pos.closes.length - 1];
    return evt ? (pos.entryFill - evt.fill) * 100 * pos.qty : null;
  }
  return pos.marks[pos.marks.length - 1]?.pnl ?? null;
}

export async function GET() {
  try {
    const ledger  = JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger;
    const { positions, lastMarkAt } = ledger;

    const allPnls    = positions.map(positionPnl);
    const validPnls  = allPnls.filter((p): p is number => p !== null);
    const closedPnls = positions
      .filter(p => p.status === "closed")
      .map(positionPnl)
      .filter((p): p is number => p !== null);

    return NextResponse.json({
      positions,
      lastMarkAt,
      stats: {
        totalPnl:    validPnls.length  > 0 ? validPnls.reduce((a, b) => a + b, 0) : null,
        openCount:   positions.filter(p => p.status === "open").length,
        closedCount: positions.filter(p => p.status === "closed").length,
        winRate:     closedPnls.length > 0 ? closedPnls.filter(p => p > 0).length / closedPnls.length : null,
        worst:       validPnls.length  > 0 ? Math.min(...validPnls) : null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to read ledger" },
      { status: 500 }
    );
  }
}
