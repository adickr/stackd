import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Platform } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import DateTimePicker from "@react-native-community/datetimepicker";

import { useStackStore } from "../../../src/stores/stackStore";
import { useCoinStore } from "../../../src/stores/coinStore";

function parseNumber(input: string) {
  const normalized = input.trim().replace(",", ".");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : NaN;
}

function ymdFromDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function EditEntry() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();

  // Handle string[] just in case
  const id =
    typeof params.id === "string"
      ? params.id
      : Array.isArray(params.id)
      ? params.id[0]
      : undefined;

  const entry = useStackStore((s) => s.getEntry(id));
  const updateEntry = useStackStore((s) => s.updateEntry);

  const getCoin = useCoinStore((s) => s.getCoin);
  const coin = useMemo(() => (entry ? getCoin(entry.coinTypeId) : undefined), [entry, getCoin]);

  const [qty, setQty] = useState("");
  const [paid, setPaid] = useState("");
  const [pickedDate, setPickedDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  // Populate fields once entry exists
  useEffect(() => {
    if (!entry) return;
    setQty(String(entry.quantity));
    setPaid(String(entry.totalPaid));
    setPickedDate(new Date(entry.purchasedAt));
  }, [entry]);

  if (!id) {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Missing entry id.</Text>
      </View>
    );
  }

  if (!entry) {
    return (
      <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 10 }}>
        <Text style={{ fontSize: 18, fontWeight: "800" }}>Entry not found.</Text>
        <Pressable
          onPress={() => router.replace("/")}
          style={{
            backgroundColor: "#111",
            paddingVertical: 12,
            borderRadius: 12,
            alignItems: "center",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Back to Home</Text>
        </Pressable>
      </View>
    );
  }

  const qtyNum = parseNumber(qty);
  const paidNum = parseNumber(paid);

  const canSave =
    Number.isFinite(qtyNum) && qtyNum > 0 && Number.isFinite(paidNum) && paidNum > 0;

  const save = () => {
    if (!canSave) return;

    const purchasedAt = new Date(
      pickedDate.getFullYear(),
      pickedDate.getMonth(),
      pickedDate.getDate(),
      12,
      0,
      0,
      0
    ).getTime();

    updateEntry(entry.id, {
      quantity: qtyNum,
      totalPaid: paidNum,
      purchasedAt,
    });

    router.replace(`/entries/${encodeURIComponent(entry.id)}`);
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Edit entry</Text>

      <View style={{ padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#eee", gap: 6 }}>
        <Text style={{ fontWeight: "800" }}>Coin</Text>
        <Text>{coin ? coin.name : entry.coinTypeId}</Text>
      </View>

      <TextInput
        placeholder="Quantity (e.g. 1)"
        keyboardType="numeric"
        value={qty}
        onChangeText={setQty}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12 }}
      />

      <TextInput
        placeholder="Total paid (ZAR)"
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={{ borderWidth: 1, borderColor: "#ddd", padding: 12, borderRadius: 12 }}
      />

      <View style={{ gap: 10, marginTop: 6 }}>
        <Text style={{ fontWeight: "900" }}>Date</Text>

        <Pressable
          onPress={() => setShowPicker(true)}
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text>{ymdFromDate(pickedDate)}</Text>
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
            style={{
              backgroundColor: "#111",
              paddingVertical: 10,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "800" }}>Done</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={save}
        disabled={!canSave}
        style={{
          backgroundColor: canSave ? "#111" : "#999",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
          marginTop: 6,
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>Save</Text>
      </Pressable>

      <Pressable
        onPress={() => router.replace(`/entries/${encodeURIComponent(entry.id)}`)}
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#111", fontWeight: "800" }}>Cancel</Text>
      </Pressable>
    </View>
  );
}
