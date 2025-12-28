import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fetchSilverPerOz } from "../services/spot";
import { useSettingsStore } from "./settingsStore";
import { useSpotHistoryStore } from "./spotHistoryStore";

type SpotState = {
  silverZarPerOz: number;
  silverUsdPerOz: number;

  fetchedAt?: number;
  source?: string;

  isLoading: boolean;
  error?: string;

  nextAllowedAt?: number; // cooldown until this timestamp

  refreshSpot: (opts?: { force?: boolean }) => Promise<void>;
  clear: () => void;
};

const TTL_MS = 60_000; // 60s: no refetch unless force
const COOLDOWN_MS = 15 * 60_000; // 15 min after rate-limit

const DEFAULTS: Pick<
  SpotState,
  | "silverZarPerOz"
  | "silverUsdPerOz"
  | "fetchedAt"
  | "source"
  | "isLoading"
  | "error"
  | "nextAllowedAt"
> = {
  silverZarPerOz: 0,
  silverUsdPerOz: 0,
  fetchedAt: undefined,
  source: undefined,
  isLoading: false,
  error: undefined,
  nextAllowedAt: undefined,
};

function isRateLimitMessage(msg: string) {
  return /rate limit|too many requests|429/i.test(msg);
}

export const useSpotStore = create<SpotState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      refreshSpot: async (opts) => {
        if (get().isLoading) return;

        const now = Date.now();

        // Cooldown guard (after a rate-limit hit)
        const nextAllowedAt = get().nextAllowedAt;
        if (!opts?.force && nextAllowedAt && now < nextAllowedAt) {
          const secs = Math.ceil((nextAllowedAt - now) / 1000);
          set({ error: `Rate-limited. Try again in ${secs}s.` });
          return;
        }

        // TTL cache guard
        const fetchedAt = get().fetchedAt;
        if (!opts?.force && fetchedAt && now - fetchedAt < TTL_MS) {
          return;
        }

        // Fetch only currently selected currency
        const currency = useSettingsStore.getState().currency as "ZAR" | "USD";

        set({ isLoading: true, error: undefined });

        try {
          const r = await fetchSilverPerOz(currency);

          // Persist daily history snapshot (one per day per currency)
          useSpotHistoryStore.getState().upsertDaily({
            currency,
            silverPerOz: r.perOz,
            source: r.source,
            updatedAt: Date.now(),
          });

          if (currency === "ZAR") {
            set({
              silverZarPerOz: r.perOz,
              fetchedAt: r.fetchedAt,
              source: r.source,
              isLoading: false,
              error: undefined,
              nextAllowedAt: undefined,
            });
          } else {
            set({
              silverUsdPerOz: r.perOz,
              fetchedAt: r.fetchedAt,
              source: r.source,
              isLoading: false,
              error: undefined,
              nextAllowedAt: undefined,
            });
          }
        } catch (e: any) {
          const msg = e?.message ?? "Failed to fetch spot";
          set({
            isLoading: false,
            error: msg,
            nextAllowedAt: isRateLimitMessage(msg) ? Date.now() + COOLDOWN_MS : undefined,
          });
        }
      },

      clear: () => set({ ...DEFAULTS }),
    }),
    {
      name: "stackd:spot",
      storage: createJSONStorage(() => AsyncStorage),
      version: 6,
      migrate: (persisted: any, version: number) => {
        if (!persisted) return { ...DEFAULTS };

        if (version === 1) {
          return {
            ...DEFAULTS,
            silverZarPerOz: Number(persisted.silverZarPerOz) || 0,
            fetchedAt: persisted.fetchedAt,
            source: persisted.source,
          };
        }

        return {
          ...DEFAULTS,
          ...persisted,
          isLoading: false,
          error: undefined,
          silverZarPerOz: Number(persisted.silverZarPerOz) || 0,
          silverUsdPerOz: Number(persisted.silverUsdPerOz) || 0,
        };
      },
    }
  )
);
