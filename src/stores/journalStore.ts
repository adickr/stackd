import { create } from "zustand";
import { persist } from "zustand/middleware";

export type JournalAnchor = {
  id: string;
  createdAt: number;

  // Snapshot summary
  totalFineOz: number;
  spotPrice: number;
  spotFetchedAt: number;
  currency: "ZAR" | "USD";
  stackValue: number;

  levelName: string;
  levelVersion: string;

  // Verifiability
  inventoryHash: string;
  snapshotHash: string;

  // Wallet proof (mock for now)
  walletAddress: string;
  signature: string; // mock signature string
  signMessage: string;
};

type JournalState = {
  anchors: JournalAnchor[];
  addAnchor: (anchor: JournalAnchor) => void;
  reset: () => void;
};

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      anchors: [],
      addAnchor: (anchor) =>
        set((state) => ({ anchors: [...state.anchors, anchor] })),
      reset: () => set({ anchors: [] }),
    }),
    { name: "journal-store" }
  )
);
