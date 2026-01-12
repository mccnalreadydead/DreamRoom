import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Row = Record<string, any>;

function safeParse<T>(v: string | null, fallback: T): T {
  try {
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: any) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

function normalizeHeader(h: any) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function excelDateToISO(n: number) {
  // Excel serial date -> ISO yyyy-mm-dd
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

function normalizeDate(v: any) {
  if (typeof v === "number" && v > 20000) return excelDateToISO(v);
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return s;
  }
  return "";
}

function sheetToObjects(ws: XLSX.WorkSheet) {
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (!rows.length) return [];

  const headers = (rows[0] ?? []).map(normalizeHeader);
  const out: Row[] = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.every((c) => c == null || String(c).trim() === "")) continue;
    const obj: Row = {};
    headers.forEach((h, idx) => (obj[h || `col_${idx}`] = r[idx]));
    out.push(obj);
  }
  return out;
}

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const existingCounts = useMemo(() => {
    const inv = safeParse<any[]>(localStorage.getItem("inventory"), []);
    const sales = safeParse<any[]>(localStorage.getItem("sales"), []);
    return { inv: inv.length, sales: sales.length };
  }, []);

  async function importExcel() {
    setMsg("");
    setErr("");
    if (!file) return setErr("Pick an Excel file first.");

    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });

      // Read all sheets
      const bySheet: Record<string, Row[]> = {};
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        bySheet[name.toLowerCase()] = sheetToObjects(ws);
      }

      // Try to locate inventory + sales sheets by name
      const invSheet =
        bySheet["inventory"] ||
        bySheet["inv"] ||
        bySheet["items"] ||
        bySheet["current_inventory"] ||
        [];

      const salesSheet =
        bySheet["sales"] ||
        bySheet["transaction_logs"] ||
        bySheet["transactions"] ||
        bySheet["sold"] ||
        [];

      // Normalize inventory rows into fields used by our app
      const inventory = invSheet.map((r) => {
        const name =
          r.name ?? r.item ?? r.product ?? r.title ?? r.sku ?? r.description ?? "";
        const qty = toNumber(r.qty ?? r.quantity ?? r.onhand ?? r.stock ?? 0);
        const unitCost = toNumber(r.unitcost ?? r.cost ?? r.wholesale ?? r.buyprice ?? 0);
        const resale = toNumber(r.resell ?? r.resale ?? r.sellprice ?? r.price ?? 0);

        return {
          name: String(name || "").trim(),
          qty,
          unitCost,
          resale,
          ...r,
        };
      }).filter((x) => x.name);

      // Normalize sales rows
      const sales = salesSheet.map((r) => {
        const date = normalizeDate(r.date ?? r.saledate ?? r.sold_on ?? r.time ?? "");
        const item = String(r.item ?? r.name ?? r.product ?? r.title ?? "").trim();
        const unitsSold = toNumber(r.unitssold ?? r.qty ?? r.quantity ?? 1);
        const priceEach = toNumber(r.priceeach ?? r.price ?? r.soldfor ?? r.saleprice ?? 0);
        const revenue = toNumber(r.revenue ?? r.total ?? unitsSold * priceEach);
        const profit = toNumber(r.profit ?? 0);
        const note = String(r.note ?? r.notes ?? r.comment ?? "").trim();

        return {
          date,
          item,
          unitsSold,
          priceEach,
          revenue,
          profit,
          note,
          source: "excel",
          ...r,
        };
      }).filter((x) => x.item || x.date);

      // Save into localStorage
      save("inventory", inventory);
      save("sales", sales);

      setMsg(
        `✅ Imported Excel.\nInventory rows: ${inventory.length}\nSales rows: ${sales.length}`
      );
    } catch (e: any) {
      setErr(e?.message || "Import failed.");
    }
  }

  return (
    <div className="page">
      <h1>Import / Export</h1>

      <div className="card" style={{ padding: 16 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Upload your Excel file. This will update Inventory + Sales in the app.
        </p>

        <div className="card" style={{ padding: 12, marginBottom: 12 }}>
          <div className="muted">Current saved data on this device:</div>
          <div style={{ fontWeight: 800, marginTop: 4 }}>
            Inventory: {existingCounts.inv} rows • Sales: {existingCounts.sales} rows
          </div>
        </div>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />

        <div style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={importExcel}>
            Import Excel
          </button>
        </div>

        {msg && (
          <pre className="card" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
            {msg}
          </pre>
        )}
        {err && (
          <div className="card" style={{ marginTop: 12, color: "salmon" }}>
            ❌ {err}
          </div>
        )}
      </div>
    </div>
  );
}
