"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/",         label: "SURFACE",  extra: "/surface" },
  { href: "/chain",    label: "CHAIN",    extra: undefined },
  { href: "/findings", label: "FINDINGS", extra: undefined },
  { href: "/paper",    label: "PAPER",    extra: undefined },
] as const;

export default function NavLinks() {
  const pathname = usePathname();
  return (
    <div className="flex gap-6">
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
    </div>
  );
}
