// src/domain/stackEntry.ts

export type PaidCurrency = "USD" | "ZAR" | "EUR" | "GBP";

export type StackEntry = {
  id: string;
  coinTypeId: string;
  quantity: number;
  totalPaid: number;
  paidCurrency: PaidCurrency;
  purchasedAt: number;
  createdAt: number;
  notes?: string;
};
