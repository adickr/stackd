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

// Relay publish response (new relay returns createdAt)
export type CloudPublishResponse = {
  pointer: string;
  createdAt?: number;
  publishedAt?: number; // compat if you ever use that name
};

/**
 * Relay response from GET /v1/journal/latest
 * - legacy relay stored/returned ciphertext directly
 * - new relay (Irys) still returns ciphertext by fetching from gateway, plus createdAt
 */
export type CloudLatestResponse = {
  pointer: string;
  snapshotHash: string;
  schemaVersion: string;
  nonceB64: string;
  ciphertextB64: string;

  // timestamp (optional, depends on relay version)
  publishedAt?: number;
  createdAt?: number;
};

export type CloudCreditsBalanceResponse = {
  walletAddress: string;
  credits: number;
};

export type CloudStorage = {
  challenge: (walletAddress: string, snapshotHash: string) => Promise<CloudChallenge>;
  publish: (req: CloudPublishRequest) => Promise<CloudPublishResponse>;
  latest: (walletAddress: string) => Promise<CloudLatestResponse | null>;

  // credits (for UI)
  creditsBalance: (walletAddress: string) => Promise<CloudCreditsBalanceResponse>;
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

export function setCloudWalletContext(ctx: {
  walletAddressB64: string | null;
  walletAddressB58: string | null;
}) {
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

function toStr(x: any) {
  return typeof x === "string" ? x : x == null ? "" : String(x);
}

function toNum(x: any): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function pickTimestampFromJson(x: any): number | undefined {
  // accept either key (and accept 0? no)
  const a = toNum(x?.createdAt);
  const b = toNum(x?.publishedAt);
  return a ?? b;
}

function mapFetchError(status: number, txt: string) {
  // Your relay returns 402 JSON for insufficient credits
  if (status === 402) {
    try {
      const j = JSON.parse(txt);
      if (j?.error === "INSUFFICIENT_CREDITS") {
        const cur = Number.isFinite(j.current) ? j.current : undefined;
        const req = Number.isFinite(j.required) ? j.required : undefined;
        const msg =
          typeof cur === "number" && typeof req === "number"
            ? `Insufficient credits (${cur}/${req}).`
            : "Insufficient credits.";
        const err: any = new Error(msg);
        err.code = "INSUFFICIENT_CREDITS";
        err.current = cur;
        err.required = req;
        return err;
      }
    } catch {
      // fall through
    }
  }
  return new Error(txt || `Request failed (${status}).`);
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
      throw mapFetchError(r.status, txt || r.statusText);
    }

    const raw = (await r.json()) as any;

    const out: CloudPublishResponse = {
      pointer: toStr(raw?.pointer),
      ...(typeof pickTimestampFromJson(raw) === "number"
        ? { createdAt: pickTimestampFromJson(raw), publishedAt: pickTimestampFromJson(raw) }
        : {}),
    };

    if (!out.pointer) throw new Error("Publish returned malformed payload from relay.");
    return out;
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

    const raw = (await r.json()) as any;
    const ts = pickTimestampFromJson(raw);

    const out: CloudLatestResponse = {
      pointer: toStr(raw?.pointer),
      snapshotHash: toStr(raw?.snapshotHash),
      schemaVersion: toStr(raw?.schemaVersion),
      nonceB64: toStr(raw?.nonceB64),
      ciphertextB64: toStr(raw?.ciphertextB64),
      ...(typeof ts === "number" ? { createdAt: ts, publishedAt: ts } : {}),
    };

    if (!out.pointer || !out.snapshotHash || !out.schemaVersion || !out.nonceB64 || !out.ciphertextB64) {
      throw new Error("Latest returned malformed payload from relay.");
    }

    return out;
  }

  async creditsBalance(walletAddress: string) {
    const base = mustBaseUrl();
    const url = `${base}/v1/credits/balance?walletAddress=${encodeURIComponent(walletAddress)}`;

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Credits failed (${r.status}): ${txt || r.statusText}`);
    }

    const raw = (await r.json()) as any;

    const out: CloudCreditsBalanceResponse = {
      walletAddress: toStr(raw?.walletAddress),
      credits: Number(raw?.credits ?? 0),
    };

    if (!out.walletAddress) throw new Error("Credits returned malformed payload from relay.");
    if (!Number.isFinite(out.credits) || out.credits < 0) out.credits = 0;

    return out;
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
