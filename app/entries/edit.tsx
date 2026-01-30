import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, Platform } from "react-native";
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
  const params = useLocalSearchParams<{ coinTypeId?: string }>();

  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);
  const getCoin = useCoinStore((s) => s.getCoin);

  const addEntry = useStackStore((s) => s.addEntry);

  const [coinTypeId, setCoinTypeId] = useState<string | undefined>();
  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState("");

  const [pickedDate, setPickedDate] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  // When returning from coin picker
  useEffect(() => {
    if (params.coinTypeId) {
      setCoinTypeId(String(params.coinTypeId));
    }
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

    addEntry({
      coinTypeId,
      quantity: qtyNum,
      totalPaid: paidNum,
      paidCurrency: "ZAR",
      category: "bullion",
      purchasedAt,
    });

    router.replace("/");
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Stack</Text>
      <Text style={{ color: "#444" }}>Add a purchase to your stack.</Text>

      {/* Coin picker */}
      <Pressable
        onPress={() => router.push("/coins/picker")}
        style={{
          borderWidth: 1,
          borderColor: "#eee",
          borderRadius: 14,
          padding: 14,
          gap: 6,
        }}
      >
        <Text style={{ fontWeight: "800" }}>Coin</Text>
        <Text>{coin ? coin.name : "Pick a coin"}</Text>
        {coin ? (
          <Text style={{ color: "#555" }}>
            Purity {coin.purity} • Fine {coin.fineWeightGrams} g
          </Text>
        ) : null}
      </Pressable>

      {/* Quantity */}
      <TextInput
        placeholder="Quantity (e.g. 1)"
        keyboardType="numeric"
        value={qty}
        onChangeText={setQty}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 12,
          borderRadius: 12,
        }}
      />

      {/* Paid */}
      <TextInput
        placeholder="Total paid (ZAR)"
        keyboardType="numeric"
        value={paid}
        onChangeText={setPaid}
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 12,
          borderRadius: 12,
        }}
      />

      {/* Date picker */}
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

      {/* Save */}
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
        <Text style={{ color: "#fff", fontWeight: "800" }}>Stack</Text>
      </Pressable>
    </View>
  );
}
