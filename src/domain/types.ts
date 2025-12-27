export type Metal = "silver";

export type CoinType = {
  id: string;
  name: string;
  metal: Metal;          // v1 fixed to "silver"
  purity: number;        // e.g. 0.999
  fineWeightGrams: number; // e.g. 31.1035
  diameterMm?: number;
  thicknessMm?: number;
  hallmarks?: string;
  createdAt: number;
};
