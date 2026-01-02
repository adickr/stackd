// src/utils/cryptoV1.ts
import nacl from "tweetnacl";
import { Buffer } from "buffer";
import { stableStringify } from "./journalCrypto";

// expo-crypto is the most reliable SHA-256 in Expo/RN
import * as Crypto from "expo-crypto";

/** hex string -> Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error("Invalid hex length");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * SHA-256 over a UTF-8 string -> hex.
 * Uses expo-crypto (works on Android/iOS in Expo).
 */
export async function sha256Hex(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
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
 * Deterministic 32-byte key from a signature (string or bytes).
 * Hash signature into a 32-byte key for nacl.secretbox.
 *
 * IMPORTANT: This is async now because expo-crypto is async.
 */
export async function keyFromSignature(
  signature: Uint8Array | string
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const sigBytes =
    typeof signature === "string" ? enc.encode(signature) : signature;

  // hash bytes by hashing a stable base64 representation
  const sigB64 = Buffer.from(sigBytes).toString("base64");
  const hex = await sha256Hex(sigB64);
  return hexToBytes(hex); // 32 bytes
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
