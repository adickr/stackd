import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WeightUnit = "oz" | "g";

/* ---------------------------------------------
   ✅ Single source of truth for currencies
---------------------------------------------- */

export const SUPPORTED_CURRENCIES = ["USD", "ZAR", "EUR", "GBP"] as const;
export type DisplayCurrency = typeof SUPPORTED_CURRENCIES[number];

/* ---------------------------------------------
   Store shape
---------------------------------------------- */

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

  setCloudBackupState: (p: {
    hasCloudBackup: boolean;
    lastCloudBackupAt: number | null;
  }) => void;

  clearCloudBackupState: () => void;
};

/* ---------------------------------------------
   Defaults
---------------------------------------------- */

const DEFAULTS: Pick<
  SettingsState,
  "unit" | "currency" | "hasCloudBackup" | "lastCloudBackupAt"
> = {
  unit: "oz",
  currency: "USD",
  hasCloudBackup: false,
  lastCloudBackupAt: null,
};

/* ---------------------------------------------
   Guards
---------------------------------------------- */

function isValidCurrency(x: any): x is DisplayCurrency {
  return SUPPORTED_CURRENCIES.includes(x);
}

/* ---------------------------------------------
   Store
---------------------------------------------- */

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setUnit: (unit) => set({ unit }),
      toggleUnit: () =>
        set({ unit: get().unit === "oz" ? "g" : "oz" }),

      setCurrency: (currency) => set({ currency }),

      // ⚠️ Dev convenience only (kept intentionally)
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
      version: 4,

      migrate: (persisted: any, version) => {
        let next = { ...persisted };

        // v1 → v2: add cloud backup fields
        if (version < 2) {
          next.hasCloudBackup = false;
          next.lastCloudBackupAt = null;
        }

        // v2 → v3: ensure currency exists
        if (version < 3) {
          next.currency = isValidCurrency(next.currency)
            ? next.currency
            : "USD";
        }

        // v3 → v4: allow EUR / GBP
        if (version < 4) {
          next.currency = isValidCurrency(next.currency)
            ? next.currency
            : "USD";
        }

        return next;
      },
    }
  )
);
