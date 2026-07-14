"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/chain", label: "CHAIN" },
  { href: "/surface", label: "SURFACE" },
  { href: "/findings", label: "FINDINGS" },
  { href: "/paper", label: "PAPER" },
] as const;

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="flex gap-6">
      {NAV_LINKS.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          className={`label-caps transition-colors ${
            pathname === href || pathname.startsWith(href + "/")
              ? "text-accent"
              : "text-label"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
