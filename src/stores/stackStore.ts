// src/stores/stackStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { StackEntry, StackCategory } from "../domain/stackEntry";
import type { DisplayCurrency } from "./settingsStore";

const uid = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

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
      Pick<
        StackEntry,
        "coinTypeId" | "quantity" | "totalPaid" | "paidCurrency" | "purchasedAt" | "category" | "notes"
      >
    >
  ) => void;

  clearAll: () => void;

  replaceAll: (entries: StackEntry[]) => void;

  safeReplaceAll: (entries: unknown, opts?: SafeReplaceOptions) => ReplaceReport;
};

function coerceEntries(persisted: any): StackEntry[] {
  if (Array.isArray(persisted)) return persisted as StackEntry[];
  if (Array.isArray(persisted?.entries)) return persisted.entries as StackEntry[];
  if (Array.isArray(persisted?.state?.entries)) return persisted.state.entries as StackEntry[];
  return [];
}

function isDisplayCurrency(x: any): x is DisplayCurrency {
  return x === "USD" || x === "ZAR" || x === "EUR" || x === "GBP";
}

function isStackCategory(x: any): x is StackCategory {
  return (
    x === "bullion" ||
    x === "collector" ||
    x === "jewellery" ||
    x === "scrap" ||
    x === "other"
  );
}

function normalizeEntry(raw: any): StackEntry {
  const coinTypeId = String(raw?.coinTypeId ?? "");
  const quantity = Number(raw?.quantity ?? 0);
  const totalPaid = Number(raw?.totalPaid ?? 0);
  const purchasedAt = Number(raw?.purchasedAt ?? 0);

  const id = String(raw?.id ?? uid());
  const createdAt = Number.isFinite(raw?.createdAt) ? Number(raw.createdAt) : Date.now();

  // ✅ paidCurrency (default ZAR for old backups)
  const paidCurrency: DisplayCurrency = isDisplayCurrency(raw?.paidCurrency)
    ? raw.paidCurrency
    : "ZAR";

  // ✅ category (default other for old backups)
  const category: StackCategory = isStackCategory(raw?.category) ? raw.category : "other";

  if (!coinTypeId) throw new Error("coinTypeId missing");
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("quantity invalid");
  if (!Number.isFinite(totalPaid) || totalPaid < 0) throw new Error("totalPaid invalid");
  if (!Number.isFinite(purchasedAt) || purchasedAt <= 0) throw new Error("purchasedAt invalid");

  const notes = typeof raw?.notes === "string" ? raw.notes : undefined;

  const e: StackEntry = {
    id,
    coinTypeId,
    quantity,
    totalPaid,
    paidCurrency,
    category,
    purchasedAt,
    createdAt,
    notes,
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
        // keep old behavior, but you might prefer safeReplaceAll for untrusted backups
        const safe = Array.isArray(entriesFromBackup) ? entriesFromBackup : [];
        set({ entries: safe });
      },

      safeReplaceAll: (incoming, opts) => {
        const { entries, report } = safeNormalizeEntries(incoming, opts);
        set({ entries });
        return report;
      },
    }),
    {
      name: "stackd:stack",
      storage: createJSONStorage(() => AsyncStorage),
      version: 5,

      migrate: (persistedState: any, version) => {
        const entries = coerceEntries(persistedState);

        // v<4 -> v4: ensure paidCurrency exists and is valid
        if (version < 4) {
          const upgraded = entries.map((e: any) => ({
            ...e,
            paidCurrency: isDisplayCurrency(e?.paidCurrency) ? e.paidCurrency : "ZAR",
          }));

          // and then fall through to v5 normalization below via normalize step
          const normalized = upgraded.map((e: any) => ({
            ...e,
            category: isStackCategory(e?.category) ? e.category : "other",
            notes: typeof e?.notes === "string" ? e.notes : undefined,
          }));

          return { entries: normalized };
        }

        // v4 -> v5: add category default
        if (version < 5) {
          const upgraded = entries.map((e: any) => ({
            ...e,
            paidCurrency: isDisplayCurrency(e?.paidCurrency) ? e.paidCurrency : "ZAR",
            category: isStackCategory(e?.category) ? e.category : "other",
            notes: typeof e?.notes === "string" ? e.notes : undefined,
          }));

          return { entries: upgraded };
        }

        // Even on v5+, normalize defensive (handles odd persisted shapes)
        const normalized = entries.map((e: any) => ({
          ...e,
          paidCurrency: isDisplayCurrency(e?.paidCurrency) ? e.paidCurrency : "ZAR",
          category: isStackCategory(e?.category) ? e.category : "other",
          notes: typeof e?.notes === "string" ? e.notes : undefined,
        }));

        return { entries: normalized };
      },

      partialize: (state) => ({ entries: state.entries }),
    }
  )
);
