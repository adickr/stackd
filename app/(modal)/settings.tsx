// app/(modal)/settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  ActivityIndicator,
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

import { exportJournalBackup, importJournalBackup } from "../../src/services/journalBackup";

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

type CloudBusyMode = "idle" | "backup" | "restore";

// ✅ now that spot.ts + spotStore support them, just list them here
const CURRENCIES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP"];

export default function SettingsScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);

  // Persisted cloud backup UI metadata
  const hasCloudBackup = useSettingsStore((s) => (s as any).hasCloudBackup ?? false);
  const lastCloudBackupAt = useSettingsStore((s) => (s as any).lastCloudBackupAt ?? null);
  const setCloudBackupState = useSettingsStore((s) => (s as any).setCloudBackupState);

  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const spotLoading = useSpotStore((s) => s.isLoading);
  const spotError = useSpotStore((s) => s.error);
  const perOzByCurrency = useSpotStore((s) => s.silverPerOzByCurrency);

  const isConnected = useAccountStore((s) => s.isConnected);
  const walletAddressB64 = useAccountStore((s) => s.walletAddressB64);
  const walletAddressB58 = useAccountStore((s) => s.walletAddressB58);
  const connect = useAccountStore((s) => s.connect);
  const disconnect = useAccountStore((s) => s.disconnect);

  const signMessage = useAccountStore((s) => s.signMessage);
  const signMessagesMaybe = useAccountStore((s) => (s as any).signMessages);

  // v1 UX state
  const [checkingCloud, setCheckingCloud] = useState(false);
  const [cloudBusy, setCloudBusy] = useState<CloudBusyMode>("idle");
  const [cloudBusyText, setCloudBusyText] = useState<string>("");
  const [restoreModalVisible, setRestoreModalVisible] = useState(false);

  // Advanced / offline backup (smaller)
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Currency picker modal
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  // ✅ Pre-fetch spot once so EUR/GBP are immediately available in the picker.
  useEffect(() => {
    refreshSpot().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const cloudStatusPill = useMemo(() => {
    if (checkingCloud) return { label: "Checking…", kind: "neutral" as const };
    if (!isConnected) return { label: "Wallet required", kind: "neutral" as const };
    if (hasCloudBackup) return { label: "Backed up", kind: "good" as const };
    return { label: "Not backed up", kind: "warn" as const };
  }, [checkingCloud, isConnected, hasCloudBackup]);

  const cloudPrimaryLabel = useMemo(() => {
    if (!isConnected) return "Connect wallet";
    if (cloudBusy !== "idle") return cloudBusy === "backup" ? "Backing up…" : "Working…";
    return hasCloudBackup ? "Back up again" : "Back up now";
  }, [isConnected, hasCloudBackup, cloudBusy]);

  const cloudPrimaryDisabled = useMemo(() => cloudBusy !== "idle", [cloudBusy]);

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

  // On connect, ask relay for latest backup and capture its timestamp.
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
    if (cloudBusy !== "idle") return;

    if (!isConnected || !walletAddressB58) {
      await handleConnectForCloud();
      return;
    }

    try {
      setCloudBusy("backup");
      setCloudBusyText("Creating encrypted backup…");
      setCloudBusyText("Uploading backup…");

      const res = await publishEncryptedSnapshot();

      // Immediate UI update (local)
      const now = Date.now();
      setCloudBackupState?.({ hasCloudBackup: true, lastCloudBackupAt: now });

      console.log("[settings] cloud backup ok", res);
      Alert.alert("Backed up", "Your encrypted cloud backup was saved.");
    } catch (e: any) {
      console.log("[settings] cloud backup error", e?.message ?? String(e), e);
      if (isUserCancel(e)) return;
      Alert.alert("Backup failed", e?.message ?? String(e));
    } finally {
      setCloudBusy("idle");
      setCloudBusyText("");
    }
  };

  const openRestoreModal = async () => {
    if (cloudBusy !== "idle") return;

    if (!isConnected || !walletAddressB58) {
      Alert.alert("Wallet required", "Connect your wallet to restore from cloud.");
      return;
    }

    setRestoreModalVisible(true);
  };

  const closeRestoreModal = () => {
    if (cloudBusy === "restore") return;
    setRestoreModalVisible(false);
    setCloudBusyText("");
  };

  const confirmRestore = async () => {
    if (cloudBusy !== "idle") return;

    if (!isConnected || !walletAddressB58) {
      Alert.alert("Wallet required", "Connect your wallet to restore from cloud.");
      return;
    }

    try {
      setCloudBusy("restore");
      setCloudBusyText("Fetching encrypted backup…");
      setCloudBusyText("Decrypting locally…");

      const res = await restoreLatestEncryptedSnapshot();

      console.log("[settings] cloud restore ok", res);
      setRestoreModalVisible(false);
      Alert.alert("Restored", "Your portfolio has been restored.");
    } catch (e: any) {
      console.log("[settings] cloud restore error", e?.message ?? String(e), e);
      if (isUserCancel(e)) {
        setRestoreModalVisible(false);
        return;
      }
      Alert.alert("Restore failed", e?.message ?? String(e));
    } finally {
      setCloudBusy("idle");
      setCloudBusyText("");
    }
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
          <Pressable
            onPress={() => setCurrencyPickerOpen(true)}
            style={({ pressed }) => [
              styles.navBtn,
              { backgroundColor: "rgba(0,0,0,0.08)" },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.navText}>Display currency: {currency}</Text>
          </Pressable>

          <Text style={styles.helper}>
            Spot refreshes when you change currency.
            {spotError ? ` (Spot: ${spotError})` : ""}
          </Text>
        </Section>

        <Section title="Cloud Backup (Encrypted)">
          <View style={styles.cloudCard}>
            <View style={styles.cloudTopRow}>
              <Text style={styles.cloudTitle}>Cloud Backup</Text>
              <StatusPill label={cloudStatusPill.label} kind={cloudStatusPill.kind} />
            </View>

            <Text style={styles.cloudSub}>
              {!isConnected
                ? "Connect your wallet to enable cloud backups."
                : hasCloudBackup
                ? `Last backup: ${checkingCloud ? "Checking…" : formatWhen(lastCloudBackupAt)}`
                : "Not backed up"}
            </Text>

            {isConnected ? (
              <Text style={styles.cloudMeta} numberOfLines={2}>
                Wallet: {walletAddressB58 ? shortAddr(walletAddressB58) : "—"}
              </Text>
            ) : null}

            {cloudBusy !== "idle" ? (
              <View style={styles.cloudProgressRow}>
                <ActivityIndicator />
                <Text style={styles.cloudProgressText}>{cloudBusyText || "Working…"}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handlePublishCloud}
              disabled={cloudPrimaryDisabled}
              style={({ pressed }) => [
                styles.cloudPrimaryBtn,
                cloudPrimaryDisabled && { opacity: 0.55 },
                pressed && !cloudPrimaryDisabled && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.cloudPrimaryText}>{cloudPrimaryLabel}</Text>
            </Pressable>

            {isConnected && hasCloudBackup ? (
              <Pressable
                onPress={openRestoreModal}
                disabled={cloudBusy !== "idle"}
                style={({ pressed }) => [
                  styles.cloudSecondaryBtn,
                  cloudBusy !== "idle" && { opacity: 0.55 },
                  pressed && cloudBusy === "idle" && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.cloudSecondaryText}>Restore from backup</Text>
              </Pressable>
            ) : null}

            {isConnected ? (
              <Pressable
                onPress={disconnect}
                disabled={cloudBusy !== "idle"}
                style={({ pressed }) => [
                  styles.cloudLinkBtn,
                  cloudBusy !== "idle" && { opacity: 0.55 },
                  pressed && cloudBusy === "idle" && { opacity: 0.75 },
                ]}
                hitSlop={10}
              >
                <Text style={styles.cloudLinkText}>Disconnect wallet</Text>
              </Pressable>
            ) : null}

            <Text style={styles.cloudInfo}>
              Your data is encrypted on this device using your wallet. Stackd cannot read or recover
              your backup.
            </Text>
          </View>
        </Section>

        {/* Advanced (small): Offline backup tucked away */}
        <View style={{ marginTop: 6 }}>
          <Pressable
            onPress={() => setShowAdvanced((v) => !v)}
            style={({ pressed }) => [{ paddingVertical: 6 }, pressed && { opacity: 0.75 }]}
            hitSlop={10}
          >
            <Text style={styles.advancedLink}>
              {showAdvanced ? "Hide advanced" : "Advanced"}
            </Text>
          </Pressable>

          {showAdvanced ? (
            <View style={{ marginTop: 10, gap: 10 }}>
              <Pressable
                onPress={handleExport}
                style={({ pressed }) => [
                  styles.navBtn,
                  { backgroundColor: "rgba(0,0,0,0.06)" },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.navText, { opacity: 0.75 }]}>Export offline backup</Text>
              </Pressable>

              <Pressable
                onPress={handleImport}
                style={({ pressed }) => [
                  styles.navBtn,
                  { backgroundColor: "rgba(0,0,0,0.06)" },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.navText, { opacity: 0.75 }]}>Import offline backup</Text>
              </Pressable>

              <Text style={styles.advancedHelper}>
                Offline backups are manual files stored on your device.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Restore confirmation modal */}
        <Modal
          visible={restoreModalVisible}
          transparent
          animationType="fade"
          onRequestClose={closeRestoreModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Restore encrypted backup?</Text>

              <Text style={styles.modalBody}>
                This will replace all current data on this device.{"\n"}
                You must sign with the same wallet used to create the backup.{"\n"}
                Stackd cannot recover backups if the wallet is unavailable.
              </Text>

              <View style={styles.modalWarn}>
                <Text style={styles.modalWarnText}>This action is destructive</Text>
              </View>

              {cloudBusy === "restore" ? (
                <View style={styles.modalProgressRow}>
                  <ActivityIndicator />
                  <Text style={styles.modalProgressText}>{cloudBusyText || "Restoring…"}</Text>
                </View>
              ) : null}

              <View style={styles.modalButtons}>
                <Pressable
                  onPress={confirmRestore}
                  disabled={cloudBusy === "restore"}
                  style={({ pressed }) => [
                    styles.modalPrimary,
                    cloudBusy === "restore" && { opacity: 0.55 },
                    pressed && cloudBusy !== "restore" && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.modalPrimaryText}>Continue</Text>
                </Pressable>

                <Pressable
                  onPress={closeRestoreModal}
                  disabled={cloudBusy === "restore"}
                  style={({ pressed }) => [
                    styles.modalSecondary,
                    cloudBusy === "restore" && { opacity: 0.55 },
                    pressed && cloudBusy !== "restore" && { opacity: 0.85 },
                  ]}
                >
                  <Text style={styles.modalSecondaryText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>

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

              {/* Optional loading hint */}
              {spotLoading ? (
                <View style={{ marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator />
                  <Text style={{ fontSize: 12, fontWeight: "800", opacity: 0.7 }}>
                    Updating spot…
                  </Text>
                </View>
              ) : null}

              {CURRENCIES.map((c) => {
                const active = c === currency;
                const hasSpot = typeof perOzByCurrency?.[c] === "number" && perOzByCurrency[c] > 0;

                return (
                  <Pressable
                    key={c}
                    onPress={async () => {
                      // If we don't have a spot value yet, refresh once and re-check.
                      if (!hasSpot) {
                        try {
                          await refreshSpot();
                        } catch {}
                      }

                      const stillMissing =
                        typeof perOzByCurrency?.[c] !== "number" || perOzByCurrency[c] <= 0;

                      if (stillMissing) {
                        Alert.alert(
                          "Spot unavailable",
                          "Could not fetch a live silver spot price right now. Try again in a moment."
                        );
                        return;
                      }

                      setCurrency(c);
                      setCurrencyPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.navBtn,
                      {
                        marginTop: 10,
                        backgroundColor: active ? "rgba(0,0,0,0.12)" : "rgba(0,0,0,0.06)",
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                  >
                    <Text style={[styles.navText, { opacity: active ? 0.9 : 0.75 }]}>
                      {c}
                      {active ? " ✓" : ""}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                onPress={() => setCurrencyPickerOpen(false)}
                style={({ pressed }) => [
                  styles.modalSecondary,
                  { marginTop: 12 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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

function StatusPill({
  label,
  kind,
}: {
  label: string;
  kind: "good" | "warn" | "neutral";
}) {
  return (
    <View
      style={[
        styles.pill,
        kind === "good" && styles.pillGood,
        kind === "warn" && styles.pillWarn,
        kind === "neutral" && styles.pillNeutral,
      ]}
    >
      <Text style={styles.pillText} numberOfLines={1}>
        {label}
      </Text>
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

  // Cloud card
  cloudCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  cloudTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  cloudTitle: { fontSize: 15, fontWeight: "900", opacity: 0.9 },
  cloudSub: { marginTop: 6, fontSize: 12, fontWeight: "800", opacity: 0.7 },
  cloudMeta: { marginTop: 6, fontSize: 12, fontWeight: "800", opacity: 0.6 },

  cloudProgressRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  cloudProgressText: { fontSize: 12, fontWeight: "800", opacity: 0.75 },

  cloudPrimaryBtn: {
    marginTop: 12,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  cloudPrimaryText: { fontSize: 14, fontWeight: "900", opacity: 0.9 },

  cloudSecondaryBtn: {
    marginTop: 10,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  cloudSecondaryText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },

  cloudLinkBtn: {
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 6,
  },
  cloudLinkText: {
    fontSize: 13,
    fontWeight: "900",
    opacity: 0.7,
    textDecorationLine: "underline",
  },

  cloudInfo: { marginTop: 10, fontSize: 12, opacity: 0.65, lineHeight: 16 },

  // Advanced tiny link
  advancedLink: {
    fontSize: 12,
    fontWeight: "900",
    opacity: 0.55,
    textDecorationLine: "underline",
  },
  advancedHelper: { marginTop: 6, fontSize: 11, opacity: 0.55, lineHeight: 15 },

  // Status pill
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.10)",
    maxWidth: 160,
  },
  pillGood: { backgroundColor: "rgba(0,0,0,0.14)" },
  pillWarn: { backgroundColor: "rgba(0,0,0,0.10)" },
  pillNeutral: { backgroundColor: "rgba(0,0,0,0.08)" },
  pillText: { fontSize: 12, fontWeight: "900", opacity: 0.75 },

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
  modalBody: { marginTop: 10, fontSize: 13, fontWeight: "700", opacity: 0.75, lineHeight: 18 },

  modalWarn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.06)",
  },
  modalWarnText: { fontSize: 12, fontWeight: "900", opacity: 0.7 },

  modalProgressRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  modalProgressText: { fontSize: 12, fontWeight: "800", opacity: 0.75 },

  modalButtons: { marginTop: 14, gap: 10 },

  modalPrimary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  modalPrimaryText: { fontSize: 14, fontWeight: "900", opacity: 0.9 },

  modalSecondary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  modalSecondaryText: { fontSize: 14, fontWeight: "900", opacity: 0.85 },
});
