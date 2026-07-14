"use client";
import { useState } from "react";

interface Props {
  onSubmit: (symbol: string) => void;
}

export default function TickerInput({ onSubmit }: Props) {
  const [value, setValue] = useState("SPY");

  return (
    <input
      value={value}
      onChange={(e) => setValue(e.target.value.toUpperCase())}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          const s = value.trim();
          if (/^[A-Z]{1,5}$/.test(s)) onSubmit(s);
        }
      }}
      maxLength={5}
      spellCheck={false}
      autoCapitalize="characters"
      className="num bg-transparent border-b border-edge text-[#E7E7EA] outline-none focus:border-accent transition-colors text-xl tracking-[0.18em] pb-0.5 w-36"
    />
  );
}
