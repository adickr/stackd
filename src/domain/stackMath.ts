import type { StackEntry } from "./stackEntry";
import type { CoinType } from "./coinType";

const TROY_OZ_IN_GRAMS = 31.1034768;

export function computeStackTotals(args: {
  entries: StackEntry[];
  getCoin: (id?: string) => CoinType | undefined;
  silverZarPerOz: number;
}) {
  const { entries, getCoin, silverZarPerOz } = args;

  let fineGrams = 0;
  let costBasis = 0;

  for (const e of entries) {
    const coin = getCoin(e.coinTypeId);
    if (!coin) continue;

    fineGrams += e.quantity * coin.fineWeightGrams;
    costBasis += e.totalPaid;
  }

  const fineOz = fineGrams / TROY_OZ_IN_GRAMS;
  const spotValue = silverZarPerOz > 0 ? fineOz * silverZarPerOz : 0;
  const pnl = spotValue - costBasis;

  return { fineGrams, fineOz, costBasis, spotValue, pnl };
}
