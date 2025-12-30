import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  useSettingsStore,
  WeightUnit,
  DisplayCurrency,
} from "../../src/stores/settingsStore";
import { useSpotStore } from "../../src/stores/spotStore";
import { useStackStore } from "../../src/stores/stackStore";
import { useCoinStore } from "../../src/stores/coinStore";
import { useJournalStore } from "../../src/stores/journalStore";

const TROY_OZ_GRAMS = 31.1035;

export default function SettingsScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const reset = useSettingsStore((s) => s.reset);

  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const spotZar = useSpotStore((s) => s.silverZarPerOz);
  const spotUsd = useSpotStore((s) => s.silverUsdPerOz);

  const entries = useStackStore((s) => s.entries);
  const coins = useCoinStore((s) => s.coins);

  const addAnchor = useJournalStore((s) => s.addAnchor);
  const anchors = useJournalStore((s) => s.anchors);

  // Build fine oz per coin id from coins list
  const fineOzByCoinId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS;
    }
    return map;
  }, [coins]);

  // Total fine oz in stack
  const totalOz = useMemo(() => {
    return entries.reduce(
      (sum, e) => sum + e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0),
      0
    );
  }, [entries, fineOzByCoinId]);

  const spot = currency === "ZAR" ? spotZar : spotUsd;
  const portfolioValue = spot > 0 ? totalOz * spot : 0;

  // Normalize snapshot keys to avoid float noise
  const currentWeightKey = Number(totalOz.toFixed(4)); // 0.0001 oz precision
  const currentValueKey = Math.round(portfolioValue); // integer currency

  // Latest anchor by createdAt
  const lastAnchor = useMemo(() => {
    if (!anchors.length) return null;
    return anchors.reduce((latest, a) => {
      return a.createdAt > latest.createdAt ? a : latest;
    }, anchors[0]);
  }, [anchors]);

  const lastWeightKey = lastAnchor
    ? Number(lastAnchor.totalWeightOz.toFixed(4))
    : null;
  const lastValueKey = lastAnchor ? Math.round(lastAnchor.totalValue) : null;

  const hasStack = entries.length > 0;
  const hasChangedSinceLastSeal =
    !lastAnchor ||
    currentWeightKey !== lastWeightKey ||
    currentValueKey !== lastValueKey;

  const canSeal = hasStack && hasChangedSinceLastSeal;

  const sealSnapshot = () => {
    const now = Date.now();
    addAnchor({
      id: `${now}-${Math.random().toString(16).slice(2)}`,
      createdAt: now,
      totalValue: currentValueKey,
      totalWeightOz: currentWeightKey,
      // note: currency, // optional
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Settings</Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.75 }]}
            hitSlop={10}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <Section title="Units">
          <Segmented<WeightUnit>
            value={unit}
            options={[
              { label: "oz", value: "oz" },
              { label: "g", value: "g" },
            ]}
            onChange={(v) => setUnit(v)}
          />
          <Text style={styles.helper}>Choose how weights are displayed.</Text>
        </Section>

        <Section title="Currency">
          <Segmented<DisplayCurrency>
            value={currency}
            options={[
              { label: "ZAR", value: "ZAR" },
              { label: "USD", value: "USD" },
            ]}
            onChange={(v) => {
              setCurrency(v);
              refreshSpot(); // refresh after switching currency
            }}
          />
          <Text style={styles.helper}>Spot refreshes when you switch currency.</Text>
        </Section>

        {/* Journal controls */}
        <Section title="Journal">
          <Pressable
            onPress={() => router.push("../journal")}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.navText}>Open Journal</Text>
          </Pressable>

          <Pressable
            onPress={sealSnapshot}
            disabled={!canSeal}
            style={({ pressed }) => [
              styles.navBtn,
              {
                marginTop: 10,
                opacity: !canSeal ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.navText}>{canSeal ? "Seal snapshot" : "Sealed ✓"}</Text>
          </Pressable>

          <Text style={styles.helper}>
            {hasStack
              ? canSeal
                ? "Seal a snapshot of your current stack (value + weight)."
                : "Latest snapshot matches your current stack."
              : "Add metal to your stack to enable sealing."}
          </Text>
        </Section>

        <Pressable
          onPress={() => {
            reset();
            refreshSpot(); // ✅ no args
          }}
          style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.resetText}>Reset to defaults</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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

  section: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    opacity: 0.75,
    marginBottom: 10,
  },

  segmentWrap: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: "rgba(0,0,0,0.18)" },
  segmentText: { fontSize: 14, fontWeight: "800", opacity: 0.7 },
  segmentTextActive: { opacity: 1 },

  helper: { marginTop: 10, fontSize: 12, opacity: 0.65 },

  navBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  navText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },

  resetBtn: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  resetText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
});
