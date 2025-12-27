import { useMemo, useState, useEffect } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useCoinStore } from "../../src/stores/coinStore";

function norm(s: string) {
  return s.trim().toLowerCase();
}

export default function CoinPicker() {
  const router = useRouter();

  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);
  const coins = useCoinStore((s) => s.coins);

  const [q, setQ] = useState("");

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  const results = useMemo(() => {
    const query = norm(q);
    if (!query) return coins;

    return coins.filter((c) => {
      const hay = norm(`${c.name} ${c.metal} ${c.purity} ${c.fineWeightGrams}`);
      return hay.includes(query);
    });
  }, [q, coins]);

  const selectCoin = (coinTypeId: string) => {
    // Go back to Add screen and set coinTypeId via query param
    router.replace(`/stack/add?coinTypeId=${encodeURIComponent(coinTypeId)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Pick a coin</Text>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search (e.g. eagle, maple, 0.999)"
        placeholderTextColor="#777"
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 12,
          borderRadius: 12,
        }}
      />

      <ScrollView contentContainerStyle={{ gap: 10 }}>
        {results.length === 0 ? (
          <Text style={{ color: "#666" }}>No results.</Text>
        ) : (
          results.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => selectCoin(c.id)}
              style={{
                borderWidth: 1,
                borderColor: "#eee",
                borderRadius: 14,
                padding: 14,
                gap: 6,
              }}
            >
              <Text style={{ fontWeight: "900" }}>{c.name}</Text>
              <Text style={{ color: "#555" }}>
                {c.metal} • purity {c.purity} • {c.fineWeightGrams} g fine
              </Text>
            </Pressable>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.back()}
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#111", fontWeight: "800" }}>Back</Text>
      </Pressable>
    </View>
  );
}
