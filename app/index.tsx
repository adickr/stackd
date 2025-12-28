import React, { useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path, G, Circle } from "react-native-svg";

import { useStackStore } from "../src/stores/stackStore";
import { useCoinStore } from "../src/stores/coinStore";
import { useSpotStore } from "../src/stores/spotStore";
import { useSettingsStore } from "../src/stores/settingsStore";

const TROY_OZ_GRAMS = 31.1035;

/* ---------------- helpers ---------------- */

function formatCurrency(value: number, currency: "ZAR" | "USD") {
  try {
    return new Intl.NumberFormat(
      currency === "ZAR" ? "en-ZA" : "en-US",
      { style: "currency", currency, maximumFractionDigits: 0 }
    ).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function formatWeight(oz: number, unit: "oz" | "g") {
  if (unit === "g") {
    const g = oz * TROY_OZ_GRAMS;
    return `${g.toFixed(g < 100 ? 1 : 0)} g`;
  }
  return `${oz.toFixed(2)} oz`;
}

/* ---------------- screen ---------------- */

export default function HomeScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);

  const entries = useStackStore((s) => s.entries);
  const coins = useCoinStore((s) => s.coins);
  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);

  const spotZar = useSpotStore((s) => s.silverZarPerOz);
  const spotUsd = useSpotStore((s) => s.silverUsdPerOz);
  const fetchedAt = useSpotStore((s) => s.fetchedAt);
  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const isLoading = useSpotStore((s) => s.isLoading);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  const coinById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS;
    }
    return map;
  }, [coins]);

  const totalOz = useMemo(() => {
    return entries.reduce(
      (sum, e) => sum + e.quantity * (coinById[e.coinTypeId] ?? 0),
      0
    );
  }, [entries, coinById]);

  const spot = currency === "ZAR" ? spotZar : spotUsd;
  const portfolioValue = spot > 0 ? totalOz * spot : 0;

  /* --------- My Stack (donut) --------- */

  const stackSlices = useMemo(() => {
    const byId: Record<string, number> = {};
    for (const e of entries) {
      byId[e.coinTypeId] =
        (byId[e.coinTypeId] ?? 0) +
        e.quantity * (coinById[e.coinTypeId] ?? 0);
    }

    const total = Object.values(byId).reduce((a, b) => a + b, 0) || 1;
    return Object.entries(byId)
      .map(([id, oz]) => ({
        id,
        name: coins.find((c) => c.id === id)?.name ?? "Unknown",
        pct: oz / total,
      }))
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 5);
  }, [entries, coinById, coins]);

  /* ---------------- render ---------------- */

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={refreshSpot} />
      }
    >
      {/* Hero */}
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <Text style={styles.appTitle}>Stackd</Text>
          <Pressable onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={22} />
          </Pressable>
        </View>

        <Text style={styles.heroValue}>
          {portfolioValue > 0 ? formatCurrency(portfolioValue, currency) : "—"}
        </Text>

        <Text style={styles.heroSub}>
          {formatWeight(totalOz, unit)} • {currency}/oz •{" "}
          {fetchedAt ? "updated" : "tap refresh"}
        </Text>
      </View>

      {/* My Stack */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>My Stack</Text>

        <View style={styles.donutWrap}>
          <Svg width={180} height={180} viewBox="0 0 100 100">
            <G rotation="-90" origin="50,50">
              {renderDonut(stackSlices)}
            </G>
          </Svg>
        </View>

        {stackSlices.map((s) => (
          <View key={s.id} style={styles.sliceRow}>
            <Text style={styles.sliceName}>{s.name}</Text>
            <Text style={styles.slicePct}>
              {Math.round(s.pct * 100)}%
            </Text>
          </View>
        ))}
      </View>

      {/* CTA */}
      <Pressable
        onPress={() => router.push("/stack/add")}
        style={styles.cta}
      >
        <Text style={styles.ctaText}>＋ Stack</Text>
      </Pressable>
    </ScrollView>
  );
}

/* ---------------- donut helpers ---------------- */

function renderDonut(slices: { pct: number }[]) {
  let start = 0;
  const colors = [
    "#111",
    "#333",
    "#555",
    "#777",
    "#999",
  ];

  return slices.map((s, i) => {
    const end = start + s.pct * 2 * Math.PI;
    const path = describeArc(50, 50, 35, start, end);
    start = end;
    return (
      <Path
        key={i}
        d={path}
        stroke={colors[i % colors.length]}
        strokeWidth={12}
        fill="none"
      />
    );
  });
}

function describeArc(x: number, y: number, r: number, start: number, end: number) {
  const sx = x + r * Math.cos(start);
  const sy = y + r * Math.sin(start);
  const ex = x + r * Math.cos(end);
  const ey = y + r * Math.sin(end);
  const large = end - start > Math.PI ? 1 : 0;

  return `M ${sx} ${sy} A ${r} ${r} 0 ${large} 1 ${ex} ${ey}`;
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 28 },

  hero: { marginBottom: 12 },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  appTitle: { fontSize: 22, fontWeight: "700" },
  heroValue: { fontSize: 36, fontWeight: "800" },
  heroSub: { opacity: 0.7, marginTop: 6 },

  card: {
    marginTop: 14,
    padding: 14,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  cardTitle: { fontWeight: "800", opacity: 0.75 },

  donutWrap: {
    alignItems: "center",
    marginVertical: 14,
  },

  sliceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  sliceName: { fontWeight: "700" },
  slicePct: { fontWeight: "800" },

  cta: {
    marginTop: 18,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  ctaText: { fontSize: 16, fontWeight: "900" },
});
