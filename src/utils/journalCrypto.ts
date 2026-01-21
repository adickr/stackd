// Minimal + deterministic for mock phase.
// Later we can replace hash/sign with real SHA-256 + wallet signMessage.

export function stableStringify(value: any): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const keys = Object.keys(value).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
  return `{${entries.join(",")}}`;
}

// Simple non-crypto hash (FNV-1a style). Good enough for mock/dev.
export function hashString(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // unsigned + base16
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function hashObject(obj: any): string {
  return hashString(stableStringify(obj));
}

export function mockSignMessage(message: string, walletAddress: string): string {
  // Deterministic “signature” derived from message + address
  return `MOCKSIG_${hashString(`${walletAddress}::${message}`)}`;
}
