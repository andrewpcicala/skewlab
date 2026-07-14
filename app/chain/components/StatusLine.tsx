interface Props {
  dataQuality: "live" | "delayed" | "eod";
  quoteBasis: "mid" | "close";
  asOf: string;
  truncated: boolean;
}

export default function StatusLine({ dataQuality, quoteBasis, asOf, truncated }: Props) {
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

  return <span className="label-caps">{parts.join(" · ")}</span>;
}
