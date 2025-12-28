// src/stores/coinStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoinType } from "../domain/coinType";

type CoinState = {
  coins: CoinType[];
  seedIfEmpty: () => void; // now means "ensure seeded"
  getCoin: (id?: string) => CoinType | undefined;
  upsertCoin: (coin: CoinType) => void;

  // NEW
  createCoin: (input: Omit<CoinType, "id" | "createdAt"> & { id?: string }) => CoinType;

  searchCoins: (query: string) => CoinType[];
  clearAll: () => void;
};

const now = () => Date.now();

function makeId(prefix = "custom") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function validateCoinInput(c: Pick<CoinType, "name" | "purity" | "fineWeightGrams">) {
  if (!c.name.trim()) throw new Error("Name is required.");
  if (!Number.isFinite(c.purity) || c.purity <= 0 || c.purity > 1) {
    throw new Error("Purity must be between 0 and 1 (e.g. 0.999).");
  }
  if (!Number.isFinite(c.fineWeightGrams) || c.fineWeightGrams <= 0) {
    throw new Error("Fine weight must be greater than 0.");
  }
  // sanity cap (50kg fine silver per unit is enough for MVP)
  if (c.fineWeightGrams > 50_000) throw new Error("Fine weight seems too large.");
}

/**
 * Seed library:
 * - fineWeightGrams = fine silver grams
 * - Most bullion 1 oz = 31.1035g (1 troy oz)
 */
const seedCoins: CoinType[] = [
  // ... your seed list unchanged ...
];

function mergeSeeds(existing: CoinType[]) {
  const byId = new Map<string, CoinType>();
  for (const c of existing) byId.set(c.id, c);
  for (const s of seedCoins) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  const seedIds = new Set(seedCoins.map((c) => c.id));
  const seedsInOrder = seedCoins.map((s) => byId.get(s.id)!).filter(Boolean);
  const extras = Array.from(byId.values()).filter((c) => !seedIds.has(c.id));
  return [...seedsInOrder, ...extras];
}

export const useCoinStore = create<CoinState>()(
  persist(
    (set, get) => ({
      coins: [],

      seedIfEmpty: () => {
        const existing = get().coins;
        if (!existing || existing.length === 0) {
          set({ coins: seedCoins });
          return;
        }
        const merged = mergeSeeds(existing);
        if (merged.length !== existing.length) {
          set({ coins: merged });
        }
      },

      getCoin: (id) => (id ? get().coins.find((c) => c.id === id) : undefined),

      upsertCoin: (coin) =>
        set((state) => {
          const idx = state.coins.findIndex((c) => c.id === coin.id);
          if (idx === -1) return { coins: [coin, ...state.coins] };
          const next = state.coins.slice();
          next[idx] = { ...next[idx], ...coin };
          return { coins: next };
        }),

      // NEW: create + upsert with validation
      createCoin: (input) => {
        const coin: CoinType = {
          id: input.id ?? makeId("custom"),
          createdAt: now(),
          ...input,
          name: input.name.trim().replace(/\s+/g, " "),
          purity: clamp(input.purity, 0, 1),
          fineWeightGrams: clamp(input.fineWeightGrams, 0, 50_000),
        };

        validateCoinInput(coin);
        get().upsertCoin(coin);
        return coin;
      },

      searchCoins: (query) => {
        const q = norm(query);
        if (!q) return get().coins;

        return get().coins.filter((c) => {
          const hay = norm(
            `${c.name} ${c.metal} ${c.purity} ${c.fineWeightGrams} ${c.diameterMm ?? ""} ${c.thicknessMm ?? ""} ${
              (c.hallmarks ?? []).join(" ")
            } ${c.notes ?? ""}`
          );
          return hay.includes(q);
        });
      },

      clearAll: () => set({ coins: [] }),
    }),
    {
      name: "stackd:coins",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3,
      migrate: (persisted: any) => {
        const existing: CoinType[] = Array.isArray(persisted)
          ? persisted
          : Array.isArray(persisted?.coins)
            ? persisted.coins
            : [];

        return { coins: mergeSeeds(existing) };
      },
      partialize: (state) => ({ coins: state.coins }),
    }
  )
);
