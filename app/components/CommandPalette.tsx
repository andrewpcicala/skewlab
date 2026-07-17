"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useMotionSafe } from "@/lib/motion";

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGES = ["SURFACE", "CHAIN", "FINDINGS", "PAPER"] as const;
type PageName = typeof PAGES[number];

const PAGE_HREFS: Record<PageName, string> = {
  SURFACE:  "/",
  CHAIN:    "/chain",
  FINDINGS: "/findings",
  PAPER:    "/paper",
};

const SHORTCUTS = [
  { key: "⌘K",   desc: "COMMAND PALETTE" },
  { key: "/",    desc: "OPEN PALETTE — WHEN UNFOCUSED" },
  { key: "← →",  desc: "SWITCH EXPIRY — CHAIN" },
  { key: "ESC",  desc: "CLOSE PANEL / PALETTE" },
  { key: "?",    desc: "THIS SHEET" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function currentPageName(pathname: string): PageName {
  if (pathname.startsWith("/chain"))    return "CHAIN";
  if (pathname.startsWith("/findings")) return "FINDINGS";
  if (pathname.startsWith("/paper"))    return "PAPER";
  return "SURFACE";
}

function buildPageHref(page: PageName, ticker?: string): string {
  const base = PAGE_HREFS[page];
  return ticker && (page === "SURFACE" || page === "CHAIN")
    ? `${base}?s=${ticker}`
    : base;
}

interface PaletteItem {
  label: string;
  href:  string;
}

function parseInput(raw: string): { ticker?: string; page?: PageName } {
  const tokens = raw.trim().toUpperCase().split(/\s+/).filter(Boolean);
  let ticker: string | undefined;
  let page:   PageName | undefined;
  for (const tok of tokens) {
    if ((PAGES as readonly string[]).includes(tok)) page   = tok as PageName;
    else if (/^[A-Z]{1,5}$/.test(tok))             ticker = tok;
  }
  return { ticker, page };
}

function buildResults(
  input:       string,
  activeTick:  string,
  activePage:  PageName,
): PaletteItem[] {
  const { ticker, page } = parseInput(input);

  if (!input.trim()) {
    const ordered: PageName[] = [
      activePage,
      ...PAGES.filter(p => p !== activePage),
    ];
    return ordered.map(p => ({ label: p, href: PAGE_HREFS[p] }));
  }

  if (ticker && page) {
    return [{ label: `${ticker} → ${page}`, href: buildPageHref(page, ticker) }];
  }

  if (page) {
    return [{ label: page, href: PAGE_HREFS[page] }];
  }

  if (ticker) {
    const tickerPages: PageName[] = ["SURFACE", "CHAIN"];
    const ordered: PageName[] = [
      ...(tickerPages.includes(activePage) ? [activePage] : []),
      ...tickerPages.filter(p => p !== activePage),
    ];
    return ordered.map(p => ({ label: `${ticker} → ${p}`, href: buildPageHref(p, ticker) }));
  }

  return [];
}

// ── Sheet wrapper ─────────────────────────────────────────────────────────────
// Shared visual container for palette and shortcuts.

function Sheet({
  visible,
  reduced,
  children,
}: {
  visible:  boolean;
  reduced:  boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position:        "fixed",
        top:             "20vh",
        left:            "50%",
        transform:       "translateX(-50%)",
        zIndex:          51,
        width:           "min(480px, 90vw)",
        border:          "1px solid var(--color-edge)",
        backgroundColor: "var(--color-card)",
        opacity:         visible ? 1 : 0,
        transition:      reduced ? "none" : "opacity 0.15s",
      }}
    >
      {children}
    </div>
  );
}

// ── CommandPalette ────────────────────────────────────────────────────────────

type Mode = "palette" | "shortcuts" | null;

export default function CommandPalette() {
  const { reduced } = useMotionSafe();
  const router      = useRouter();
  const pathname    = usePathname();

  const [mode,        setMode]        = useState<Mode>(null);
  const [visible,     setVisible]     = useState(false);
  const [input,       setInput]       = useState("");
  const [cursor,      setCursor]      = useState(0);
  const [activeTick,  setActiveTick]  = useState("SPY");

  const inputRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const activePage = currentPageName(pathname);
  const results    = buildResults(input, activeTick, activePage).slice(0, 5);

  const open = useCallback((nextMode: Mode) => {
    const s = new URLSearchParams(window.location.search).get("s");
    setActiveTick((s ?? "SPY").toUpperCase());
    setInput("");
    setCursor(0);
    setMode(nextMode);
    setVisible(true);
    if (nextMode === "palette") {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, []);

  const close = useCallback(() => {
    if (reduced) {
      setMode(null);
      setVisible(false);
      return;
    }
    setVisible(false);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setMode(null), 150);
  }, [reduced]);

  const navigate = useCallback((href: string) => {
    close();
    router.push(href);
  }, [close, router]);

  // Global keyboard handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K — toggle palette
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (mode) close(); else open("palette");
        return;
      }

      const tag = (document.activeElement as HTMLElement)?.tagName;
      const focused = tag === "INPUT" || tag === "TEXTAREA";

      // "/" — open palette when nothing focused
      if (e.key === "/" && !mode && !focused) {
        e.preventDefault();
        open("palette");
        return;
      }

      // "?" — open shortcuts when nothing focused
      if (e.key === "?" && !mode && !focused) {
        e.preventDefault();
        open("shortcuts");
        return;
      }

      if (!mode) return;

      if (e.key === "Escape") { close(); return; }

      if (mode === "palette") {
        if (e.key === "ArrowDown") { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
        if (e.key === "Enter" && results[cursor]) { e.preventDefault(); navigate(results[cursor].href); }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, open, close, navigate, cursor, results]);

  // Reset cursor when input changes
  useEffect(() => { setCursor(0); }, [input]);

  if (!mode) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position:        "fixed",
          inset:           0,
          zIndex:          50,
          backgroundColor: "rgba(10, 10, 12, 0.6)",
          opacity:         visible ? 1 : 0,
          transition:      reduced ? "none" : "opacity 0.15s",
        }}
      />

      {/* ── Palette mode ──────────────────────────────────────────────────── */}
      {mode === "palette" && (
        <Sheet visible={visible} reduced={reduced}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            placeholder="TICKER OR PAGE..."
            spellCheck={false}
            className="num"
            style={{
              width:        "100%",
              background:   "transparent",
              border:       "none",
              borderBottom: results.length ? "1px solid var(--color-edge)" : "none",
              outline:      "none",
              fontSize:     "16px",
              color:        "#E7E7EA",
              padding:      "14px 16px",
              letterSpacing:"0.08em",
              boxSizing:    "border-box",
            }}
          />
          {results.map((item, i) => (
            <button
              key={item.href + i}
              onClick={() => navigate(item.href)}
              style={{
                display:       "block",
                width:         "100%",
                textAlign:     "left",
                background:    i === cursor ? "rgba(255,255,255,0.04)" : "transparent",
                border:        "none",
                borderBottom:  i < results.length - 1 ? "1px solid var(--color-edge)" : "none",
                padding:       "10px 16px",
                cursor:        "pointer",
                fontSize:      "11px",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color:         i === cursor ? "#E7E7EA" : "var(--color-label)",
              }}
            >
              {item.label}
            </button>
          ))}
        </Sheet>
      )}

      {/* ── Shortcuts mode ────────────────────────────────────────────────── */}
      {mode === "shortcuts" && (
        <Sheet visible={visible} reduced={reduced}>
          <div style={{ padding: "14px 16px 4px" }}>
            <span className="label-caps" style={{ color: "#E7E7EA" }}>KEYBOARD SHORTCUTS</span>
          </div>
          {SHORTCUTS.map(({ key, desc }, i) => (
            <div
              key={key}
              style={{
                display:      "flex",
                alignItems:   "baseline",
                gap:          "1rem",
                padding:      "10px 16px",
                borderTop:    "1px solid var(--color-edge)",
                ...(i === SHORTCUTS.length - 1 ? {} : {}),
              }}
            >
              <span
                className="num"
                style={{
                  fontSize:      "11px",
                  color:         "#E7E7EA",
                  letterSpacing: "0.08em",
                  minWidth:      "40px",
                }}
              >
                {key}
              </span>
              <span className="label-caps">{desc}</span>
            </div>
          ))}
        </Sheet>
      )}
    </>
  );
}
