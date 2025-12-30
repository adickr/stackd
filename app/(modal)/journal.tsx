import React, { useMemo } from "react";
import { View, Text, StyleSheet, Pressable, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { useJournalStore } from "../../src/stores/journalStore";
import { useAccountStore } from "../../src/stores/accountStore";

function formatDate(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function JournalScreen() {
  const router = useRouter();

  const anchors = useJournalStore((s) => s.anchors);
  const isConnected = useAccountStore((s) => s.isConnected);
  const connectMock = useAccountStore((s) => s.connectMock);

  const data = useMemo(
    () => [...anchors].sort((a, b) => b.createdAt - a.createdAt),
    [anchors]
  );

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
              onPress={connectMock}
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
          <FlatList
            data={data}
            keyExtractor={(a) => a.id}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            renderItem={({ item }) => (
              <View style={styles.item}>
                <Text style={styles.itemTitle}>{formatDate(item.createdAt)}</Text>

                <Text style={styles.itemSub}>
                  Level: {item.levelName} • {item.totalFineOz.toFixed(4)} oz
                </Text>

                <Text style={styles.itemSub}>
                  Spot: {item.currency} {item.spotPrice.toFixed(2)}/oz • Stack:{" "}
                  {item.currency} {item.stackValue}
                </Text>

                <Text style={styles.itemTiny}>Signed by: {item.walletAddress}</Text>
                <Text style={styles.itemTiny}>sig: {item.signature}</Text>
              </View>
            )}
          />
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

  item: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  itemTitle: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
  itemSub: { marginTop: 6, fontSize: 12, opacity: 0.75 },
  itemTiny: { marginTop: 8, fontSize: 11, opacity: 0.55 },
});
