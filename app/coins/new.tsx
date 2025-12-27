import { View, Text } from "react-native";

export default function NewCoin() {
  return (
    <View style={{ flex: 1, backgroundColor: "#fff", padding: 18 }}>
      <Text style={{ fontSize: 20, fontWeight: "800" }}>
        Add new coin type
      </Text>
      <Text style={{ marginTop: 8, color: "#555" }}>
        (Form coming next)
      </Text>
    </View>
  );
}
