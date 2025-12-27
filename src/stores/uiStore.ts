import { create } from "zustand";

type UIState = {
  pendingCoinTypeId?: string;
  setPendingCoinTypeId: (id?: string) => void;
};

export const useUIStore = create<UIState>((set) => ({
  pendingCoinTypeId: undefined,
  setPendingCoinTypeId: (id) => set({ pendingCoinTypeId: id }),
}));
