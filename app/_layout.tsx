import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Normal screens */}
      <Stack.Screen name="index" />
      <Stack.Screen name="stack/add" />

      {/* Modal group */}
      <Stack.Screen
        name="(modal)"
        options={{
          presentation: "modal",
          animation: "slide_from_bottom",
        }}
      />
    </Stack>
  );
}
