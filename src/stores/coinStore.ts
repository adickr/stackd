import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoinType } from "../domain/coinType";

type CoinState = {
  coins: CoinType[];
  seedIfEmpty: () => void;
  getCoin: (id?: string) => CoinType | undefined;
  upsertCoin: (coin: CoinType) => void;
  clearAll: () => void;
};

const seedCoins: CoinType[] = [
  {
    id: "ase-1oz",
    name: "American Silver Eagle 1 oz",
    metal: "silver",
    purity: 0.999,
    fineWeightGrams: 31.1035,
    diameterMm: 40.6,
    thicknessMm: 2.98,
    createdAt: Date.now(),
  },
  {
    id: "maple-1oz",
    name: "Canadian Maple Leaf 1 oz",
    metal: "silver",
    purity: 0.9999,
    fineWeightGrams: 31.1035,
    diameterMm: 38.0,
    thicknessMm: 3.29,
    createdAt: Date.now(),
  },
];

export const useCoinStore = create<CoinState>()(
  persist(
    (set, get) => ({
      coins: [],
      seedIfEmpty: () => {
        if (get().coins.length > 0) return;
        set({ coins: seedCoins });
      },
      getCoin: (id) => (id ? get().coins.find((c) => c.id === id) : undefined),
      upsertCoin: (coin) =>
        set((state) => {
          const idx = state.coins.findIndex((c) => c.id === coin.id);
          if (idx === -1) return { coins: [coin, ...state.coins] };
          const next = state.coins.slice();
          next[idx] = { ...next[idx], ...coin };
          return { coins: next };
        }),
      clearAll: () => set({ coins: [] }),
    }),
    {
      name: "stackd:coins",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
