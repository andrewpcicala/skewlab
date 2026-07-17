"use client";
import { useEffect } from "react";

export default function Prewarm() {
  useEffect(() => {
    fetch("/api/chain?symbol=SPY").catch(() => {});
    fetch("/api/surface?symbol=SPY").catch(() => {});
  }, []);
  return null;
}
