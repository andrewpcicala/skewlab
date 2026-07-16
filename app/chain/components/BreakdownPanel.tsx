"use client";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { motion, AnimatePresence, useAnimate, type Variants } from "framer-motion";
import { panelVariants, EASE_OUT, NUMBER_ROLL_DURATION, useMotionSafe, priceFlash } from "@/lib/motion";
import { bsPrice, timeToExpiryYears } from "@/lib/pricing/blackScholes";
import { solveImpliedVol } from "@/lib/pricing/impliedVol";
import { RISK_FREE_RATE, DIV_YIELD_DEFAULT } from "@/lib/pricing/config";
import type { OptionQuote } from "@/lib/data/types";
import VolInput    from "./VolInput";
import GreeksGrid  from "./GreeksGrid";
import DivergenceRow from "./DivergenceRow";

interface Props {
  quote:   OptionQuote;
  spot:    number;
  onClose: () => void;
}

// ── Animated number counter ────────────────────────────────────────────────
// Rolls from prev value to next over NUMBER_ROLL_DURATION when vol changes.
function useRollingNumber(target: number, decimals: number, reduced: boolean): string {
  const [display, setDisplay] = useState(target);
  const prev  = useRef(target);
  const rafId = useRef(0);

  useEffect(() => {
    if (prev.current === target) return;
    cancelAnimationFrame(rafId.current);
    const startVal = prev.current;
    prev.current = target;

    if (reduced) { setDisplay(target); return; }

    const t0  = performance.now();
    const dur = NUMBER_ROLL_DURATION * 1000;
    const step = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setDisplay(startVal + (target - startVal) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) rafId.current = requestAnimationFrame(step);
    };
    rafId.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId.current);
  }, [target, reduced]);

  return display.toFixed(decimals);
}

// ── Formatting helpers ─────────────────────────────────────────────────────

function fmtExpiry(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

function fmtStrike(v: number): string {
  return v % 1 === 0 ? String(v) : v.toFixed(2);
}

// ── Section stagger variants ───────────────────────────────────────────────

const contentWrap: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
};

const section: Variants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
};

// ── Layout helpers ─────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="label-caps">{label}</span>
      {children}
    </div>
  );
}

function BlockHeader({ children }: { children: React.ReactNode }) {
  return <p className="label-caps text-label mb-3">{children}</p>;
}

// ── BreakdownPanel ─────────────────────────────────────────────────────────

const DEFAULT_VOL = 20.0; // percent

export default function BreakdownPanel({ quote, spot, onClose }: Props) {
  const { reduced } = useMotionSafe();
  const [vol, setVol] = useState(DEFAULT_VOL);
  const [divergenceScope, runDivergenceFlash] = useAnimate<HTMLDivElement>();

  // Reset vol when the selected contract changes
  useEffect(() => { setVol(DEFAULT_VOL); }, [quote.symbol]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Shared BS inputs (no vol) — stable reference across vol changes
  const bsInput = useMemo(() => ({
    spot,
    strike:    quote.strike,
    timeYears: timeToExpiryYears(quote.expiry),
    rate:      RISK_FREE_RATE,
    divYield:  DIV_YIELD_DEFAULT,
  }), [spot, quote.strike, quote.expiry]);

  const bsResult = useMemo(
    () => bsPrice(quote.type, { ...bsInput, vol: vol / 100 }),
    [quote.type, bsInput, vol]
  );

  // Solve IV from market price once per contract load (mid preferred, close fallback)
  const ivResult = useMemo(() => {
    const marketPrice = quote.mid ?? quote.close;
    if (marketPrice === null || marketPrice === undefined || marketPrice <= 0) return null;
    return solveImpliedVol(quote.type, marketPrice, bsInput);
  }, [quote.type, quote.mid, quote.close, bsInput]);

  const ivPct = ivResult?.iv != null ? ivResult.iv * 100 : null;

  // Footnote switches when user vol differs from market IV by more than 0.5pp
  const showVolDivergenceNote = ivPct !== null && Math.abs(vol - ivPct) > 0.5;

  const handleMatchMarket = useCallback(() => {
    if (ivResult?.iv == null) return;
    const newBs = bsPrice(quote.type, { ...bsInput, vol: ivResult.iv });
    const direction = newBs.price >= bsResult.price ? "up" : "down";
    setVol(ivResult.iv * 100);
    if (divergenceScope.current && !reduced) {
      const { backgroundColor, transition } = priceFlash(direction);
      runDivergenceFlash(divergenceScope.current, { backgroundColor }, transition);
    }
  }, [ivResult, bsInput, quote.type, bsResult.price, divergenceScope, runDivergenceFlash, reduced]);

  const dte = Math.max(bsInput.timeYears * 365, 0).toFixed(1);

  // Rolling-number formatted values — animate when vol changes
  const fmtPrice = useRollingNumber(bsResult.price,  2, reduced);
  const fmtDelta = useRollingNumber(bsResult.delta,  4, reduced);
  const fmtGamma = useRollingNumber(bsResult.gamma,  4, reduced);
  const fmtTheta = useRollingNumber(bsResult.theta,  4, reduced);
  const fmtVega  = useRollingNumber(bsResult.vega,   4, reduced);
  const fmtRho   = useRollingNumber(bsResult.rho,    4, reduced);
  const fmtVanna = useRollingNumber(bsResult.vanna,  4, reduced);
  const fmtCharm = useRollingNumber(bsResult.charm,  4, reduced);

  const typeLabel = quote.type === "call" ? "C" : "P";

  return (
    <motion.div
      className="w-[360px] border-l border-edge pl-6 flex flex-col h-full"
      variants={panelVariants}
      initial={reduced ? false : "initial"}
      animate="animate"
    >
      {/* CLOSE — stable, outside the crossfade */}
      <div className="flex justify-end mb-4 pt-0.5">
        <button
          onClick={onClose}
          className="label-caps text-label hover:text-accent transition-colors duration-[100ms] cursor-pointer"
        >
          CLOSE
        </button>
      </div>

      {/* Content — crossfades when contract changes */}
      <AnimatePresence mode="wait">
        <motion.div
          key={quote.symbol}
          className="flex flex-col gap-6 overflow-y-auto pb-6"
          initial={reduced ? false : "initial"}
          animate="animate"
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
          variants={contentWrap}
        >

          {/* 1 · Header + MODEL INPUTS ──────────────────────────────────── */}
          <motion.div variants={section} className="flex flex-col gap-4">
            {/* Header */}
            <div>
              <span className="label-caps">{quote.underlying}{" "}</span>
              <span className="num text-base text-[#E7E7EA] font-medium">
                {fmtStrike(quote.strike)}
              </span>
              <span className="label-caps text-base text-[#E7E7EA]"> {typeLabel}</span>
              <span className="label-caps"> · {fmtExpiry(quote.expiry)}</span>
            </div>

            {/* MODEL INPUTS */}
            <div>
              <BlockHeader>MODEL INPUTS</BlockHeader>
              <div className="border-t border-edge">
                <Row label="SPOT">
                  <span className="num text-sm text-[#E7E7EA]">{spot.toFixed(2)}</span>
                </Row>
                <Row label="STRIKE">
                  <span className="num text-sm text-[#E7E7EA]">{fmtStrike(quote.strike)}</span>
                </Row>
                <Row label="DTE">
                  <span className="num text-sm text-[#E7E7EA]">{dte}</span>
                </Row>
                <Row label="RATE">
                  <span className="num text-sm text-[#E7E7EA]">
                    {(RISK_FREE_RATE * 100).toFixed(2)}%
                  </span>
                </Row>
                <Row label="DIV YIELD">
                  <span className="num text-sm text-[#E7E7EA]">
                    {(DIV_YIELD_DEFAULT * 100).toFixed(2)}%
                  </span>
                </Row>
                <Row label="VOL">
                  <div className="flex items-center gap-1">
                    <VolInput value={vol} onChange={setVol} />
                    <span className="label-caps">%</span>
                  </div>
                </Row>
              </div>
              {ivPct !== null && (
                <div className="mt-2">
                  <button
                    onClick={handleMatchMarket}
                    className="label-caps text-accent hover:opacity-70 transition-opacity duration-[100ms] cursor-pointer"
                  >
                    MATCH MARKET
                  </button>
                </div>
              )}
              <p className="label-caps text-label mt-2 leading-relaxed">
                {showVolDivergenceNote && ivPct !== null
                  ? `Model at your vol. Market implies ${ivPct.toFixed(1)}%.`
                  : "Vol is your input — the model prices YOUR vol."}
              </p>
            </div>
          </motion.div>

          {/* 2 · MODEL ──────────────────────────────────────────────────── */}
          <motion.div variants={section} className="border-t border-edge pt-6">
            <BlockHeader>MODEL</BlockHeader>
            <p className="label-caps mb-1">THEORETICAL PRICE</p>
            <p className="num text-2xl text-[#E7E7EA] mb-4">${fmtPrice}</p>
            <GreeksGrid
              fmtDelta={fmtDelta}
              fmtGamma={fmtGamma}
              fmtTheta={fmtTheta}
              fmtVega={fmtVega}
              fmtRho={fmtRho}
              fmtVanna={fmtVanna}
              fmtCharm={fmtCharm}
            />
          </motion.div>

          {/* 3 · MARKET ─────────────────────────────────────────────────── */}
          <motion.div variants={section} className="border-t border-edge pt-6">
            <BlockHeader>MARKET</BlockHeader>
            <div className="border-t border-edge">
              <Row label="BID">
                <span className={`num text-sm ${quote.bid !== null ? "text-pos" : "text-label"}`}>
                  {quote.bid !== null ? quote.bid.toFixed(2) : "—"}
                </span>
              </Row>
              <Row label="MID">
                <span className={`num text-sm ${quote.mid !== null ? "text-[#E7E7EA]" : "text-label"}`}>
                  {quote.mid !== null ? quote.mid.toFixed(2) : "—"}
                </span>
              </Row>
              <Row label="ASK">
                <span className={`num text-sm ${quote.ask !== null ? "text-neg" : "text-label"}`}>
                  {quote.ask !== null ? quote.ask.toFixed(2) : "—"}
                </span>
              </Row>
              <Row label="LAST">
                <span className={`num text-sm ${quote.last !== null ? "text-[#E7E7EA]" : "text-label"}`}>
                  {quote.last !== null ? quote.last.toFixed(2) : "—"}
                </span>
              </Row>
              <Row label="VOLUME">
                <span className={`num text-sm ${quote.volume > 0 ? "text-[#E7E7EA]" : "text-label"}`}>
                  {quote.volume > 0 ? quote.volume.toLocaleString("en-US") : "—"}
                </span>
              </Row>
              <Row label="IMPLIED VOL">
                <span
                  className={`num text-sm ${ivPct !== null ? "text-[#E7E7EA]" : "text-label"}`}
                  title={ivResult?.reason ? `IV solver: ${ivResult.reason}` : undefined}
                >
                  {ivPct !== null ? `${ivPct.toFixed(1)}%` : "—"}
                </span>
              </Row>
            </div>
          </motion.div>

          {/* 4 · DIVERGENCE + footer ────────────────────────────────────── */}
          <motion.div variants={section} className="border-t border-edge pt-6">
            <div ref={divergenceScope}>
              <DivergenceRow
                modelPrice={bsResult.price}
                quote={quote}
                userVolPct={vol}
                ivPct={ivPct}
              />
            </div>
            <p className="label-caps text-label mt-5 leading-relaxed">
              Delayed data · American-exercise contract priced with a European
              model — expect small systematic divergence.
            </p>
          </motion.div>

        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
