import type { DisplayCurrency, WeightUnit } from "../stores/settingsStore";

export const TROY_OZ_GRAMS = 31.1035;

export function formatWeight(oz: number, unit: WeightUnit) {
  if (!Number.isFinite(oz)) oz = 0;
  if (unit === "g") {
    const g = oz * TROY_OZ_GRAMS;
    return `${g.toFixed(g < 100 ? 1 : 0)} g`;
  }
  return `${oz.toFixed(2)} oz`;
}

export function formatMoney(amount: number, currency: DisplayCurrency) {
  if (!Number.isFinite(amount)) amount = 0;
  try {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    const symbol = currency === "USD" ? "$" : "R";
    return `${symbol} ${Math.round(amount).toLocaleString()}`;
  }
}
