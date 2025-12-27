import { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";

import { useStackStore } from "../src/stores/stackStore";
import { useSpotStore } from "../src/stores/spotStore";
import { useCoinStore } from "../src/stores/coinStore";
import { fetchSilverZarPerOz } from "../src/services/spot";

const TROY_OZ_IN_GRAMS = 31.1034768;

function fmt(n: number) {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function Home() {
  const router = useRouter();

  const entries = useStackStore((s) => s.entries);

  const getCoin = useCoinStore((s) => s.getCoin);
  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);

  const silverZarPerOz = useSpotStore((s) => s.silverZarPerOz);
  const fetchedAt = useSpotStore((s) => s.fetchedAt);
  const setSpot = useSpotStore((s) => s.setSpot);

  const [loadingSpot, setLoadingSpot] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  // ---------- totals ----------
  const totalOz = useMemo(() => {
    return entries.reduce((sum, e) => {
      const coin = getCoin(e.coinTypeId);
      if (!coin) return sum;
      const fineGrams = e.quantity * coin.fineWeightGrams;
      return sum + fineGrams / TROY_OZ_IN_GRAMS;
    }, 0);
  }, [entries, getCoin]);

  const totalValue = useMemo(() => {
    if (!silverZarPerOz) return 0;
    return totalOz * silverZarPerOz;
  }, [totalOz, silverZarPerOz]);

  // ---------- fetch spot ----------
  async function refreshSpot() {
    try {
      setLoadingSpot(true);
      const spot = await fetchSilverZarPerOz();
      setSpot(spot);
    } catch (e) {
      console.warn("Failed to fetch spot", e);
    } finally {
      setLoadingSpot(false);
    }
  }

  // auto-refresh if missing or stale (>1h)
  useEffect(() => {
    const stale = !fetchedAt || Date.now() - fetchedAt > 60 * 60 * 1000;
    if (stale) refreshSpot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 20 }}>
      {/* ---------- header ---------- */}
      <Text style={{ fontSize: 28, fontWeight: "900", marginBottom: 6 }}>
        Stackd
      </Text>
      <Text style={{ color: "#555", marginBottom: 16 }}>
        Your silver stack
      </Text>

      {/* ---------- totals ---------- */}
      <View
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 16,
          padding: 16,
          gap: 10,
          marginBottom: 16,
        }}
      >
        <Text style={{ fontSize: 16 }}>
          Total silver:{" "}
          <Text style={{ fontWeight: "900" }}>{fmt(totalOz)} oz</Text>
        </Text>

        <Text style={{ fontSize: 16 }}>
          Value:{" "}
          <Text style={{ fontWeight: "900" }}>
            R {fmt(totalValue)}
          </Text>
        </Text>

        <Pressable
          onPress={refreshSpot}
          disabled={loadingSpot}
          style={{
            marginTop: 6,
            paddingVertical: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#ddd",
            alignItems: "center",
          }}
        >
          {loadingSpot ? (
            <ActivityIndicator />
          ) : (
            <Text style={{ fontWeight: "800" }}>
              Refresh spot
              {silverZarPerOz ? ` (R ${fmt(silverZarPerOz)}/oz)` : ""}
            </Text>
          )}
        </Pressable>

        {fetchedAt && (
          <Text style={{ color: "#777", fontSize: 12 }}>
            Updated {new Date(fetchedAt).toLocaleString()}
          </Text>
        )}
      </View>

      {/* ---------- add button ---------- */}
      <Pressable
        onPress={() => router.push("/stack/add")}
        style={{
          backgroundColor: "#111",
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>
          + Stack silver
        </Text>
      </Pressable>

      {/* ---------- entries ---------- */}
      <Text style={{ fontSize: 18, fontWeight: "900", marginBottom: 10 }}>
        Entries
      </Text>

      <ScrollView contentContainerStyle={{ gap: 10 }}>
        {entries.length === 0 ? (
          <Text style={{ color: "#666" }}>
            No entries yet. Stack your first coin.
          </Text>
        ) : (
          entries.map((e) => {
            const coin = getCoin(e.coinTypeId);
            const coinName = coin?.name ?? "Unknown coin";
            const perUnitOz = coin ? coin.fineWeightGrams / TROY_OZ_IN_GRAMS : 0;
            const fineOz = perUnitOz * e.quantity;

            return (
              <Pressable
                key={e.id}
                onPress={() => router.push(`/entries/${e.id}`)}
                style={{
                  borderWidth: 1,
                  borderColor: "#eee",
                  borderRadius: 14,
                  padding: 14,
                  gap: 6,
                }}
              >
                <Text style={{ fontWeight: "900" }}>{coinName}</Text>

                <Text style={{ color: "#555" }}>
                  {e.quantity} × {fmt(perUnitOz)} oz = {fmt(fineOz)} oz
                </Text>

                <Text style={{ color: "#777" }}>
                  Paid R {fmt(e.totalPaid)}
                </Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}
