import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { useStackStore } from "../src/stores/stackStore";
import { useCoinStore } from "../src/stores/coinStore";
import { useSpotStore } from "../src/stores/spotStore";
import { useSettingsStore } from "../src/stores/settingsStore";

import { MyStackConviction } from "../src/components/MyStackConviction";

// ✅ tokens
import { colors, spacing, radius, text } from "../src/theme/tokens";

const TROY_OZ_GRAMS = 31.1035;
const PAGE_SIZE = 10;

/* ---------------- helpers ---------------- */

function formatCurrency(value: number, currency: "ZAR" | "USD") {
  try {
    return new Intl.NumberFormat(currency === "ZAR" ? "en-ZA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${Math.round(value).toLocaleString()}`;
  }
}

function formatSpot(value: number, currency: "ZAR" | "USD") {
  if (!Number.isFinite(value) || value <= 0) return "—";
  try {
    return new Intl.NumberFormat(currency === "ZAR" ? "en-ZA" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function formatWeight(oz: number, unit: "oz" | "g") {
  if (unit === "g") {
    const g = oz * TROY_OZ_GRAMS;
    return `${g.toFixed(g < 100 ? 1 : 0)} g`;
  }
  return `${oz.toFixed(2)} oz`;
}

function ymd(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

/* ---------------- screen ---------------- */

export default function HomeScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);

  const entries = useStackStore((s) => s.entries);
  const coins = useCoinStore((s) => s.coins);
  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);
  const getCoin = useCoinStore((s) => s.getCoin);

  const spotZar = useSpotStore((s) => s.silverZarPerOz);
  const spotUsd = useSpotStore((s) => s.silverUsdPerOz);
  const fetchedAt = useSpotStore((s) => s.fetchedAt);
  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const isLoading = useSpotStore((s) => s.isLoading);

  // UI state for purchases
  const [showPurchases, setShowPurchases] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  // Fetch spot once on first load
  useEffect(() => {
    if (!fetchedAt) refreshSpot();
  }, [fetchedAt, refreshSpot]);

  // Reset pagination when collapsing
  useEffect(() => {
    if (!showPurchases) {
      setVisibleCount(PAGE_SIZE);
    }
  }, [showPurchases]);

  // Keep pagination sane when entries change
  useEffect(() => {
    setVisibleCount((v) =>
      Math.min(Math.max(PAGE_SIZE, v), entries.length || PAGE_SIZE)
    );
  }, [entries.length]);

  const coinById = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS; // fine oz per unit
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

  /* --------- My Stack (conviction bars) --------- */

  const stackRows = useMemo(() => {
    const byId: Record<string, number> = {};
    for (const e of entries) {
      byId[e.coinTypeId] =
        (byId[e.coinTypeId] ?? 0) +
        e.quantity * (coinById[e.coinTypeId] ?? 0);
    }

    return Object.entries(byId)
      .map(([id, oz]) => ({
        id,
        name: coins.find((c) => c.id === id)?.name ?? "Unknown",
        oz,
      }))
      .filter((r) => Number.isFinite(r.oz) && r.oz > 0)
      .sort((a, b) => b.oz - a.oz);
  }, [entries, coinById, coins]);

  /* --------- Purchases list (paged) --------- */

  const purchaseRows = useMemo(() => {
    return entries
      .slice()
      .sort((a, b) => b.purchasedAt - a.purchasedAt)
      .map((e) => {
        const coin = getCoin(e.coinTypeId);
        return {
          id: e.id,
          coinName: coin?.name ?? "Unknown coin",
          quantity: e.quantity,
          totalPaid: e.totalPaid,
          purchasedAt: e.purchasedAt,
        };
      });
  }, [entries, getCoin]);

  const visiblePurchases = showPurchases
    ? purchaseRows.slice(0, visibleCount)
    : [];
  const canLoadMore = showPurchases && visibleCount < purchaseRows.length;

  /* ---------------- render ---------------- */

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
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
            <Pressable
              onPress={() => router.push("/settings")}
              style={({ pressed }) => pressed && { opacity: 0.8 }}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <Text style={styles.heroValue}>
            {portfolioValue > 0 ? formatCurrency(portfolioValue, currency) : "—"}
          </Text>

          <Text style={styles.heroSub}>
            {formatWeight(totalOz, unit)} • {formatSpot(spot, currency)}/oz •{" "}
            {fetchedAt ? "updated" : "pull to refresh"}
          </Text>
        </View>

        {/* My Stack */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>My Stack</Text>

          <View style={{ marginTop: spacing.lg }}>
            <MyStackConviction unit={unit} slices={stackRows} />
          </View>
        </View>

        {/* Purchases (collapsed by default) */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Purchases</Text>
            <Text style={styles.cardHint}>{purchaseRows.length} total</Text>
          </View>

          <Pressable
            onPress={() => setShowPurchases((v) => !v)}
            style={({ pressed }) => [
              styles.toggleBtn,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.toggleText}>
              {showPurchases ? "Hide purchases" : "View purchases"}
            </Text>
            <Ionicons
              name={showPurchases ? "chevron-up" : "chevron-down"}
              size={18}
              color={colors.ink}
              style={{ opacity: 0.6 }}
            />
          </Pressable>

          {showPurchases ? (
            purchaseRows.length === 0 ? (
              <Text style={styles.emptyText}>No purchases yet.</Text>
            ) : (
              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                {visiblePurchases.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      router.push(`/stack/add?entryId=${encodeURIComponent(p.id)}`)
                    }
                    style={({ pressed }) => [
                      styles.purchaseRow,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <View style={{ flex: 1, gap: spacing.xs }}>
                      <Text style={styles.purchaseTitle}>{p.coinName}</Text>
                      <Text style={styles.purchaseSub}>
                        Qty {p.quantity} • {formatCurrency(p.totalPaid, "ZAR")} •{" "}
                        {ymd(p.purchasedAt)}
                      </Text>
                    </View>

                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color={colors.ink}
                      style={{ opacity: 0.45 }}
                    />
                  </Pressable>
                ))}

                {canLoadMore ? (
                  <Pressable
                    onPress={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    style={({ pressed }) => [
                      styles.loadMoreBtn,
                      pressed && { opacity: 0.9 },
                    ]}
                  >
                    <Text style={styles.loadMoreText}>
                      Load more (
                      {Math.min(visibleCount + PAGE_SIZE, purchaseRows.length)}/
                      {purchaseRows.length})
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )
          ) : null}
        </View>

        {/* CTA */}
        <Pressable
          onPress={() => router.push("/stack/add")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>＋ Stack</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },

  container: { padding: spacing.lg, paddingBottom: spacing.xl + spacing.md },

  hero: { marginBottom: spacing.md },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    alignItems: "center",
  },
  appTitle: { ...text.titleM, color: colors.ink },

  heroValue: { ...text.titleXL, color: colors.ink },
  heroSub: { ...text.body, color: colors.inkMuted, marginTop: spacing.sm },

  card: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
  },

  cardHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  cardTitle: { ...text.label, color: colors.inkSoft },
  cardHint: { ...text.hint, color: colors.inkSoft },

  toggleBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.78)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  toggleText: { ...text.titleM, fontSize: 14, color: colors.ink },

  emptyText: { marginTop: spacing.lg, color: colors.inkSoft },

  purchaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLift,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  purchaseTitle: { ...text.titleM, fontSize: 14, color: colors.ink },
  purchaseSub: { ...text.body, fontSize: 12, color: colors.inkMuted },

  loadMoreBtn: {
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "rgba(255,255,255,0.62)",
  },
  loadMoreText: { ...text.label, color: colors.inkSoft },

  cta: {
    marginTop: spacing.lg,
    paddingVertical: spacing.lg,
    borderRadius: radius.lg,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  ctaText: { ...text.titleM, fontSize: 16, color: colors.ink },
});
