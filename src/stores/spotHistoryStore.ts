import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type SpotCurrency = "ZAR" | "USD";

export type SpotHistoryPoint = {
  dayTs: number; // midnight local timestamp for the day
  currency: SpotCurrency;
  silverPerOz: number;
  source?: string;
  updatedAt: number;
};

type SpotHistoryState = {
  points: SpotHistoryPoint[];
  upsertDaily: (p: Omit<SpotHistoryPoint, "dayTs"> & { dayTs?: number }) => void;
  clear: () => void;
};

function startOfDayTs(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const useSpotHistoryStore = create<SpotHistoryState>()(
  persist(
    (set, get) => ({
      points: [],

      upsertDaily: (p) => {
        const now = Date.now();
        const dayTs = typeof p.dayTs === "number" ? p.dayTs : startOfDayTs(now);

        if (!Number.isFinite(p.silverPerOz) || p.silverPerOz <= 0) return;

        const key = `${p.currency}:${dayTs}`;

        set((state) => {
          const next = state.points.slice();
          const idx = next.findIndex(
            (x) => `${x.currency}:${x.dayTs}` === key
          );

          const row: SpotHistoryPoint = {
            dayTs,
            currency: p.currency,
            silverPerOz: p.silverPerOz,
            source: p.source,
            updatedAt: now,
          };

          if (idx === -1) next.push(row);
          else next[idx] = { ...next[idx], ...row };

          // keep it tidy (sort + cap)
          next.sort((a, b) => a.dayTs - b.dayTs);
          const CAP = 3660; // ~10 years daily points
          const trimmed = next.length > CAP ? next.slice(next.length - CAP) : next;

          return { points: trimmed };
        });
      },

      clear: () => set({ points: [] }),
    }),
    {
      name: "stackd:spotHistory",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persisted: any) => persisted,
      partialize: (s) => ({ points: s.points }),
    }
  )
);
