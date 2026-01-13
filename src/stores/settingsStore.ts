import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WeightUnit = "oz" | "g";

// ✅ You can add more later
export type DisplayCurrency = "USD" | "ZAR" | "EUR" | "GBP";

type SettingsState = {
  unit: WeightUnit;
  currency: DisplayCurrency;

  // Cloud backup UI metadata (persisted)
  hasCloudBackup: boolean;
  lastCloudBackupAt: number | null;

  setUnit: (unit: WeightUnit) => void;
  toggleUnit: () => void;

  setCurrency: (currency: DisplayCurrency) => void;
  toggleCurrency: () => void;

  setCloudBackupState: (p: { hasCloudBackup: boolean; lastCloudBackupAt: number | null }) => void;
  clearCloudBackupState: () => void;
};

const DEFAULTS: Pick<
  SettingsState,
  "unit" | "currency" | "hasCloudBackup" | "lastCloudBackupAt"
> = {
  unit: "oz",
  currency: "USD", // ✅ default
  hasCloudBackup: false,
  lastCloudBackupAt: null,
};

function isValidCurrency(x: any): x is DisplayCurrency {
  return x === "USD" || x === "ZAR" || x === "EUR" || x === "GBP";
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setUnit: (unit) => set({ unit }),
      toggleUnit: () => set({ unit: get().unit === "oz" ? "g" : "oz" }),

      setCurrency: (currency) => set({ currency }),

      // Keep toggle for quick dev/testing; it only flips USD/ZAR
      toggleCurrency: () =>
        set({ currency: get().currency === "USD" ? "ZAR" : "USD" }),

      setCloudBackupState: ({ hasCloudBackup, lastCloudBackupAt }) =>
        set({ hasCloudBackup, lastCloudBackupAt }),

      clearCloudBackupState: () =>
        set({ hasCloudBackup: false, lastCloudBackupAt: null }),
    }),
    {
      name: "stackd:settings",
      storage: createJSONStorage(() => AsyncStorage),
      version: 4, // bump
      migrate: (persisted: any, version) => {
        // v1 -> v2: cloud backup fields added
        if (version < 2) {
          persisted = {
            ...persisted,
            hasCloudBackup: false,
            lastCloudBackupAt: null,
          };
        }

        // v2 -> v3: USD default guard
        if (version < 3) {
          const cur = persisted?.currency;
          persisted = {
            ...persisted,
            currency: isValidCurrency(cur) ? cur : "USD",
          };
        }

        // v3 -> v4: validate currency again (now we allow EUR/GBP)
        if (version < 4) {
          const cur = persisted?.currency;
          persisted = {
            ...persisted,
            currency: isValidCurrency(cur) ? cur : "USD",
          };
        }

        return persisted;
      },
    }
  )
);
