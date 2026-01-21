import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type WeightUnit = "oz" | "g";
export type DisplayCurrency = "ZAR" | "USD";

type SettingsState = {
  unit: WeightUnit;
  currency: DisplayCurrency;

<<<<<<< HEAD
=======
  // Cloud backup UI metadata (persisteds)
  hasCloudBackup: boolean;
  lastCloudBackupAt: number | null;

>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
  setUnit: (unit: WeightUnit) => void;
  toggleUnit: () => void;

  setCurrency: (currency: DisplayCurrency) => void;
  toggleCurrency: () => void;

<<<<<<< HEAD
  reset: () => void;
};

const DEFAULTS: Pick<SettingsState, "unit" | "currency"> = {
  unit: "oz",
  currency: "ZAR",
=======
  setCloudBackupState: (p: { hasCloudBackup: boolean; lastCloudBackupAt: number | null }) => void;
  clearCloudBackupState: () => void;

  reset: () => void;
};

const DEFAULTS: Pick<
  SettingsState,
  "unit" | "currency" | "hasCloudBackup" | "lastCloudBackupAt"
> = {
  unit: "oz",
  currency: "ZAR",
  hasCloudBackup: false,
  lastCloudBackupAt: null,
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...DEFAULTS,

      setUnit: (unit) => set({ unit }),
      toggleUnit: () => set({ unit: get().unit === "oz" ? "g" : "oz" }),

      setCurrency: (currency) => set({ currency }),
<<<<<<< HEAD
      toggleCurrency: () => set({ currency: get().currency === "ZAR" ? "USD" : "ZAR" }),

=======
      toggleCurrency: () =>
        set({ currency: get().currency === "ZAR" ? "USD" : "ZAR" }),

      setCloudBackupState: ({ hasCloudBackup, lastCloudBackupAt }) =>
        set({ hasCloudBackup, lastCloudBackupAt }),

      clearCloudBackupState: () =>
        set({ hasCloudBackup: false, lastCloudBackupAt: null }),

      // Reset should return app preferences to defaults (including UI backup metadata)
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: "stackd:settings",
      storage: createJSONStorage(() => AsyncStorage),
<<<<<<< HEAD
      version: 1,
=======
      version: 2, // bump because we've added fields
      migrate: (persisted: any, version) => {
        // If upgrading from older versions, fill in new fields safely.
        if (version < 2) {
          return {
            ...persisted,
            hasCloudBackup: false,
            lastCloudBackupAt: null,
          };
        }
        return persisted;
      },
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
    }
  )
);
