import { Text, View } from "react-native";

export function EmptyState({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={{ padding: 24, gap: 8 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>{title}</Text>
      {subtitle && <Text style={{ color: "#555" }}>{subtitle}</Text>}
    </View>
  );
}
