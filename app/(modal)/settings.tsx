// app/(modal)/settings.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
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
import { useFocusEffect } from "@react-navigation/native";

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
  computeDeterministicSnapshotHashForCurrentState,
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

function isRateLimited(err: any) {
  const raw =
    String(err?.message ?? err ?? "") +
    " " +
    String(err?.code ?? "") +
    " " +
    String(err?.status ?? "") +
    " " +
    String(err?.response?.status ?? "") +
    " " +
    String(err?.response?.data?.error ?? "") +
    " " +
    String(err?.response?.data?.message ?? "");

  const msg = raw.toLowerCase();

  // Common signatures
  if (msg.includes("429")) return true;
  if (msg.includes("too many requests")) return true;
  if (msg.includes("rate limit")) return true;
  if (msg.includes("ratelimit")) return true;
  if (msg.includes("rate-limited")) return true;

  return false;
}

function showRateLimitOk() {
  Alert.alert("Please try again shortly.", "", [{ text: "OK" }]);
}

function showFriendlyError(title: string, err: any) {
  if (isRateLimited(err)) {
    showRateLimitOk();
    return;
  }
  Alert.alert(title, err?.message ?? String(err));
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
const CURRENCIES: DisplayCurrency[] = ["USD", "ZAR", "EUR", "GBP"];

export default function SettingsScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);

  const hasCloudBackup = useSettingsStore(
    (s) => (s as any).hasCloudBackup ?? false
  );
  const lastCloudBackupAt = useSettingsStore(
    (s) => (s as any).lastCloudBackupAt ?? null
  );
  const setCloudBackupState = useSettingsStore(
    (s) => (s as any).setCloudBackupState
  );

  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const spotLoading = useSpotStore((s) => s.isLoading);
  const spotError = useSpotStore((s) => s.error);

  // ✅ NEW: we can now read per-gram too (derived in spotStore)
  const perOzByCurrency = useSpotStore((s) => s.silverPerOzByCurrency);
  const perGramByCurrency = useSpotStore(
    (s) => (s as any).silverPerGramByCurrency as Record<string, number> | undefined
  );

  const isConnected = useAccountStore((s) => s.isConnected);
  const walletAddressB64 = useAccountStore((s) => s.walletAddressB64);
  const walletAddressB58 = useAccountStore((s) => s.walletAddressB58);
  const connect = useAccountStore((s) => s.connect);
  const disconnect = useAccountStore((s) => s.disconnect);

  const signMessage = useAccountStore((s) => s.signMessage);
  const signMessagesMaybe = useAccountStore((s) => (s as any).signMessages);

  // Credits
  const credits = useAccountStore((s) => (s as any).credits as number | undefined);
  const refreshCredits = useAccountStore(
    (s) => (s as any).refreshCredits as undefined | (() => Promise<void>)
  );

  const [cloudBusy, setCloudBusy] = useState<CloudBusyMode>("idle");
  const [cloudBusyText, setCloudBusyText] = useState<string>("");

  // cloud state
  const [checkingCloud, setCheckingCloud] = useState(false);
  const [cloudResolved, setCloudResolved] = useState(false); // ✅ gate UI
  const [backupSynced, setBackupSynced] = useState(false);
  const [backupMsg, setBackupMsg] = useState<string>("");

  const [restoreModalVisible, setRestoreModalVisible] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);

  const resolveSeq = useRef(0);
  const lastWalletRef = useRef<string | null>(null);

  // Pre-fetch spot once
  useEffect(() => {
    refreshSpot().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Credits fetch on connect
  useEffect(() => {
    if (!isConnected || !walletAddressB58) return;
    if (typeof refreshCredits !== "function") return;
    refreshCredits().catch(() => {});
  }, [isConnected, walletAddressB58, refreshCredits]);

  // ✅ Core resolve: latest + localHash compare (with seq guard)
  const syncBackupUi = async (reason: string) => {
    const seq = ++resolveSeq.current;

    console.log("[cloud] resolve start", {
      reason,
      seq,
      isConnected,
      walletAddressB58,
    });

    // while resolving, gate UI
    setCloudResolved(false);
    setCheckingCloud(true);

    // if not connected, reset everything deterministically
    if (!isConnected || !walletAddressB58) {
      setBackupSynced(false);
      setBackupMsg("");
      setCloudBackupState?.({ hasCloudBackup: false, lastCloudBackupAt: null });
      setCheckingCloud(false);
      setCloudResolved(true);
      console.log("[cloud] resolve end (not connected)", { seq });
      return;
    }

    try {
      // kick credits refresh, but don't block
      if (typeof refreshCredits === "function") refreshCredits().catch(() => {});

      const cloud = await checkCloudBackupExists();
      if (seq !== resolveSeq.current) return;

      console.log(
        "[cloud] latest",
        cloud.exists
          ? { exists: true, snapshotHash: cloud.snapshotHash }
          : { exists: false }
      );

      if (!cloud.exists || !cloud.snapshotHash) {
        setBackupSynced(false);
        setBackupMsg("");
        setCloudBackupState?.({ hasCloudBackup: false, lastCloudBackupAt: null });

        console.log("[cloud] resolve end (no remote)", { seq });
        return;
      }

      const localHash = await computeDeterministicSnapshotHashForCurrentState();
      if (seq !== resolveSeq.current) return;

      const matches = localHash === cloud.snapshotHash;

      setBackupSynced(matches);
      setBackupMsg(matches ? "Already backed up — no changes since last backup." : "");
      setCloudBackupState?.({
        hasCloudBackup: true,
        lastCloudBackupAt: typeof cloud.createdAt === "number" ? cloud.createdAt : null,
      });

      console.log("[cloud] resolve end", { seq, matches });
    } catch (e: any) {
      if (seq !== resolveSeq.current) return;
      console.warn("[cloud] resolve failed", e?.message ?? String(e));
      // fail closed: keep action gated until next resolve
    } finally {
      if (seq === resolveSeq.current) {
        setCheckingCloud(false);
        setCloudResolved(true);
      }
    }
  };

  // ✅ IMPORTANT: resolve on reconnect / wallet change
  useEffect(() => {
    const w = walletAddressB58 ?? null;

    // if disconnected, hard reset and mark resolved
    if (!isConnected || !w) {
      lastWalletRef.current = null;
      setBackupSynced(false);
      setBackupMsg("");
      setCloudBackupState?.({ hasCloudBackup: false, lastCloudBackupAt: null });
      setCloudResolved(true);
      setCheckingCloud(false);
      return;
    }

    if (lastWalletRef.current !== w) {
      lastWalletRef.current = w;
      syncBackupUi("wallet-change").catch(() => {});
    } else {
      syncBackupUi("reconnect").catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, walletAddressB58]);

  // Resolve when Settings gains focus too
  useFocusEffect(
    React.useCallback(() => {
      syncBackupUi("focus").catch(() => {});
      const t = setTimeout(() => syncBackupUi("focus-delay").catch(() => {}), 700);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected, walletAddressB58])
  );

  const creditsPill = useMemo(() => {
    if (!isConnected) return { label: "Wallet required", kind: "neutral" as const };
    if (!cloudResolved || checkingCloud) return { label: "Checking…", kind: "neutral" as const };

    if (typeof credits === "number") {
      if (credits <= 0) return { label: `Credits: ${credits}`, kind: "warn" as const };
      return { label: `Credits: ${credits}`, kind: "good" as const };
    }

    return { label: "Credits: —", kind: "neutral" as const };
  }, [isConnected, cloudResolved, checkingCloud, credits]);

  const cloudPrimaryLabel = useMemo(() => {
    if (!isConnected) return "Connect wallet";
    if (!cloudResolved || checkingCloud) return "Checking…";
    if (cloudBusy !== "idle") return cloudBusy === "backup" ? "Backing up…" : "Working…";
    if (credits === 0) return "No credits";
    if (backupSynced) return "Backed up";
    return hasCloudBackup ? "Back up again" : "Back up now";
  }, [isConnected, cloudResolved, checkingCloud, cloudBusy, credits, backupSynced, hasCloudBackup]);

  const cloudPrimaryDisabled = useMemo(() => {
    if (!isConnected) return false; // allow connect flow
    if (!cloudResolved || checkingCloud) return true; // ✅ gate until resolved
    if (cloudBusy !== "idle") return true;
    if (credits === 0) return true;
    return backupSynced; // ✅ disable if unchanged
  }, [isConnected, cloudResolved, checkingCloud, cloudBusy, credits, backupSynced]);

  const handleConnectForCloud = async () => {
    try {
      await connect();
    } catch (e: any) {
      if (isUserCancel(e)) return;
      showFriendlyError("Wallet connect failed", e);
    }
  };

  const handlePublishCloud = async () => {
    if (cloudBusy !== "idle") return;

    if (!isConnected || !walletAddressB58) {
      await handleConnectForCloud();
      return;
    }

    if (!cloudResolved || checkingCloud) {
      await syncBackupUi("publish-while-unresolved").catch(() => {});
      return;
    }

    if (backupSynced) return;

    try {
      setCloudBusy("backup");
      setCloudBusyText("Uploading backup…");
      setBackupMsg("");

      const res = await publishEncryptedSnapshot();
      console.log("[cloud] publish result", res);

      await syncBackupUi("post-publish");

      if (typeof refreshCredits === "function") await refreshCredits();

      if (res.status === "unchanged") {
        setBackupMsg(res.message || "Already backed up — no changes since last backup.");
      } else {
        setBackupMsg(res.message || "Backup saved.");
      }
    } catch (e: any) {
      if (isUserCancel(e)) return;
      showFriendlyError("Backup failed", e);
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
    if (!cloudResolved || checkingCloud) {
      await syncBackupUi("restore-while-unresolved").catch(() => {});
    }
    if (!hasCloudBackup) return;
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
      setCloudBusyText("Decrypting locally…");

      await restoreLatestEncryptedSnapshot();
      setRestoreModalVisible(false);

      await syncBackupUi("post-restore");
      Alert.alert("Restored", "Your portfolio has been restored.");
    } catch (e: any) {
      if (isUserCancel(e)) {
        setRestoreModalVisible(false);
        return;
      }
      showFriendlyError("Restore failed", e);
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

      // If a service underneath threw a rate limit error, keep UX clean
      if (isRateLimited(res as any)) {
        showRateLimitOk();
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

            if (isRateLimited(res as any)) {
              showRateLimitOk();
              return;
            }

            Alert.alert("Import failed", res.message ?? "Unknown error");
            return;
          }

          const report = res.report;
          Alert.alert(
            "Imported",
            `Anchors: ${report.anchorsImported}\nInventories: ${report.inventoriesImported}`
          );

          await syncBackupUi("post-import");
        },
      },
    ]);
  };

  // ✅ NEW: show spot hint in selected unit inside Currency section
  const spotHint = useMemo(() => {
    const c = currency;
    if (unit === "g") {
      const v = perGramByCurrency?.[c];
      if (typeof v === "number" && v > 0) return `${c} ${v.toFixed(2)} / g`;
      return null;
    }
    const v = perOzByCurrency?.[c];
    if (typeof v === "number" && v > 0) return `${c} ${v.toFixed(2)} / oz`;
    return null;
  }, [currency, unit, perGramByCurrency, perOzByCurrency]);

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
            {spotHint ? `Spot: ${spotHint}. ` : ""}
            Spot refreshes when you change currency.
            {spotError ? ` (Spot error: ${spotError})` : ""}
          </Text>
        </Section>

        <Section title="Cloud Backup (Encrypted)">
          <View style={styles.cloudCard}>
            <View style={styles.cloudTopRow}>
              <Text style={styles.cloudTitle}>Cloud Backup</Text>
              <StatusPill label={creditsPill.label} kind={creditsPill.kind} />
            </View>

            <Text style={styles.cloudSub}>
              {!isConnected
                ? "Connect your wallet to enable cloud backups."
                : !cloudResolved || checkingCloud
                ? "Checking backup status…"
                : hasCloudBackup
                ? `Last backup: ${formatWhen(lastCloudBackupAt)}`
                : "Not backed up"}
            </Text>

            {isConnected ? (
              <Text style={styles.cloudMeta} numberOfLines={2}>
                Wallet: {walletAddressB58 ? shortAddr(walletAddressB58) : "—"}
              </Text>
            ) : null}

            {backupMsg ? <Text style={styles.cloudMeta}>{backupMsg}</Text> : null}

            {cloudBusy !== "idle" ? (
              <View style={styles.cloudProgressRow}>
                <ActivityIndicator />
                <Text style={styles.cloudProgressText}>
                  {cloudBusyText || "Working…"}
                </Text>
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
                disabled={cloudBusy !== "idle" || !cloudResolved || checkingCloud}
                style={({ pressed }) => [
                  styles.cloudSecondaryBtn,
                  (cloudBusy !== "idle" || !cloudResolved || checkingCloud) && {
                    opacity: 0.55,
                  },
                  pressed &&
                    cloudBusy === "idle" &&
                    cloudResolved &&
                    !checkingCloud && { opacity: 0.85 },
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
              Your data is encrypted on this device using your wallet. Stackd cannot read or
              recover your backup.
            </Text>
          </View>
        </Section>

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
                <Text style={[styles.navText, { opacity: 0.75 }]}>
                  Export offline backup
                </Text>
              </Pressable>

              <Pressable
                onPress={handleImport}
                style={({ pressed }) => [
                  styles.navBtn,
                  { backgroundColor: "rgba(0,0,0,0.06)" },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.navText, { opacity: 0.75 }]}>
                  Import offline backup
                </Text>
              </Pressable>
              <Text style={styles.advancedHelper}>
                Offline backups are manual files stored on your device.
              </Text>
            </View>
          ) : null}
        </View>

        {/* Restore modal */}
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
                  <Text style={styles.modalProgressText}>
                    {cloudBusyText || "Restoring…"}
                  </Text>
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

              {spotLoading ? (
                <View
                  style={{
                    marginTop: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <ActivityIndicator />
                  <Text style={{ fontSize: 12, fontWeight: "800", opacity: 0.7 }}>
                    Updating spot…
                  </Text>
                </View>
              ) : null}

              {CURRENCIES.map((c) => {
                const active = c === currency;
                const perOzOk =
                  typeof perOzByCurrency?.[c] === "number" && perOzByCurrency[c] > 0;

                return (
                  <Pressable
                    key={c}
                    onPress={async () => {
                      if (!perOzOk) {
                        try {
                          await refreshSpot();
                        } catch (e: any) {
                          if (isRateLimited(e)) {
                            showRateLimitOk();
                            return;
                          }
                        }
                      }

                      const stillMissing =
                        typeof perOzByCurrency?.[c] !== "number" || perOzByCurrency[c] <= 0;

                      if (stillMissing) {
                        // keep the UX simple if spot isn't available (often due to rate limits)
                        showRateLimitOk();
                        return;
                      }

                      setCurrency(c);
                      setCurrencyPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.navBtn,
                      {
                        marginTop: 10,
                        backgroundColor: active
                          ? "rgba(0,0,0,0.12)"
                          : "rgba(0,0,0,0.06)",
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
  sectionTitle: { fontSize: 13, fontWeight: "800", opacity: 0.75, marginBottom: 10 },

  segmentWrap: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  segment: { flex: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
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

  cloudCard: { borderRadius: 18, padding: 14, backgroundColor: "rgba(255,255,255,0.65)" },
  cloudTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cloudTitle: { fontSize: 15, fontWeight: "900", opacity: 0.9 },
  cloudSub: { marginTop: 6, fontSize: 12, fontWeight: "800", opacity: 0.7 },
  cloudMeta: { marginTop: 6, fontSize: 12, fontWeight: "800", opacity: 0.6 },

  cloudProgressRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 10 },
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

  cloudLinkBtn: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 6 },
  cloudLinkText: { fontSize: 13, fontWeight: "900", opacity: 0.7, textDecorationLine: "underline" },

  cloudInfo: { marginTop: 10, fontSize: 12, opacity: 0.65, lineHeight: 16 },

  advancedLink: { fontSize: 12, fontWeight: "900", opacity: 0.55, textDecorationLine: "underline" },
  advancedHelper: { marginTop: 6, fontSize: 11, opacity: 0.55, lineHeight: 15 },

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

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", padding: 16, justifyContent: "center" },
  modalCard: { borderRadius: 18, backgroundColor: "#fff", padding: 16 },
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

  modalProgressRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 10 },
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
