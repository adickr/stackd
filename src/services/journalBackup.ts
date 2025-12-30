// src/services/journalBackup.ts
import * as FileSystem from "expo-file-system"; // SDK 54 new API
import * as LegacyFS from "expo-file-system/legacy"; // ✅ SAF + legacy write for content://
import * as DocumentPicker from "expo-document-picker";
import { useJournalStore } from "../stores/journalStore";

type ImportMode = "replace" | "merge";

type ExportResult =
  | { ok: true; fileUri: string }
  | { ok: false; reason: "cancelled"; message?: string }
  | { ok: false; reason: "unavailable"; message?: string }
  | { ok: false; reason: "error"; message?: string };

type ImportResult =
  | { ok: true; report: any }
  | { ok: false; reason: "cancelled"; message?: string }
  | { ok: false; reason: "error"; message?: string };

function makeFileName() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `stackd-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
}

/**
 * Android export via SAF (SDK 54: SAF is in expo-file-system/legacy)
 */
export async function exportJournalBackup(): Promise<ExportResult> {
  try {
    const blob = useJournalStore.getState().exportBlob();
    const json = JSON.stringify(blob, null, 2);
    const filename = makeFileName();

    const SAF = (LegacyFS as any).StorageAccessFramework as
      | {
          requestDirectoryPermissionsAsync: () => Promise<{
            granted: boolean;
            directoryUri: string;
          }>;
          createFileAsync: (
            directoryUri: string,
            fileName: string,
            mimeType: string
          ) => Promise<string>;
        }
      | undefined;

    if (!SAF) {
      return {
        ok: false,
        reason: "unavailable",
        message:
          "Storage Access Framework (SAF) is not available. Ensure you import it from 'expo-file-system/legacy' (SDK 54).",
      };
    }

    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: "cancelled" };

    const fileUri = await SAF.createFileAsync(
      perm.directoryUri,
      filename,
      "application/json"
    );

    // Write to content:// SAF URI using legacy API
    await (LegacyFS as any).writeAsStringAsync(fileUri, json);

    return { ok: true, fileUri };
  } catch (e: any) {
    return { ok: false, reason: "error", message: e?.message ?? String(e) };
  }
}

export async function importJournalBackup(
  mode: ImportMode = "replace"
): Promise<ImportResult> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/json", "text/json", "text/plain"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (res.canceled) return { ok: false, reason: "cancelled" };

    const asset = res.assets?.[0];
    if (!asset?.uri) {
      return { ok: false, reason: "error", message: "No file selected." };
    }

    // ✅ SDK 54 preferred: File API (no deprecation)
    const file = new (FileSystem as any).File(asset.uri);
    const text: string = await file.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return {
        ok: false,
        reason: "error",
        message: "Selected file is not valid JSON.",
      };
    }

    const report = useJournalStore.getState().importBlob(parsed, mode);
    return { ok: true, report };
  } catch (e: any) {
    return { ok: false, reason: "error", message: e?.message ?? String(e) };
  }
}
