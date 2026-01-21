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
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useCoinStore } from "../../src/stores/coinStore";
import { useStackStore } from "../../src/stores/stackStore";
import { useSettingsStore } from "../../src/stores/settingsStore";
import type { DisplayCurrency } from "../../src/stores/settingsStore";
import type { StackCategory } from "../../src/domain/stackEntry";

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

  // ✅ Paid currency is DisplayCurrency (same union as settings)
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
    if (existing) return; // don't override edit mode
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
  const subtitle = entryId ? "Update a purchase in your stack." : "Add a purchase to your stack.";

  // Nice placeholder per currency (tiny UX win)
  const paidPlaceholder =
    paidCurrency === "USD"
      ? "e.g. 120"
      : paidCurrency === "EUR"
        ? "e.g. 110"
        : paidCurrency === "GBP"
          ? "e.g. 95"
          : "e.g. 450";

  const categoryLabel = useMemo(() => {
    return CATEGORIES.find((c) => c.key === category)?.label ?? "Other";
  }, [category]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 6 : 0}
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
          <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {/* Back */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                router.back();
              }}
              style={({ pressed }) => [styles.backPill, pressed && { opacity: 0.85 }]}
              hitSlop={8}
            >
              <Text style={styles.backPillText}>← Back</Text>
            </Pressable>

            {/* Coin picker */}
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                router.push("/coins/picker");
              }}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.label}>Coin</Text>
              <Text style={styles.valueText}>{coin ? coin.name : "Pick a coin"}</Text>
              {coin ? (
                <Text style={styles.muted}>
                  Purity {coin.purity} • Fine {coin.fineWeightGrams} g
                </Text>
              ) : null}
            </Pressable>

            {/* Quantity */}
            <Text style={styles.label}>Quantity</Text>
            <TextInput
              placeholder="e.g. 1"
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={qty}
              onChangeText={setQty}
              style={styles.input}
              returnKeyType="done"
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setCategoryPickerOpen(true);
              }}
              style={({ pressed }) => [
                styles.input,
                styles.pickerInput,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.valueText}>{categoryLabel}</Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>

            {/* Gift toggle */}
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
                pressed && { opacity: 0.9 },
              ]}
              hitSlop={6}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={[styles.giftCheckbox, isGift && styles.giftCheckboxOn]}>
                  {isGift ? "✓" : ""}
                </Text>
                <View style={{ gap: 2 }}>
                  <Text style={styles.giftTitle}>Gift</Text>
                  <Text style={styles.giftSub}>Mark this purchase as a gift (paid = 0)</Text>
                </View>
              </View>
            </Pressable>

            {/* Paid currency picker */}
            <Text style={styles.label}>Paid currency</Text>
            <Pressable
              onPress={() => {
                Keyboard.dismiss();
                setCurrencyPickerOpen(true);
              }}
              style={({ pressed }) => [
                styles.input,
                styles.pickerInput,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.valueText}>{paidCurrency}</Text>
              <Text style={styles.chevron}>▾</Text>
            </Pressable>

            {/* Paid */}
            <Text style={styles.label}>Total paid ({paidCurrency})</Text>
            <TextInput
              placeholder={isGift ? "Gift" : paidPlaceholder}
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={isGift ? "" : paid}
              onChangeText={setPaid}
              style={[styles.input, isGift && styles.inputDisabled]}
              editable={!isGift}
              returnKeyType="done"
            />

            {/* Date picker */}
            <View style={styles.dateBlock}>
              <Text style={styles.label}>Date</Text>

              <Pressable
                onPress={() => {
                  Keyboard.dismiss();
                  setShowPicker(true);
                }}
                style={({ pressed }) => [styles.input, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.valueText}>{ymdFromDate(pickedDate)}</Text>
              </Pressable>

              {showPicker ? (
                <DateTimePicker
                  value={pickedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    if (Platform.OS !== "ios") setShowPicker(false);
                    if (date) setPickedDate(date);
                  }}
                />
              ) : null}

              {Platform.OS === "ios" && showPicker ? (
                <Pressable
                  onPress={() => setShowPicker(false)}
                  style={({ pressed }) => [styles.primaryBtn, pressed && { opacity: 0.9 }]}
                >
                  <Text style={styles.primaryText}>Done</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Save */}
            <Pressable
              onPress={save}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.saveText}>{entryId ? "Save changes" : "Stack"}</Text>
            </Pressable>

            {/* Delete (edit mode only) */}
            {entryId ? (
              <Pressable
                onPress={confirmDelete}
                style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.deleteText}>Delete purchase</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </Pressable>

        {/* Currency picker modal */}
        <Modal
          visible={currencyPickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setCurrencyPickerOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Choose currency</Text>

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
                      pressed && { opacity: 0.9 },
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
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.9 }]}
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
              <Text style={styles.modalTitle}>Choose category</Text>

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
                      pressed && { opacity: 0.9 },
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
                style={({ pressed }) => [styles.modalCancel, pressed && { opacity: 0.9 }]}
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
  safe: { flex: 1, backgroundColor: "#fff" },

  container: {
    flexGrow: 1,
    padding: 24,
    gap: 14,
    paddingBottom: 32,
  },

  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#444" },

  backPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
  },
  backPillText: { fontSize: 13, fontWeight: "800", opacity: 0.75 },

  card: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },

  label: {
    fontSize: 12,
    fontWeight: "800",
    opacity: 0.7,
    marginTop: 2,
  },

  valueText: { fontWeight: "700", color: "#111" },
  muted: { color: "#555" },

  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fff",
    color: "#111",
  },

  inputDisabled: {
    backgroundColor: "rgba(0,0,0,0.04)",
    borderColor: "rgba(0,0,0,0.10)",
    color: "rgba(0,0,0,0.55)",
  },

  pickerInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chevron: { fontSize: 16, opacity: 0.5, fontWeight: "800" },

  giftToggle: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
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
  },
  giftCheckboxOn: {
    backgroundColor: "rgba(0,0,0,0.10)",
    borderColor: "rgba(0,0,0,0.28)",
  },
  giftTitle: { fontSize: 14, fontWeight: "900", color: "#111" },
  giftSub: { fontSize: 12, color: "#555", fontWeight: "600" },

  dateBlock: { gap: 10, marginTop: 6 },

  primaryBtn: {
    backgroundColor: "#111",
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontWeight: "800" },

  saveBtn: {
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 6,
  },
  saveBtnDisabled: { backgroundColor: "#999" },
  saveText: { color: "#fff", fontWeight: "800" },

  deleteBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(220,0,0,0.25)",
    backgroundColor: "rgba(220,0,0,0.06)",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteText: { color: "#b00020", fontWeight: "900" },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    padding: 16,
    justifyContent: "center",
  },
  modalCard: {
    borderRadius: 18,
    backgroundColor: "#fff",
    padding: 16,
  },
  modalTitle: { fontSize: 16, fontWeight: "900", opacity: 0.9 },

  modalRow: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  modalRowActive: { backgroundColor: "rgba(0,0,0,0.12)" },
  modalRowText: { fontSize: 14, fontWeight: "900", opacity: 0.8 },

  modalCancel: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  modalCancelText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
});
