// src/services/cloudStorage.ts
/**
 * Stackd v1 cloud storage uses a small relay service.
 * The relay is responsible for uploading ciphertext to Arweave and returning a pointer (txid).
 * The relay MUST NOT be able to decrypt anything (ciphertext + nonce only).
 *
 * Expected relay API (suggested):
 *  - POST   {baseUrl}/v1/journal/publish
 *      body: { walletAddress, snapshotHash, schemaVersion, nonceB64, ciphertextB64 }
 *      returns: { pointer }
 *  - GET    {baseUrl}/v1/journal/latest?walletAddress=...
 *      returns: { pointer, snapshotHash, schemaVersion, nonceB64, ciphertextB64 }
 */

export type CloudPublishRequest = {
  walletAddress: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;
};

export type CloudPublishResponse = {
  pointer: string; // arweave tx id (or relay pointer)
};

export type CloudLatestResponse = {
  pointer: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;
};

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
      throw new Error(`Publish failed (${res.status}): ${txt || res.statusText}`);
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
      throw new Error(`Restore failed (${res.status}): ${txt || res.statusText}`);
    }
    return (await res.json()) as CloudLatestResponse;
  }
}
