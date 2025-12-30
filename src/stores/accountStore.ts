import { create } from "zustand";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Buffer } from "buffer";

type Cluster = "solana:mainnet" | "solana:devnet";

const APP_IDENTITY = {
  name: "Stackd",
  uri: "https://stackd.app",
  icon: "favicon.ico",
};

function isUserCancelled(err: unknown) {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  // Common Android cancel surface from MWA:
  // "java.util.concurrent.CancellationException"
  return (
    msg.toLowerCase().includes("cancellationexception") ||
    msg.toLowerCase().includes("cancel")
  );
}

function utf8ToBytes(message: string) {
  // In RN, TextEncoder exists in modern runtimes; fallback is safe.
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(message);
  return Uint8Array.from(message.split("").map((c) => c.charCodeAt(0)));
}

type AccountState = {
  // state
  isConnected: boolean;
  walletAddress: string | null; // NOTE: MWA returns base64-encoded address
  authToken: string | null;
  cluster: Cluster;

  // actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>; // returns base64 signed payload
};

export const useAccountStore = create<AccountState>((set, get) => ({
  isConnected: false,
  walletAddress: null,
  authToken: null,
  cluster: "solana:mainnet",

  connect: async () => {
    try {
      const { authToken, cluster } = get();

      const result = await transact(async (wallet: Web3MobileWallet) => {
        const auth = await wallet.authorize({
          chain: cluster,
          identity: APP_IDENTITY,
          auth_token: authToken ?? undefined,
        });

        const address = auth.accounts?.[0]?.address ?? null;

        return { address, authToken: auth.auth_token };
      });

      set({
        isConnected: !!result.address,
        walletAddress: result.address,
        authToken: result.authToken,
      });
    } catch (err) {
      if (isUserCancelled(err)) {
        // User backed out of the wallet UI — don’t treat as a hard error
        console.log("[MWA] connect cancelled by user");
        return;
      }
      console.error("[MWA] connect failed:", err);
      throw err;
    }
  },

  disconnect: async () => {
    const { authToken } = get();

    try {
      if (authToken) {
        await transact(async (wallet: Web3MobileWallet) => {
          await wallet.deauthorize({ auth_token: authToken });
        });
      }
    } catch (err) {
      console.error("[MWA] disconnect error:", err);
    } finally {
      set({
        isConnected: false,
        walletAddress: null,
        authToken: null,
      });
    }
  },

  signMessage: async (message: string) => {
    try {
      const { authToken, cluster, walletAddress } = get();

      const result = await transact(async (wallet: Web3MobileWallet) => {
        // Ensure we’re authorized (reauthorize silently if possible)
        const auth = await wallet.authorize({
          chain: cluster,
          identity: APP_IDENTITY,
          auth_token: authToken ?? undefined,
        });

        const address = walletAddress ?? auth.accounts?.[0]?.address ?? null;
        if (!address) throw new Error("No wallet address available");

        const payload = utf8ToBytes(message);

        // IMPORTANT: Per docs, signMessages returns Uint8Array[] of signed payloads :contentReference[oaicite:1]{index=1}
        const signedPayloads = await wallet.signMessages({
          addresses: [address],
          payloads: [payload],
        });

        const signed0 = signedPayloads?.[0];
        if (!signed0) throw new Error("No signed payload returned from wallet");

        const signedPayloadB64 = Buffer.from(signed0).toString("base64");

        return {
          address,
          authToken: auth.auth_token,
          signedPayloadB64,
        };
      });

      // keep session fresh
      set({
        isConnected: true,
        walletAddress: result.address,
        authToken: result.authToken,
      });

      return result.signedPayloadB64;
    } catch (err) {
      if (isUserCancelled(err)) {
        console.log("[MWA] signMessage cancelled by user");
        // Throw a recognizable error so UI can ignore it cleanly
        throw new Error("USER_CANCELLED");
      }
      console.error("[MWA] signMessage failed:", err);
      throw err;
    }
  },
}));
