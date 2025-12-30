// src/stores/journalStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { CoinType } from "../domain/coinType";

export type JournalAnchor = {
  id: string;
  createdAt: number;

  // Snapshot summary
  totalFineOz: number;
  spotPrice: number;
  spotFetchedAt: number;
  currency: "ZAR" | "USD";
  stackValue: number;

  levelName: string;
  levelVersion: string;

  // Verifiability
  inventoryHash: string;
  snapshotHash: string;

  // Wallet proof
  walletAddress: string;
  signature: string; // base64 (real wallet) or mock
  signMessage: string;
};

export type InventoryEntryBackup = {
  id: string;
  coinTypeId: string;
  quantity: number;
  totalPaid: number;
  purchasedAt: number;
};

export type InventoryBackup = {
  inventoryHash: string;
  createdAt: number;

  // ✅ full coin objects for lossless restore
  coins: CoinType[];

  // Minimal stack entry fields to restore purchases
  entries: InventoryEntryBackup[];
};

type JournalState = {
  anchors: JournalAnchor[];

  // Inventory backups keyed by inventoryHash
  inventories: Record<string, InventoryBackup>;

  addAnchor: (anchor: JournalAnchor) => void;
  upsertInventory: (backup: InventoryBackup) => void;

  reset: () => void;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// If we ever persisted "minimal coins" before, upconvert them to CoinType.
function coerceCoinType(c: unknown): CoinType | null {
  if (!isRecord(c)) return null;

  const id = typeof c.id === "string" ? c.id : null;
  const name = typeof c.name === "string" ? c.name : null;

  if (!id || !name) return null;

  const fineWeightGrams =
    typeof c.fineWeightGrams === "number" && Number.isFinite(c.fineWeightGrams)
      ? c.fineWeightGrams
      : 0;

  const purity =
    typeof c.purity === "number" && Number.isFinite(c.purity) ? c.purity : 1;

  const createdAt =
    typeof c.createdAt === "number" && Number.isFinite(c.createdAt)
      ? c.createdAt
      : 0;

  const diameterMm =
    typeof c.diameterMm === "number" && Number.isFinite(c.diameterMm)
      ? c.diameterMm
      : undefined;

  const thicknessMm =
    typeof c.thicknessMm === "number" && Number.isFinite(c.thicknessMm)
      ? c.thicknessMm
      : undefined;

  const hallmarks = Array.isArray(c.hallmarks)
    ? c.hallmarks.filter((x: unknown): x is string => typeof x === "string")
    : undefined;

  const notes = typeof c.notes === "string" ? c.notes : undefined;

  // metal: default to silver if missing/invalid
  const metal =
    typeof c.metal === "string" && c.metal === "silver" ? "silver" : "silver";

  return {
    id,
    name,
    metal,
    purity,
    fineWeightGrams,
    diameterMm,
    thicknessMm,
    hallmarks,
    notes,
    createdAt,
  };
}

function coerceInventoryEntryBackup(e: unknown): InventoryEntryBackup | null {
  if (!isRecord(e)) return null;

  if (typeof e.id !== "string") return null;
  if (typeof e.coinTypeId !== "string") return null;

  if (typeof e.quantity !== "number" || !Number.isFinite(e.quantity)) return null;
  if (typeof e.totalPaid !== "number" || !Number.isFinite(e.totalPaid)) return null;
  if (typeof e.purchasedAt !== "number" || !Number.isFinite(e.purchasedAt)) return null;

  return {
    id: e.id,
    coinTypeId: e.coinTypeId,
    quantity: e.quantity,
    totalPaid: e.totalPaid,
    purchasedAt: e.purchasedAt,
  };
}

function coerceInventoryBackup(b: unknown): InventoryBackup | null {
  if (!isRecord(b)) return null;

  const inventoryHash = typeof b.inventoryHash === "string" ? b.inventoryHash : null;
  const createdAt =
    typeof b.createdAt === "number" && Number.isFinite(b.createdAt) ? b.createdAt : null;

  if (!inventoryHash || createdAt === null) return null;

  const coinsRaw = Array.isArray(b.coins) ? b.coins : [];
  const coins: CoinType[] = coinsRaw
    .map(coerceCoinType)
    .filter((x: CoinType | null): x is CoinType => x !== null);

  const entriesRaw = Array.isArray(b.entries) ? b.entries : [];
  const entries: InventoryEntryBackup[] = entriesRaw
    .map(coerceInventoryEntryBackup)
    .filter((x: InventoryEntryBackup | null): x is InventoryEntryBackup => x !== null);

  return { inventoryHash, createdAt, coins, entries };
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set) => ({
      anchors: [],
      inventories: {},

      addAnchor: (anchor) =>
        set((state) => ({ anchors: [...state.anchors, anchor] })),

      upsertInventory: (backup) =>
        set((state) => ({
          inventories: {
            ...state.inventories,
            [backup.inventoryHash]: backup,
          },
        })),

      reset: () => set({ anchors: [], inventories: {} }),
    }),
    {
      name: "journal-store",
      version: 3,

      migrate: (persisted: unknown) => {
        const raw = isRecord(persisted) && isRecord(persisted.state)
          ? (persisted.state as Record<string, unknown>)
          : isRecord(persisted)
          ? (persisted as Record<string, unknown>)
          : {};

        const anchors = Array.isArray(raw.anchors)
          ? (raw.anchors as JournalAnchor[])
          : [];

        const inventories: Record<string, InventoryBackup> = {};
        const rawInv = raw.inventories;

        if (isRecord(rawInv)) {
          for (const [k, v] of Object.entries(rawInv)) {
            const coerced = coerceInventoryBackup(v);
            if (coerced) inventories[k] = coerced;
          }
        }

        return { anchors, inventories } as JournalState;
      },
    }
  )
);
