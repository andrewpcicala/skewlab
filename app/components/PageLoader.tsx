"use client";
// Shared full-page loading indicator used by all four top-level views.
// Three dots stagger-blink in sequence (1.2 s cycle, 0.4 s offset per dot).
// Reduced-motion: animation is suppressed via the .dot-blink rule in globals.css
// so the dots render as static text — no JS branching required here.

export default function PageLoader({ label }: { label: string }) {
  return (
    <div
      style={{
        height:         "70vh",
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
      }}
    >
      <span className="label-caps">
        {label}
        <span className="dot-blink" style={{ animation: "dot-blink 1.2s ease-in-out infinite", animationDelay: "0s"   }}>.</span>
        <span className="dot-blink" style={{ animation: "dot-blink 1.2s ease-in-out infinite", animationDelay: "0.4s" }}>.</span>
        <span className="dot-blink" style={{ animation: "dot-blink 1.2s ease-in-out infinite", animationDelay: "0.8s" }}>.</span>
      </span>
    </div>
  );
}
