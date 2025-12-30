import { create } from "zustand";
import { persist } from "zustand/middleware";

export type JournalAnchor = {
  id: string;
  createdAt: number;
  totalValue: number;
  totalWeightOz: number;
  note?: string;
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
