// src/services/cloudStorage.ts
import bs58 from "bs58";
import Constants from "expo-constants";

// -------- Types --------
export type CloudChallenge = {
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  message: string;
};

export type CloudPublishRequest = {
  walletAddress: string; // base58
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;

  auth: {
    nonce: string;
    message: string;
    signature: string; // base58 signature bytes
  };
};

export type CloudPublishResponse = { pointer: string };

export type CloudLatestResponse = {
  pointer: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;
};

export type CloudStorage = {
  challenge: (walletAddress: string, snapshotHash: string) => Promise<CloudChallenge>;
  publish: (req: CloudPublishRequest) => Promise<CloudPublishResponse>;
  latest: (walletAddress: string) => Promise<CloudLatestResponse | null>;
};

// -------- Config / injected signer --------

// Highest priority: explicitly set at runtime (eg from Settings / debug)
let RELAY_BASE_URL_OVERRIDE = "";

// Next priority: EXPO_PUBLIC_ env (works in Metro when set correctly)
const RELAY_BASE_URL_ENV = String(process.env.EXPO_PUBLIC_RELAY_URL ?? "").trim();

// signer injection
let cloudSignMessages: null | ((messages: string[]) => Promise<string[]>) = null;

export function setRelayBaseUrl(url: string | null) {
  RELAY_BASE_URL_OVERRIDE = String(url ?? "").trim();
}

export function setCloudSignMessages(fn: null | ((messages: string[]) => Promise<string[]>)) {
  cloudSignMessages = fn;
}

// Backwards compatibility
export function setCloudSignMessage(fn: null | ((message: string) => Promise<string>)) {
  if (!fn) {
    cloudSignMessages = null;
    return;
  }
  cloudSignMessages = async (messages: string[]) => {
    const out: string[] = [];
    for (const m of messages) out.push(await fn(m));
    return out;
  };
}

// optional context (debug)
let walletContext: { walletAddressB64: string | null; walletAddressB58: string | null } = {
  walletAddressB64: null,
  walletAddressB58: null,
};

export function setCloudWalletContext(ctx: { walletAddressB64: string | null; walletAddressB58: string | null }) {
  walletContext = ctx;
}

function normalizeBaseUrl(u: string) {
  return String(u || "").trim().replace(/\/+$/, "");
}

// Expo Constants “extra” (works for dev client + production if you wire it in)
function relayFromConstantsExtra(): string {
  // expoConfig is preferred in newer SDKs, manifest for older
  const extraA: any = (Constants as any)?.expoConfig?.extra;
  const extraB: any = (Constants as any)?.manifest?.extra;
  const extra = extraA ?? extraB ?? {};
  return String(extra?.EXPO_PUBLIC_RELAY_URL ?? extra?.relayUrl ?? "").trim();
}

function mustBaseUrl() {
  const fromOverride = normalizeBaseUrl(RELAY_BASE_URL_OVERRIDE);
  if (fromOverride) return fromOverride;

  const fromEnv = normalizeBaseUrl(RELAY_BASE_URL_ENV);
  if (fromEnv) return fromEnv;

  const fromExtra = normalizeBaseUrl(relayFromConstantsExtra());
  if (fromExtra) return fromExtra;

  // Helpful debug info in logs
  console.log("[cloudStorage] baseUrl missing. Debug:", {
    override: RELAY_BASE_URL_OVERRIDE || null,
    env: RELAY_BASE_URL_ENV || null,
    extra: relayFromConstantsExtra() || null,
  });

  throw new Error("Relay baseUrl not configured (EXPO_PUBLIC_RELAY_URL).");
}

// -------- Helpers --------
function padB64(s: string) {
  const t = String(s ?? "");
  const mod = t.length % 4;
  if (mod === 0) return t;
  return t + "=".repeat(4 - mod);
}

function b64ToBytes(b64: string) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Buffer } = require("buffer");
  return Buffer.from(padB64(b64), "base64");
}

// -------- Relay implementation --------
class RelayCloudStorage implements CloudStorage {
  async challenge(walletAddress: string, snapshotHash: string) {
    const base = mustBaseUrl();
    const url =
      `${base}/v1/journal/challenge` +
      `?walletAddress=${encodeURIComponent(walletAddress)}` +
      `&snapshotHash=${encodeURIComponent(snapshotHash)}`;

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Challenge failed (${r.status}): ${txt || r.statusText}`);
    }
    return (await r.json()) as CloudChallenge;
  }

  async publish(req: CloudPublishRequest) {
    const base = mustBaseUrl();
    const url = `${base}/v1/journal/publish`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Publish failed (${r.status}): ${txt || r.statusText}`);
    }

    return (await r.json()) as CloudPublishResponse;
  }

  async latest(walletAddress: string) {
    const base = mustBaseUrl();
    const url = `${base}/v1/journal/latest?walletAddress=${encodeURIComponent(walletAddress)}`;

    const r = await fetch(url);
    if (r.status === 404) return null;
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Latest failed (${r.status}): ${txt || r.statusText}`);
    }
    return (await r.json()) as CloudLatestResponse;
  }
}

export function getCloudStorage(): CloudStorage {
  return new RelayCloudStorage();
}

// Utility: base64 signature string -> base58 bytes signature
export function walletSigB64ToB58(sigB64: string) {
  const bytes = b64ToBytes(sigB64);
  if (bytes.length !== 64) {
    throw new Error(`Wallet signature bytes length unexpected: ${bytes.length}`);
  }
  return bs58.encode(bytes);
}

export function getCloudSigner() {
  if (!cloudSignMessages) throw new Error("Cloud signer not set (setCloudSignMessages).");
  return cloudSignMessages;
}

export function getWalletContext() {
  return walletContext;
}
