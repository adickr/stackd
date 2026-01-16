// src/utils/money.ts
import type { DisplayCurrency } from "../stores/settingsStore";

export function localeForCurrency(c: DisplayCurrency) {
  switch (c) {
    case "ZAR":
      return "en-ZA";
    case "EUR":
      return "en-IE";
    case "GBP":
      return "en-GB";
    case "USD":
    default:
      return "en-US";
  }
}

export function formatMoney(
  value: number,
  currency: DisplayCurrency,
  maxFractionDigits = 0
) {
  const safe = Number.isFinite(value) ? value : 0;

  try {
    return new Intl.NumberFormat(localeForCurrency(currency), {
      style: "currency",
      currency,
      maximumFractionDigits: maxFractionDigits,
    }).format(safe);
  } catch {
    // Fallback for environments without Intl support
    const rounded =
      maxFractionDigits <= 0
        ? Math.round(safe).toLocaleString()
        : safe.toFixed(maxFractionDigits);
    return `${currency} ${rounded}`;
  }
}

export function formatSpot(value: number, currency: DisplayCurrency) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return formatMoney(value, currency, 2);
}
