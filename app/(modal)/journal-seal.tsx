import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import nacl from "tweetnacl";
import bs58 from "bs58";
import { Buffer } from "buffer";

import { useJournalStore } from "../../src/stores/journalStore";

function truncate(s?: string, n = 10) {
  if (!s) return "—";
  return s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-n)}` : s;
}

function utf8ToBytes(message: string) {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(message);
  return Uint8Array.from(message.split("").map((c) => c.charCodeAt(0)));
}

/**
 * Accepts either:
 * - base58 public key string (normal Solana address)
 * - base64-encoded public key bytes (MWA account.address)
 * Returns pubkey bytes (Uint8Array) for nacl verification.
 */
function decodePubkeyBytes(addr: string): Uint8Array {
  const a = String(addr ?? "").trim();
  if (!a) throw new Error("Missing wallet address");

  const looksBase64 = a.includes("+") || a.includes("/") || a.includes("=");

  if (looksBase64) {
    const bytes = Buffer.from(a, "base64");
    if (!bytes.length) throw new Error("Invalid base64 wallet address");
    return new Uint8Array(bytes);
  }

  // base58 public key
  return bs58.decode(a);
}

/**
 * Your accountStore returns base64 of the signed payload from wallet.signMessages().
 * That payload is: signature(64 bytes) || messageBytes
 *
 * We must:
 * - base64 decode it
 * - take first 64 bytes as signature
 * - verify against the ORIGINAL message bytes (anchor.signMessage)
 */
function extractSignatureBytesFromSignedPayloadB64(
  signedPayloadB64: string
): Uint8Array {
  const bytes = Buffer.from(String(signedPayloadB64 ?? "").trim(), "base64");
  if (bytes.length < 64) throw new Error("Signed payload too short");
  return new Uint8Array(bytes.subarray(0, 64));
}

export default function JournalSealScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const anchor = useJournalStore((s) => s.anchors.find((a) => a.id === id));

  const [verified, setVerified] = useState<null | boolean>(null);

  const verifySignature = () => {
    if (!anchor) return;

    try {
      const messageBytes = utf8ToBytes(anchor.signMessage);

      // ✅ signature is base64 signed payload from signMessages (sig||msg)
      const signatureBytes = extractSignatureBytesFromSignedPayloadB64(
        anchor.signature
      );

      // ✅ walletAddress can be base58 OR base64; decode appropriately
      const pubkeyBytes = decodePubkeyBytes(anchor.walletAddress);

      const ok = nacl.sign.detached.verify(messageBytes, signatureBytes, pubkeyBytes);

      setVerified(ok);
    } catch (e: any) {
      Alert.alert("Verification error", e?.message ?? String(e));
      setVerified(false);
    }
  };

  if (!anchor) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.container}>
          <Text style={styles.title}>Seal not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Journal Seal</Text>

          <Pressable onPress={() => router.back()}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <Section title="Snapshot">
          <Row label="Created">{new Date(anchor.createdAt).toLocaleString()}</Row>
          <Row label="Fine oz">{anchor.totalFineOz.toFixed(4)}</Row>
          <Row label="Stack value">
            {anchor.currency} {anchor.stackValue}
          </Row>
          <Row label="Level">{anchor.levelName}</Row>
        </Section>

        <Section title="Hashes">
          <Row label="Snapshot hash">{truncate(anchor.snapshotHash)}</Row>
          <Row label="Inventory hash">{truncate(anchor.inventoryHash)}</Row>
        </Section>

        <Section title="Signature">
          <Row label="Wallet">{truncate(anchor.walletAddress)}</Row>
          <Row label="Signature (b64)">{truncate(anchor.signature)}</Row>
        </Section>

        <Section title="Signed message">
          <Text style={styles.mono}>{anchor.signMessage}</Text>
        </Section>

        <Pressable
          onPress={verifySignature}
          style={({ pressed }) => [styles.verifyBtn, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.verifyText}>Verify signature</Text>
        </Pressable>

        {verified !== null && (
          <View
            style={[
              styles.result,
              { backgroundColor: verified ? "#d1fae5" : "#fee2e2" },
            ]}
          >
            <Text style={styles.resultText}>
              {verified ? "✓ Signature valid" : "✕ Signature invalid"}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { padding: 16 },

  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },

  title: { fontSize: 22, fontWeight: "800" },
  doneText: { fontSize: 14, fontWeight: "900", opacity: 0.6 },

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

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  label: { fontSize: 12, opacity: 0.6 },
  value: { fontSize: 12, fontWeight: "600" },

  mono: {
    fontSize: 11,
    fontFamily: "Courier",
    opacity: 0.75,
  },

  verifyBtn: {
    marginTop: 6,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.1)",
  },
  verifyText: { fontSize: 14, fontWeight: "900" },

  result: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
  },
  resultText: { fontSize: 14, fontWeight: "800" },
});
