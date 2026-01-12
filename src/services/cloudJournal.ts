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

/**
 * Relay truth-source check:
 * - No signing
 * - No decryption
 * - Used for UI (Restore button + timestamp)
 */
async function checkCloudBackupExists(): Promise<{
  exists: boolean;
  pointer?: string;
  snapshotHash?: string;
  createdAt?: number; // normalized
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    return { exists: false };
  }

  const storage = getCloudStorage();
  const latest = await storage.latest(account.walletAddressB58);
  if (!latest) return { exists: false };

  const ts = pickTs(latest);

  return {
    exists: true,
    pointer: latest.pointer,
    snapshotHash: latest.snapshotHash,
    createdAt: ts,
  };
}

async function publishEncryptedSnapshot(): Promise<{
  pointer: string;
  snapshotHash: string;
  createdAt?: number; // relay-confirmed if provided
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    throw new Error("Connect your wallet first.");
  }

  const walletAddress = account.walletAddressB58;

  const coins = useCoinStore.getState().coins;
  const entries = useStackStore.getState().entries;

  const snapshot = buildSnapshotV1({ walletAddress, coins, entries });
  const snapshotHash = await hashObjectSha256Hex(snapshot);

  const storage = getCloudStorage();

  // 1) Get challenge (no wallet prompt)
  const ch = await storage.challenge(walletAddress, snapshotHash);

  // 2) ONE wallet prompt: sign both messages in one call
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

  // 5) Publish using challenge signature (relay may debit credits + upload to Irys)
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

  // Keep local offline inventory (optional)
  const inventoryPayload = {
    coins: coins
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
      .sort((a, b) => a.id.localeCompare(b.id)),
    entries: entries
      .map((e) => ({
        id: e.id,
        coinTypeId: e.coinTypeId,
        quantity: e.quantity,
        totalPaid: e.totalPaid,
        purchasedAt: e.purchasedAt,
        createdAt: e.createdAt,
        notes: e.notes,
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };

  const inventoryHash = hashObject(inventoryPayload);

  useJournalStore.getState().upsertInventory({
    inventoryHash,
    createdAt: snapshot.createdAt,
    coins: inventoryPayload.coins as any,
    entries: inventoryPayload.entries as any,
  });

  // Anchor: reuse challenge signature (no extra wallet prompt)
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

  const createdAt = pickTs(res);
  return { pointer: res.pointer, snapshotHash, createdAt };
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

  // Restore needs 1 signature (key derivation)
  const keySigB64 = await account.signMessage(KEY_MESSAGE_PREFIX + walletAddress);
  const key = await deriveKeyFromSigB64(keySigB64);

  // TS + runtime safety: ensure ciphertext is present
  if (!latest.nonceB64 || !latest.ciphertextB64) {
    throw new Error("Cloud backup is missing ciphertext (invalid pointer or fetch failed).");
  }

  const json = await decryptJsonSecretBox({
    nonceB64: latest.nonceB64,
    ciphertextB64: latest.ciphertextB64,
    key,
  });

  const snapshot = JSON.parse(json);

  if (!snapshot || snapshot.schemaVersion !== "snapshot.v1" || snapshot.walletAddress !== walletAddress) {
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

// Explicit exports (prevents TS “no exported member” weirdness)
export { publishEncryptedSnapshot, restoreLatestEncryptedSnapshot, checkCloudBackupExists };
