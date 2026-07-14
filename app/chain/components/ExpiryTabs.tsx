"use client";

interface Props {
  expiries: string[];
  selected: string;
  onSelect: (expiry: string) => void;
}

function fmtExpiry(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d
    .toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    .toUpperCase();
}

export default function ExpiryTabs({ expiries, selected, onSelect }: Props) {
  return (
    <div className="flex gap-6 border-b border-edge">
      {expiries.map((exp) => {
        const active = exp === selected;
        return (
          <button
            key={exp}
            onClick={() => onSelect(exp)}
            className={[
              "label-caps pb-2 transition-colors cursor-pointer",
              active
                ? "text-accent border-b border-accent -mb-px"
                : "text-label hover:text-[#E7E7EA]",
            ].join(" ")}
          >
            {fmtExpiry(exp)}
          </button>
        );
      })}
    </div>
  );
}
