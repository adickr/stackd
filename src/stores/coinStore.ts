// src/stores/coinStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoinType } from "../domain/coinType";

type CoinState = {
  coins: CoinType[];
  hasHydrated: boolean;

  seedIfEmpty: () => void;
  forceResetToSeeds: () => void;

  getCoin: (id?: string) => CoinType | undefined;
  upsertCoin: (coin: CoinType) => void;

  createCoin: (
    input: Omit<CoinType, "id" | "createdAt"> & { id?: string }
  ) => CoinType;

  searchCoins: (query: string) => CoinType[];
  clearAll: () => void;
};

/* ---------------- utils ---------------- */

const now = () => Date.now();

function makeId(prefix = "custom") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function validateCoinInput(
  c: Pick<CoinType, "name" | "purity" | "fineWeightGrams">
) {
  if (!c.name.trim()) throw new Error("Name is required.");
  if (!Number.isFinite(c.purity) || c.purity <= 0 || c.purity > 1) {
    throw new Error("Purity must be between 0 and 1 (e.g. 0.999).");
  }
  if (!Number.isFinite(c.fineWeightGrams) || c.fineWeightGrams <= 0) {
    throw new Error("Fine weight must be greater than 0.");
  }
  if (c.fineWeightGrams > 50_000) throw new Error("Fine weight seems too large.");
}

/* ---------------- seed coins ---------------- */

const seedCoins: CoinType[] = [
  // --- Sovereign 1 oz coins ---
  {
    id: "seed_ase_1oz",
    createdAt: 1,
    name: "American Silver Eagle 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["ASE", "USA"],
  },
  {
    id: "seed_maple_1oz",
    createdAt: 2,
    name: "Canadian Maple Leaf 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["RCM", "9999"],
  },
  {
    id: "seed_britannia_1oz",
    createdAt: 3,
    name: "Britannia 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["UK"],
  },
  {
    id: "seed_philharmonic_1oz",
    createdAt: 4,
    name: "Austrian Philharmonic 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Austria"],
  },
  {
    id: "seed_krugerrand_silver_1oz",
    createdAt: 5,
    name: "Krugerrand (Silver) 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["South Africa"],
  },
  {
    id: "seed_kangaroo_1oz",
    createdAt: 6,
    name: "Australian Kangaroo 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Perth Mint", "9999"],
  },
  {
    id: "seed_libertad_1oz",
    createdAt: 7,
    name: "Mexican Libertad 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Mexico"],
  },
  {
    id: "seed_panda_30g",
    createdAt: 8,
    name: "Chinese Silver Panda 30 g",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 30.0,
    hallmarks: ["China"],
  },

  // --- Famous series / popular bullion ---
  {
    id: "seed_kookaburra_1oz",
    createdAt: 20,
    name: "Australian Kookaburra 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Perth Mint"],
  },
  {
    id: "seed_koala_1oz",
    createdAt: 21,
    name: "Australian Koala 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Perth Mint"],
  },
  {
    id: "seed_somali_elephant_1oz",
    createdAt: 22,
    name: "Somali Elephant 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Somalia"],
  },
  {
    id: "seed_noahs_ark_1oz",
    createdAt: 23,
    name: "Noah’s Ark 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Armenia"],
  },
  {
    id: "seed_germania_1oz",
    createdAt: 24,
    name: "Germania 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    hallmarks: ["Germania Mint"],
  },

  // --- Generic / useful ---
  {
    id: "seed_generic_round_1oz_999",
    createdAt: 100,
    name: "Generic round 1 oz (0.999)",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
  },
  {
    id: "seed_generic_round_1oz_9999",
    createdAt: 101,
    name: "Generic round 1 oz (0.9999)",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
  },

  // --- Bars ---
  {
    id: "seed_bar_100g_generic",
    createdAt: 200,
    name: "Silver bar 100 g",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 100.0,
    hallmarks: ["100 g"],
  },
  {
    id: "seed_bar_10oz_generic",
    createdAt: 201,
    name: "Silver bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    hallmarks: ["10 oz"],
  },
  {
    id: "seed_bar_1kg_generic",
    createdAt: 202,
    name: "Silver bar 1 kg",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 1000.0,
    hallmarks: ["1 kg"],
  },
  {
    id: "seed_jm_10oz",
    createdAt: 210,
    name: "Johnson Matthey bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    hallmarks: ["JM"],
  },
  {
    id: "seed_engelhard_10oz",
    createdAt: 211,
    name: "Engelhard bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    hallmarks: ["Engelhard"],
  },
  {
    id: "seed_sunshine_10oz",
    createdAt: 212,
    name: "Sunshine Mint bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    hallmarks: ["SMI"],
  },
  {
    id: "seed_scottsdale_10oz",
    createdAt: 213,
    name: "Scottsdale bar 10 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 311.035,
    hallmarks: ["Scottsdale"],
  },
  {
    id: "seed_hera_eus_1kg",
    createdAt: 214,
    name: "Heraeus bar 1 kg",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 1000.0,
    hallmarks: ["Heraeus"],
  },
  {
    id: "seed_valcambi_100g",
    createdAt: 215,
    name: "Valcambi bar 100 g",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 100.0,
    hallmarks: ["Valcambi"],
  },
  {
    id: "seed_geiger_100g",
    createdAt: 216,
    name: "Geiger bar 100 g",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 100.0,
    hallmarks: ["Geiger"],
  },
];

/* ---------------- dedupe (fixes your duplicate ASE) ---------------- */

function keyForCoin(c: CoinType) {
  return (c.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeByNamePreferSeeds(all: CoinType[]) {
  const seen = new Set<string>();
  const out: CoinType[] = [];

  // 1) seeds first (preferred)
  for (const s of seedCoins) {
    const k = keyForCoin(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }

  // 2) everything else, skipping same-name duplicates
  for (const c of all) {
    const k = keyForCoin(c);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }

  return out;
}

/* ---------------- merge + migrate helpers ---------------- */

function mergeSeeds(existing: CoinType[]) {
  const byId = new Map<string, CoinType>();
  for (const c of existing) byId.set(c.id, c);
  for (const s of seedCoins) if (!byId.has(s.id)) byId.set(s.id, s);

  const seedIds = new Set(seedCoins.map((c) => c.id));
  const orderedSeeds = seedCoins.map((s) => byId.get(s.id)!).filter(Boolean);
  const extras = Array.from(byId.values()).filter((c) => !seedIds.has(c.id));

  return dedupeByNamePreferSeeds([...orderedSeeds, ...extras]);
}

function extractCoins(persisted: any): CoinType[] {
  if (!persisted) return [];
  if (Array.isArray(persisted?.state?.coins)) return persisted.state.coins;
  if (Array.isArray(persisted?.coins)) return persisted.coins;
  if (Array.isArray(persisted)) return persisted;
  return [];
}

/* ---------------- store ---------------- */

export const useCoinStore = create<CoinState>()(
  persist(
    (set, get) => ({
      coins: [],
      hasHydrated: false,

      seedIfEmpty: () => {
        const existing = get().coins;

        // If empty, seed
        if (!existing || existing.length === 0) {
          set({ coins: seedCoins });
          return;
        }

        // Merge + dedupe
        const merged = mergeSeeds(existing);
        const a = existing.map((c) => c.id).join("|");
        const b = merged.map((c) => c.id).join("|");
        if (a !== b) set({ coins: merged });
      },

      forceResetToSeeds: () => {
        set({ coins: seedCoins });
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
            `${c.name} ${c.metal ?? ""} ${c.purity} ${c.fineWeightGrams} ${
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

      // ✅ bump version so migrate runs and removes the duplicate ASE
      version: 6,

      migrate: (persisted) => {
        const existing = extractCoins(persisted);
        return {
          coins: mergeSeeds(existing),
          hasHydrated: true,
        };
      },

      partialize: (state) => ({ coins: state.coins }),

      // ✅ seed AFTER hydration to prevent overwrite-to-empty problems
      onRehydrateStorage: () => () => {
        useCoinStore.setState({ hasHydrated: true });
        useCoinStore.getState().seedIfEmpty();
      },
    }
  )
);
