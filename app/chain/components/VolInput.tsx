"use client";
import { useState, useEffect } from "react";

interface Props {
  value: number;   // percent, e.g. 20.0
  onChange: (v: number) => void;
}

export default function VolInput({ value, onChange }: Props) {
  const [raw, setRaw] = useState(value.toFixed(1));
  const [focused, setFocused] = useState(false);

  // Keep raw text in sync when value changes externally (e.g. contract switch)
  useEffect(() => {
    if (!focused) setRaw(value.toFixed(1));
  }, [value, focused]);

  function commit(str: string) {
    const n = parseFloat(str);
    if (!isNaN(n) && n >= 0.1 && n <= 200) {
      onChange(Math.round(n * 10) / 10);
    } else {
      setRaw(value.toFixed(1)); // revert to last valid
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className={[
        "num text-sm text-right bg-transparent outline-none w-14",
        "border-b transition-colors duration-[100ms]",
        focused ? "border-accent text-[#E7E7EA]" : "border-edge text-[#E7E7EA]",
      ].join(" ")}
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => { setFocused(false); commit(e.target.value); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") { commit(raw); (e.target as HTMLInputElement).blur(); }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          onChange(Math.round(Math.min(200, value + 0.5) * 10) / 10);
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          onChange(Math.round(Math.max(0.1, value - 0.5) * 10) / 10);
        }
      }}
    />
  );
}
