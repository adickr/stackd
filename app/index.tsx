// app/index.tsx
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

<<<<<<< HEAD
=======

>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
import { MyStackConviction } from "../src/components/MyStackConviction";

// tokens
import { colors, spacing, radius, text } from "../src/theme/tokens";

const TROY_OZ_GRAMS = 31.1035;
const PAGE_SIZE = 10;
const STACK_TOP_N = 5;

/* ---------------- gamification ---------------- */

type StackLevel = { name: string; minOz: number };

const STACK_LEVELS: StackLevel[] = [
  { name: "Seed", minOz: 0 },
  { name: "Starter", minOz: 10 },
  { name: "Accumulator", minOz: 50 },
  { name: "Stacker", minOz: 150 },
  { name: "Vaulted", minOz: 300 },
  { name: "Stronghold", minOz: 500 },
  { name: "Hoarder", minOz: 1000 },
  { name: "Bullion Lord", minOz: 2500 },
];

function getStackLevel(totalOz: number) {
  const safe = Number.isFinite(totalOz) ? totalOz : 0;
  for (let i = STACK_LEVELS.length - 1; i >= 0; i--) {
    if (safe >= STACK_LEVELS[i].minOz) return STACK_LEVELS[i];
  }
  return STACK_LEVELS[0];
}

function getNextLevel(totalOz: number) {
  const safe = Number.isFinite(totalOz) ? totalOz : 0;
  for (let i = 0; i < STACK_LEVELS.length; i++) {
    if (safe < STACK_LEVELS[i].minOz) return STACK_LEVELS[i];
  }
  return null; // maxed
}

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
  const spotError = useSpotStore((s) => s.error);
  const clearSpotError = useSpotStore((s) => s.clearError);

<<<<<<< HEAD
=======

>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
  // UI state
  const [showPurchases, setShowPurchases] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // My Stack UI: top-N + expand
  const [showAllStack, setShowAllStack] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  // Fetch spot once on first load
  useEffect(() => {
    if (!fetchedAt) refreshSpot();
  }, [fetchedAt, refreshSpot]);

  // Reset purchase pagination when collapsing
  useEffect(() => {
    if (!showPurchases) setVisibleCount(PAGE_SIZE);
  }, [showPurchases]);

  // Keep pagination sane when entries change
  useEffect(() => {
    setVisibleCount((v) =>
      Math.min(Math.max(PAGE_SIZE, v), entries.length || PAGE_SIZE)
    );
  }, [entries.length]);

  // If stack shrinks, keep "show all" from feeling weird
  useEffect(() => {
    if (showAllStack && entries.length === 0) setShowAllStack(false);
  }, [showAllStack, entries.length]);

  const fineOzByCoinId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS; // fine oz per unit
    }
    return map;
  }, [coins]);

  const totalOz = useMemo(() => {
    return entries.reduce(
      (sum, e) => sum + e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0),
      0
    );
  }, [entries, fineOzByCoinId]);

  const spot = currency === "ZAR" ? spotZar : spotUsd;
<<<<<<< HEAD
  const portfolioValue = spot > 0 ? totalOz * spot : 0;

=======
  const spotPerUnit = useMemo(() => {
    if (!Number.isFinite(spot) || spot <= 0) return 0;
    return unit === "g" ? spot / TROY_OZ_GRAMS : spot;
  }, [spot, unit]);
  const portfolioValue = spot > 0 ? totalOz * spot : 0;


>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
  // ✅ Hero level chip
  const level = useMemo(() => getStackLevel(totalOz), [totalOz]);
  const nextLevel = useMemo(() => getNextLevel(totalOz), [totalOz]);
  const ozToNext = nextLevel
    ? Math.max(0, nextLevel.minOz - totalOz)
    : 0;

  /* --------- My Stack (conviction bars) --------- */

  const allStackRows = useMemo(() => {
    const byId: Record<string, number> = {};
    for (const e of entries) {
      byId[e.coinTypeId] =
        (byId[e.coinTypeId] ?? 0) +
        e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0);
    }

    return Object.entries(byId)
      .map(([id, oz]) => ({
        id,
        name: coins.find((c) => c.id === id)?.name ?? "Unknown",
        oz,
      }))
      .filter((r) => Number.isFinite(r.oz) && r.oz > 0)
      .sort((a, b) => b.oz - a.oz);
  }, [entries, fineOzByCoinId, coins]);

  const visibleStackRows = useMemo(() => {
    if (showAllStack) return allStackRows;
    return allStackRows.slice(0, STACK_TOP_N);
  }, [allStackRows, showAllStack]);

  const hiddenStackCount = Math.max(0, allStackRows.length - STACK_TOP_N);
  const canExpandStack = !showAllStack && hiddenStackCount > 0;

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

          {/* ✅ Level chip (gamification) */}
          <View style={styles.levelRow}>
            <View style={styles.levelChip}>
              <Ionicons
                name="trophy-outline"
                size={14}
                color={colors.ink}
                style={{ opacity: 0.8 }}
              />
              <Text style={styles.levelChipText}>{level.name}</Text>
            </View>

            {nextLevel ? (
              <Text style={styles.levelHint}>
                Next: {nextLevel.name} in{" "}
                {unit === "g"
                  ? `${(ozToNext * TROY_OZ_GRAMS).toFixed(0)} g`
                  : `${ozToNext.toFixed(1)} oz`}
              </Text>
            ) : (
              <Text style={styles.levelHint}>Max level</Text>
            )}
          </View>

          <Text style={styles.heroValue}>
            {formatCurrency(portfolioValue, currency)}
          </Text>

          <Text style={styles.heroSub}>
<<<<<<< HEAD
            {formatWeight(totalOz, unit)} • {formatSpot(spot, currency)}/oz •{" "}
=======
            {formatWeight(totalOz, unit)} • {formatSpot(spotPerUnit, currency)}/{unit} •{" "}
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
            {fetchedAt ? "updated" : "pull to refresh"}
          </Text>

          {/* Spot error (non-blocking) */}
          {spotError ? (
            <View style={styles.errorPill}>
              <Text style={styles.errorText} numberOfLines={2}>
                Spot fetch failed: {spotError}
              </Text>
              <Pressable
                onPress={clearSpotError}
                hitSlop={8}
                style={({ pressed }) => pressed && { opacity: 0.9 }}
              >
                <Ionicons name="close" size={16} color={colors.ink} />
              </Pressable>
            </View>
          ) : null}
        </View>

        {/* My Stack */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>My Stack</Text>
            <Text style={styles.cardHint}>
              {allStackRows.length > 0
                ? showAllStack
                  ? `${allStackRows.length} positions`
                  : `Top ${Math.min(STACK_TOP_N, allStackRows.length)}`
                : "—"}
            </Text>
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <MyStackConviction unit={unit} slices={visibleStackRows} />
          </View>

          {/* Expand / collapse */}
          {canExpandStack ? (
            <Pressable
              onPress={() => setShowAllStack(true)}
              style={({ pressed }) => [
                styles.expandBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.expandText}>
                + {hiddenStackCount} smaller positions
              </Text>
              <Ionicons
                name="chevron-down"
                size={18}
                color={colors.ink}
                style={{ opacity: 0.55 }}
              />
            </Pressable>
          ) : null}

          {showAllStack && allStackRows.length > STACK_TOP_N ? (
            <Pressable
              onPress={() => setShowAllStack(false)}
              style={({ pressed }) => [
                styles.expandBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.expandText}>Show top only</Text>
              <Ionicons
                name="chevron-up"
                size={18}
                color={colors.ink}
                style={{ opacity: 0.55 }}
              />
            </Pressable>
          ) : null}
        </View>

        {/* Purchase history (hide section entirely when none) */}
        {purchaseRows.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Purchase history</Text>
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
                {showPurchases ? "Hide history" : "View history"}
              </Text>
              <Ionicons
                name={showPurchases ? "chevron-up" : "chevron-down"}
                size={18}
                color={colors.ink}
                style={{ opacity: 0.6 }}
              />
            </Pressable>

            {showPurchases ? (
              <View style={{ marginTop: spacing.lg, gap: spacing.md }}>
                {visiblePurchases.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      router.push(
                        `/stack/add?entryId=${encodeURIComponent(p.id)}`
                      )
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
            ) : null}
          </View>
        ) : null}

        {/* CTA */}
        <Pressable
          onPress={() => router.push("/stack/add")}
          style={({ pressed }) => [styles.cta, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.ctaText}>＋ Stack</Text>
        </Pressable>
<<<<<<< HEAD
=======

>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
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

  // ✅ new hero level row
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.sm,
  },
  levelChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.72)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  levelChipText: { ...text.label, color: colors.inkSoft },
  levelHint: { ...text.hint, color: colors.inkMuted },

  heroValue: { ...text.titleXL, color: colors.ink },
  heroSub: { ...text.body, color: colors.inkMuted, marginTop: spacing.sm },

  errorPill: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: "rgba(255, 110, 110, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 110, 110, 0.20)",
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  errorText: { ...text.hint, color: colors.ink },

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

  expandBtn: {
    marginTop: spacing.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.62)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  expandText: { ...text.label, color: colors.inkSoft },

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
