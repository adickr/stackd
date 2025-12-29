import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius, text } from "../theme/tokens";

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  variant?: "info" | "warning" | "error";
};

export function EmptyState({
  icon = "sparkles-outline",
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  variant = "info",
}: Props) {
  const accent =
    variant === "error"
      ? "rgba(255, 59, 48, 0.12)"
      : variant === "warning"
      ? "rgba(255, 149, 0, 0.12)"
      : "rgba(0, 122, 255, 0.10)";

  return (
    <View style={[styles.wrap, { borderColor: accent }]}>
      <View style={styles.row}>
        <View style={[styles.iconWrap, { backgroundColor: accent }]}>
          <Ionicons name={icon} size={18} color={colors.ink} style={{ opacity: 0.8 }} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {body ? <Text style={styles.body}>{body}</Text> : null}
        </View>
      </View>

      {(primaryLabel && onPrimary) || (secondaryLabel && onSecondary) ? (
        <View style={styles.actions}>
          {primaryLabel && onPrimary ? (
            <Pressable onPress={onPrimary} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.9 }]}>
              <Text style={styles.primaryText}>{primaryLabel}</Text>
            </Pressable>
          ) : null}

          {secondaryLabel && onSecondary ? (
            <Pressable onPress={onSecondary} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.9 }]}>
              <Text style={styles.secondaryText}>{secondaryLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
  },
  row: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...text.titleM, fontSize: 14, color: colors.ink },
  body: { ...text.body, fontSize: 12, color: colors.inkMuted, marginTop: spacing.xs },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  primary: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  primaryText: { ...text.label, color: colors.ink },
  secondary: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    backgroundColor: "rgba(255,255,255,0.60)",
  },
  secondaryText: { ...text.label, color: colors.inkSoft },
});
