import { useEffect, useMemo, useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useCoinStore } from "../../src/stores/coinStore";
import { useStackStore } from "../../src/stores/stackStore";

function parseNumber(input: string) {
  const normalized = input.trim().replace(",", ".");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : NaN;
}

function ymdFromDate(d: Date) {
  return d.toISOString().slice(0, 10);
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

  const entryId = params.entryId ? String(params.entryId) : undefined;
  const existing = useMemo(() => getEntry(entryId), [entryId, getEntry]);

  const [coinTypeId, setCoinTypeId] = useState<string | undefined>();
  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState("");

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
    setPaid(String(existing.totalPaid));
    setPickedDate(new Date(existing.purchasedAt));
  }, [existing]);

  // When returning from coin picker (applies to add OR edit)
  useEffect(() => {
    if (params.coinTypeId) setCoinTypeId(String(params.coinTypeId));
  }, [params.coinTypeId]);

  const coin = useMemo(() => getCoin(coinTypeId), [coinTypeId, getCoin]);

  const qtyNum = parseNumber(qty);
  const paidNum = parseNumber(paid);

  const canSave =
    !!coinTypeId &&
    Number.isFinite(qtyNum) &&
    qtyNum > 0 &&
    Number.isFinite(paidNum) &&
    paidNum > 0;

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

    if (entryId && existing) {
      updateEntry(entryId, {
        coinTypeId,
        quantity: qtyNum,
        totalPaid: paidNum,
        purchasedAt,
      });
    } else {
      addEntry({
        coinTypeId,
        quantity: qtyNum,
        totalPaid: paidNum,
        purchasedAt,
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
  const subtitle = entryId
    ? "Update a purchase in your stack."
    : "Add a purchase to your stack.";

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
          <ScrollView
            contentContainerStyle={styles.container}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>

            {/* More prominent secondary back */}
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

            {/* Paid */}
            <Text style={styles.label}>Total paid (ZAR)</Text>
            <TextInput
              placeholder="e.g. 450"
              placeholderTextColor="#777"
              keyboardType="numeric"
              value={paid}
              onChangeText={setPaid}
              style={styles.input}
              returnKeyType="done"
            />

            {/* Date picker */}
            <View style={styles.dateBlock}>
              <Text style={styles.label}>Date</Text>

              <Pressable
                onPress={() => {
                  Keyboard.dismiss(); // ✅ close keypad
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
});
