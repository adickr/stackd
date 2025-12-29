// src/stores/spotStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { fetchSilverPerOz } from "../services/spot";

export type SpotHistoryPoint = {
  t: number; // day start (ms)
  zarPerOz: number;
  usdPerOz: number;
};

type SpotState = {
  silverZarPerOz: number;
  silverUsdPerOz: number;
  fetchedAt: number | null;
  isLoading: boolean;

  // ✅ for UI states
  error: string | null;

  // ✅ needed for the line chart
  history: SpotHistoryPoint[];

  refreshSpot: () => Promise<void>;
  clearError: () => void;
};

function dayStart(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function upsertDailyPoint(history: SpotHistoryPoint[], point: SpotHistoryPoint) {
  const idx = history.findIndex((p) => p.t === point.t);

  if (idx >= 0) {
    const next = history.slice();
    next[idx] = point;
    return next;
  }

  const next = [...history, point].sort((a, b) => a.t - b.t);
  const MAX = 365;
  return next.length > MAX ? next.slice(next.length - MAX) : next;
}

function normalizeError(err: unknown) {
  if (!err) return "Unknown error";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "Request failed";
  try {
    return JSON.stringify(err);
  } catch {
    return "Request failed";
  }
}

export const useSpotStore = create<SpotState>()(
  persist(
    (set, get) => ({
      silverZarPerOz: 0,
      silverUsdPerOz: 0,
      fetchedAt: null,
      isLoading: false,
      error: null,
      history: [],

      clearError: () => set({ error: null }),

      refreshSpot: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, error: null });

        try {
          // Fetch both so switching currency is instant + history supports both
          const [zar, usd] = await Promise.all([
            fetchSilverPerOz("ZAR"),
            fetchSilverPerOz("USD"),
          ]);

          const now = Date.now();
          const today = dayStart(now);

          set((state) => ({
            ...state,
            silverZarPerOz: zar.perOz,
            silverUsdPerOz: usd.perOz,
            fetchedAt: Math.max(zar.fetchedAt, usd.fetchedAt),
            isLoading: false,
            error: null,
            history: upsertDailyPoint(state.history, {
              t: today,
              zarPerOz: zar.perOz,
              usdPerOz: usd.perOz,
            }),
          }));
        } catch (err) {
          // keep existing values, just stop loading + store error
          set({ isLoading: false, error: normalizeError(err) });
          console.warn("refreshSpot failed:", err);
        }
      },
    }),
    {
      name: "spot-store",
      storage: createJSONStorage(() => AsyncStorage),

      partialize: (s) => ({
        silverZarPerOz: s.silverZarPerOz,
        silverUsdPerOz: s.silverUsdPerOz,
        fetchedAt: s.fetchedAt,
        history: s.history,
      }),
    }
  )
);
