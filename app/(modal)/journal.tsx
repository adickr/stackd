// app/(modal)/journal.tsx
import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useJournalStore } from "../../src/stores/journalStore";
import { useAccountStore } from "../../src/stores/accountStore";
import { useCoinStore } from "../../src/stores/coinStore";
import { useStackStore } from "../../src/stores/stackStore";

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

function isUserCancel(err: any) {
  const msg = String(err?.message ?? err);
  return (
    msg.includes("CancellationException") ||
    msg.toLowerCase().includes("cancel") ||
    msg === "USER_CANCELLED"
  );
}

export default function JournalScreen() {
  const router = useRouter();

  const anchors = useJournalStore((s) => s.anchors);
  const inventories = useJournalStore((s) => s.inventories);

  const isConnected = useAccountStore((s) => s.isConnected);
  const connect = useAccountStore((s) => s.connect);

  // ✅ use safe replace actions (no manual loops, no regen ids)
  const safeReplaceCoins = useCoinStore((s) => s.safeReplaceAll);
  const safeReplaceStack = useStackStore((s) => s.safeReplaceAll);

  const data = useMemo(
    () => [...anchors].sort((a, b) => b.createdAt - a.createdAt),
    [anchors]
  );

  const latestAnchor = data.length ? data[0] : null;
  const latestBackup = latestAnchor
    ? inventories?.[latestAnchor.inventoryHash]
    : null;

  const handleConnect = async () => {
    try {
      await connect();
    } catch (e: any) {
      if (isUserCancel(e)) return;
      Alert.alert("Wallet connect failed", e?.message ?? String(e));
    }
  };

  const handleRestore = () => {
    if (!latestAnchor) return;

    if (!latestBackup) {
      Alert.alert(
        "No backup found",
        "This seal doesn't have a matching inventory backup stored on this device."
      );
      return;
    }

    Alert.alert(
      "Restore inventory?",
      "This will restore your inventory from the latest seal.\n\nCoins will be updated (seeds kept). Stack entries will be replaced.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: () => {
            try {
              // 1) Restore coins first
              // keepSeeds: always true
              // keepLocalExtras: true prevents nuking local custom coins if backup doesn't contain full coin defs
              const coinReport = safeReplaceCoins(latestBackup.coins, {
                keepSeeds: true,
                keepLocalExtras: true,
              });

              // 2) Restore stack entries, dropping entries that reference unknown coins
              const knownCoinIds = new Set(
                useCoinStore.getState().coins.map((c) => c.id)
              );

              const stackReport = safeReplaceStack(latestBackup.entries, {
                knownCoinIds,
                dropUnknownCoinRefs: true,
              });

              const warnings = [
                ...coinReport.warnings,
                ...stackReport.warnings,
              ].slice(0, 6); // keep alert readable

              Alert.alert(
                "Restored",
                `Coins: applied ${coinReport.applied}, dropped ${coinReport.dropped}\n` +
                  `Entries: applied ${stackReport.applied}, dropped ${stackReport.dropped}\n` +
                  (stackReport.unknownCoinRefs
                    ? `Unknown coin refs: ${stackReport.unknownCoinRefs}\n`
                    : "") +
                  (warnings.length ? `\nWarnings:\n• ${warnings.join("\n• ")}` : "")
              );
            } catch (e: any) {
              Alert.alert("Restore failed", e?.message ?? String(e));
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Journal</Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.75 }]}
            hitSlop={10}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {!isConnected ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>Locked</Text>
            <Text style={styles.emptySub}>
              Connect your wallet to unlock journal sealing and backups.
            </Text>

            <Pressable
              onPress={handleConnect}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryText}>Connect wallet</Text>
            </Pressable>
          </View>
        ) : data.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyTitle}>No seals yet</Text>
            <Text style={styles.emptySub}>
              Seal a snapshot from Settings and it will appear here.
            </Text>
          </View>
        ) : (
          <>
            {/* ✅ Restore CTA (uses latest seal) */}
            <View style={styles.restoreCard}>
              <Text style={styles.restoreTitle}>Restore</Text>
              <Text style={styles.restoreSub}>
                Latest seal: {latestAnchor ? formatDate(latestAnchor.createdAt) : "—"}
                {"\n"}
                Backup: {latestBackup ? "available" : "missing"}
              </Text>

              <Pressable
                onPress={handleRestore}
                disabled={!latestBackup}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  {
                    marginTop: 12,
                    opacity: !latestBackup ? 0.45 : pressed ? 0.9 : 1,
                  },
                ]}
              >
                <Text style={styles.primaryText}>Restore from latest seal</Text>
              </Pressable>
            </View>

            <FlatList
              data={data}
              keyExtractor={(a) => a.id}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              renderItem={({ item }) => (
                <View style={styles.item}>
                  <Text style={styles.itemTitle}>{formatDate(item.createdAt)}</Text>

                  <Text style={styles.itemSub}>
                    Level: {item.levelName ?? "—"} •{" "}
                    {(item.totalFineOz ?? 0).toFixed(4)} oz
                  </Text>

                  <Text style={styles.itemSub}>
                    Spot: {item.currency ?? "—"} {(item.spotPrice ?? 0).toFixed(2)}
                    /oz • Stack: {item.currency ?? "—"} {item.stackValue ?? 0}
                  </Text>

                  <Text style={styles.itemTiny}>
                    Signed by: {item.walletAddress ?? "—"}
                  </Text>
                  <Text style={styles.itemTiny}>sig: {item.signature ?? "—"}</Text>

                  <Text style={styles.itemTiny}>
                    backup: {inventories?.[item.inventoryHash] ? "yes" : "no"} • invHash:{" "}
                    {item.inventoryHash?.slice(0, 10) ?? "—"}…
                  </Text>
                </View>
              )}
            />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 16 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: "800" },

  doneBtn: { alignSelf: "flex-start" },
  doneText: { fontSize: 14, fontWeight: "900", opacity: 0.65 },

  card: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  emptyTitle: { fontSize: 16, fontWeight: "900", opacity: 0.85 },
  emptySub: { marginTop: 8, fontSize: 12, opacity: 0.65 },

  primaryBtn: {
    marginTop: 14,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  primaryText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },

  restoreCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 12,
  },
  restoreTitle: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
  restoreSub: { marginTop: 8, fontSize: 12, opacity: 0.7, lineHeight: 16 },

  item: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  itemTitle: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
  itemSub: { marginTop: 6, fontSize: 12, opacity: 0.75 },
  itemTiny: { marginTop: 8, fontSize: 11, opacity: 0.55 },
});
