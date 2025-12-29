export type PortfolioValuePoint = { t: number; v: number };

type StackEntry = {
  coinTypeId: string;
  quantity: number;
  purchasedAt: number; // ms
};

type CoinType = {
  id: string;
  fineOzPerUnit: number; // adjust if yours differs
};

type SpotPoint = {
  t: number; // ms
  zarPerOz: number;
};

function dayStart(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addDays(ms: number, days: number) {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function normalizeSpotDaily(spots: SpotPoint[]): SpotPoint[] {
  const s = spots
    .map((p) => ({ t: dayStart(p.t), zarPerOz: p.zarPerOz }))
    .filter((p) => Number.isFinite(p.zarPerOz))
    .sort((a, b) => a.t - b.t);

  if (s.length === 0) return [];

  const out: SpotPoint[] = [];
  let last = s[0].zarPerOz;

  let i = 0;
  for (let t = s[0].t; t <= s[s.length - 1].t; t = addDays(t, 1)) {
    while (i < s.length && s[i].t === t) {
      last = s[i].zarPerOz;
      i++;
    }
    out.push({ t, zarPerOz: last });
  }
  return out;
}

export function buildPortfolioValueSeriesDaily(args: {
  entries: StackEntry[];
  coinTypes: CoinType[];
  spots: SpotPoint[];
  rangeDays?: number; // 7, 30, etc. omit for ALL
}): PortfolioValuePoint[] {
  const { entries, coinTypes, spots, rangeDays } = args;

  const spotDaily = normalizeSpotDaily(spots);
  if (spotDaily.length === 0) return [];

  const ctMap = new Map(coinTypes.map((c) => [c.id, c.fineOzPerUnit]));

  // purchases aggregated by day (fine oz)
  const purchasesByDay = new Map<number, number>();
  for (const e of entries) {
    const oz =
      (e.quantity ?? 0) * (ctMap.get(e.coinTypeId) ?? 0);

    if (!Number.isFinite(oz) || oz <= 0) continue;

    const t = dayStart(e.purchasedAt);
    purchasesByDay.set(t, (purchasesByDay.get(t) ?? 0) + oz);
  }

  const startAll = spotDaily[0].t;
  const endAll = spotDaily[spotDaily.length - 1].t;

  const startT =
    typeof rangeDays === "number"
      ? Math.max(startAll, addDays(endAll, -(rangeDays - 1)))
      : startAll;

  // We need holdings at startT, so accumulate from startAll to startT-1
  let heldOz = 0;
  for (let t = startAll; t < startT; t = addDays(t, 1)) {
    heldOz += purchasesByDay.get(t) ?? 0;
  }

  const points: PortfolioValuePoint[] = [];
  for (let t = startT; t <= endAll; t = addDays(t, 1)) {
    heldOz += purchasesByDay.get(t) ?? 0;

    // spotDaily is contiguous now, so we can index by offset
    const idx = Math.round((t - startAll) / (24 * 60 * 60 * 1000));
    const spot = spotDaily[idx]?.zarPerOz ?? spotDaily[spotDaily.length - 1].zarPerOz;

    points.push({ t, v: heldOz * spot });
  }

  // Trim leading zeros for nicer chart
  const firstNonZero = points.findIndex((p) => p.v > 0);
  return firstNonZero >= 0 ? points.slice(firstNonZero) : points;
}
