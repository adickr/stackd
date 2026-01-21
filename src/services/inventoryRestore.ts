// src/services/inventoryRestore.ts
import { useCoinStore } from "../stores/coinStore";
import { useStackStore } from "../stores/stackStore";

export type InventorySnapshot = {
  coins?: unknown;
  entries?: unknown;
};

export function restoreInventoryFromSnapshot(snapshot: InventorySnapshot) {
  const coinReport = useCoinStore.getState().safeReplaceAll(snapshot.coins, {
    keepSeeds: true,
    keepLocalExtras: false, // full restore
  });

  const knownCoinIds = new Set(useCoinStore.getState().coins.map((c) => c.id));

  const stackReport = useStackStore.getState().safeReplaceAll(snapshot.entries, {
    knownCoinIds,
    dropUnknownCoinRefs: true, // safest default
  });

  return { coinReport, stackReport };
}
