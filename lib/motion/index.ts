"use client";

// Motion System: fewer, flawless. Durations 200–400ms, ease-out or stiff
// springs, nothing bounces, nothing loops. All motion collapses to instant
// states under prefers-reduced-motion.

import { useReducedMotion, type Variants, type Transition } from "framer-motion";

export const EASE_OUT: [number, number, number, number] = [0.22, 1, 0.36, 1];

export const SPRING_PANEL: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 40,
  mass: 1,
};

// Rows animate once on first load only, never on data refresh.
export function tableRowVariants(index: number): Variants {
  return {
    initial: { opacity: 0, y: 4 },
    animate: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.25,
        delay: index * 0.02,
        ease: EASE_OUT,
      },
    },
  };
}

export const panelVariants: Variants = {
  initial: { opacity: 0, x: 16 },
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      ...SPRING_PANEL,
      staggerChildren: 0.05,
    },
  },
};

export function priceFlash(direction: "up" | "down") {
  const color =
    direction === "up"
      ? "rgba(34, 197, 94, 0.08)"  // pos at 8% opacity
      : "rgba(239, 68, 68, 0.08)"; // neg at 8% opacity
  return {
    backgroundColor: [color, "transparent"],
    transition: { duration: 0.6, ease: EASE_OUT },
  };
}

export const NUMBER_ROLL_DURATION = 0.3;

export function useMotionSafe(): { reduced: boolean } {
  const reduced = useReducedMotion();
  return { reduced: reduced ?? false };
}
