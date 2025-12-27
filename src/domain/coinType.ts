export type Metal = "silver";

export type CoinType = {
  id: string;
  name: string;
  metal: Metal;
  purity: number;
  fineWeightGrams: number;
  diameterMm?: number;
  thicknessMm?: number;
  hallmarks?: string[];
  notes?: string;
  createdAt: number;
};
