import { create } from "zustand";
import { persist } from "zustand/middleware";

type AccountState = {
  walletAddress: string | null;
  isConnected: boolean;

  connectMock: () => void;
  disconnect: () => void;
};

function makeMockAddress() {
  // Stable-ish, human friendly. Not a real pubkey; fine for mock phase.
  const rand = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `STACKD_MOCK_${rand}`;
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      walletAddress: null,
      isConnected: false,

      connectMock: () => {
        const existing = get().walletAddress;
        set({
          walletAddress: existing ?? makeMockAddress(),
          isConnected: true,
        });
      },

      disconnect: () => set({ walletAddress: null, isConnected: false }),
    }),
    { name: "account-store" }
  )
);
