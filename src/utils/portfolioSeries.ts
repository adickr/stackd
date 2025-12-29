export type PortfolioPoint = {
  t: number;     // day timestamp (ms)
  v: number;     // total portfolio value (ZAR)
  oz: number;    // total fine oz held
};

type StackEntry = {
  coinTypeId: string;
  quantity: number;
  purchasedAt: number; // ms
};

type CoinType = {
  id: string;
  fineOzPerUnit: number;
};

type SpotPoint = {
  t: number; // ms
  zarPerOz: number;
};

// round timestamp to local day start
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

// Fill missing spot days by carrying last known value forward.
function normalizeSpotDaily(spots: SpotPoint[]): SpotPoint[] {
  const s = spots
    .map(p => ({ t: dayStart(p.t), zarPerOz: p.zarPerOz }))
    .sort((a,b) => a.t - b.t);

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
  spots: SpotPoint[]; // daily or irregular
}): PortfolioPoint[] {
  const { entries, coinTypes, spots } = args;

  const ctMap = new Map(coinTypes.map(c => [c.id, c.fineOzPerUnit]));
  const e = entries
    .map(en => ({
      t: dayStart(en.purchasedAt),
      oz: (en.quantity ?? 0) * (ctMap.get(en.coinTypeId) ?? 0),
    }))
    .filter(x => x.oz > 0)
    .sort((a,b) => a.t - b.t);

  const spotDaily = normalizeSpotDaily(spots);
  if (spotDaily.length === 0) return [];

  // If purchases start after first spot day, we still want a series from first spot day
  const startT = spotDaily[0].t;
  const endT = spotDaily[spotDaily.length - 1].t;

  let idx = 0;
  let heldOz = 0;

  const points: PortfolioPoint[] = [];
  for (let t = startT; t <= endT; t = addDays(t, 1)) {
    while (idx < e.length && e[idx].t <= t) {
      heldOz += e[idx].oz;
      idx++;
    }
    const spot = spotDaily.find(s => s.t === t)?.zarPerOz ?? spotDaily[0].zarPerOz;
    points.push({ t, oz: heldOz, v: heldOz * spot });
  }

  // Optional: drop leading zero-hold days
  const firstNonZero = points.findIndex(p => p.oz > 0);
  return firstNonZero >= 0 ? points.slice(firstNonZero) : points;
}
