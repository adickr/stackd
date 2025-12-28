import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useSettingsStore } from "../src/stores/settingsStore";
import { useSpotStore } from "../src/stores/spotStore";

export default function SettingsScreen() {
  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const reset = useSettingsStore((s) => s.reset);

  const refreshSpot = useSpotStore((s) => s.refreshSpot);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      <Section title="Units">
        <Segmented
          value={unit}
          options={[
            { label: "oz", value: "oz" },
            { label: "g", value: "g" },
          ]}
          onChange={(v) => setUnit(v as any)}
        />
        <Text style={styles.helper}>Choose how weights are displayed.</Text>
      </Section>

      <Section title="Currency">
        <Segmented
          value={currency}
          options={[
            { label: "ZAR", value: "ZAR" },
            { label: "USD", value: "USD" },
          ]}
          onChange={(v) => {
            setCurrency(v as any);
            refreshSpot(); // fills the chosen currency (store decides what to fetch)
          }}
        />
        <Text style={styles.helper}>Spot refreshes when you switch currency.</Text>
      </Section>

      <Pressable
        onPress={() => {
          reset();
          refreshSpot({ force: true });
        }}
        style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
      >
        <Text style={styles.resetText}>Reset to defaults</Text>
      </Pressable>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { label: string; value: string }[];
  onChange: (value: string) => void;
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
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 18 },

  section: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 13, fontWeight: "800", opacity: 0.75, marginBottom: 10 },

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
