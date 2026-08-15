import { create } from "zustand";
import type { MegaId } from "../data/site";

interface AppState {
  navOpen: boolean;
  mega: MegaId | null;
  setNavOpen: (open: boolean) => void;
  setMega: (mega: MegaId | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  navOpen: false,
  mega: null,
  setNavOpen: (navOpen) => set({ navOpen, mega: navOpen ? get().mega : null }),
  setMega: (mega) => set({ mega }),
}));
