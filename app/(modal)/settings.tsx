// app/(modal)/settings.tsx
import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import {
  useSettingsStore,
  WeightUnit,
  DisplayCurrency,
} from "../../src/stores/settingsStore";
import { useSpotStore } from "../../src/stores/spotStore";
import { useStackStore } from "../../src/stores/stackStore";
import { useCoinStore } from "../../src/stores/coinStore";
import { useJournalStore } from "../../src/stores/journalStore";
import { useAccountStore } from "../../src/stores/accountStore";
import { publishEncryptedSnapshot, restoreLatestEncryptedSnapshot } from "../../src/services/cloudJournal";

import { hashObject } from "../../src/utils/journalCrypto";
import {
  exportJournalBackup,
  importJournalBackup,
} from "../../src/services/journalBackup";

const TROY_OZ_GRAMS = 31.1035;
const LEVEL_VERSION = "v1";

type StackLevel = { name: string; minOz: number };
const STACK_LEVELS: StackLevel[] = [
  { name: "Seed", minOz: 0 },
  { name: "Starter", minOz: 10 },
  { name: "Accumulator", minOz: 50 },
  { name: "Stacker", minOz: 150 },
  { name: "Vaulted", minOz: 300 },
  { name: "Stronghold", minOz: 500 },
  { name: "Hoarder", minOz: 1000 },
  { name: "Bullion Lord", minOz: 2500 },
];

function getStackLevel(totalOz: number) {
  const safe = Number.isFinite(totalOz) ? totalOz : 0;
  for (let i = STACK_LEVELS.length - 1; i >= 0; i--) {
    if (safe >= STACK_LEVELS[i].minOz) return STACK_LEVELS[i];
  }
  return STACK_LEVELS[0];
}

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

export default function SettingsScreen() {
  const router = useRouter();

  const unit = useSettingsStore((s) => s.unit);
  const currency = useSettingsStore((s) => s.currency);
  const setUnit = useSettingsStore((s) => s.setUnit);
  const setCurrency = useSettingsStore((s) => s.setCurrency);
  const reset = useSettingsStore((s) => s.reset);

  const refreshSpot = useSpotStore((s) => s.refreshSpot);
  const spotZar = useSpotStore((s) => s.silverZarPerOz);
  const spotUsd = useSpotStore((s) => s.silverUsdPerOz);
  const spotFetchedAt = useSpotStore((s) => s.fetchedAt);

  const entries = useStackStore((s) => s.entries);
  const coins = useCoinStore((s) => s.coins);

  const addAnchor = useJournalStore((s) => s.addAnchor);
  const anchors = useJournalStore((s) => s.anchors);
  const upsertInventory = useJournalStore((s) => s.upsertInventory);

  const isConnected = useAccountStore((s) => s.isConnected);
  const walletAddressB58 = useAccountStore((s) => s.walletAddressB58);
  const connect = useAccountStore((s) => s.connect);
  const disconnect = useAccountStore((s) => s.disconnect);
  const signMessage = useAccountStore((s) => s.signMessage);

  const fineOzByCoinId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of coins) {
      map[c.id] = (c.fineWeightGrams ?? 0) / TROY_OZ_GRAMS;
    }
    return map;
  }, [coins]);

  const totalOz = useMemo(() => {
    return entries.reduce(
      (sum, e) => sum + e.quantity * (fineOzByCoinId[e.coinTypeId] ?? 0),
      0
    );
  }, [entries, fineOzByCoinId]);

  const spot = currency === "ZAR" ? spotZar : spotUsd;
  const portfolioValue = spot > 0 ? totalOz * spot : 0;
  const hasSpot = Number.isFinite(spot) && spot > 0;

  const currentFineOz = Number(totalOz.toFixed(4));
  const currentStackValue = Math.round(portfolioValue);
  const level = useMemo(() => getStackLevel(currentFineOz), [currentFineOz]);

  const lastAnchor = useMemo(() => {
    if (!anchors.length) return null;
    return anchors.reduce(
      (latest, a) => (a.createdAt > latest.createdAt ? a : latest),
      anchors[0]
    );
  }, [anchors]);

  const lastFineOz = lastAnchor ? Number(lastAnchor.totalFineOz.toFixed(4)) : null;
  const lastValue = lastAnchor ? Math.round(lastAnchor.stackValue) : null;

  const hasStack = entries.length > 0;
  const hasChangedSinceLastSeal =
    !lastAnchor || currentFineOz !== lastFineOz || currentStackValue !== lastValue;

  const canSeal =
    isConnected &&
    !!walletAddressB58 &&
    hasStack &&
    hasSpot &&
    hasChangedSinceLastSeal;

  const sealSnapshot = async () => {
    if (!walletAddressB58) return;

    const inventoryPayload = {
      coins: [...coins]
        .map((c) => ({
          id: c.id,
          name: c.name,
          metal: c.metal,
          purity: c.purity,
          fineWeightGrams: c.fineWeightGrams ?? 0,
          diameterMm: c.diameterMm,
          thicknessMm: c.thicknessMm,
          hallmarks: c.hallmarks ?? [],
          notes: c.notes,
          createdAt: c.createdAt,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),

      entries: [...entries]
        .map((e) => ({
          id: e.id,
          coinTypeId: e.coinTypeId,
          quantity: e.quantity,
          totalPaid: e.totalPaid,
          purchasedAt: e.purchasedAt,
        }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    };

    const inventoryHash = hashObject(inventoryPayload);

    const snapshotPayload = {
      createdAt: Date.now(),
      currency,
      spotPrice: Number((spot || 0).toFixed(4)),
      spotFetchedAt: spotFetchedAt ?? 0,
      totalFineOz: currentFineOz,
      stackValue: currentStackValue,
      levelName: level.name,
      levelVersion: LEVEL_VERSION,
      inventoryHash,
    };

    const snapshotHash = hashObject(snapshotPayload);

    // IMPORTANT: address in the seal must be BASE58 (PublicKey string)
    const signText =
      `Stackd Journal Seal v1\n` +
      `snapshotHash:${snapshotHash}\n` +
      `address:${walletAddressB58}`;

    let signature: string;
    try {
      signature = await signMessage(signText);
    } catch (e: any) {
      if (isUserCancel(e)) return;
      Alert.alert("Signing failed", e?.message ?? String(e));
      return;
    }

    upsertInventory({
      inventoryHash,
      createdAt: snapshotPayload.createdAt,
      coins: inventoryPayload.coins as any,
      entries: inventoryPayload.entries as any,
    });

    addAnchor({
      id: `${snapshotPayload.createdAt}-${Math.random().toString(16).slice(2)}`,
      createdAt: snapshotPayload.createdAt,

      totalFineOz: snapshotPayload.totalFineOz,
      spotPrice: snapshotPayload.spotPrice,
      spotFetchedAt: snapshotPayload.spotFetchedAt,
      currency: snapshotPayload.currency,
      stackValue: snapshotPayload.stackValue,

      levelName: snapshotPayload.levelName,
      levelVersion: snapshotPayload.levelVersion,

      inventoryHash,
      snapshotHash,

      // store BASE58 (matches new journalStore expectations + verifier)
      walletAddress: walletAddressB58,
      signature,
      signMessage: signText,
    });
  };

  
  const handlePublishCloud = async () => {
  console.log("[settings] publish tapped");
  console.log("[settings] isConnected =", isConnected);
  console.log("[settings] walletAddressB58 =", walletAddressB58);

  if (!isConnected || !walletAddressB58) {
    Alert.alert(
      "Wallet required",
      "Connect your wallet to publish an encrypted cloud backup."
    );
    return;
  }

  try {
    console.log("[settings] calling publishEncryptedSnapshot...");
    const res = await publishEncryptedSnapshot();
    console.log("[settings] publish ok", res);
    Alert.alert("Published", `Cloud backup published.\nPointer: ${res.pointer}`);
  } catch (e: any) {
    console.log(
      "[settings] publish error",
      e?.message ?? String(e),
      e
    );
    if (isUserCancel(e)) return;
    Alert.alert("Publish failed", e?.message ?? String(e));
  }
};


  const handleRestoreCloud = async () => {
    if (!isConnected || !walletAddressB58) {
      Alert.alert("Wallet required", "Connect your wallet to restore your encrypted cloud backup.");
      return;
    }
    Alert.alert(
      "Restore from cloud?",
      "This will replace your local stack with the latest published cloud snapshot.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Restore",
          style: "destructive",
          onPress: async () => {
            try {
              const res = await restoreLatestEncryptedSnapshot();
              Alert.alert("Restored", `Restored latest cloud snapshot.\nPointer: ${res.pointer}`);
            } catch (e: any) {
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
    Alert.alert(
      "Import backup?",
      "This will replace your local journal backups on this device.\n\nAfter importing, open Journal → Restore.",
      [
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
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
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

        <Section title="Account">
          {!isConnected ? (
            <Pressable
              onPress={async () => {
                try {
                  await connect();
                } catch (e: any) {
                  if (isUserCancel(e)) return;
                  Alert.alert("Wallet connect failed", e?.message ?? String(e));
                }
              }}
              style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.navText}>Connect wallet</Text>
            </Pressable>
          ) : (
            <>
              <View style={styles.accountPill}>
                <Text style={styles.accountText} numberOfLines={1}>
                  Connected: {walletAddressB58 ? shortAddr(walletAddressB58) : "—"}
                </Text>
              </View>

              <Pressable
                onPress={disconnect}
                style={({ pressed }) => [
                  styles.navBtn,
                  { marginTop: 10, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.navText}>Disconnect</Text>
              </Pressable>
            </>
          )}
          <Text style={styles.helper}>
            Wallet connection unlocks journal sealing and backups.
          </Text>
        </Section>

        <Section title="Journal">
          <Pressable
            onPress={() => router.push("/journal")}
            style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.navText}>Open Journal</Text>
          </Pressable>
          <Pressable
            onPress={handlePublishCloud}
            style={({ pressed }) => [
              styles.navBtn,
              { marginTop: 10 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.navText}>Publish encrypted cloud backup</Text>
          </Pressable>

          <Pressable
            onPress={handleRestoreCloud}
            style={({ pressed }) => [
              styles.navBtn,
              { marginTop: 10 },
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.navText}>Restore from cloud</Text>
          </Pressable>


          <Pressable
            onPress={handleExport}
            style={({ pressed }) => [
              styles.navBtn,
              { marginTop: 10 },
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

          <Pressable
            onPress={() => sealSnapshot()}
            disabled={!canSeal}
            style={({ pressed }) => [
              styles.navBtn,
              {
                marginTop: 10,
                opacity: !canSeal ? 0.45 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.navText}>
              {canSeal ? "Seal & sign snapshot" : "Sealed ✓"}
            </Text>
          </Pressable>

          <Text style={styles.helper}>
            {!isConnected
              ? "Connect wallet to unlock sealing."
              : !hasStack
              ? "Add metal to your stack to enable sealing."
              : !hasSpot
              ? "Pull to refresh to fetch spot before sealing."
              : canSeal
              ? "Creates a signed seal of your stack + inventory hash."
              : "Latest signed seal matches your current stack."}
          </Text>

          <Text style={[styles.helper, { marginTop: 8 }]}>
            Stackd never has access to your wallet keys. Signing is used only to prove
            ownership and seal journal entries. No funds are moved.
          </Text>
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
      </View>
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
  container: { flex: 1, padding: 16 },

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
