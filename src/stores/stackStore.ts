import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { StackEntry } from "../domain/stackEntry";

const uid = () => Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);

type StackState = {
  entries: StackEntry[];
  addEntry: (entry: Omit<StackEntry, "id" | "createdAt">) => void;
  getEntry: (id?: string) => StackEntry | undefined;
  removeEntry: (id: string) => void;
  updateEntry: (
    id: string,
    patch: Partial<Pick<StackEntry, "quantity" | "totalPaid" | "purchasedAt">>
  ) => void;
  clearAll: () => void;
};

export const useStackStore = create<StackState>()(
  persist(
    (set, get) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => ({
          entries: [{ ...entry, id: uid(), createdAt: Date.now() }, ...state.entries],
        })),
      getEntry: (id) => (id ? get().entries.find((e) => e.id === id) : undefined),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      updateEntry: (id, patch) =>
        set((state) => ({
          entries: state.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      clearAll: () => set({ entries: [] }),
    }),
    {
      name: "stackd:stack",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
