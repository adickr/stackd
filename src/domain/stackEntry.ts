export type StackEntry = {
  id: string;
  coinTypeId: string;
  quantity: number;
  totalPaid: number;     // ZAR
  purchasedAt: number;   // timestamp
  createdAt: number;     // timestamp
  notes?: string;
};
