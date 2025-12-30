// src/stores/stackStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StackEntry } from "../domain/stackEntry";

const uid = () =>
  Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

type ReplaceReport = {
  applied: number;
  dropped: number;
  unknownCoinRefs: number;
  warnings: string[];
};

type SafeReplaceOptions = {
  // if provided, entries referencing coinTypeIds not in this set can be dropped
  knownCoinIds?: Set<string>;
  // default true when knownCoinIds is provided
  dropUnknownCoinRefs?: boolean;
};

type StackState = {
  entries: StackEntry[];
  addEntry: (entry: Omit<StackEntry, "id" | "createdAt">) => void;
  getEntry: (id?: string) => StackEntry | undefined;
  removeEntry: (id: string) => void;
  updateEntry: (
    id: string,
    patch: Partial<
      Pick<StackEntry, "coinTypeId" | "quantity" | "totalPaid" | "purchasedAt">
    >
  ) => void;
  clearAll: () => void;

  replaceAll: (entries: StackEntry[]) => void;

  // ✅ NEW
  safeReplaceAll: (entries: unknown, opts?: SafeReplaceOptions) => ReplaceReport;
};

function coerceEntries(persisted: any): StackEntry[] {
  if (Array.isArray(persisted)) return persisted as StackEntry[];
  if (Array.isArray(persisted?.entries)) return persisted.entries as StackEntry[];
  if (Array.isArray(persisted?.state?.entries))
    return persisted.state.entries as StackEntry[];
  return [];
}

function normalizeEntry(raw: any): StackEntry {
  const coinTypeId = String(raw?.coinTypeId ?? "");
  const quantity = Number(raw?.quantity ?? 0);
  const totalPaid = Number(raw?.totalPaid ?? 0);
  const purchasedAt = Number(raw?.purchasedAt ?? 0);

  const id = String(raw?.id ?? uid());
  const createdAt = Number.isFinite(raw?.createdAt) ? Number(raw.createdAt) : Date.now();

  if (!coinTypeId) throw new Error("coinTypeId missing");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity invalid");
  if (!Number.isFinite(totalPaid) || totalPaid < 0) throw new Error("totalPaid invalid");
  if (!Number.isFinite(purchasedAt) || purchasedAt <= 0) throw new Error("purchasedAt invalid");

  const e: StackEntry = {
    id,
    coinTypeId,
    quantity,
    totalPaid,
    purchasedAt,
    createdAt,
    notes: typeof raw?.notes === "string" ? raw.notes : undefined,
  };

  return e;
}

function safeNormalizeEntries(
  input: unknown,
  opts?: SafeReplaceOptions
): { entries: StackEntry[]; report: ReplaceReport } {
  const warnings: string[] = [];
  const arr = Array.isArray(input) ? input : [];

  const known = opts?.knownCoinIds;
  const dropUnknown = (opts?.dropUnknownCoinRefs ?? true) && !!known;

  let applied = 0;
  let dropped = 0;
  let unknownCoinRefs = 0;

  const normalized: StackEntry[] = [];
  for (const raw of arr) {
    try {
      const e = normalizeEntry(raw);

      if (known && !known.has(e.coinTypeId)) {
        unknownCoinRefs++;
        if (dropUnknown) {
          dropped++;
          warnings.push(`Dropped entry ${e.id}: unknown coinTypeId ${e.coinTypeId}`);
          continue;
        }
      }

      normalized.push(e);
      applied++;
    } catch (err: any) {
      dropped++;
      warnings.push(
        `Dropped entry: ${(raw?.id ?? "unknown").toString()} (${err?.message ?? "invalid"})`
      );
    }
  }

  return { entries: normalized, report: { applied, dropped, unknownCoinRefs, warnings } };
}

export const useStackStore = create<StackState>()(
  persist(
    (set, get) => ({
      entries: [],

      addEntry: (entry) =>
        set((state) => ({
          entries: [{ ...entry, id: uid(), createdAt: Date.now() }, ...state.entries],
        })),

      getEntry: (id) => (id ? get().entries.find((e) => e.id === id) : undefined),

      removeEntry: (id) =>
        set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),

      updateEntry: (id, patch) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      clearAll: () => set({ entries: [] }),

      replaceAll: (entriesFromBackup) => {
        const safe = Array.isArray(entriesFromBackup) ? entriesFromBackup : [];
        set({ entries: safe });
      },

      // ✅ NEW
      safeReplaceAll: (incoming, opts) => {
        const { entries, report } = safeNormalizeEntries(incoming, opts);

        // overwrite with normalized
        set({ entries });

        return report;
      },
    }),
    {
      name: "stackd:stack",
      storage: createJSONStorage(() => AsyncStorage),
      version: 3, // bumped

      migrate: (persistedState: any) => {
        const entries = coerceEntries(persistedState);
        return { entries };
      },

      partialize: (state) => ({ entries: state.entries }),
    }
  )
);
