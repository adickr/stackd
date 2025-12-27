export async function fetchSilverZarPerOz(): Promise<{
  silverZarPerOz: number;
  fetchedAt: number;
  source: string;
}> {
  const accessKey = process.env.EXPO_PUBLIC_EXCHANGERATE_KEY;

  if (!accessKey) {
    throw new Error(
      "Missing EXPO_PUBLIC_EXCHANGERATE_KEY. Add it to .env and restart Expo with: npx expo start -c"
    );
  }

  const url =
    `https://api.exchangerate.host/convert` +
    `?access_key=${encodeURIComponent(accessKey)}` +
    `&from=XAG&to=ZAR&amount=1`;

  const res = await fetch(url);
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Spot API HTTP ${res.status}: ${JSON.stringify(data)}`);
  }

  if (!data?.success) {
    throw new Error(data?.error?.info ?? "Spot API failed (success=false)");
  }

  const result = Number(data.result);
  if (!Number.isFinite(result) || result <= 0) {
    throw new Error(`Invalid spot result: ${String(data.result)}`);
  }

  return {
    silverZarPerOz: result,
    fetchedAt: Date.now(),
    source: "exchangerate.host XAG→ZAR",
  };
}
