// src/services/cloudJournal.ts
import { buildSnapshotV1 } from "../domain/snapshot";
import { useAccountStore } from "../stores/accountStore";
import { useCoinStore } from "../stores/coinStore";
import { useStackStore } from "../stores/stackStore";
import { useJournalStore } from "../stores/journalStore";
import { restoreInventoryFromSnapshot } from "./inventoryRestore";

import {
  decryptJsonSecretBox,
  encryptJsonSecretBox,
  hashObjectSha256Hex,
  keyFromSignature,
} from "../utils/cryptoV1";
import { hashObject } from "../utils/journalCrypto";

import { getCloudStorage, getCloudSigner, walletSigB64ToB58 } from "./cloudStorage";

const KEY_MESSAGE_PREFIX = "STACKD_KEY_V1::";

async function deriveKeyFromSigB64(sigB64: string): Promise<Uint8Array> {
  return await keyFromSignature(sigB64);
}

function pickTs(x: any): number | undefined {
  const a = x?.createdAt;
  const b = x?.publishedAt;
  if (typeof a === "number" && Number.isFinite(a)) return a;
  if (typeof b === "number" && Number.isFinite(b)) return b;
  return undefined;
}

function normStr(x: any): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t.length ? t : null;
}

function normNum(x: any): number {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Build a deterministic (stable) payload for hashing.
 * CRITICAL:
 * - Exclude createdAt (it can change across sessions / devices / imports)
 * - Normalize optional strings to null
 * - Normalize numbers
 * - Sort arrays deterministically
 */
function buildDeterministicSnapshotPayload(args: {
  walletAddress: string;
  coins: any[];
  entries: any[];
}) {
  const { walletAddress, coins, entries } = args;

  const coinsStable = (coins || [])
    .map((c) => ({
      id: String(c.id ?? ""),
      name: normStr(c.name),
      metal: normStr(c.metal),
      purity: normNum(c.purity),
      fineWeightGrams: normNum(c.fineWeightGrams),
      diameterMm: normNum(c.diameterMm),
      thicknessMm: normNum(c.thicknessMm),
      hallmarks: Array.isArray(c.hallmarks)
        ? c.hallmarks.map((h: any) => normStr(h)).filter(Boolean)
        : [],
      notes: normStr(c.notes),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  const entriesStable = (entries || [])
    .map((e) => ({
      coinTypeId: String(e.coinTypeId ?? ""),
      quantity: normNum(e.quantity),
      totalPaid: normNum(e.totalPaid),
      purchasedAt: normNum(e.purchasedAt),
      notes: normStr(e.notes),
    }))
    .sort((a, b) => {
      if (a.purchasedAt !== b.purchasedAt) return a.purchasedAt - b.purchasedAt;
      if (a.coinTypeId !== b.coinTypeId) return a.coinTypeId.localeCompare(b.coinTypeId);
      if (a.quantity !== b.quantity) return a.quantity - b.quantity;
      return a.totalPaid - b.totalPaid;
    });

  return {
    v: 2,
    walletAddress: String(walletAddress),
    coins: coinsStable,
    entries: entriesStable,
  };
}

/**
 * Compute the deterministic hash for CURRENT local portfolio state.
 * This is what Settings should compare to relay.latest.snapshotHash.
 */
async function computeDeterministicSnapshotHashForCurrentState(): Promise<string> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    throw new Error("Wallet not connected");
  }

  const walletAddress = account.walletAddressB58;
  const coins = useCoinStore.getState().coins;
  const entries = useStackStore.getState().entries;

  const deterministic = buildDeterministicSnapshotPayload({
    walletAddress,
    coins,
    entries,
  });

  return await hashObjectSha256Hex(deterministic);
}

/**
 * Relay truth-source check:
 * - No signing
 * - No decryption
 * - Used for UI (Restore button + timestamp)
 *
 * IMPORTANT:
 * Some relays may temporarily report a "latest" pointer without ciphertext.
 * Treat that case as "no usable backup" (exists:false) to keep UI sane.
 */
async function checkCloudBackupExists(): Promise<{
  exists: boolean;
  pointer?: string;
  snapshotHash?: string;
  createdAt?: number;
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    return { exists: false };
  }

  const storage = getCloudStorage();

  try {
    const latest = await storage.latest(account.walletAddressB58);
    if (!latest) return { exists: false };

    return {
      exists: true,
      pointer: latest.pointer,
      snapshotHash: latest.snapshotHash,
      createdAt: pickTs(latest),
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg.toLowerCase().includes("missing ciphertext")) {
      return { exists: false };
    }
    throw e;
  }
}

async function publishEncryptedSnapshot(): Promise<{
  pointer: string;
  snapshotHash: string;
  createdAt?: number;
  status: "published" | "unchanged";
  message?: string;
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    throw new Error("Connect your wallet first.");
  }

  const walletAddress = account.walletAddressB58;

  const coins = useCoinStore.getState().coins;
  const entries = useStackStore.getState().entries;

  // Snapshot that we encrypt/restore (can include createdAt etc; that's fine)
  const snapshot = buildSnapshotV1({ walletAddress, coins, entries });

  // ✅ Stable hash for dedupe/UI
  const snapshotHash = await computeDeterministicSnapshotHashForCurrentState();

  const storage = getCloudStorage();

  // ✅ Client-side dedupe: avoid wallet prompt + credits when unchanged
  const latest = await storage.latest(walletAddress).catch(() => null);
  if (latest?.snapshotHash && latest.snapshotHash === snapshotHash) {
    return {
      pointer: latest.pointer,
      snapshotHash,
      createdAt: pickTs(latest),
      status: "unchanged",
      message: "Already backed up — no changes since last backup.",
    };
  }

  // 1) Get challenge (no wallet prompt)
  const ch = await storage.challenge(walletAddress, snapshotHash);

  // 2) ONE wallet prompt: sign both messages
  const signMessages = getCloudSigner();
  const [keySigB64, challengeSigB64] = await signMessages([
    KEY_MESSAGE_PREFIX + walletAddress,
    ch.message,
  ]);

  // 3) Derive encryption key from signature
  const key = await deriveKeyFromSigB64(keySigB64);

  // 4) Encrypt snapshot
  const json = JSON.stringify(snapshot);
  const boxed = await encryptJsonSecretBox({ json, key });

  // 5) Publish
  const challengeSigB58 = walletSigB64ToB58(challengeSigB64);

  const res = await storage.publish({
    walletAddress,
    snapshotHash,
    schemaVersion: snapshot.schemaVersion,
    nonceB64: boxed.nonceB64,
    ciphertextB64: boxed.ciphertextB64,
    auth: {
      nonce: ch.nonce,
      message: ch.message,
      signature: challengeSigB58,
    },
  });

  // Local journal bookkeeping
  const inventoryPayload = {
    coins: (coins || [])
      .map((c) => ({
        id: c.id,
        name: c.name,
        metal: c.metal,
        purity: c.purity,
        fineWeightGrams: c.fineWeightGrams,
        diameterMm: c.diameterMm,
        thicknessMm: c.thicknessMm,
        hallmarks: c.hallmarks,
        notes: c.notes,
        createdAt: c.createdAt,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
    entries: (entries || [])
      .map((e) => ({
        id: e.id,
        coinTypeId: e.coinTypeId,
        quantity: e.quantity,
        totalPaid: e.totalPaid,
        purchasedAt: e.purchasedAt,
        createdAt: e.createdAt,
        notes: e.notes,
      }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  };

  const inventoryHash = hashObject(inventoryPayload);

  useJournalStore.getState().upsertInventory({
    inventoryHash,
    createdAt: snapshot.createdAt,
    coins: inventoryPayload.coins as any,
    entries: inventoryPayload.entries as any,
  });

  useJournalStore.getState().addAnchor({
    id: `${snapshot.createdAt}-${Math.random().toString(16).slice(2)}`,
    createdAt: snapshot.createdAt,

    totalFineOz: 0,
    spotPrice: 0,
    spotFetchedAt: 0,
    currency: "ZAR",
    stackValue: 0,

    levelName: "Published",
    levelVersion: "cloud.v1",

    inventoryHash,
    snapshotHash,

    walletAddress,
    signature: challengeSigB58,
    signMessage: ch.message,

    snapshotPointer: res.pointer,
    snapshotSchemaVersion: snapshot.schemaVersion,
  } as any);

  return {
    pointer: res.pointer,
    snapshotHash,
    createdAt: pickTs(res),
    status: "published",
    message: "Backup saved.",
  };
}

async function restoreLatestEncryptedSnapshot(): Promise<{
  snapshotHash: string;
  pointer: string;
  createdAt?: number;
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    throw new Error("Connect your wallet first.");
  }
  const walletAddress = account.walletAddressB58;

  const storage = getCloudStorage();
  const latest = await storage.latest(walletAddress);
  if (!latest) throw new Error("No backup found for this wallet.");

  const keySigB64 = await account.signMessage(KEY_MESSAGE_PREFIX + walletAddress);
  const key = await deriveKeyFromSigB64(keySigB64);

  if (!latest.nonceB64 || !latest.ciphertextB64) {
    throw new Error("Cloud backup is missing ciphertext (invalid pointer or fetch failed).");
  }

  const json = await decryptJsonSecretBox({
    nonceB64: latest.nonceB64,
    ciphertextB64: latest.ciphertextB64,
    key,
  });

  const snapshot = JSON.parse(json);

  if (
    !snapshot ||
    snapshot.schemaVersion !== "snapshot.v1" ||
    snapshot.walletAddress !== walletAddress
  ) {
    throw new Error("Snapshot schema mismatch or wrong wallet.");
  }

  restoreInventoryFromSnapshot({
    coins: snapshot.coins,
    entries: snapshot.entries,
  });

  return {
    snapshotHash: latest.snapshotHash,
    pointer: latest.pointer,
    createdAt: pickTs(latest),
  };
}

export {
  publishEncryptedSnapshot,
  restoreLatestEncryptedSnapshot,
  checkCloudBackupExists,
  computeDeterministicSnapshotHashForCurrentState,
};
