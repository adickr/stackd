// src/domain/stackEntry.ts
import type { DisplayCurrency } from "../stores/settingsStore";

export type StackCategory = "bullion" | "collector" | "jewellery" | "scrap" | "other";

export type StackEntry = {
  id: string;
  coinTypeId: string;
  quantity: number;

  totalPaid: number;              // amount in paidCurrency (0 allowed = gift)
  paidCurrency: DisplayCurrency;  // ✅ USD | ZAR | EUR | GBP

  category: StackCategory;        // ✅ new (defaults to "other" for old data)

  purchasedAt: number; // timestamp (ms)
  createdAt: number;   // timestamp (ms)
  notes?: string;
};
