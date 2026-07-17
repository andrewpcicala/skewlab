"use client";
// template.tsx re-renders on every navigation (unlike layout.tsx which persists).
// This gives us a per-route mount point for the page crossfade without needing
// AnimatePresence at the layout level.
import { motion } from "framer-motion";
import { EASE_OUT, useMotionSafe } from "@/lib/motion";

export default function Template({ children }: { children: React.ReactNode }) {
  const { reduced } = useMotionSafe();
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15, ease: EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
