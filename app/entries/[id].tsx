import { View, Text, Pressable, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useStackStore } from "../../src/stores/stackStore";
import { useCoinStore } from "../../src/stores/coinStore";

const TROY_OZ_IN_GRAMS = 31.1034768;

function formatMoneyZar(v: number) {
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  return `${sign}R${abs.toFixed(2)}`;
}

function shortDate(ts: number) {
  // YYYY-MM-DD (simple, stable)
  return new Date(ts).toISOString().slice(0, 10);
}

export default function EntryDetails() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const entry = useStackStore((s) => s.getEntry(id));
  const removeEntry = useStackStore((s) => s.removeEntry);

  const getCoin = useCoinStore((s) => s.getCoin);
  const coin = entry ? getCoin(entry.coinTypeId) : undefined;

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Entry not found.</Text>
      </View>
    );
  }

  const fineGrams = coin ? entry.quantity * coin.fineWeightGrams : 0;
  const fineOz = fineGrams / TROY_OZ_IN_GRAMS;

  const onDelete = () => {
    Alert.alert("Delete entry?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          removeEntry(entry.id);
          router.replace("/");
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Entry</Text>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#eee",
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Coin</Text>
        <Text>{coin ? coin.name : entry.coinTypeId}</Text>
        {coin ? (
          <Text style={{ color: "#555" }}>
            Purity {coin.purity} • Fine {coin.fineWeightGrams} g
          </Text>
        ) : null}
      </View>

      <View
        style={{
          padding: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: "#eee",
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Purchase</Text>
        <Text>Date: {shortDate(entry.purchasedAt)}</Text>
        <Text>Quantity: {entry.quantity}</Text>
        <Text>Total paid: {formatMoneyZar(entry.totalPaid)}</Text>
        <Text>Fine oz: {fineOz.toFixed(3)}</Text>
      </View>

      <Pressable
        onPress={() => router.push(`/entries/edit/${encodeURIComponent(entry.id)}`)}
        style={{
          backgroundColor: "#111",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>Edit</Text>
      </Pressable>

      <Pressable
        onPress={onDelete}
        style={{
          borderWidth: 1,
          borderColor: "#f2b8b5",
          backgroundColor: "#fff",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#b42318", fontWeight: "800" }}>Delete entry</Text>
      </Pressable>
    </View>
  );
}
