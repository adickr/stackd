// src/stores/spotStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { fetchSilverPerOz } from "../services/spot";
import type { DisplayCurrency } from "./settingsStore";

// ✅ These should match what fetchSilverPerOz supports.
const SUPPORTED_CURRENCIES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP"];

// Troy ounce -> grams
const TROY_OZ_TO_G = 31.1034768;

export type SpotHistoryPoint = {
  t: number; // day start (ms)

  // backwards compat
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

  // ✅ NEW: currency -> perGram
  silverPerGramByCurrency: Record<string, number>;

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
 */
function sanitizeNumMap(input: unknown): Record<string, number> {
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
    const by = sanitizeNumMap((raw as any)?.by);

    if (!Number.isFinite(t) || t <= 0) continue;

    out.push({
      t,
      usdPerOz: Number.isFinite(usdPerOz) && usdPerOz > 0 ? usdPerOz : 0,
      zarPerOz: Number.isFinite(zarPerOz) && zarPerOz > 0 ? zarPerOz : 0,
      by: Object.keys(by).length ? by : undefined,
    });
  }

  out.sort((a, b) => a.t - b.t);
  const MAX = 365;
  return out.length > MAX ? out.slice(out.length - MAX) : out;
}

function perOzToPerGram(perOz: number) {
  if (!Number.isFinite(perOz) || perOz <= 0) return 0;
  return perOz / TROY_OZ_TO_G;
}

export const useSpotStore = create<SpotState>()(
  persist(
    (set, get) => ({
      silverZarPerOz: 0,
      silverUsdPerOz: 0,

      silverPerOzByCurrency: {},
      silverPerGramByCurrency: {},

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

          const mapPerOz: Record<string, number> = {};
          const mapPerG: Record<string, number> = {};
          let fetchedAt = 0;

          for (const r of results) {
            if (Number.isFinite(r.perOz) && r.perOz > 0) {
              mapPerOz[r.c] = r.perOz;

              const pg = perOzToPerGram(r.perOz);
              if (Number.isFinite(pg) && pg > 0) mapPerG[r.c] = pg;
            }
            fetchedAt = Math.max(fetchedAt, r.fetchedAt || 0);
          }

          const today = dayStart(Date.now());

          const usd = mapPerOz["USD"] ?? get().silverUsdPerOz;
          const zar = mapPerOz["ZAR"] ?? get().silverZarPerOz;

          set((state) => {
            const prevOz = sanitizeNumMap(state.silverPerOzByCurrency);
            const prevG = sanitizeNumMap(state.silverPerGramByCurrency);

            const nextOz = { ...prevOz, ...mapPerOz };
            const nextG = { ...prevG, ...mapPerG };

            return {
              ...state,
              silverUsdPerOz: usd,
              silverZarPerOz: zar,
              silverPerOzByCurrency: nextOz,
              silverPerGramByCurrency: nextG,
              fetchedAt: fetchedAt || state.fetchedAt,
              isLoading: false,
              error: null,
              history: upsertDailyPoint(state.history, {
                t: today,
                usdPerOz: usd,
                zarPerOz: zar,
                by: mapPerOz,
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
      version: 3,
      migrate: (persisted: any) => {
        const silverPerOzByCurrency = sanitizeNumMap(persisted?.silverPerOzByCurrency);
        const silverPerGramByCurrency = sanitizeNumMap(persisted?.silverPerGramByCurrency);

        const history = sanitizeHistory(persisted?.history);

        const silverUsdPerOz = Number(persisted?.silverUsdPerOz ?? 0);
        const silverZarPerOz = Number(persisted?.silverZarPerOz ?? 0);
        const fetchedAt = persisted?.fetchedAt ?? null;

        // Backfill per-gram map from per-oz if missing (one-time)
        const nextPerGram =
          Object.keys(silverPerGramByCurrency).length > 0
            ? silverPerGramByCurrency
            : Object.fromEntries(
                Object.entries(silverPerOzByCurrency)
                  .map(([k, v]) => [k, perOzToPerGram(v)])
                  .filter(([, v]) => typeof v === "number" && v > 0)
              );

        return {
          silverUsdPerOz: Number.isFinite(silverUsdPerOz) ? silverUsdPerOz : 0,
          silverZarPerOz: Number.isFinite(silverZarPerOz) ? silverZarPerOz : 0,
          silverPerOzByCurrency,
          silverPerGramByCurrency: nextPerGram,
          fetchedAt: typeof fetchedAt === "number" ? fetchedAt : null,
          history,
        };
      },
      partialize: (s) => ({
        silverZarPerOz: s.silverZarPerOz,
        silverUsdPerOz: s.silverUsdPerOz,
        silverPerOzByCurrency: s.silverPerOzByCurrency,
        silverPerGramByCurrency: s.silverPerGramByCurrency,
        fetchedAt: s.fetchedAt,
        history: s.history,
      }),
    }
  )
);
