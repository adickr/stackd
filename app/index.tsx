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
import type { DisplayCurrency } from "../src/stores/settingsStore";

import { MyStackConviction } from "../src/components/MyStackConviction";

// shared money helpers (Option B)
import { formatMoney, formatSpot } from "../src/utils/money";

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

function monthKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthTitle(ms: number) {
  return new Date(ms).toLocaleString(undefined, { month: "long", year: "numeric" });
}

type PnlMeta = {
  ok: boolean;
  pct: number;
  amount: number;
  kind: "up" | "down" | "flat";
};

function computePnl(paidDisplay: number, currentValue: number): PnlMeta {
  if (!Number.isFinite(paidDisplay) || paidDisplay <= 0) {
    return { ok: false, pct: 0, amount: 0, kind: "flat" };
  }
  const amount = currentValue - paidDisplay;
  const pct = (amount / paidDisplay) * 100;

  const eps = 0.001;
  const kind: PnlMeta["kind"] = amount > eps ? "up" : amount < -eps ? "down" : "flat";

  return { ok: true, pct, amount, kind };
}

function formatPct(pct: number) {
  if (!Number.isFinite(pct)) return "—";
  const abs = Math.abs(pct);
  if (abs < 10) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(0)}%`;
}

/* ---------------- timeline types ---------------- */

type TimelineRowItem = {
  id: string;
  coinName: string;
  quantity: number;
  totalPaid: number;
  paidCurrency: DisplayCurrency;
  purchasedAt: number;
  fineOz: number;
};

type TimelineSection = {
  key: string;
  title: string;
  items: TimelineRowItem[];
};

// FX helper using implied rate from silver spot
function impliedFx(
  from: DisplayCurrency,
  to: DisplayCurrency,
  perOzByCurrency: Record<string, number>
) {
  if (from === to) return 1;
  const fromPerOz = perOzByCurrency?.[from] ?? 0;
  const toPerOz = perOzByCurrency?.[to] ?? 0;
  if (fromPerOz > 0 && toPerOz > 0) return toPerOz / fromPerOz; // (to per oz) / (from per oz)
  return 0;
}

function TimelineRow({
  item,
  isFirst,
  isLast,
  onPress,
  spotPerOzDisplay,
  perOzByCurrency,
  displayCurrency,
}: {
  item: TimelineRowItem;
  isFirst: boolean;
  isLast: boolean;
  onPress: () => void;
  spotPerOzDisplay: number;
  perOzByCurrency: Record<string, number>;
  displayCurrency: DisplayCurrency;
}) {
  const fineOz = Number.isFinite(item.fineOz) ? item.fineOz : 0;

  const currentValue =
    spotPerOzDisplay > 0 && fineOz > 0 ? fineOz * spotPerOzDisplay : 0;

  // Convert paidCurrency -> displayCurrency using implied FX from spot map
  const fx = impliedFx(item.paidCurrency, displayCurrency, perOzByCurrency);
  const paidDisplay =
    fx > 0 && Number.isFinite(item.totalPaid) ? item.totalPaid * fx : 0;

  const pnl = computePnl(paidDisplay, currentValue);

  const pnlColor =
    pnl.kind === "up" ? styles.pnlUp : pnl.kind === "down" ? styles.pnlDown : styles.pnlFlat;

  const pnlIcon =
    pnl.kind === "up" ? "arrow-up" : pnl.kind === "down" ? "arrow-down" : "remove";

  const iconColor =
    pnl.ok
      ? pnl.kind === "up"
        ? "#008C46"
        : pnl.kind === "down"
          ? "#C83232"
          : "#666"
      : "#666";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.timelineRow, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.rail}>
        {!isFirst ? <View style={styles.line} /> : <View style={styles.lineSpacer} />}
        <View style={styles.dot} />
        {!isLast ? <View style={styles.line} /> : <View style={styles.lineSpacer} />}
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.timelineTop}>
          <Text style={styles.purchaseTitle}>{item.coinName}</Text>
          <Ionicons
            name="chevron-forward"
            size={18}
            color={colors.ink}
            style={{ opacity: 0.45 }}
          />
        </View>

        <Text style={styles.purchaseSub}>
          {ymd(item.purchasedAt)} • Qty {item.quantity} • {fineOz.toFixed(2)} oz
        </Text>

        <Text style={styles.purchaseSub}>
          Paid: {formatMoney(item.totalPaid, item.paidCurrency, 0)}
          {"  "}• Current:{" "}
          {spotPerOzDisplay > 0 ? formatMoney(currentValue, displayCurrency, 0) : "—"}
        </Text>

        <View style={styles.pnlRow}>
          <Ionicons
            name={pnl.ok ? (pnlIcon as any) : "remove"}
            size={14}
            color={iconColor}
            style={{ opacity: 0.95 }}
          />
          <Text style={[styles.pnlText, pnl.ok ? pnlColor : styles.pnlFlat]}>
            {pnl.ok
              ? `${formatPct(pnl.pct)} (${formatMoney(pnl.amount, displayCurrency, 0)})`
              : "PnL: —"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
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

  const fetchedAt = useSpotStore((s) => s.fetchedAt);
  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const isLoading = useSpotStore((s) => s.isLoading);
  const spotError = useSpotStore((s) => s.error);
  const clearSpotError = useSpotStore((s) => s.clearError);

  // works with your updated store
  const perOzByCurrency = useSpotStore((s) => s.silverPerOzByCurrency ?? {});
  const fallbackZar = useSpotStore((s) => s.silverZarPerOz);
  const fallbackUsd = useSpotStore((s) => s.silverUsdPerOz);

  const [showPurchases, setShowPurchases] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showAllStack, setShowAllStack] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  useEffect(() => {
    if (!fetchedAt) refreshSpot();
  }, [fetchedAt, refreshSpot]);

  useEffect(() => {
    if (!showPurchases) setVisibleCount(PAGE_SIZE);
  }, [showPurchases]);

  useEffect(() => {
    setVisibleCount((v) => Math.min(Math.max(PAGE_SIZE, v), entries.length || PAGE_SIZE));
  }, [entries.length]);

  useEffect(() => {
    if (showAllStack && entries.length === 0) setShowAllStack(false);
  }, [showAllStack, entries.length]);

  const fineOzByCoinId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS;
    }
    return map;
  }, [coins]);

  const totalOz = useMemo(() => {
    return entries.reduce(
      (sum, e) => sum + e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0),
      0
    );
  }, [entries, fineOzByCoinId]);

  const spotDisplay = useMemo(() => {
    const fromMap = perOzByCurrency?.[currency];
    if (typeof fromMap === "number" && fromMap > 0) return fromMap;

    // fallback if store hasn't refreshed yet
    if (currency === "ZAR") return fallbackZar;
    if (currency === "USD") return fallbackUsd;
    return 0;
  }, [perOzByCurrency, currency, fallbackZar, fallbackUsd]);

  const portfolioValue = spotDisplay > 0 ? totalOz * spotDisplay : 0;

  // convert each entry's paid -> display using implied FX
  const totalPaidDisplay = useMemo(() => {
    if (!entries.length) return 0;

    let sum = 0;
    for (const e of entries) {
      const from = (e as any).paidCurrency ?? "ZAR";
      const fx = impliedFx(from, currency, perOzByCurrency);
      if (fx > 0 && Number.isFinite(e.totalPaid)) sum += e.totalPaid * fx;
    }
    return sum;
  }, [entries, currency, perOzByCurrency]);

  const portfolioPnl = useMemo(() => {
    return computePnl(totalPaidDisplay, portfolioValue);
  }, [totalPaidDisplay, portfolioValue]);

  const portfolioPnlColor =
    portfolioPnl.kind === "up" ? styles.pnlUp : portfolioPnl.kind === "down" ? styles.pnlDown : styles.pnlFlat;

  const portfolioPnlIcon =
    portfolioPnl.kind === "up" ? "arrow-up" : portfolioPnl.kind === "down" ? "arrow-down" : "remove";

  const level = useMemo(() => getStackLevel(totalOz), [totalOz]);
  const nextLevel = useMemo(() => getNextLevel(totalOz), [totalOz]);
  const ozToNext = nextLevel ? Math.max(0, nextLevel.minOz - totalOz) : 0;

  const allStackRows = useMemo(() => {
    const byId: Record<string, number> = {};
    for (const e of entries) {
      byId[e.coinTypeId] =
        (byId[e.coinTypeId] ?? 0) + e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0);
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

  const purchaseRows = useMemo<TimelineRowItem[]>(() => {
    return entries
      .slice()
      .sort((a, b) => b.purchasedAt - a.purchasedAt)
      .map((e) => {
        const coin = getCoin(e.coinTypeId);
        const fineOzPerUnit = fineOzByCoinId[e.coinTypeId] ?? 0;
        const fineOz = e.quantity * fineOzPerUnit;

        return {
          id: e.id,
          coinName: coin?.name ?? "Unknown coin",
          quantity: e.quantity,
          totalPaid: e.totalPaid,
          paidCurrency: (e as any).paidCurrency ?? "ZAR",
          purchasedAt: e.purchasedAt,
          fineOz,
        };
      });
  }, [entries, getCoin, fineOzByCoinId]);

  const visiblePurchaseRows = showPurchases ? purchaseRows.slice(0, visibleCount) : [];
  const canLoadMore = showPurchases && visibleCount < purchaseRows.length;

  const purchaseSections = useMemo(() => {
    if (!showPurchases) return [];
    const map = new Map<string, { ms: number; items: TimelineRowItem[] }>();

    for (const p of visiblePurchaseRows) {
      const t = Number(p.purchasedAt ?? 0);
      const key = monthKey(t);
      const existing = map.get(key);
      if (!existing) map.set(key, { ms: t, items: [p] });
      else existing.items.push(p);
    }

    return Array.from(map.entries())
      .map(([key, v]) => ({ key, title: monthTitle(v.ms), items: v.items }))
      .sort((a, b) => (a.key < b.key ? 1 : -1));
  }, [showPurchases, visiblePurchaseRows]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refreshSpot} />}
      >
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

          <Text style={styles.heroValue}>{formatMoney(portfolioValue, currency, 0)}</Text>

          <View style={styles.heroPnlRow}>
            <Ionicons
              name={portfolioPnl.ok ? (portfolioPnlIcon as any) : "remove"}
              size={14}
              color={
                portfolioPnl.ok
                  ? portfolioPnl.kind === "up"
                    ? "#008C46"
                    : portfolioPnl.kind === "down"
                      ? "#C83232"
                      : "#666"
                  : "#666"
              }
              style={{ opacity: 0.95 }}
            />
            <Text style={[styles.heroPnlText, portfolioPnl.ok ? portfolioPnlColor : styles.pnlFlat]}>
              {portfolioPnl.ok
                ? `${formatPct(portfolioPnl.pct)} (${formatMoney(portfolioPnl.amount, currency, 0)})`
                : "PnL: —"}
            </Text>
          </View>

          <Text style={styles.heroSub}>
            {formatWeight(totalOz, unit)} • {formatSpot(spotDisplay, currency)}/oz •{" "}
            {fetchedAt ? "updated" : "pull to refresh"}
          </Text>

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

          {canExpandStack ? (
            <Pressable
              onPress={() => setShowAllStack(true)}
              style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.expandText}>+ {hiddenStackCount} smaller positions</Text>
              <Ionicons name="chevron-down" size={18} color={colors.ink} style={{ opacity: 0.55 }} />
            </Pressable>
          ) : null}

          {showAllStack && allStackRows.length > STACK_TOP_N ? (
            <Pressable
              onPress={() => setShowAllStack(false)}
              style={({ pressed }) => [styles.expandBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.expandText}>Show top only</Text>
              <Ionicons name="chevron-up" size={18} color={colors.ink} style={{ opacity: 0.55 }} />
            </Pressable>
          ) : null}
        </View>

        {purchaseRows.length > 0 ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.cardTitle}>Purchase history</Text>
              <Text style={styles.cardHint}>{purchaseRows.length} total</Text>
            </View>

            <Pressable
              onPress={() => setShowPurchases((v) => !v)}
              style={({ pressed }) => [styles.toggleBtn, pressed && { opacity: 0.9 }]}
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
              <View style={{ marginTop: spacing.lg }}>
                {purchaseSections.map((section) => (
                  <View key={section.key} style={{ marginBottom: spacing.lg }}>
                    <Text style={styles.timelineHeader}>{section.title}</Text>

                    <View style={{ marginTop: spacing.md }}>
                      {section.items.map((p, idx) => (
                        <TimelineRow
                          key={p.id}
                          item={p}
                          isFirst={idx === 0}
                          isLast={idx === section.items.length - 1}
                          spotPerOzDisplay={spotDisplay}
                          perOzByCurrency={perOzByCurrency}
                          displayCurrency={currency}
                          onPress={() => router.push(`/stack/add?entryId=${encodeURIComponent(p.id)}`)}
                        />
                      ))}
                    </View>
                  </View>
                ))}

                {canLoadMore ? (
                  <Pressable
                    onPress={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    style={({ pressed }) => [styles.loadMoreBtn, pressed && { opacity: 0.9 }]}
                  >
                    <Text style={styles.loadMoreText}>
                      Load more ({Math.min(visibleCount + PAGE_SIZE, purchaseRows.length)}/
                      {purchaseRows.length})
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

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

  heroPnlRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroPnlText: { ...text.body, fontSize: 13, fontWeight: "800" },

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

  timelineHeader: {
    ...text.label,
    color: colors.inkSoft,
    opacity: 0.9,
    marginTop: spacing.sm,
  },

  timelineRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "stretch",
    paddingVertical: spacing.sm,
  },

  rail: { width: 18, alignItems: "center" },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  line: { flex: 1, width: 2, backgroundColor: "rgba(0,0,0,0.12)" },
  lineSpacer: { flex: 1 },

  timelineCard: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceLift,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    gap: spacing.xs,
  },
  timelineTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },

  purchaseTitle: { ...text.titleM, fontSize: 14, color: colors.ink },
  purchaseSub: { ...text.body, fontSize: 12, color: colors.inkMuted },

  pnlRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  pnlText: { ...text.body, fontSize: 12, fontWeight: "900" },

  pnlUp: { color: "#008C46" },
  pnlDown: { color: "#C83232" },
  pnlFlat: { color: "rgba(0,0,0,0.55)" },

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
