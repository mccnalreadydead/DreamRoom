import { useState } from "react";
import * as XLSX from "xlsx";

type AnyRow = Record<string, any>;

function toNum(v: any) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Qty can be numbers OR strings like "1(2)" -> we take the first number
function toQty(v: any) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  const m = s.match(/-?\d+(\.\d+)?/); // first number found
  return m ? toNum(m[0]) : 0;
}

function toISODate(v: any) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    // Excel serial -> JS date
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).trim() : d.toISOString().slice(0, 10);
}

// Try exact key, then trimmed-key versions
function pick(row: AnyRow, ...keys: string[]) {
  for (const k of keys) if (row[k] !== undefined) return row[k];
  // trimmed match
  const map: Record<string, string> = {};
  for (const k of Object.keys(row)) map[String(k).trim()] = k;
  for (const want of keys) {
    const real = map[String(want).trim()];
    if (real && row[real] !== undefined) return row[real];
  }
  return undefined;
}

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  async function importAll() {
    setMsg("");
    if (!file) {
      setMsg("Pick an Excel file first.");
      return;
    }

    const buf = await file.arrayBuffer();

    // IMPORTANT: cellDates true so Date comes in as Date objects
    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    // ✅ Your exact sheet names:
    const invWS = wb.Sheets["Inventory "] || wb.Sheets["Inventory"];
    const txWS = wb.Sheets["Transaction Log"];

    if (!invWS) {
      setMsg(`Missing sheet "Inventory " (with a space). Found: ${wb.SheetNames.join(", ")}`);
      return;
    }
    if (!txWS) {
      setMsg(`Missing sheet "Transaction Log". Found: ${wb.SheetNames.join(", ")}`);
      return;
    }

    // =========================
    // INVENTORY (Inventory )
    // headers (from your file):
    // Item name | Qty | Cost | Used Sell Price | Profit
    // =========================
    const invRaw = XLSX.utils.sheet_to_json<AnyRow>(invWS, { defval: "" });

    const inventory = invRaw
      .map((r) => {
        const item = String(pick(r, "Item name", "Item Name", "Item") ?? "").trim();
        if (!item) return null;

        const qty = toQty(pick(r, "Qty", "QTY", "qty", "Quantity"));
        const unitCost = toNum(pick(r, "Cost", "Unit Cost", "unit cost"));
        const resalePrice = toNum(pick(r, "Used Sell Price", "Used Sell", "Resell Price", "Sell Price"));
        const profit = toNum(pick(r, "Profit", "profit"));

        return { item, qty, unitCost, resalePrice, profit };
      })
      .filter(Boolean);

    // =========================
    // SALES (Transaction Log)
    // headers (from your file):
    // Date | SM7b | SM7db | TLM103 | U87 | Total Profit  (note trailing space)
    // unitsSold = sum of product columns
    // profit = Total Profit  column
    // =========================
    const txRaw = XLSX.utils.sheet_to_json<AnyRow>(txWS, { defval: "" });

    const sales = txRaw
      .map((r) => {
        const date = toISODate(pick(r, "Date"));
        if (!date) return null;

        const sm7b = toNum(pick(r, "SM7b"));
        const sm7db = toNum(pick(r, "SM7db"));
        const tlm103 = toNum(pick(r, "TLM103"));
        const u87 = toNum(pick(r, "U87"));

        const unitsSold = sm7b + sm7db + tlm103 + u87;

        const profit = toNum(pick(r, "Total Profit ", "Total Profit"));

        if (unitsSold === 0 && profit === 0) return null;

        return { date, unitsSold, profit };
      })
      .filter(Boolean);

    localStorage.setItem("inventory", JSON.stringify(inventory));
    localStorage.setItem("sales", JSON.stringify(sales));
    window.dispatchEvent(new Event("ad-storage-updated"));

    setMsg(`Imported ${inventory.length} inventory rows and ${sales.length} sales rows.`);
  }

  return (
    <div className="page">
      <h1>Import / Export</h1>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={importAll}>
          IMPORT ALL
        </button>
      </div>

      {msg && (
        <pre className="card" style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
          {msg}
        </pre>
      )}
    </div>
  );
}
