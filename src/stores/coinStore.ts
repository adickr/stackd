// src/stores/coinStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoinType } from "../domain/coinType";

type ReplaceReport = {
  applied: number;
  dropped: number;
  warnings: string[];
};

type SafeReplaceOptions = {
  // default true
  keepSeeds?: boolean;
  // if true, preserves any local coins not present in incoming (by id)
  // default false (full restore)
  keepLocalExtras?: boolean;
};

type CoinState = {
  coins: CoinType[];
  hasHydrated: boolean;

  // seeds
  seedIfEmpty: () => void;
  forceResetToSeeds: () => void;

  // ✅ clearer alias for UI buttons
  restoreDefaults: () => void;

  getCoin: (id?: string) => CoinType | undefined;
  upsertCoin: (coin: CoinType) => void;

  createCoin: (input: Omit<CoinType, "id" | "createdAt"> & { id?: string }) => CoinType;

  searchCoins: (query: string) => CoinType[];
  clearAll: () => void;

  // existing (kept)
  replaceAll: (coins: CoinType[]) => void;

  // ✅ safe replace that validates + returns report
  safeReplaceAll: (coins: unknown, opts?: SafeReplaceOptions) => ReplaceReport;
};

/* ---------------- utils ---------------- */

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
  if (c.fineWeightGrams > 50_000) throw new Error("Fine weight seems too large.");
}

function normalizeCoin(raw: any): CoinType {
  const name = String(raw?.name ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const purity = clamp(Number(raw?.purity ?? 0), 0, 1);
  const fineWeightGrams = clamp(Number(raw?.fineWeightGrams ?? 0), 0, 50_000);

  const coin: CoinType = {
    id: String(raw?.id ?? makeId("restored")),
    createdAt: Number.isFinite(raw?.createdAt) ? Number(raw.createdAt) : now(),
    name,
    metal: raw?.metal ?? "silver",
    purity,
    fineWeightGrams,
    hallmarks: Array.isArray(raw?.hallmarks)
      ? raw.hallmarks.map(String)
      : raw?.hallmarks
      ? [String(raw.hallmarks)]
      : undefined,
    notes: typeof raw?.notes === "string" ? raw.notes : undefined,
  };

  validateCoinInput(coin);
  return coin;
}

/* ---------------- seed coins ---------------- */
/**
 * IMPORTANT:
 * If this array is empty, new users WILL have an empty coin library
 * and “Restore default coins” will do nothing.
 *
 * Expand this list as you like. Keep ids stable so backups/migrations are reliable.
 */
const seedCoins: CoinType[] = [
  // 1 oz (fine silver)
  { id: "seed_silver_krugerrand_1oz", createdAt: 1, name: "Silver Krugerrand 1 oz", metal: "silver", purity: 0.999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_maple_1oz", createdAt: 1, name: "Canadian Maple Leaf 1 oz", metal: "silver", purity: 0.9999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_eagle_1oz", createdAt: 1, name: "American Silver Eagle 1 oz", metal: "silver", purity: 0.999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_philharmonic_1oz", createdAt: 1, name: "Austrian Philharmonic 1 oz", metal: "silver", purity: 0.999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_britannia_1oz", createdAt: 1, name: "Britannia 1 oz", metal: "silver", purity: 0.999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_kookaburra_1oz", createdAt: 1, name: "Kookaburra 1 oz", metal: "silver", purity: 0.999, fineWeightGrams: 31.1035 },
  { id: "seed_silver_kangaroo_1oz", createdAt: 1, name: "Kangaroo 1 oz", metal: "silver", purity: 0.9999, fineWeightGrams: 31.1035 },

  // Common bars
  { id: "seed_silver_bar_100g", createdAt: 1, name: "Silver Bar 100 g", metal: "silver", purity: 0.999, fineWeightGrams: 100 },
  { id: "seed_silver_bar_250g", createdAt: 1, name: "Silver Bar 250 g", metal: "silver", purity: 0.999, fineWeightGrams: 250 },
  { id: "seed_silver_bar_500g", createdAt: 1, name: "Silver Bar 500 g", metal: "silver", purity: 0.999, fineWeightGrams: 500 },
  { id: "seed_silver_bar_1kg", createdAt: 1, name: "Silver Bar 1 kg", metal: "silver", purity: 0.999, fineWeightGrams: 1000 },
];

/* ---------------- dedupe ---------------- */

function keyForCoin(c: CoinType) {
  return (c.name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeByNamePreferSeeds(all: CoinType[]) {
  const seen = new Set<string>();
  const out: CoinType[] = [];

  for (const s of seedCoins) {
    const k = keyForCoin(s);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }

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

/* ---------------- safe replace helpers ---------------- */

function safeNormalizeCoins(input: unknown): { coins: CoinType[]; report: ReplaceReport } {
  const warnings: string[] = [];
  const arr = Array.isArray(input) ? input : [];

  let applied = 0;
  let dropped = 0;

  const normalized: CoinType[] = [];
  for (const raw of arr) {
    try {
      const c = normalizeCoin(raw);
      normalized.push(c);
      applied++;
    } catch (e: any) {
      dropped++;
      warnings.push(
        `Dropped coin: ${(raw?.name ?? raw?.id ?? "unknown").toString()} (${e?.message ?? "invalid"})`
      );
    }
  }

  return { coins: normalized, report: { applied, dropped, warnings } };
}

/* ---------------- store ---------------- */

export const useCoinStore = create<CoinState>()(
  persist(
    (set, get) => ({
      coins: [],
      hasHydrated: false,

      seedIfEmpty: () => {
        const existing = get().coins;
        if (!existing || existing.length === 0) {
          set({ coins: seedCoins });
          return;
        }
        const merged = mergeSeeds(existing);
        const a = existing.map((c) => c.id).join("|");
        const b = merged.map((c) => c.id).join("|");
        if (a !== b) set({ coins: merged });
      },

      forceResetToSeeds: () => {
        set({ coins: seedCoins });
      },

      restoreDefaults: () => {
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
            `${c.name} ${c.metal ?? ""} ${c.purity} ${c.fineWeightGrams} ${(c.hallmarks ?? []).join(
              " "
            )} ${c.notes ?? ""}`
          );
          return hay.includes(q);
        });
      },

      clearAll: () => set({ coins: [] }),

      replaceAll: (coinsFromBackup) => {
        const merged = mergeSeeds(Array.isArray(coinsFromBackup) ? coinsFromBackup : []);
        set({ coins: merged });
      },

      safeReplaceAll: (incoming, opts) => {
        const keepSeeds = opts?.keepSeeds ?? true;
        const keepLocalExtras = opts?.keepLocalExtras ?? false;

        const { coins: normalized, report } = safeNormalizeCoins(incoming);

        const current = get().coins;
        const currentById = new Map(current.map((c) => [c.id, c]));

        let next = normalized;

        if (keepLocalExtras) {
          const incomingIds = new Set(normalized.map((c) => c.id));
          const extras = current.filter((c) => !incomingIds.has(c.id));
          next = [...normalized, ...extras];
        }

        if (keepSeeds) next = mergeSeeds(next);
        else next = dedupeByNamePreferSeeds(next);

        set({ coins: next });

        for (const c of normalized) {
          const prev = currentById.get(c.id);
          if (prev && prev.name !== c.name) {
            report.warnings.push(`Coin id ${c.id} name changed "${prev.name}" → "${c.name}"`);
          }
        }

        return report;
      },
    }),
    {
      name: "stackd:coins",
      storage: createJSONStorage(() => AsyncStorage),
      version: 6,

      migrate: (persisted) => {
        const existing = extractCoins(persisted);
        return {
          coins: mergeSeeds(existing),
          hasHydrated: true,
        };
      },

      partialize: (state) => ({ coins: state.coins }),

      onRehydrateStorage: () => () => {
        useCoinStore.setState({ hasHydrated: true });

        const s = useCoinStore.getState();
        const existing = s.coins ?? [];

        if (existing.length === 0) {
          useCoinStore.setState({ coins: seedCoins });
          return;
        }

        s.seedIfEmpty();
      },
    }
  )
);
