// app/stack/add.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  Platform,
  StyleSheet,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  Modal,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";


import { useCoinStore } from "../../src/stores/coinStore";
import { useStackStore } from "../../src/stores/stackStore";
import { useSettingsStore } from "../../src/stores/settingsStore";
import type { DisplayCurrency } from "../../src/stores/settingsStore";
import type { StackCategory } from "../../src/domain/stackEntry";

import { colors, spacing, radius, text } from "../../src/theme/tokens";

function parseNumber(input: string) {
  const normalized = input.trim().replace(",", ".");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : NaN;
}

function ymdFromDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ✅ Keep this in sync with settingsStore DisplayCurrency
const CURRENCIES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP"];

function asDisplayCurrency(x: any, fallback: DisplayCurrency): DisplayCurrency {
  return CURRENCIES.includes(x) ? (x as DisplayCurrency) : fallback;
}

const CATEGORIES: { key: StackCategory; label: string }[] = [
  { key: "bullion", label: "Bullion" },
  { key: "collector", label: "Collector" },
  { key: "jewellery", label: "Jewellery" },
  { key: "scrap", label: "Scrap" },
  { key: "other", label: "Other" },
];

function asStackCategory(x: any, fallback: StackCategory): StackCategory {
  return CATEGORIES.some((c) => c.key === x) ? (x as StackCategory) : fallback;
}

export default function AddStackEntry() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ coinTypeId?: string; entryId?: string }>();

  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);
  const getCoin = useCoinStore((s) => s.getCoin);

  const addEntry = useStackStore((s) => s.addEntry);
  const getEntry = useStackStore((s) => s.getEntry);
  const updateEntry = useStackStore((s) => s.updateEntry);
  const removeEntry = useStackStore((s) => s.removeEntry);

  const settingsCurrency = useSettingsStore((s) => s.currency);

  const entryId = params.entryId ? String(params.entryId) : undefined;
  const existing = useMemo(() => getEntry(entryId), [entryId, getEntry]);

  const [coinTypeId, setCoinTypeId] = useState<string | undefined>();
  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState("");
  const [isGift, setIsGift] = useState(false);

  const [paidCurrency, setPaidCurrency] = useState<DisplayCurrency>(
    asDisplayCurrency(settingsCurrency, "USD")
  );
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const [category, setCategory] = useState<StackCategory>("other");
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const [pickedDate, setPickedDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  // Initialize form from existing entry (edit mode)
  useEffect(() => {
    if (!existing) return;

    setCoinTypeId(existing.coinTypeId);
    setQty(String(existing.quantity));
    setPickedDate(new Date(existing.purchasedAt));

    const existingPaid = Number(existing.totalPaid ?? 0);
    const gift = Number.isFinite(existingPaid) && existingPaid === 0;
    setIsGift(gift);
    setPaid(gift ? "" : String(existingPaid));

    // ✅ If older entries don't have paidCurrency yet, assume ZAR
    setPaidCurrency(asDisplayCurrency((existing as any).paidCurrency, "ZAR"));

    // ✅ category default for old entries
    setCategory(asStackCategory((existing as any).category, "other"));
  }, [existing]);

  // For brand new entries, default paid currency to current settings
  useEffect(() => {
    if (existing) return;
    setPaidCurrency(asDisplayCurrency(settingsCurrency, "USD"));
  }, [settingsCurrency, existing]);

  // When returning from coin picker (applies to add OR edit)
  useEffect(() => {
    if (params.coinTypeId) setCoinTypeId(String(params.coinTypeId));
  }, [params.coinTypeId]);

  const coin = useMemo(() => getCoin(coinTypeId), [coinTypeId, getCoin]);

  const qtyNum = parseNumber(qty);
  const paidNum = isGift ? 0 : parseNumber(paid);

  const canSave =
    !!coinTypeId &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    (isGift || (Number.isFinite(paidNum) && paidNum > 0));

  const save = () => {
    if (!coinTypeId) return;

    // Store date at noon local time (DST-safe)
    const purchasedAt = new Date(
      pickedDate.getFullYear(),
      pickedDate.getMonth(),
      pickedDate.getDate(),
      12,
      0,
      0,
      0
    ).getTime();

    const totalPaid = isGift ? 0 : paidNum;

    if (entryId && existing) {
      updateEntry(entryId, {
        coinTypeId,
        quantity: qtyNum,
        totalPaid,
        paidCurrency,
        purchasedAt,
        category,
      });
    } else {
      addEntry({
        coinTypeId,
        quantity: qtyNum,
        totalPaid,
        paidCurrency,
        purchasedAt,
        category,
      });
    }

    Keyboard.dismiss();
    router.replace("/");
  };

  const confirmDelete = () => {
    if (!entryId) return;

    Alert.alert("Delete purchase?", "This will remove the purchase from your stack.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          removeEntry(entryId);
          router.replace("/");
        },
      },
    ]);
  };

  const title = entryId ? "Edit purchase" : "Stack";
  const subtitle = entryId ? "Update a purchase." : "Add a purchase.";

  const paidPlaceholder =
    paidCurrency === "USD"
      ? "120"
      : paidCurrency === "EUR"
      ? "110"
      : paidCurrency === "GBP"
      ? "95"
      : "450";

  const categoryLabel = useMemo(() => {
    return CATEGORIES.find((c) => c.key === category)?.label ?? "Other";
  }, [category]);

  // Sticky footer height (keeps button visible + prevents cutoff)
  const FOOTER_H = 72;

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        {/* Tap-anywhere-to-dismiss wrapper */}
        <Pressable
          style={{ flex: 1 }}
          onPress={() => {
            Keyboard.dismiss();
            if (Platform.OS !== "ios") setShowPicker(false);
          }}
          accessible={false}
        >
          <ScrollView
            contentContainerStyle={[
              styles.container,
              { paddingBottom: FOOTER_H + insets.bottom + spacing.lg },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header row (compact) */}
            <View style={styles.headerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.subtitle}>{subtitle}</Text>
              </View>

              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  router.back();
                }}
                style={({ pressed }) => [styles.backPill, pressed && { opacity: 0.85 }]}
                hitSlop={8}
              >
                <Text style={styles.backPillText}>Back</Text>
              </Pressable>
            </View>

            {/* Coin (single compact card) */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                router.push("/coins/picker");
              }}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
            >
              <View style={styles.cardTopRow}>
                <Text style={styles.label}>Coin</Text>
                <Text style={styles.pickHint}>{coin ? "Change" : "Pick"}</Text>
              </View>

              <Text style={styles.valueText}>{coin ? coin.name : "Pick a coin"}</Text>

              {coin ? (
                <Text style={styles.muted}>
                  Purity {coin.purity} • Fine {coin.fineWeightGrams} g
                </Text>
              ) : null}
            </Pressable>

            {/* Row: Qty + Category */}
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Qty</Text>
                <TextInput
                  placeholder="1"
                  placeholderTextColor="rgba(0,0,0,0.45)"
                  keyboardType="numeric"
                  value={qty}
                  onChangeText={setQty}
                  style={styles.input}
                  returnKeyType="done"
                />
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Category</Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setCategoryPickerOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.input,
                    styles.pickerInput,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.valueText}>{categoryLabel}</Text>
                  <Text style={styles.chevron}>▾</Text>
                </Pressable>
              </View>
            </View>

            {/* Row: Currency + Total paid */}
            <View style={styles.row}>
              <View style={{ width: 96 }}>
                <Text style={styles.label}>Curr</Text>
                <Pressable
                  onPress={() => {
                    Keyboard.dismiss();
                    setCurrencyPickerOpen(true);
                  }}
                  style={({ pressed }) => [
                    styles.input,
                    styles.pickerInput,
                    pressed && { opacity: 0.92 },
                  ]}
                >
                  <Text style={styles.valueText}>{paidCurrency}</Text>
                  <Text style={styles.chevron}>▾</Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Total paid</Text>
                <TextInput
                  placeholder={isGift ? "Gift" : paidPlaceholder}
                  placeholderTextColor="rgba(0,0,0,0.45)"
                  keyboardType="numeric"
                  value={isGift ? "" : paid}
                  onChangeText={setPaid}
                  style={[styles.input, isGift && styles.inputDisabled]}
                  editable={!isGift}
                  returnKeyType="done"
                />
              </View>
            </View>

            {/* Gift toggle (compact) */}
            <Pressable
              onPress={() => {
                setIsGift((v) => {
                  const next = !v;
                  if (next) setPaid("");
                  return next;
                });
              }}
              style={({ pressed }) => [
                styles.giftToggle,
                isGift && styles.giftToggleOn,
                pressed && { opacity: 0.92 },
              ]}
              hitSlop={6}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
                <Text style={[styles.giftCheckbox, isGift && styles.giftCheckboxOn]}>
                  {isGift ? "✓" : ""}
                </Text>
                <Text style={styles.giftTitle}>Gift (paid = 0)</Text>
              </View>
              <Text style={styles.giftRight}>{isGift ? "On" : "Off"}</Text>
            </Pressable>

            {/* Date (compact) */}
            <View style={styles.dateRow}>
              <Text style={styles.label}>Date</Text>

              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowPicker(true);
                }}
                style={({ pressed }) => [styles.input, styles.dateInput, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.valueText}>{ymdFromDate(pickedDate)}</Text>
                <Ionicons
                  name="calendar-outline"
                  size={16}
                  color={colors.ink}
                  style={{ opacity: 0.55 }}
                />
              </Pressable>

              {showPicker ? (
                <View style={{ marginTop: spacing.sm }}>
                  <DateTimePicker
                    value={pickedDate}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(event, date) => {
                      if (Platform.OS !== "ios") setShowPicker(false);
                      if (date) setPickedDate(date);
                    }}
                  />

                  {Platform.OS === "ios" ? (
                    <Pressable
                      onPress={() => setShowPicker(false)}
                      style={({ pressed }) => [styles.inlineDone, pressed && { opacity: 0.9 }]}
                    >
                      <Text style={styles.inlineDoneText}>Done</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            {/* Delete (edit mode only) */}
            {entryId ? (
              <Pressable
                onPress={confirmDelete}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.deleteText}>Delete purchase</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>

        {/* Sticky footer save (prevents cutoff + feels lighter) */}
        <View style={[styles.footer, { paddingBottom: Math.max(10, insets.bottom) }]}>
          <Pressable
            onPress={save}
            disabled={!canSave}
            style={({ pressed }) => [
              styles.saveBtn,
              !canSave && styles.saveBtnDisabled,
              pressed && canSave && { opacity: 0.92 },
            ]}
          >
            <Text style={styles.saveText}>{entryId ? "Save" : "Stack"}</Text>
          </Pressable>
        </View>

        {/* Currency picker modal */}
        <Modal
          visible={currencyPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCurrencyPickerOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Currency</Text>

              {CURRENCIES.map((c) => {
                const active = c === paidCurrency;
                return (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setPaidCurrency(c);
                      setCurrencyPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalRow,
                      active && styles.modalRowActive,
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    <Text style={[styles.modalRowText, active && { opacity: 0.95 }]}>
                      {c}
                      {active ? " ✓" : ""}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setCurrencyPickerOpen(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {/* Category picker modal */}
        <Modal
          visible={categoryPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCategoryPickerOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Category</Text>

              {CATEGORIES.map((c) => {
                const active = c.key === category;
                return (
                  <Pressable
                    key={c.key}
                    onPress={() => {
                      setCategory(c.key);
                      setCategoryPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalRow,
                      active && styles.modalRowActive,
                      pressed && { opacity: 0.92 },
                    ]}
                  >
                    <Text style={[styles.modalRowText, active && { opacity: 0.95 }]}>
                      {c.label}
                      {active ? " ✓" : ""}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setCategoryPickerOpen(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.92 }]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },

  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm, // tighter
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },

  title: { ...text.titleM, fontSize: 20, color: colors.ink },
  subtitle: { ...text.hint, color: colors.inkMuted, marginTop: 2 },

  backPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSoft,
    borderWidth: 1,
    borderColor: colors.border,
  },
  backPillText: { ...text.label, color: colors.inkSoft },

  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.70)", // matches your frosted vibe
  },

  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },

  label: { ...text.label, color: colors.inkSoft },

  pickHint: { ...text.hint, color: colors.inkMuted, textAlign: "right" },

  valueText: { ...text.body, fontWeight: "800", color: colors.ink },
  muted: { ...text.hint, color: colors.inkMuted },

  row: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "flex-end",
  },

  input: {
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10, // tighter
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    color: colors.ink,
    ...text.body,
  },

  inputDisabled: {
    backgroundColor: colors.surfaceSoft,
    borderColor: "rgba(0,0,0,0.10)",
    color: "rgba(0,0,0,0.55)",
  },

  pickerInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  chevron: { fontSize: 16, color: colors.inkMuted, fontWeight: "900" },

  giftToggle: {
    marginTop: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSoft,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  giftToggleOn: {
    backgroundColor: "rgba(0,0,0,0.07)",
    borderColor: "rgba(0,0,0,0.14)",
  },
  giftCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.22)",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: "900",
    opacity: 0.9,
    textAlign: "center",
    textAlignVertical: "center",
  },
  giftCheckboxOn: {
    backgroundColor: "rgba(0,0,0,0.10)",
    borderColor: "rgba(0,0,0,0.28)",
  },
  giftTitle: { ...text.body, fontWeight: "800", color: colors.ink },
  giftRight: { ...text.hint, color: colors.inkMuted },

  dateRow: { marginTop: spacing.xs, gap: spacing.xs },
  dateInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  inlineDone: {
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.10)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  inlineDoneText: { ...text.label, color: colors.ink },

  deleteBtn: {
    marginTop: spacing.md,
    borderWidth: 1,
    borderColor: "rgba(220,0,0,0.25)",
    backgroundColor: "rgba(220,0,0,0.06)",
    paddingVertical: 12,
    borderRadius: radius.md,
    alignItems: "center",
  },
  deleteText: { ...text.label, color: colors.danger },

  footer: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    backgroundColor: "rgba(255,255,255,0.92)",
    paddingHorizontal: spacing.lg,
    paddingTop: 10,
  },

  saveBtn: {
    backgroundColor: "rgba(0,0,0,0.14)",
    paddingVertical: 14,
    borderRadius: radius.lg,
    alignItems: "center",
  },
  saveBtnDisabled: { backgroundColor: "rgba(0,0,0,0.06)" },
  saveText: { ...text.titleM, fontSize: 16, color: colors.ink },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 16,
    justifyContent: "center",
  },
  modalCard: {
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  modalTitle: { ...text.titleM, fontSize: 16, color: colors.ink, opacity: 0.95 },

  modalRow: {
    marginTop: 10,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: colors.surfaceSoft,
  },
  modalRowActive: { backgroundColor: "rgba(0,0,0,0.12)" },
  modalRowText: { ...text.body, fontSize: 14, fontWeight: "900", color: colors.inkSoft },

  modalCancel: {
    marginTop: 12,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  modalCancelText: { ...text.body, fontWeight: "900", color: colors.inkSoft },
});
