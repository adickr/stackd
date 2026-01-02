// src/utils/cryptoV1.ts
import nacl from "tweetnacl";
import { Buffer } from "buffer";
import { stableStringify } from "./journalCrypto";

/**
 * SHA-256 over a UTF-8 string.
 * Prefers WebCrypto when available (Expo SDK often provides it),
 * otherwise throws with an instruction to install expo-crypto.
 */
export async function sha256Hex(input: string): Promise<string> {
  // WebCrypto path
  const subtle = (globalThis as any)?.crypto?.subtle;
  if (subtle?.digest) {
    const data = new TextEncoder().encode(input);
    const hashBuf = await subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hashBuf);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // expo-crypto path (optional dependency)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Crypto = require("expo-crypto") as typeof import("expo-crypto");
    const digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input,
      { encoding: Crypto.CryptoEncoding.HEX }
    );
    return digest;
  } catch (e) {
    throw new Error(
      "SHA-256 unavailable. Install expo-crypto (expo install expo-crypto) or enable WebCrypto."
    );
  }
}

export async function hashObjectSha256Hex(obj: any): Promise<string> {
  return sha256Hex(stableStringify(obj));
}

/**
 * MWA signMessage returns a payload that is signature(64) || message(bytes)
 * encoded as base64.
 */
export function parseSignedPayloadB64(signedPayloadB64: string): {
  signature: Uint8Array;
  message: Uint8Array;
} {
  const bytes = Buffer.from(signedPayloadB64, "base64");
  if (bytes.length < 65) throw new Error("Signed payload too short");
  const sig = bytes.subarray(0, 64);
  const msg = bytes.subarray(64);
  return { signature: new Uint8Array(sig), message: new Uint8Array(msg) };
}

/**
 * Deterministic 32-byte key from an Ed25519 signature.
 * DO NOT use the signature bytes directly; hash them into a key.
 */
export async function keyFromSignature(signature: Uint8Array): Promise<Uint8Array> {
  const sigHex = Buffer.from(signature).toString("hex");
  const keyHex = await sha256Hex("STACKD_KEY_DERIVE_V1::" + sigHex);
  return new Uint8Array(Buffer.from(keyHex, "hex"));
}

export type SecretBoxPayload = {
  nonceB64: string;
  ciphertextB64: string;
};

export async function encryptJsonSecretBox(args: {
  json: string;
  key: Uint8Array; // 32 bytes
}): Promise<SecretBoxPayload> {
  if (args.key.length !== nacl.secretbox.keyLength) {
    throw new Error("Invalid key length for secretbox");
  }
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const msg = new TextEncoder().encode(args.json);
  const boxed = nacl.secretbox(msg, nonce, args.key);
  return {
    nonceB64: Buffer.from(nonce).toString("base64"),
    ciphertextB64: Buffer.from(boxed).toString("base64"),
  };
}

export function decryptJsonSecretBox(args: {
  nonceB64: string;
  ciphertextB64: string;
  key: Uint8Array;
}): string {
  const nonce = new Uint8Array(Buffer.from(args.nonceB64, "base64"));
  const boxed = new Uint8Array(Buffer.from(args.ciphertextB64, "base64"));
  const opened = nacl.secretbox.open(boxed, nonce, args.key);
  if (!opened) throw new Error("Decryption failed (bad key or corrupted data)");
  return new TextDecoder().decode(opened);
}
