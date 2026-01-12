// app/(modal)/settings.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  useSettingsStore,
  WeightUnit,
  DisplayCurrency,
} from "../../src/stores/settingsStore";
import { useSpotStore } from "../../src/stores/spotStore";
import { useAccountStore } from "../../src/stores/accountStore";

import {
  publishEncryptedSnapshot,
  restoreLatestEncryptedSnapshot,
  checkCloudBackupExists,
} from "../../src/services/cloudJournal";

import {
  setCloudSignMessages,
  setCloudSignMessage,
  setCloudWalletContext,
} from "../../src/services/cloudStorage";

import {
  exportJournalBackup,
  importJournalBackup,
} from "../../src/services/journalBackup";

function isUserCancel(err: any) {
  const msg = String(err?.message ?? err);
  return (
    msg.includes("CancellationException") ||
    msg.toLowerCase().includes("cancel") ||
    msg === "USER_CANCELLED"
  );
}

function shortAddr(a: string) {
  if (!a) return "";
  if (a.length <= 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

function formatWhen(ts?: number | null) {
  if (!ts) return "Unknown";
  return new Date(ts).toLocaleString();
}

export default function SettingsScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const reset = useSettingsStore((s) => s.reset);

  // Persisted cloud backup UI metadata (assumes you added these to settingsStore)
  const hasCloudBackup = useSettingsStore((s) => (s as any).hasCloudBackup ?? false);
  const lastCloudBackupAt = useSettingsStore((s) => (s as any).lastCloudBackupAt ?? null);
  const setCloudBackupState = useSettingsStore((s) => (s as any).setCloudBackupState);

  const [showOfflineBackup, setShowOfflineBackup] = useState(false);
  const [checkingCloud, setCheckingCloud] = useState(false);

  const refreshSpot = useSpotStore((s) => s.refreshSpot);

  const isConnected = useAccountStore((s) => s.isConnected);
  const walletAddressB64 = useAccountStore((s) => s.walletAddressB64);
  const walletAddressB58 = useAccountStore((s) => s.walletAddressB58);
  const connect = useAccountStore((s) => s.connect);
  const disconnect = useAccountStore((s) => s.disconnect);

  const signMessage = useAccountStore((s) => s.signMessage);
  const signMessagesMaybe = useAccountStore((s) => (s as any).signMessages);

  // Register signer + wallet context for cloud flows
  useEffect(() => {
    const hasB58 = typeof walletAddressB58 === "string" && walletAddressB58.length > 0;
    const connected = !!isConnected;

    const canBatch = connected && hasB58 && typeof signMessagesMaybe === "function";
    const canSingle = connected && hasB58 && typeof signMessage === "function";

    if (canBatch) {
      setCloudSignMessages(signMessagesMaybe);
      setCloudWalletContext({
        walletAddressB64: walletAddressB64 ?? null,
        walletAddressB58: walletAddressB58 ?? null,
      });
    } else if (canSingle) {
      setCloudSignMessage(signMessage);
      setCloudSignMessages(async (messages: string[]) => {
        const out: string[] = [];
        for (const m of messages) out.push(await signMessage(m));
        return out;
      });
      setCloudWalletContext({
        walletAddressB64: walletAddressB64 ?? null,
        walletAddressB58: walletAddressB58 ?? null,
      });
    } else {
      setCloudSignMessage(null);
      setCloudSignMessages(null);
      setCloudWalletContext({ walletAddressB64: null, walletAddressB58: null });
    }

    return () => {
      setCloudSignMessage(null);
      setCloudSignMessages(null);
      setCloudWalletContext({ walletAddressB64: null, walletAddressB58: null });
    };
  }, [isConnected, walletAddressB64, walletAddressB58, signMessage, signMessagesMaybe]);

  // Option A: On connect, ask relay for latest backup and capture its timestamp.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!isConnected || !walletAddressB58) return;

      try {
        setCheckingCloud(true);
        const res = await checkCloudBackupExists();
        if (cancelled) return;

        if (res.exists) {
          const ts =
            typeof (res as any).publishedAt === "number"
              ? (res as any).publishedAt
              : typeof (res as any).createdAt === "number"
              ? (res as any).createdAt
              : null;

          setCloudBackupState?.({
            hasCloudBackup: true,
            lastCloudBackupAt: ts,
          });
        } else {
          setCloudBackupState?.({ hasCloudBackup: false, lastCloudBackupAt: null });
        }
      } catch {
        // ignore; cloud might be temporarily unreachable
      } finally {
        if (!cancelled) setCheckingCloud(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isConnected, walletAddressB58, setCloudBackupState]);

  const handleConnectForCloud = async () => {
    try {
      await connect();
    } catch (e: any) {
      if (isUserCancel(e)) return;
      Alert.alert("Wallet connect failed", e?.message ?? String(e));
    }
  };

  const handlePublishCloud = async () => {
    if (!isConnected || !walletAddressB58) {
      Alert.alert("Wallet required", "Connect your wallet to enable cloud backup.");
      return;
    }

    try {
      const res = await publishEncryptedSnapshot();

      // immediate UI update (local), relay timestamp will show after reconnect or next check
      const now = Date.now();
      setCloudBackupState?.({ hasCloudBackup: true, lastCloudBackupAt: now });

      console.log("[settings] cloud backup ok", res);
      Alert.alert("Backed up", "Your encrypted cloud backup was saved.");
    } catch (e: any) {
      console.log("[settings] cloud backup error", e?.message ?? String(e), e);
      if (isUserCancel(e)) return;
      Alert.alert("Backup failed", e?.message ?? String(e));
    }
  };

  const handleRestoreCloud = async () => {
    if (!isConnected || !walletAddressB58) {
      Alert.alert("Wallet required", "Connect your wallet to restore from cloud.");
      return;
    }

    Alert.alert(
      "Restore backup?",
      "This will replace the portfolio on this phone with your latest cloud backup.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await restoreLatestEncryptedSnapshot();
              console.log("[settings] cloud restore ok", res);
              Alert.alert("Restored", "Your portfolio has been restored.");
            } catch (e: any) {
              console.log("[settings] cloud restore error", e?.message ?? String(e), e);
              if (isUserCancel(e)) return;
              Alert.alert("Restore failed", e?.message ?? String(e));
            }
          },
        },
      ]
    );
  };

  const handleExport = async () => {
    const res = await exportJournalBackup();

    if (!res.ok) {
      if (res.reason === "cancelled") return;

      if (res.reason === "unavailable") {
        Alert.alert(
          "Export unavailable",
          res.message ??
            "Your current app build doesn't support Android export yet. Rebuild/reinstall the dev client."
        );
        return;
      }

      Alert.alert("Export failed", res.message ?? "Unknown error");
      return;
    }

    Alert.alert("Exported", "Backup saved. You can now import it on a new phone.");
  };

  const handleImport = async () => {
    Alert.alert("Import backup?", "This will replace your local backups on this device.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Import",
        style: "destructive",
        onPress: async () => {
          const res = await importJournalBackup("replace");

          if (!res.ok) {
            if (res.reason === "cancelled") return;
            Alert.alert("Import failed", res.message ?? "Unknown error");
            return;
          }

          const report = res.report;
          Alert.alert(
            "Imported",
            `Anchors: ${report.anchorsImported}\nInventories: ${report.inventoriesImported}`
          );
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>Settings</Text>

          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.75 }]}
            hitSlop={10}
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <Section title="Units">
          <Segmented<WeightUnit>
            value={unit}
            options={[
              { label: "oz", value: "oz" },
              { label: "g", value: "g" },
            ]}
            onChange={(v) => setUnit(v)}
          />
          <Text style={styles.helper}>Choose how weights are displayed.</Text>
        </Section>

        <Section title="Currency">
          <Segmented<DisplayCurrency>
            value={currency}
            options={[
              { label: "ZAR", value: "ZAR" },
              { label: "USD", value: "USD" },
            ]}
            onChange={(v) => {
              setCurrency(v);
              refreshSpot();
            }}
          />
          <Text style={styles.helper}>Spot refreshes when you switch currency.</Text>
        </Section>

        <Section title="Cloud backup">
          {!isConnected ? (
            <>
              <Pressable
                onPress={handleConnectForCloud}
                style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
              >
                <Text style={styles.navText}>Connect wallet</Text>
              </Pressable>

              <Text style={styles.helper}>
                Connect your wallet to enable encrypted cloud backups.
              </Text>
            </>
          ) : (
            <>
              <View style={styles.accountPill}>
                <Text style={styles.accountText} numberOfLines={2}>
                  Wallet connected: {walletAddressB58 ? shortAddr(walletAddressB58) : "—"}
                  {"\n"}Last backup: {checkingCloud ? "Checking…" : formatWhen(lastCloudBackupAt)}
                </Text>
              </View>

              <Pressable
                onPress={handlePublishCloud}
                style={({ pressed }) => [
                  styles.navBtn,
                  { marginTop: 10 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.navText}>Back up now</Text>
              </Pressable>

              {hasCloudBackup ? (
                <Pressable
                  onPress={handleRestoreCloud}
                  style={({ pressed }) => [
                    styles.navBtn,
                    { marginTop: 10 },
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.navText}>Restore backup</Text>
                </Pressable>
              ) : null}

              <Pressable
                onPress={disconnect}
                style={({ pressed }) => [
                  styles.navBtn,
                  { marginTop: 10, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.navText}>Disconnect wallet</Text>
              </Pressable>

              <Text style={styles.helper}>
                Backups are encrypted and can only be restored using your wallet.
              </Text>
            </>
          )}
        </Section>

        <Section title="Offline backup">
          <Pressable
            onPress={() => setShowOfflineBackup((v) => !v)}
            style={({ pressed }) => [styles.linkBtn, pressed && { opacity: 0.75 }]}
            hitSlop={10}
          >
            <Text style={styles.linkText}>
              {showOfflineBackup ? "Hide offline backup" : "Show offline backup"}
            </Text>
          </Pressable>

          {showOfflineBackup ? (
            <>
              <Pressable
                onPress={handleExport}
                style={({ pressed }) => [
                  styles.navBtn,
                  { marginTop: 12 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.navText}>Export backup</Text>
              </Pressable>

              <Pressable
                onPress={handleImport}
                style={({ pressed }) => [
                  styles.navBtn,
                  { marginTop: 10 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.navText}>Import backup</Text>
              </Pressable>

              <Text style={styles.helper}>
                Stores a backup file on your device. Useful for reviews or moving data manually.
              </Text>
            </>
          ) : (
            <Text style={styles.helper}>Optional: export/import a local backup file.</Text>
          )}
        </Section>

        <Pressable
          onPress={() => {
            reset();
            refreshSpot();
          }}
          style={({ pressed }) => [styles.resetBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.resetText}>Reset to defaults</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.segmentWrap}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={({ pressed }) => [
              styles.segment,
              active && styles.segmentActive,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 28 },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  title: { fontSize: 22, fontWeight: "800" },

  doneBtn: { alignSelf: "flex-start" },
  doneText: { fontSize: 14, fontWeight: "900", opacity: 0.65 },

  section: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(0,0,0,0.06)",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    opacity: 0.75,
    marginBottom: 10,
  },

  segmentWrap: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentActive: { backgroundColor: "rgba(0,0,0,0.18)" },
  segmentText: { fontSize: 14, fontWeight: "800", opacity: 0.7 },
  segmentTextActive: { opacity: 1 },

  helper: { marginTop: 10, fontSize: 12, opacity: 0.65 },

  navBtn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  navText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },

  accountPill: {
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  accountText: { fontSize: 12, fontWeight: "800", opacity: 0.75 },

  linkBtn: {
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  linkText: {
    fontSize: 13,
    fontWeight: "900",
    opacity: 0.7,
    textDecorationLine: "underline",
  },

  resetBtn: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.10)",
  },
  resetText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
});
