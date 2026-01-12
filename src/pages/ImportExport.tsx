import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

type AnyRow = Record<string, any>;

function normalizeKey(k: string) {
  return String(k || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function toNum(v: any) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toInt(v: any, fallback = 0) {
  const n = toNum(v);
  if (n == null) return fallback;
  return Math.trunc(n);
}

// YOUR Excel Inventory sheet headers:
// Item name | Qty | Cost | Used Sell Price
function mapInventoryRow(excelRow: AnyRow) {
  const r: AnyRow = {};
  for (const [k, v] of Object.entries(excelRow)) r[normalizeKey(k)] = v;

  const item = String(r.item_name ?? r.item ?? "").trim();

  return {
    item,
    qty: toInt(r.qty, 0),
    unit_cost: toNum(r.cost),
    resale_price: toNum(r.used_sell_price),
  };
}

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [rawRows, setRawRows] = useState<AnyRow[]>([]);
  const [mappedRows, setMappedRows] = useState<any[]>([]);
  const [dbCount, setDbCount] = useState<number | null>(null);

  // Show which Supabase URL the app is using (helps catch “wrong project” instantly)
  const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL ?? "(missing VITE_SUPABASE_URL)";

  async function onPickFile(f: File | null) {
    setError("");
    setStatus("");
    setFile(f);
    setRawRows([]);
    setMappedRows([]);
    setDbCount(null);

    if (!f) return;

    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // IMPORTANT: your workbook sheet is named exactly "Inventory " (with a trailing space)
      const inventorySheetName =
        wb.SheetNames.find((n) => n === "Inventory ") ||
        wb.SheetNames.find((n) => normalizeKey(n) === "inventory");

      if (!inventorySheetName) {
        throw new Error(`Could not find Inventory sheet. Found sheets: ${wb.SheetNames.join(", ")}`);
      }

      const ws = wb.Sheets[inventorySheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as AnyRow[];

      // Map rows to your Supabase schema
      const mapped = rows.map(mapInventoryRow);

      // Clean out empty item names (your sheet includes some blank rows)
      const cleaned = mapped.filter((r) => r.item && String(r.item).trim().length > 0);

      setRawRows(rows);
      setMappedRows(cleaned);

      setStatus(
        `Loaded "${f.name}". Sheet="${inventorySheetName}". Raw rows=${rows.length}. Mapped rows=${cleaned.length}.`
      );
    } catch (e: any) {
      setError(e?.message || "Failed to read file");
    }
  }

  async function refreshDbCount() {
    setError("");
    setStatus("Checking database row count...");
    const { count, error } = await supabase
      .from("inventory")
      .select("*", { count: "exact", head: true });

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setDbCount(count ?? 0);
    setStatus(`Database inventory row count = ${count ?? 0}`);
  }

  async function uploadToSupabase() {
    setError("");
    setStatus("");

    if (!mappedRows.length) {
      setError(
        "Mapped rows = 0. That means the app did not find item names. Check the preview below to see what it mapped."
      );
      return;
    }

    try {
      setStatus(`Uploading ${mappedRows.length} row(s) to Supabase table "inventory"...`);

      const { data, error } = await supabase
        .from("inventory")
        .insert(mappedRows, { defaultToNull: true })
        .select();

      if (error) throw error;

      setStatus(`✅ Insert success. Inserted ${data?.length ?? 0} row(s). Now checking DB count...`);

      // Immediately re-check count so you see proof on screen
      const { count, error: countErr } = await supabase
        .from("inventory")
        .select("*", { count: "exact", head: true });

      if (countErr) throw countErr;

      setDbCount(count ?? 0);
      setStatus(`✅ Done. Database inventory row count = ${count ?? 0}`);
    } catch (e: any) {
      setError(e?.message || "Upload failed");
      setStatus("");
    }
  }

  const firstMapped = useMemo(() => (mappedRows.length ? mappedRows[0] : null), [mappedRows]);

  return (
    <div style={{ padding: 16, maxWidth: 980 }}>
      <h2>Import / Export (Inventory Debug)</h2>

      <p style={{ opacity: 0.8 }}>
        Supabase URL in use: <code>{supabaseUrl}</code>
      </p>

      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => onPickFile(e.target.files?.[0] ?? null)} />
        <button onClick={uploadToSupabase} disabled={!mappedRows.length}>
          Upload Inventory to Supabase
        </button>
        <button onClick={refreshDbCount}>Check DB Count</button>
      </div>

      {status && <p style={{ marginTop: 12 }}>{status}</p>}
      {error && <p style={{ marginTop: 12, color: "salmon" }}>{error}</p>}

      <hr style={{ margin: "16px 0" }} />

      <h3>Counts</h3>
      <ul>
        <li>File: {file ? file.name : "(none)"}</li>
        <li>Raw rows read from Excel: {rawRows.length}</li>
        <li>Mapped rows (will be inserted): {mappedRows.length}</li>
        <li>DB inventory count (last checked): {dbCount == null ? "(not checked)" : dbCount}</li>
      </ul>

      <hr style={{ margin: "16px 0" }} />

      <h3>First mapped row (this MUST have item/qty/cost/prices)</h3>
      <pre
        style={{
          background: "rgba(255,255,255,0.06)",
          padding: 12,
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(firstMapped, null, 2)}
      </pre>

      <h3>Preview (first 20 mapped rows)</h3>
      <pre
        style={{
          background: "rgba(255,255,255,0.06)",
          padding: 12,
          borderRadius: 8,
          overflowX: "auto",
        }}
      >
        {JSON.stringify(mappedRows.slice(0, 20), null, 2)}
      </pre>
    </div>
  );
}
