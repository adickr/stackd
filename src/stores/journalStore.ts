// src/stores/journalStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Buffer } from "buffer";
import bs58 from "bs58";

import { CoinType } from "../domain/coinType";

export type JournalAnchor = {
  id: string;
  createdAt: number;

  totalFineOz: number;
  spotPrice: number;
  spotFetchedAt: number;
  currency: "ZAR" | "USD";
  stackValue: number;

  levelName: string;
  levelVersion: string;

  inventoryHash: string;
  snapshotHash: string;

  /**
   * IMPORTANT: Store this as BASE58 (Solana address string).
   * Older versions may have persisted base64 (MWA address bytes) — migrate/import will normalize.
   */
  walletAddress: string;

  signature: string;
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
  coins: CoinType[];
  entries: InventoryEntryBackup[];
};

export type JournalExportBlobV1 = {
  schema: "stackd.journal.export";
  version: 1;
  exportedAt: number;
  anchors: JournalAnchor[];
  inventories: Record<string, InventoryBackup>;
};

type ImportReport = {
  anchorsImported: number;
  inventoriesImported: number;
  warnings: string[];
};

type JournalState = {
  anchors: JournalAnchor[];
  inventories: Record<string, InventoryBackup>;

  addAnchor: (anchor: JournalAnchor) => void;
  upsertInventory: (backup: InventoryBackup) => void;

  reset: () => void;

  exportBlob: () => JournalExportBlobV1;
  importBlob: (blob: unknown, mode?: "replace" | "merge") => ImportReport;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * Detects likely base64 (MWA account.address) and converts to base58 (Solana address string).
 * If already base58 (or not convertible), returns the original string.
 */
function normalizeWalletAddress(addr: string): string {
  const a = addr.trim();

  // base58 never contains + / =, and often avoids 0 O I l
  const looksLikeBase64 =
    a.includes("+") || a.includes("/") || a.includes("=");

  if (!looksLikeBase64) return a;

  try {
    const bytes = Buffer.from(a, "base64");
    // If decode produced nothing meaningful, fall back
    if (!bytes || bytes.length === 0) return a;
    return bs58.encode(bytes);
  } catch {
    return a;
  }
}

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

function coerceAnchor(a: unknown): JournalAnchor | null {
  if (!isRecord(a)) return null;

  // required string fields
  const id = typeof a.id === "string" ? a.id : null;
  const inventoryHash = typeof a.inventoryHash === "string" ? a.inventoryHash : null;
  const snapshotHash = typeof a.snapshotHash === "string" ? a.snapshotHash : null;

  const walletAddressRaw =
    typeof a.walletAddress === "string" ? a.walletAddress : null;

  const signature = typeof a.signature === "string" ? a.signature : null;
  const signMessage = typeof a.signMessage === "string" ? a.signMessage : null;

  const levelName = typeof a.levelName === "string" ? a.levelName : "";
  const levelVersion = typeof a.levelVersion === "string" ? a.levelVersion : "v1";

  if (!id || !inventoryHash || !snapshotHash || !walletAddressRaw || !signature || !signMessage)
    return null;

  const walletAddress = normalizeWalletAddress(walletAddressRaw);

  const createdAt =
    typeof a.createdAt === "number" && Number.isFinite(a.createdAt) ? a.createdAt : null;
  const totalFineOz =
    typeof a.totalFineOz === "number" && Number.isFinite(a.totalFineOz) ? a.totalFineOz : null;
  const spotPrice =
    typeof a.spotPrice === "number" && Number.isFinite(a.spotPrice) ? a.spotPrice : null;
  const spotFetchedAt =
    typeof a.spotFetchedAt === "number" && Number.isFinite(a.spotFetchedAt) ? a.spotFetchedAt : 0;
  const currency = a.currency === "ZAR" || a.currency === "USD" ? a.currency : null;
  const stackValue =
    typeof a.stackValue === "number" && Number.isFinite(a.stackValue) ? a.stackValue : null;

  if (createdAt === null || totalFineOz === null || spotPrice === null || currency === null || stackValue === null)
    return null;

  return {
    id,
    createdAt,
    totalFineOz,
    spotPrice,
    spotFetchedAt,
    currency,
    stackValue,
    levelName,
    levelVersion,
    inventoryHash,
    snapshotHash,
    walletAddress,
    signature,
    signMessage,
  };
}

function coerceExportBlob(blob: unknown): JournalExportBlobV1 | null {
  if (!isRecord(blob)) return null;

  const schema = typeof blob.schema === "string" ? blob.schema : null;
  const version = typeof blob.version === "number" ? blob.version : null;

  const exportedAt =
    typeof blob.exportedAt === "number" && Number.isFinite(blob.exportedAt)
      ? blob.exportedAt
      : Date.now();

  const anchorsRaw = Array.isArray(blob.anchors) ? blob.anchors : [];
  const anchors = anchorsRaw.map(coerceAnchor).filter((x): x is JournalAnchor => !!x);

  const inventories: Record<string, InventoryBackup> = {};
  const rawInv = blob.inventories;

  if (isRecord(rawInv)) {
    for (const [k, v] of Object.entries(rawInv)) {
      const coerced = coerceInventoryBackup(v);
      if (coerced) inventories[k] = coerced;
    }
  }

  return {
    schema: schema === "stackd.journal.export" ? "stackd.journal.export" : "stackd.journal.export",
    version: version === 1 ? 1 : 1,
    exportedAt,
    anchors,
    inventories,
  };
}

export const useJournalStore = create<JournalState>()(
  persist(
    (set, get) => ({
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

      exportBlob: () => {
        const { anchors, inventories } = get();
        return {
          schema: "stackd.journal.export",
          version: 1,
          exportedAt: Date.now(),
          anchors,
          inventories,
        };
      },

      importBlob: (blob, mode = "replace") => {
        const parsed = coerceExportBlob(blob);
        if (!parsed) {
          return { anchorsImported: 0, inventoriesImported: 0, warnings: ["Invalid export file."] };
        }

        const warnings: string[] = [];
        const incomingAnchors = parsed.anchors;
        const incomingInventories = parsed.inventories;

        if (mode === "replace") {
          set({ anchors: incomingAnchors, inventories: incomingInventories });
          return {
            anchorsImported: incomingAnchors.length,
            inventoriesImported: Object.keys(incomingInventories).length,
            warnings,
          };
        }

        const current = get();
        const byAnchorId = new Map(current.anchors.map((a) => [a.id, a]));
        for (const a of incomingAnchors) byAnchorId.set(a.id, a);

        const mergedAnchors = Array.from(byAnchorId.values()).sort(
          (a, b) => a.createdAt - b.createdAt
        );

        const mergedInventories: Record<string, InventoryBackup> = { ...current.inventories };
        for (const [k, v] of Object.entries(incomingInventories)) mergedInventories[k] = v;

        set({ anchors: mergedAnchors, inventories: mergedInventories });

        return {
          anchorsImported: incomingAnchors.length,
          inventoriesImported: Object.keys(incomingInventories).length,
          warnings,
        };
      },
    }),
    {
      name: "journal-store",
      version: 5, // bump because we now normalize walletAddress

      migrate: (persisted: unknown) => {
        const raw =
          isRecord(persisted) && isRecord((persisted as any).state)
            ? ((persisted as any).state as Record<string, unknown>)
            : isRecord(persisted)
            ? (persisted as Record<string, unknown>)
            : {};

        const anchorsRaw = Array.isArray(raw.anchors) ? raw.anchors : [];
        const anchors = anchorsRaw
          .map(coerceAnchor)
          .filter((x): x is JournalAnchor => !!x);

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
