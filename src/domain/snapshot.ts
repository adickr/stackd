// src/domain/snapshot.ts
import { CoinType } from "./coinType";
import { StackEntry } from "./stackEntry";

/**
 * SnapshotV1 is the encrypted payload stored in the cloud.
 * It is designed to be stable + forward compatible.
 */
export type SnapshotV1 = {
  schemaVersion: "snapshot.v1";
  createdAt: number; // ms since epoch
  walletAddress: string; // base58 pubkey string
  coins: CoinType[];
  entries: StackEntry[];
};

export function buildSnapshotV1(args: {
  walletAddress: string;
  coins: CoinType[];
  entries: StackEntry[];
  now?: number;
}): SnapshotV1 {
  return {
    schemaVersion: "snapshot.v1",
    createdAt: args.now ?? Date.now(),
    walletAddress: args.walletAddress,
    coins: args.coins,
    entries: args.entries,
  };
}
