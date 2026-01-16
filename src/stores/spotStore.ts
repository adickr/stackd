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

  // generalized map: currency -> perOz (MUST be numbers only)
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

/**
 * 🛡️ Ensure persisted or incoming maps only contain finite positive numbers.
 * This prevents the exact TS/runtime issue you hit (objects ending up in the map).
 */
function sanitizePerOzMap(input: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!input || typeof input !== "object") return out;

  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

function sanitizeHistory(input: unknown): SpotHistoryPoint[] {
  if (!Array.isArray(input)) return [];

  const out: SpotHistoryPoint[] = [];
  for (const raw of input) {
    const t = Number((raw as any)?.t ?? 0);
    const usdPerOz = Number((raw as any)?.usdPerOz ?? 0);
    const zarPerOz = Number((raw as any)?.zarPerOz ?? 0);
    const by = sanitizePerOzMap((raw as any)?.by);

    if (!Number.isFinite(t) || t <= 0) continue;

    out.push({
      t,
      usdPerOz: Number.isFinite(usdPerOz) && usdPerOz > 0 ? usdPerOz : 0,
      zarPerOz: Number.isFinite(zarPerOz) && zarPerOz > 0 ? zarPerOz : 0,
      by: Object.keys(by).length ? by : undefined,
    });
  }

  // Ensure sorted and capped
  out.sort((a, b) => a.t - b.t);
  const MAX = 365;
  return out.length > MAX ? out.slice(out.length - MAX) : out;
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
            // defensive: only store good numbers
            if (Number.isFinite(r.perOz) && r.perOz > 0) {
              map[r.c] = r.perOz;
            }
            fetchedAt = Math.max(fetchedAt, r.fetchedAt || 0);
          }

          const today = dayStart(Date.now());

          // Keep old fields populated for existing UI
          const usd = map["USD"] ?? get().silverUsdPerOz;
          const zar = map["ZAR"] ?? get().silverZarPerOz;

          set((state) => {
            const prevClean = sanitizePerOzMap(state.silverPerOzByCurrency);
            const nextMap = { ...prevClean, ...map };

            return {
              ...state,
              silverUsdPerOz: usd,
              silverZarPerOz: zar,
              silverPerOzByCurrency: nextMap,
              fetchedAt: fetchedAt || state.fetchedAt,
              isLoading: false,
              error: null,
              history: upsertDailyPoint(state.history, {
                t: today,
                usdPerOz: usd,
                zarPerOz: zar,
                by: map,
              }),
            };
          });
        } catch (err) {
          set({ isLoading: false, error: normalizeError(err) });
          console.warn("refreshSpot failed:", err);
        }
      },
    }),
    {
      name: "spot-store",
      storage: createJSONStorage(() => AsyncStorage),
      version: 2,
      migrate: (persisted: any) => {
        // sanitize any old/bad persisted values
        const silverPerOzByCurrency = sanitizePerOzMap(
          persisted?.silverPerOzByCurrency
        );
        const history = sanitizeHistory(persisted?.history);

        const silverUsdPerOz = Number(persisted?.silverUsdPerOz ?? 0);
        const silverZarPerOz = Number(persisted?.silverZarPerOz ?? 0);
        const fetchedAt = persisted?.fetchedAt ?? null;

        return {
          silverUsdPerOz: Number.isFinite(silverUsdPerOz) ? silverUsdPerOz : 0,
          silverZarPerOz: Number.isFinite(silverZarPerOz) ? silverZarPerOz : 0,
          silverPerOzByCurrency,
          fetchedAt: typeof fetchedAt === "number" ? fetchedAt : null,
          history,
        };
      },
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
