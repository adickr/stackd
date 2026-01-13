// src/stores/spotStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { fetchSilverPerOz } from "../services/spot";
import type { DisplayCurrency } from "./settingsStore";

// ✅ These should match what fetchSilverPerOz supports.
const SUPPORTED_CURRENCIES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP"];

export type SpotHistoryPoint = {
  t: number; // day start (ms)

  // keep existing fields for your chart/backwards compat
  zarPerOz: number;
  usdPerOz: number;

  // optional extension for additional currencies
  by?: Record<string, number>;
};

type SpotState = {
  silverZarPerOz: number;
  silverUsdPerOz: number;

  // generalized map: currency -> perOz
  silverPerOzByCurrency: Record<string, number>;

  fetchedAt: number | null;
  isLoading: boolean;

  error: string | null;

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
      silverPerOzByCurrency: {},

      fetchedAt: null,
      isLoading: false,
      error: null,
      history: [],

      clearError: () => set({ error: null }),

      refreshSpot: async () => {
        if (get().isLoading) return;
        set({ isLoading: true, error: null });

        try {
          const results = await Promise.all(
            SUPPORTED_CURRENCIES.map(async (c) => {
              const res = await fetchSilverPerOz(c);
              return { c, perOz: res.perOz, fetchedAt: res.fetchedAt };
            })
          );

          const map: Record<string, number> = {};
          let fetchedAt = 0;

          for (const r of results) {
            map[r.c] = r.perOz;
            fetchedAt = Math.max(fetchedAt, r.fetchedAt);
          }

          const now = Date.now();
          const today = dayStart(now);

          // Keep old fields populated for existing UI
          const usd = map["USD"] ?? get().silverUsdPerOz;
          const zar = map["ZAR"] ?? get().silverZarPerOz;

          set((state) => ({
            ...state,
            silverUsdPerOz: usd,
            silverZarPerOz: zar,
            silverPerOzByCurrency: {
              ...state.silverPerOzByCurrency,
              ...map,
            },
            fetchedAt: fetchedAt || state.fetchedAt,
            isLoading: false,
            error: null,
            history: upsertDailyPoint(state.history, {
              t: today,
              usdPerOz: usd,
              zarPerOz: zar,
              by: map, // includes EUR/GBP too now
            }),
          }));
        } catch (err) {
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
        silverPerOzByCurrency: s.silverPerOzByCurrency,
        fetchedAt: s.fetchedAt,
        history: s.history,
      }),
    }
  )
);
