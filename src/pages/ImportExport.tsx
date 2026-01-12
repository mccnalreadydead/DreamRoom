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

function toISODate(v: any) {
  if (!v) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
  }
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v).trim() : d.toISOString().slice(0, 10);
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

    // ✅ EXACT SHEET NAMES FROM YOUR FILE
    const invWS = wb.Sheets["Inventory "] || wb.Sheets["Inventory"];
    const txWS = wb.Sheets["Transaction Log"];

    if (!invWS) {
      setMsg(`Missing sheet: "Inventory " (with a space). Found: ${wb.SheetNames.join(", ")}`);
      return;
    }
    if (!txWS) {
      setMsg(`Missing sheet: "Transaction Log". Found: ${wb.SheetNames.join(", ")}`);
      return;
    }

    // =========================
    // INVENTORY (Inventory )
    // headers: Item name, QTY, Cost, Used Sell, Profit
    // =========================
    const invRaw = XLSX.utils.sheet_to_json<AnyRow>(invWS, { defval: "" });

    const inventory = invRaw
      .map((r) => {
        const item = String(r["Item name"] ?? "").trim();
        if (!item) return null;

        return {
          item,
          qty: toNum(r["QTY"]),
          unitCost: toNum(r["Cost"]),
          resalePrice: toNum(r["Used Sell"]),
          profit: toNum(r["Profit"]),
        };
      })
      .filter(Boolean);

    // =========================
    // SALES (Transaction Log)
    // headers: Date, SM7b, SM7db, TLM103, U87, Total Profit  (note trailing space)
    // unitsSold = sum of product columns
    // profit = Total Profit  column
    // =========================
    const txRaw = XLSX.utils.sheet_to_json<AnyRow>(txWS, { defval: "" });

    const sales = txRaw
      .map((r) => {
        const date = toISODate(r["Date"]);
        if (!date) return null;

        const sm7b = toNum(r["SM7b"]);
        const sm7db = toNum(r["SM7db"]);
        const tlm103 = toNum(r["TLM103"]);
        const u87 = toNum(r["U87"]);

        const unitsSold = sm7b + sm7db + tlm103 + u87;

        // ✅ EXACT HEADER: "Total Profit " (with trailing space)
        const profit = toNum(r["Total Profit "]);

        if (unitsSold === 0 && profit === 0) return null;

        return { date, unitsSold, profit };
      })
      .filter(Boolean);

    // SAVE (keys your dashboard reads)
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
