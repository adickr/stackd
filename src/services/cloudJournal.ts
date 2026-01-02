// src/services/cloudJournal.ts
import { buildSnapshotV1 } from "../domain/snapshot";
import { useAccountStore } from "../stores/accountStore";
import { useCoinStore } from "../stores/coinStore";
import { useStackStore } from "../stores/stackStore";
import { useJournalStore } from "../stores/journalStore";
import { restoreInventoryFromSnapshot } from "./inventoryRestore";
import { CloudStorageRelay } from "./cloudStorage";
import {
  decryptJsonSecretBox,
  encryptJsonSecretBox,
  hashObjectSha256Hex,
  keyFromSignature,
  parseSignedPayloadB64,
} from "../utils/cryptoV1";
import { hashObject } from "../utils/journalCrypto";

const KEY_MESSAGE_PREFIX = "STACKD_KEY_V1::";
const PUBLISH_MESSAGE_PREFIX = "STACKD_PUBLISH_V1::";

/**
 * Provide your relay base URL via app config.
 * For Expo, the easiest is EXPO_PUBLIC_STACKD_RELAY_URL in app config.
 */
function getRelayBaseUrl(): string {
  const v =
    (process.env as any)?.EXPO_PUBLIC_STACKD_RELAY_URL ||
    (process.env as any)?.STACKD_RELAY_URL;

  if (!v || typeof v !== "string") {
    throw new Error(
      "Missing relay URL. Set EXPO_PUBLIC_STACKD_RELAY_URL in app config."
    );
  }
  return v.replace(/\/+$/, "");
}

async function deriveKeyForWallet(walletAddressB58: string): Promise<Uint8Array> {
  const signMessage = useAccountStore.getState().signMessage;
  const signedPayloadB64 = await signMessage(KEY_MESSAGE_PREFIX + walletAddressB58);
  const { signature } = parseSignedPayloadB64(signedPayloadB64);
  return keyFromSignature(signature);
}

export async function publishEncryptedSnapshot(): Promise<{
  pointer: string;
  snapshotHash: string;
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

  // Derive deterministic encryption key from a deterministic wallet signature.
  const key = await deriveKeyForWallet(walletAddress);

  const json = JSON.stringify(snapshot);
  const boxed = await encryptJsonSecretBox({ json, key });

  const relay = new CloudStorageRelay(getRelayBaseUrl());
  const res = await relay.publish({
    walletAddress,
    snapshotHash,
    schemaVersion: snapshot.schemaVersion,
    nonceB64: boxed.nonceB64,
    ciphertextB64: boxed.ciphertextB64,
  });

  // Sign a publish message (separate from key derivation).
  const publishMessage = `${PUBLISH_MESSAGE_PREFIX}${snapshotHash}::${snapshot.createdAt}`;
  const signedPublishPayloadB64 = await account.signMessage(publishMessage);

  // Keep the existing local inventory backup (useful offline), keyed by inventoryHash.
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

  // Add anchor (now includes pointer).
  useJournalStore.getState().addAnchor({
    id: `${snapshot.createdAt}-${Math.random().toString(16).slice(2)}`,
    createdAt: snapshot.createdAt,

    // v1 minimal fields (not used for restore)
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
    signature: signedPublishPayloadB64,
    signMessage: publishMessage,

    // new fields (added to type)
    snapshotPointer: res.pointer,
    snapshotSchemaVersion: snapshot.schemaVersion,
  } as any);

  return { pointer: res.pointer, snapshotHash };
}

export async function restoreLatestEncryptedSnapshot(): Promise<{
  snapshotHash: string;
  pointer: string;
}> {
  const account = useAccountStore.getState();
  if (!account.isConnected || !account.walletAddressB58) {
    throw new Error("Connect your wallet first.");
  }
  const walletAddress = account.walletAddressB58;

  const relay = new CloudStorageRelay(getRelayBaseUrl());
  const latest = await relay.latest(walletAddress);

  const key = await deriveKeyForWallet(walletAddress);

  const json = decryptJsonSecretBox({
    nonceB64: latest.nonceB64,
    ciphertextB64: latest.ciphertextB64,
    key,
  });

  const snapshot = JSON.parse(json);

  // Basic sanity check
  if (
    !snapshot ||
    snapshot.schemaVersion !== "snapshot.v1" ||
    snapshot.walletAddress !== walletAddress
  ) {
    throw new Error("Snapshot schema mismatch or wrong wallet.");
  }

  // Restore coins + entries
  restoreInventoryFromSnapshot({
    coins: snapshot.coins,
    entries: snapshot.entries,
  });

  return { snapshotHash: latest.snapshotHash, pointer: latest.pointer };
}
