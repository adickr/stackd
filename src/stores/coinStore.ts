import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoinType } from "../domain/coinType";

type CoinState = {
  coins: CoinType[];
  seedIfEmpty: () => void; // now means "ensure seeded"
  getCoin: (id?: string) => CoinType | undefined;
  upsertCoin: (coin: CoinType) => void;
  searchCoins: (query: string) => CoinType[];
  clearAll: () => void;
};

const now = () => Date.now();

/**
 * Seed library:
 * - fineWeightGrams = fine silver grams
 * - Most bullion 1 oz = 31.1035g (1 troy oz)
 */
const seedCoins: CoinType[] = [
  // ---------- "Big 4" ----------
  {
    id: "ase-1oz",
    name: "American Silver Eagle 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 40.6,
    thicknessMm: 2.98,
    createdAt: now(),
  },
  {
    id: "maple-1oz",
    name: "Canadian Maple Leaf 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    diameterMm: 38.0,
    thicknessMm: 3.2,
    createdAt: now(),
  },
  {
    id: "brit-1oz",
    name: "British Britannia 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 38.61,
    thicknessMm: 3.0,
    createdAt: now(),
  },
  {
    id: "phil-1oz",
    name: "Austrian Philharmonic 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 37.0,
    thicknessMm: 3.2,
    createdAt: now(),
  },

  // ---------- Other popular bullion ----------
  {
    id: "kanga-1oz",
    name: "Australian Kangaroo 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    diameterMm: 40.9,
    thicknessMm: 3.5,
    createdAt: now(),
  },
  {
    id: "krug-1oz",
    name: "South African Silver Krugerrand 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 38.73,
    thicknessMm: 3.05,
    createdAt: now(),
  },
  {
    id: "lib-1oz",
    name: "Mexican Libertad 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 40.0,
    thicknessMm: 3.0,
    createdAt: now(),
  },
  {
    id: "panda-30g",
    name: "Chinese Silver Panda 30 g",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 30.0,
    diameterMm: 40.0,
    thicknessMm: 2.98,
    createdAt: now(),
  },
  {
    id: "noah-1oz",
    name: "Armenian Noah’s Ark 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 38.6,
    thicknessMm: 3.0,
    createdAt: now(),
  },
  {
    id: "elephant-1oz",
    name: "Somalia Elephant 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    diameterMm: 39.0,
    thicknessMm: 3.0,
    createdAt: now(),
  },

  // ---------- Generic rounds & bars ----------
  {
    id: "round-1oz",
    name: "Generic Silver Round 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 39.0,
    thicknessMm: 3.0,
    createdAt: now(),
  },
  {
    id: "bar-10oz",
    name: "Generic Silver Bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    diameterMm: 0,
    thicknessMm: 0,
    createdAt: now(),
  },
  {
    id: "bar-1kg",
    name: "Generic Silver Bar 1 kg",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 1000.0,
    diameterMm: 0,
    thicknessMm: 0,
    createdAt: now(),
  },
];

function norm(s: string) {
  return s.trim().toLowerCase();
}

/** Merge seed coins into existing list (no duplicates by id). Existing wins. */
function mergeSeeds(existing: CoinType[]) {
  const byId = new Map<string, CoinType>();
  for (const c of existing) byId.set(c.id, c);
  for (const s of seedCoins) {
    if (!byId.has(s.id)) byId.set(s.id, s);
  }
  // Keep ordering: seeds first (nice for picker), then user/custom extras
  const seedIds = new Set(seedCoins.map((c) => c.id));
  const seedsInOrder = seedCoins.map((s) => byId.get(s.id)!).filter(Boolean);
  const extras = Array.from(byId.values()).filter((c) => !seedIds.has(c.id));
  return [...seedsInOrder, ...extras];
}

export const useCoinStore = create<CoinState>()(
  persist(
    (set, get) => ({
      coins: [],

      // now acts like "ensureSeeded"
      seedIfEmpty: () => {
        const existing = get().coins;
        if (!existing || existing.length === 0) {
          set({ coins: seedCoins });
          return;
        }
        // merge new seeds into existing persisted list
        const merged = mergeSeeds(existing);
        // Only set if changed length (prevents unnecessary re-renders)
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

      searchCoins: (query) => {
        const q = norm(query);
        if (!q) return get().coins;

        return get().coins.filter((c) => {
          const hay = norm(
            `${c.name} ${c.metal} ${c.purity} ${c.fineWeightGrams} ${c.diameterMm ?? ""} ${c.thicknessMm ?? ""}`
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
        // Persisted may be:
        // - array of coins (older versions)
        // - object { coins: [...] }
        const existing: CoinType[] = Array.isArray(persisted)
          ? persisted
          : Array.isArray(persisted?.coins)
            ? persisted.coins
            : [];

        return { coins: mergeSeeds(existing) };
      },
      // Important: partialize so we only persist "coins" (keeps storage tidy)
      partialize: (state) => ({ coins: state.coins }),
    }
  )
);
