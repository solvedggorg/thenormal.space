import type { Transition } from "motion/react";

export const easeOut = [0.16, 1, 0.3, 1] as const;
export const easeSoft = [0.22, 1, 0.36, 1] as const;

export const springSoft: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 34,
  mass: 0.85,
};

export const fadeUp = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0 },
};

export const fade = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export const lineReveal = {
  hidden: { y: "110%" },
  show: { y: "0%" },
};
