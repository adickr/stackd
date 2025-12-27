import { useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useStackStore } from "../../src/stores/stackStore";

export default function StackScreen() {
  const router = useRouter();
  const addEntry = useStackStore((s) => s.addEntry);

  const [qty, setQty] = useState("1");
  const [paid, setPaid] = useState("");

  const save = () => {
    addEntry({
      coinTypeId: "ase-1oz", // temporary hardcode
      quantity: Number(qty),
      totalPaid: Number(paid),
      purchasedAt: Date.now(),
    });
    router.back();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 24, gap: 14 }}>
      <Text style={{ fontSize: 24, fontWeight: "900" }}>Add to Stack</Text>

      <TextInput
        placeholder="Quantity"
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

      <Pressable
        onPress={save}
        style={{
          backgroundColor: "#111",
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: "center",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "800" }}>Stack it</Text>
      </Pressable>
    </View>
  );
}
