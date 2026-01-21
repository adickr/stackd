// src/stores/accountStore.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  transact,
  Web3MobileWallet,
} from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Buffer } from "buffer";
import bs58 from "bs58";

type Cluster = "solana:mainnet" | "solana:devnet";

const APP_IDENTITY = {
  name: "Stackd",
  uri: "https://stackd.app",
  icon: "favicon.ico",
};

function isUserCancelled(err: unknown) {
  const msg =
    err instanceof Error ? err.message : typeof err === "string" ? err : "";
  return (
    msg.toLowerCase().includes("cancellationexception") ||
    msg.toLowerCase().includes("cancel") ||
    msg === "USER_CANCELLED"
  );
}

function utf8ToBytes(message: string) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(message);
  return Uint8Array.from(message.split("").map((c) => c.charCodeAt(0)));
}

function b64PubkeyToBase58(b64: string) {
  const bytes = Buffer.from(b64, "base64");
  return bs58.encode(bytes);
}

type PersistedAccount = {
  authToken: string | null;
  walletAddressB64: string | null;
  walletAddressB58: string | null;
  cluster: Cluster;
};

type AccountState = {
  // connection
  isConnected: boolean;
  walletAddressB64: string | null;
  walletAddressB58: string | null;
  authToken: string | null;
  cluster: Cluster;

  // credits
  credits: number | null;
  creditsLoading: boolean;
  creditsError: string | null;
  refreshCredits: () => Promise<void>;

  // actions
  connect: () => Promise<void>;
  ensureConnected: () => Promise<boolean>;
  disconnect: () => Promise<void>;

  // signing
  signMessages: (messages: string[]) => Promise<string[]>;
  signMessage: (message: string) => Promise<string>;
};

export const useAccountStore = create<AccountState>()(
  persist<AccountState, [], [], PersistedAccount>(
    (set, get) => ({
      isConnected: false,
      walletAddressB64: null,
      walletAddressB58: null,
      authToken: null,
      cluster: "solana:mainnet",

      // credits state
      credits: null,
      creditsLoading: false,
      creditsError: null,

      refreshCredits: async () => {
        const walletAddress = get().walletAddressB58;
        if (!walletAddress) {
          set({
            credits: null,
            creditsLoading: false,
            creditsError: "NO_WALLET",
          });
          return;
        }

        set({ creditsLoading: true, creditsError: null });

        try {
          const baseUrl =
            (process.env.EXPO_PUBLIC_RELAY_URL as string | undefined) ??
            (process.env.EXPO_PUBLIC_RELAY_BASE_URL as string | undefined) ??
            "http://localhost:8787";

          const url = `${baseUrl.replace(/\/$/, "")}/v1/credits/balance?walletAddress=${encodeURIComponent(
            walletAddress
          )}`;

          console.log("[credits] fetching", url);

          const res = await fetch(url);

          if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`CREDITS_HTTP_${res.status}${text ? `: ${text}` : ""}`);
          }

          const json: any = await res.json().catch(() => null);
          const balance =
            typeof json?.balance === "number"
              ? json.balance
              : typeof json?.credits === "number"
                ? json.credits
                : typeof json?.remaining === "number"
                  ? json.remaining
                  : null;

          if (balance === null) throw new Error("CREDITS_BAD_RESPONSE");

          set({
            credits: balance,
            creditsLoading: false,
            creditsError: null,
          });
        } catch (err: any) {
          console.warn("[credits] refresh failed", err);
          set({
            creditsLoading: false,
            creditsError: err?.message ?? "CREDITS_UNKNOWN",
          });
        }
      },

      connect: async () => {
        try {
          const { authToken, cluster } = get();

          const result = await transact(async (wallet: Web3MobileWallet) => {
            const auth = await wallet.authorize({
              chain: cluster,
              identity: APP_IDENTITY,
              auth_token: authToken ?? undefined,
            });

            const addressB64 = auth.accounts?.[0]?.address ?? null;
            const addressB58 = addressB64 ? b64PubkeyToBase58(addressB64) : null;

            return { addressB64, addressB58, authToken: auth.auth_token };
          });

          set({
            isConnected: !!result.addressB64,
            walletAddressB64: result.addressB64,
            walletAddressB58: result.addressB58,
            authToken: result.authToken,
          });

          get().refreshCredits().catch(() => undefined);
        } catch (err) {
          if (isUserCancelled(err)) {
            console.log("[MWA] connect cancelled by user");
            return;
          }
          console.error("[MWA] connect failed:", err);
          throw err;
        }
      },

      ensureConnected: async () => {
        const { authToken, cluster } = get();
        if (!authToken) return false;

        try {
          const result = await transact(async (wallet: Web3MobileWallet) => {
            const auth = await wallet.authorize({
              chain: cluster,
              identity: APP_IDENTITY,
              auth_token: authToken,
            });

            const addressB64 = auth.accounts?.[0]?.address ?? null;
            if (!addressB64) return null;

            return {
              authToken: auth.auth_token,
              addressB64,
              addressB58: b64PubkeyToBase58(addressB64),
            };
          });

          if (!result) return false;

          set({
            isConnected: true,
            walletAddressB64: result.addressB64,
            walletAddressB58: result.addressB58,
            authToken: result.authToken,
          });

          get().refreshCredits().catch(() => undefined);
          return true;
        } catch {
          set({
            isConnected: false,
            walletAddressB64: null,
            walletAddressB58: null,
          });
          return false;
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
            walletAddressB64: null,
            walletAddressB58: null,
            authToken: null,
            credits: null,
            creditsLoading: false,
            creditsError: null,
          });
        }
      },

      signMessages: async (messages: string[]) => {
        if (!Array.isArray(messages) || messages.length === 0) {
          throw new Error("signMessages requires at least one message");
        }

        try {
          const { authToken, cluster, walletAddressB64 } = get();

          const result = await transact(async (wallet: Web3MobileWallet) => {
            const auth = await wallet.authorize({
              chain: cluster,
              identity: APP_IDENTITY,
              auth_token: authToken ?? undefined,
            });

            const addressB64 =
              walletAddressB64 ?? auth.accounts?.[0]?.address ?? null;
            if (!addressB64) throw new Error("No wallet address available");

            const payloads = messages.map(utf8ToBytes);

            const signedPayloads = await wallet.signMessages({
              addresses: Array(messages.length).fill(addressB64),
              payloads,
            });

            if (!signedPayloads || signedPayloads.length !== messages.length) {
              throw new Error("Unexpected signed payloads response");
            }

            const sigsB64 = signedPayloads.map((p) =>
              Buffer.from(p).toString("base64")
            );

            return {
              addressB64,
              addressB58: b64PubkeyToBase58(addressB64),
              authToken: auth.auth_token,
              sigsB64,
            };
          });

          set({
            isConnected: true,
            walletAddressB64: result.addressB64,
            walletAddressB58: result.addressB58,
            authToken: result.authToken,
          });

          return result.sigsB64;
        } catch (err) {
          if (isUserCancelled(err)) {
            console.log("[MWA] signMessages cancelled by user");
            throw new Error("USER_CANCELLED");
          }
          console.error("[MWA] signMessages failed:", err);
          throw err;
        }
      },

      signMessage: async (message: string) => {
        const sigs = await get().signMessages([message]);
        return sigs[0];
      },
    }),
    {
      name: "account-store",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state): PersistedAccount => ({
        authToken: state.authToken,
        walletAddressB64: state.walletAddressB64,
        walletAddressB58: state.walletAddressB58,
        cluster: state.cluster,
      }),
    }
  )
);
