#!/usr/bin/env node
// Paper trading CLI — the Sunday ritual.
// Usage: npx tsx scripts/paper.ts <cmd> [args]
//   propose          — show the best entry candidate; does NOT write
//   open             — append the proposed position to the ledger
//   mark             — mark all open positions; print any exit signals
//   close <id>       — close an open position at the crossing fill
//
// Always ends with: "Review the diff, then commit ledger.json"
// because the git commit IS the audit record.

import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Load .env.local when running as a CLI script (outside Next.js process).
// ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY must be available.
const envPath = join(process.cwd(), ".env.local");
if (!process.env.ALPACA_API_KEY_ID && existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.+)$/);
    if (m) process.env[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, "");
  }
}

import { AlpacaProvider }   from "../lib/data/alpaca";
import { STRATEGIES }       from "../lib/paper/strategies";
import { findEntryContract, fillPrice, markPosition, checkExits } from "../lib/paper/engine";
import type { Ledger, Position, CloseEvent, MarkEvent } from "../lib/paper/ledger";

const LEDGER_PATH = join(process.cwd(), "data/paper/ledger.json");
const STRATEGY_ID = "spy-30d-put";

function readLedger(): Ledger {
  return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as Ledger;
}

function writeLedger(ledger: Ledger): void {
  writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
}

function positionId(): string {
  // e.g. pos-20260716T143022Z — readable, sortable, unique to the second
  return "pos-" + new Date().toISOString().replace(/[:.]/g, "").slice(0, 16) + "Z";
}

function hr() { console.log("─".repeat(52)); }

function fmtDelta(d: number) { return d.toFixed(3); }
function fmtPct(n: number)   { return (n * 100).toFixed(1) + "%"; }
function fmtUSD(n: number)   {
  const s = Math.abs(n).toFixed(2);
  return (n < 0 ? "−" : "+") + "$" + s;
}

const strategy = STRATEGIES.find(s => s.id === STRATEGY_ID)!;
const [, , cmd, arg] = process.argv;

async function main() {
  const provider = new AlpacaProvider();

  // ── propose ──────────────────────────────────────────────────────────────────
  if (cmd === "propose" || cmd === "open") {
    console.log(`\nFetching ${strategy.underlying} chain (21-45 DTE)…`);
    const chain = await provider.getPaperChain(strategy.underlying);
    const spot  = chain.spot;

    const result = findEntryContract(chain, strategy);

    if (!result.ok) {
      console.log("\nNO CANDIDATE FOUND");
      console.log(result.reason);
      process.exit(1);
    }

    const { quote, delta, iv, dte } = result;
    const bid  = quote.bid!;
    const ask  = quote.ask!;
    const mid  = (bid + ask) / 2;
    const fill = bid; // sell → bid

    hr();
    console.log(`PROPOSED ENTRY — ${strategy.name}`);
    hr();
    console.log(`Contract    ${quote.symbol}`);
    console.log(`Underlying  ${strategy.underlying}  spot $${spot.toFixed(2)}`);
    console.log(`Strike      $${quote.strike.toFixed(2)}  (${((quote.strike / spot - 1) * 100).toFixed(1)}% from spot)`);
    console.log(`Expiry      ${quote.expiry}  (${dte.toFixed(1)} DTE)`);
    console.log(`Type        ${quote.type}`);
    console.log(`Delta       ${fmtDelta(delta)}`);
    console.log(`IV          ${fmtPct(iv)}`);
    console.log();
    console.log(`Bid         $${bid.toFixed(2)}`);
    console.log(`Ask         $${ask.toFixed(2)}`);
    console.log(`Mid         $${mid.toFixed(2)}`);
    console.log(`Fill (bid)  $${fill.toFixed(2)}  ← crossing the spread; mid-fills flatter P&L`);
    console.log(`Credit      $${(fill * 100).toFixed(2)} per contract`);
    console.log();

    // Build the ledger entry for display (and optionally writing)
    const position: Position = {
      id:          positionId(),
      strategyId:  STRATEGY_ID,
      openedAt:    new Date().toISOString(),
      contract: {
        symbol: quote.symbol,
        strike: quote.strike,
        expiry: quote.expiry,
        type:   quote.type,
      },
      side:        "sell",
      qty:         1,
      entryFill:   fill,
      entrySpread: { bid, ask },
      entryDelta:  delta,
      entryIv:     iv,
      status:      "open",
      closes:      [],
      marks:       [],
    };

    if (cmd === "propose") {
      console.log("Ledger entry that would be appended:");
      console.log(JSON.stringify(position, null, 2));
      hr();
      console.log("DID NOT WRITE — run 'open' to append this entry.");
    } else {
      // open: actually write
      const ledger = readLedger();
      ledger.positions.push(position);
      writeLedger(ledger);
      hr();
      console.log(`OPENED — position ${position.id} appended to ledger.json`);
    }

    hr();
    console.log("Review the diff, then commit ledger.json — the commit IS the audit record.");
    return;
  }

  // ── mark ─────────────────────────────────────────────────────────────────────
  if (cmd === "mark") {
    const ledger = readLedger();
    const open   = ledger.positions.filter(p => p.status === "open");

    if (open.length === 0) {
      console.log("\nNo open positions.");
      hr();
      console.log("Review the diff, then commit ledger.json — the commit IS the audit record.");
      return;
    }

    console.log(`\nFetching ${strategy.underlying} chain (21-45 DTE)…`);
    const chain = await provider.getPaperChain(strategy.underlying);
    const now   = new Date().toISOString();

    let exitCount = 0;
    for (const pos of open) {
      const marked = markPosition(pos, chain);
      if (!marked) {
        console.log(`\n${pos.id}  contract not found in chain (expired or outside range)`);
        continue;
      }
      const { mark, pnl } = marked;
      const markEvt: MarkEvent = { at: now, mid: mark, pnl };
      pos.marks.push(markEvt);

      const signal = checkExits(pos, chain, strategy);
      const pnlStr = fmtUSD(pnl);

      console.log(`\n${pos.id}`);
      console.log(`  ${pos.contract.symbol}  mark $${mark.toFixed(2)}  pnl ${pnlStr}`);

      if (signal) {
        exitCount++;
        console.log(`  ⚑ EXIT SIGNAL: ${signal.reason.toUpperCase()}`);
        console.log(`    run: npx tsx scripts/paper.ts close ${pos.id}`);
      }
    }

    ledger.lastMarkAt = now;
    writeLedger(ledger);

    console.log(`\nMarked ${open.length} position(s).${exitCount ? ` ${exitCount} exit signal(s) above.` : ""}`);
    hr();
    console.log("Review the diff, then commit ledger.json — the commit IS the audit record.");
    return;
  }

  // ── close <id> ───────────────────────────────────────────────────────────────
  if (cmd === "close") {
    if (!arg) {
      console.error("Usage: close <positionId>");
      process.exit(1);
    }

    const ledger = readLedger();
    const pos    = ledger.positions.find(p => p.id === arg);
    if (!pos) {
      console.error(`Position ${arg} not found`);
      process.exit(1);
    }
    if (pos.status === "closed") {
      console.error(`Position ${arg} is already closed`);
      process.exit(1);
    }

    console.log(`\nFetching ${strategy.underlying} chain (21-45 DTE)…`);
    const chain = await provider.getPaperChain(strategy.underlying);
    const quote = chain.quotes.find(q => q.symbol === pos.contract.symbol);
    if (!quote) {
      console.error(`Contract ${pos.contract.symbol} not found in chain — may have expired`);
      process.exit(1);
    }

    // To close a short put: BUY it back → fill at ASK (honesty rule)
    const closeSide: "buy" | "sell" = pos.side === "sell" ? "buy" : "sell";
    const fill = fillPrice(closeSide, quote);
    if (fill === null) {
      console.error("No ask price available — cannot close");
      process.exit(1);
    }

    const pnl = (pos.entryFill - fill) * 100 * pos.qty;
    const closeEvt: CloseEvent = { at: new Date().toISOString(), fill, reason: "manual" };

    pos.closes.push(closeEvt);
    pos.status = "closed";
    // Append final mark
    pos.marks.push({ at: closeEvt.at, mid: fill, pnl });
    writeLedger(ledger);

    hr();
    console.log(`CLOSED — ${pos.contract.symbol}`);
    console.log(`  Entry fill  $${pos.entryFill.toFixed(2)}`);
    console.log(`  Close fill  $${fill.toFixed(2)}  (${closeSide} at ask — honesty rule)`);
    console.log(`  Realized    ${fmtUSD(pnl)}`);
    hr();
    console.log("Review the diff, then commit ledger.json — the commit IS the audit record.");
    return;
  }

  // ── unknown command ───────────────────────────────────────────────────────────
  console.error(`Unknown command: ${cmd ?? "(none)"}`);
  console.error("Commands: propose | open | mark | close <id>");
  process.exit(1);
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
