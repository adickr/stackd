import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

type SpotState = {
  silverZarPerOz: number;
  fetchedAt?: number;
  source?: string;

  setSpot: (args: { silverZarPerOz: number; fetchedAt: number; source: string }) => void;
  clear: () => void;
};

export const useSpotStore = create<SpotState>()(
  persist(
    (set) => ({
      silverZarPerOz: 0,
      fetchedAt: undefined,
      source: undefined,

      setSpot: ({ silverZarPerOz, fetchedAt, source }) =>
        set({ silverZarPerOz, fetchedAt, source }),

      clear: () => set({ silverZarPerOz: 0, fetchedAt: undefined, source: undefined }),
    }),
    {
      name: "stackd:spot",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
