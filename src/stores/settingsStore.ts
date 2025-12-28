import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WeightUnit = "oz" | "g";
export type DisplayCurrency = "ZAR" | "USD";

type SettingsState = {
  unit: WeightUnit;
  currency: DisplayCurrency;

  setUnit: (unit: WeightUnit) => void;
  toggleUnit: () => void;

  setCurrency: (currency: DisplayCurrency) => void;
  toggleCurrency: () => void;

  reset: () => void;
};

const DEFAULTS: Pick<SettingsState, "unit" | "currency"> = {
  unit: "oz",
  currency: "ZAR",
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setUnit: (unit) => set({ unit }),
      toggleUnit: () => set({ unit: get().unit === "oz" ? "g" : "oz" }),

      setCurrency: (currency) => set({ currency }),
      toggleCurrency: () => set({ currency: get().currency === "ZAR" ? "USD" : "ZAR" }),

      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: "stackd:settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
    }
  )
);
