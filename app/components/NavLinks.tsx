"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

const NAV_LINKS = [
  { href: "/",         label: "SURFACE",  extra: "/surface" },
  { href: "/chain",    label: "CHAIN",    extra: undefined },
  { href: "/findings", label: "FINDINGS", extra: undefined },
  { href: "/paper",    label: "PAPER",    extra: undefined },
] as const;

// Ticker-aware pages that should carry ?s= when navigating between them
const TICKER_BASES = new Set(["/", "/chain"]);

function NavLinksInner() {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const ticker       = searchParams.get("s");

  function buildHref(base: string) {
    return ticker && TICKER_BASES.has(base) ? `${base}?s=${ticker}` : base;
  }

  return (
    <div className="flex items-center gap-6">
      {NAV_LINKS.map(({ href, label, extra }) => {
        const isActive =
          pathname === href ||
          (href !== "/" && pathname.startsWith(href + "/")) ||
          (extra !== undefined && (pathname === extra || pathname.startsWith(extra + "/")));
        return (
          <Link
            key={label}
            href={buildHref(href)}
            className={`label-caps transition-colors ${isActive ? "text-accent" : "text-label"}`}
          >
            {label}
          </Link>
        );
      })}
      {/* ⌘K affordance — hidden on mobile */}
      <span
        className="num cmd-k-hint"
        style={{ fontSize: "11px", color: "var(--color-label)", letterSpacing: "0.04em" }}
      >
        ⌘K
      </span>
    </div>
  );
}

// Fallback: same links without ?s= preservation (used during SSR of static pages)
function NavLinksFallback() {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-6">
      {NAV_LINKS.map(({ href, label, extra }) => {
        const isActive =
          pathname === href ||
          (href !== "/" && pathname.startsWith(href + "/")) ||
          (extra !== undefined && (pathname === extra || pathname.startsWith(extra + "/")));
        return (
          <Link
            key={label}
            href={href}
            className={`label-caps transition-colors ${isActive ? "text-accent" : "text-label"}`}
          >
            {label}
          </Link>
        );
      })}
      <span
        className="num cmd-k-hint"
        style={{ fontSize: "11px", color: "var(--color-label)", letterSpacing: "0.04em" }}
      >
        ⌘K
      </span>
    </div>
  );
}

export default function NavLinks() {
  return (
    <Suspense fallback={<NavLinksFallback />}>
      <NavLinksInner />
    </Suspense>
  );
}
