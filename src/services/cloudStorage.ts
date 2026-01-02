// src/services/cloudStorage.ts
/**
 * Stackd v1 cloud storage uses a small relay service.
 * DEBUG VERSION – verbose logs to validate Step 3 local stub behaviour.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

export type CloudPublishRequest = {
  walletAddress: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;
};

export type CloudPublishResponse = {
  pointer: string;
};

export type CloudLatestResponse = {
  pointer: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;
};

export interface CloudStorage {
  publish(req: CloudPublishRequest): Promise<CloudPublishResponse>;
  latest(walletAddress: string): Promise<CloudLatestResponse | null>;
}

/**
 * STEP 3: local stub (no network)
 */
const USE_LOCAL_STUB = true;
const STUB_KEY_PREFIX = "stackd:cloudstub:";

function stubKey(walletAddress: string) {
  return `${STUB_KEY_PREFIX}${walletAddress}`;
}

class LocalCloudStorage implements CloudStorage {
  async publish(req: CloudPublishRequest): Promise<CloudPublishResponse> {
    const key = stubKey(req.walletAddress);
    const pointer = `local-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    const blob: CloudLatestResponse = {
      pointer,
      snapshotHash: req.snapshotHash,
      schemaVersion: req.schemaVersion,
      nonceB64: req.nonceB64,
      ciphertextB64: req.ciphertextB64,
    };

    console.log("[cloudstub] PUBLISH");
    console.log("[cloudstub] wallet =", req.walletAddress);
    console.log("[cloudstub] storage key =", key);
    console.log("[cloudstub] pointer =", pointer);

    await AsyncStorage.setItem(key, JSON.stringify(blob));

    const confirm = await AsyncStorage.getItem(key);
    console.log(
      "[cloudstub] confirm write =",
      confirm ? "OK" : "FAILED"
    );

    return { pointer };
  }

  async latest(walletAddress: string): Promise<CloudLatestResponse | null> {
    const key = stubKey(walletAddress);

    console.log("[cloudstub] RESTORE");
    console.log("[cloudstub] wallet =", walletAddress);
    console.log("[cloudstub] storage key =", key);

    const raw = await AsyncStorage.getItem(key);

    console.log(
      "[cloudstub] raw value =",
      raw ? "FOUND" : "MISSING"
    );

    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as CloudLatestResponse;
      console.log("[cloudstub] parsed pointer =", parsed.pointer);
      return parsed;
    } catch (e) {
      console.error("[cloudstub] JSON parse failed", e);
      return null;
    }
  }
}

/* ---------- Relay (unused in Step 3) ---------- */

export class CloudStorageRelay {
  constructor(private baseUrl: string) {}

  async publish(req: CloudPublishRequest): Promise<CloudPublishResponse> {
    const res = await fetch(this.baseUrl + "/v1/journal/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `Publish failed (${res.status}): ${txt || res.statusText}`
      );
    }
    return (await res.json()) as CloudPublishResponse;
  }

  async latest(walletAddress: string): Promise<CloudLatestResponse> {
    const url =
      this.baseUrl +
      "/v1/journal/latest?walletAddress=" +
      encodeURIComponent(walletAddress);

    const res = await fetch(url, { method: "GET" });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(
        `Restore failed (${res.status}): ${txt || res.statusText}`
      );
    }
    return (await res.json()) as CloudLatestResponse;
  }
}

class RelayCloudStorage implements CloudStorage {
  private relay: CloudStorageRelay;

  constructor(baseUrl: string) {
    this.relay = new CloudStorageRelay(baseUrl);
  }

  publish(req: CloudPublishRequest): Promise<CloudPublishResponse> {
    return this.relay.publish(req);
  }

  async latest(walletAddress: string): Promise<CloudLatestResponse | null> {
    return this.relay.latest(walletAddress);
  }
}

/**
 * Single entry point used by cloudJournal.ts
 */
export function getCloudStorage(): CloudStorage {
  if (USE_LOCAL_STUB) {
    console.log("[cloudstub] USING LOCAL STUB STORAGE");
    return new LocalCloudStorage();
  }

  const baseUrl = process.env.EXPO_PUBLIC_STACKD_RELAY_URL;
  if (!baseUrl) {
    throw new Error(
      "Missing relay URL. Set EXPO_PUBLIC_STACKD_RELAY_URL in app config."
    );
  }

  return new RelayCloudStorage(baseUrl);
}
