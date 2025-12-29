import { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useCoinStore } from "../../src/stores/coinStore";

/* ---------------- helpers ---------------- */

function norm(s: string) {
  return s.trim().toLowerCase();
}

function parseNumber(input: string) {
  const normalized = input.trim().replace(",", ".");
  const v = Number(normalized);
  return Number.isFinite(v) ? v : NaN;
}

/* ---------------- screen ---------------- */

export default function CoinPicker() {
  const router = useRouter();

  // store hooks (INSIDE component)
  const seedIfEmpty = useCoinStore((s) => s.seedIfEmpty);
  const coins = useCoinStore((s) => s.coins);
  const hasHydrated = useCoinStore((s) => s.hasHydrated);
  const forceResetToSeeds = useCoinStore((s) => s.forceResetToSeeds);
  const createCoin = useCoinStore((s) => s.createCoin);

  const [q, setQ] = useState("");

  // create modal state
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [purity, setPurity] = useState("0.999");
  const [fineG, setFineG] = useState("31.1035");
  const [diameter, setDiameter] = useState("");
  const [thickness, setThickness] = useState("");
  const [hallmarks, setHallmarks] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    seedIfEmpty();
  }, [seedIfEmpty]);

  /* ---------------- derived ---------------- */

  const results = useMemo(() => {
    const query = norm(q);
    if (!query) return coins;

    return coins.filter((c) => {
      const hay = norm(
        `${c.name} ${c.metal ?? ""} ${c.purity} ${c.fineWeightGrams} ${
          (c.hallmarks ?? []).join(" ")
        } ${c.notes ?? ""}`
      );
      return hay.includes(query);
    });
  }, [q, coins]);

  const hasExactNameMatch = useMemo(() => {
    const query = norm(q);
    if (!query) return false;
    return coins.some((c) => norm(c.name) === query);
  }, [q, coins]);

  const showCreate = q.trim().length > 0 && !hasExactNameMatch;

  /* ---------------- actions ---------------- */

  const selectCoin = (coinTypeId: string) => {
    router.replace(`/stack/add?coinTypeId=${encodeURIComponent(coinTypeId)}`);
  };

  const openCreate = () => {
    setError(null);
    setName(q.trim());
    setPurity("0.999");
    setFineG("31.1035");
    setDiameter("");
    setThickness("");
    setHallmarks("");
    setNotes("");
    setOpen(true);
  };

  const closeCreate = () => setOpen(false);

  const saveCreate = () => {
    try {
      setError(null);

      const purityNum = parseNumber(purity);
      const fineNum = parseNumber(fineG);
      const diaNum = diameter.trim() ? parseNumber(diameter) : NaN;
      const thickNum = thickness.trim() ? parseNumber(thickness) : NaN;

      const hallmarksArr = hallmarks
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);

      const coin = createCoin({
        name: name.trim(),
        metal: "silver",
        purity: purityNum,
        fineWeightGrams: fineNum,
        diameterMm: Number.isFinite(diaNum) ? diaNum : undefined,
        thicknessMm: Number.isFinite(thickNum) ? thickNum : undefined,
        hallmarks: hallmarksArr.length ? hallmarksArr : undefined,
        notes: notes.trim() || undefined,
      });

      closeCreate();
      selectCoin(coin.id);
    } catch (e: any) {
      setError(e?.message ?? "Could not create coin.");
    }
  };

  /* ---------------- render ---------------- */

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Pick a coin</Text>
          <Text style={styles.subtitle}>
            {hasHydrated
              ? `${coins.length} coins in library`
              : "Loading coin library…"}
          </Text>
        </View>

        {/* Search */}
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search (e.g. eagle, maple, bar, 1 kg)"
          placeholderTextColor="#777"
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />

        {/* Empty / restore state */}
        {!hasHydrated ? (
          <Text style={styles.muted}>Loading…</Text>
        ) : coins.length === 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.errorText}>Coin library is empty</Text>
            <Text style={styles.muted}>
              Restore default coins to continue.
            </Text>
            <Pressable
              onPress={forceResetToSeeds}
              style={({ pressed }) => [
                styles.primaryBtn,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Text style={styles.primaryText}>Restore default coins</Text>
            </Pressable>
          </View>
        ) : null}

        {/* Create CTA */}
        {showCreate && hasHydrated ? (
          <Pressable
            onPress={openCreate}
            style={({ pressed }) => [
              styles.createCard,
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.createTitle}>
              + Create custom coin “{q.trim()}”
            </Text>
            <Text style={styles.createSub}>Add it to your library</Text>
          </Pressable>
        ) : null}

        {/* Results */}
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          {hasHydrated && coins.length > 0 ? (
            results.length === 0 ? (
              <Text style={styles.muted}>No results.</Text>
            ) : (
              results.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => selectCoin(c.id)}
                  style={styles.coinCard}
                >
                  <Text style={styles.coinTitle}>{c.name}</Text>
                  <Text style={styles.coinSub}>
                    {c.metal} • purity {c.purity} • {c.fineWeightGrams} g fine
                  </Text>
                </Pressable>
              ))
            )
          ) : (
            <View />
          )}
        </ScrollView>

        {/* Back */}
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>

        {/* Create modal */}
        <Modal
          visible={open}
          animationType="slide"
          transparent
          onRequestClose={closeCreate}
        >
          <View style={styles.backdrop}>
            <View style={styles.sheet}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Create custom coin</Text>
                <Pressable onPress={closeCreate} hitSlop={10}>
                  <Text style={styles.closeText}>Close</Text>
                </Pressable>
              </View>

              <Text style={styles.label}>Name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                style={styles.input}
                placeholder="Name"
              />

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Purity (0–1)</Text>
                  <TextInput
                    value={purity}
                    onChangeText={setPurity}
                    style={styles.input}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                    placeholder="0.999"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Fine grams</Text>
                  <TextInput
                    value={fineG}
                    onChangeText={setFineG}
                    style={styles.input}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                    placeholder="31.1035"
                  />
                </View>
              </View>

              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Diameter (mm)</Text>
                  <TextInput
                    value={diameter}
                    onChangeText={setDiameter}
                    style={styles.input}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                    placeholder="optional"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Thickness (mm)</Text>
                  <TextInput
                    value={thickness}
                    onChangeText={setThickness}
                    style={styles.input}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                    placeholder="optional"
                  />
                </View>
              </View>

              <Text style={styles.label}>Hallmarks (comma separated)</Text>
              <TextInput
                value={hallmarks}
                onChangeText={setHallmarks}
                style={styles.input}
                placeholder="e.g. 999, JM, Sunshine"
              />

              <Text style={styles.label}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={setNotes}
                style={[styles.input, styles.textarea]}
                placeholder="optional"
                multiline
              />

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Pressable
                onPress={saveCreate}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && { opacity: 0.9 },
                ]}
              >
                <Text style={styles.primaryText}>Save coin</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

/* ---------------- styles ---------------- */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  container: { flex: 1, padding: 24, gap: 14 },

  header: { gap: 4 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { color: "#666", fontWeight: "700", fontSize: 12 },

  search: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 12,
    borderRadius: 12,
  },

  muted: { color: "#666", fontWeight: "700" },
  errorText: { color: "#b00020", fontWeight: "900" },

  createCard: {
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.12)",
    backgroundColor: "rgba(0,0,0,0.03)",
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  createTitle: { fontWeight: "900" },
  createSub: { color: "#666", fontSize: 12, fontWeight: "700" },

  coinCard: {
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  coinTitle: { fontWeight: "900" },
  coinSub: { color: "#555" },

  backBtn: {
    borderWidth: 1,
    borderColor: "#eee",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  backText: { color: "#111", fontWeight: "800" },

  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    gap: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sheetTitle: { fontSize: 18, fontWeight: "900" },
  closeText: { fontWeight: "800", opacity: 0.7 },

  label: { fontSize: 12, fontWeight: "800", opacity: 0.7, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
  },
  textarea: { minHeight: 70, textAlignVertical: "top" },

  twoCol: { flexDirection: "row", gap: 10 },

  primaryBtn: {
    backgroundColor: "#111",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  primaryText: { color: "#fff", fontWeight: "900" },
});
