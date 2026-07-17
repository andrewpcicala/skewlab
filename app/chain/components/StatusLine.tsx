"use client";

interface Props {
  dataQuality: "live" | "delayed" | "eod";
  quoteBasis:  "mid" | "close";
  asOf:        string;
  truncated:   boolean;
  isStale:     boolean;
  onRefresh:   () => void;
}

export default function StatusLine({
  dataQuality,
  quoteBasis,
  asOf,
  truncated,
  isStale,
  onRefresh,
}: Props) {
  const quality =
    dataQuality === "delayed" ? "DELAYED" :
    dataQuality === "eod"     ? "EOD"     : "LIVE";

  const time = new Date(asOf).toLocaleTimeString("en-US", {
    hour:   "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = [quality, `QUOTES: ${quoteBasis.toUpperCase()}`, `AS OF ${time}`];
  if (truncated) parts.push("PARTIAL CHAIN");

  return (
    <span className="label-caps">
      {parts.join(" · ")}
      {isStale && (
        <>
          {" · "}
          <button
            onClick={onRefresh}
            style={{
              background:    "none",
              border:        "none",
              padding:       0,
              cursor:        "pointer",
              fontSize:      "11px",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color:         "var(--color-accent)",
            }}
          >
            REFRESH
          </button>
        </>
      )}
    </span>
  );
}
