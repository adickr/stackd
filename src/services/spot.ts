// src/services/spot.ts

export type SpotCurrency = "USD" | "ZAR" | "EUR" | "GBP";

type ConvertResponse = {
  success?: boolean;
  result?: any;
  error?: { info?: string };
};

function requireAccessKey() {
  const accessKey = process.env.EXPO_PUBLIC_EXCHANGERATE_KEY;
  if (!accessKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_EXCHANGERATE_KEY. Add it to .env and restart Expo with: npx expo start -c"
    );
  }
  return accessKey;
}

async function convert(
  from: string,
  to: string,
  amount: number
): Promise<{ result: number; fetchedAt: number; source: string }> {
  const accessKey = requireAccessKey();

  const url =
    `https://api.exchangerate.host/convert` +
    `?access_key=${encodeURIComponent(accessKey)}` +
    `&from=${encodeURIComponent(from)}` +
    `&to=${encodeURIComponent(to)}` +
    `&amount=${encodeURIComponent(String(amount))}`;

  const res = await fetch(url);
  const data: ConvertResponse | null = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Spot API HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data?.success) {
    throw new Error(data?.error?.info ?? "Spot API failed (success=false)");
  }

  const result = Number(data.result);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`Invalid convert result ${from}→${to}: ${String(data?.result)}`);
  }

  return {
    result,
    fetchedAt: Date.now(),
    source: `exchangerate.host ${from}→${to}`,
  };
}

// ✅ Silver spot: 1 oz of silver (XAG) quoted in fiat
export async function fetchSilverPerOz(
  to: SpotCurrency
): Promise<{
  perOz: number;
  fetchedAt: number;
  source: string;
}> {
  const r = await convert("XAG", to, 1);
  return {
    perOz: r.result,
    fetchedAt: r.fetchedAt,
    source: `${r.source} (XAG/oz)`,
  };
}

// ✅ Fiat conversion helper (for cross-currency PnL later)
export async function convertFiat(
  amount: number,
  from: SpotCurrency,
  to: SpotCurrency
): Promise<{
  amountOut: number;
  fetchedAt: number;
  source: string;
}> {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("convertFiat: amount invalid");
  }
  if (from === to) {
    return { amountOut: amount, fetchedAt: Date.now(), source: "identity" };
  }

  const r = await convert(from, to, amount);
  return { amountOut: r.result, fetchedAt: r.fetchedAt, source: r.source };
}

// Backwards-compatible helper if any older code still imports this
export async function fetchSilverZarPerOz(): Promise<{
  silverZarPerOz: number;
  fetchedAt: number;
  source: string;
}> {
  const r = await fetchSilverPerOz("ZAR");
  return { silverZarPerOz: r.perOz, fetchedAt: r.fetchedAt, source: r.source };
}
