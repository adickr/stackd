import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

type Slice = {
  id: string;
  name: string;
  oz: number;
};

export function MyStackConviction(props: {
  slices: Slice[];
  unit: "oz" | "g";
  onPressItem?: (id: string) => void;
}) {
  const { slices, unit, onPressItem } = props;

  const rows = useMemo(() => {
    const sorted = slices
      .filter((s) => Number.isFinite(s.oz) && s.oz > 0)
      .slice()
      .sort((a, b) => b.oz - a.oz);

    const maxOz = sorted[0]?.oz ?? 1;

    return sorted.map((s) => ({
      ...s,
      pctOfMax: Math.max(0.06, s.oz / maxOz), // minimum visible bar
    }));
  }, [slices]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No holdings yet.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {rows.map((r) => {
        const barFlex = r.pctOfMax;
        const restFlex = 1 - barFlex;

        const rightLabel =
          unit === "g"
            ? `${(r.oz * 31.1035).toFixed(r.oz * 31.1035 < 100 ? 1 : 0)} g`
            : `${r.oz.toFixed(r.oz < 10 ? 2 : 1)} oz`;

        const Row = onPressItem ? Pressable : View;

        return (
          <Row
            key={r.id}
            onPress={onPressItem ? () => onPressItem(r.id) : undefined}
            style={({ pressed }: any) => [
              styles.row,
              pressed && onPressItem ? { opacity: 0.85 } : null,
            ]}
          >
            <View style={styles.topLine}>
              <Text style={styles.name} numberOfLines={1}>
                {r.name}
              </Text>
              <Text style={styles.value}>{rightLabel}</Text>
            </View>

            <View style={styles.barTrack}>
              <View style={[styles.barFill, { flex: barFlex }]} />
              <View style={{ flex: restFlex }} />
            </View>
          </Row>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 6,
  },
  topLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 8,
  },
  name: { fontWeight: "800", opacity: 0.9, flex: 1 },
  value: { fontWeight: "900", opacity: 0.6 },

  barTrack: {
    flexDirection: "row",
    height: 8,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  barFill: {
    backgroundColor: "rgba(0,0,0,0.75)",
    borderRadius: 999,
  },

  empty: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.04)",
    borderRadius: 14,
  },
  emptyText: { fontWeight: "800", opacity: 0.6 },
});
