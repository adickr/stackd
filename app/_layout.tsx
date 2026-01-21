// app/_layout.tsx
import React, { useEffect } from "react";
import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "../src/theme/tokens";

import { useCoinStore } from "../src/stores/coinStore";
<<<<<<< HEAD
=======
import { useAccountStore } from "../src/stores/accountStore";
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))

export default function RootLayout() {
  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

<<<<<<< HEAD
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="dark" backgroundColor={colors.surface} translucent={false} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
=======
  useEffect(() => {
    // Best-effort silent wallet re-auth on cold start
    // (won't pop wallet UI; returns false if not possible)
    useAccountStore.getState().ensureConnected();
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <StatusBar style="dark" backgroundColor={colors.surface} translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
>>>>>>> 2c3aa92 (Initial Stackd app (submission-ready))
        <Stack.Screen name="index" />
        <Stack.Screen name="stack/add" />
        <Stack.Screen
          name="(modal)"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
    </View>
  );
}
