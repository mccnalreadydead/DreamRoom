import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";

type AnyRow = Record<string, any>;

function toNum(v: any) {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function toQty(v: any) {
  if (typeof v === "number") return v;
  if (!v) return 0;
  const m = String(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function toISODate(v: any) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  async function importAll() {
    if (!file) return;

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });

    const invWS = wb.Sheets["Inventory "] || wb.Sheets["Inventory"];
    const txWS = wb.Sheets["Transaction Log"];

    if (!invWS || !txWS) {
      setMsg("Missing Inventory or Transaction Log sheet");
      return;
    }

    const invRaw = XLSX.utils.sheet_to_json<AnyRow>(invWS, { defval: "" });
    const inventory = invRaw
      .map(r => {
        const item = String(r["Item name"] ?? "").trim();
        if (!item) return null;
        return {
          item,
          qty: toQty(r["Qty"]),
          unit_cost: toNum(r["Cost"]),
          resale_price: toNum(r["Used Sell Price"]),
          profit: toNum(r["Profit"])
        };
      })
      .filter(Boolean);

    const txRaw = XLSX.utils.sheet_to_json<AnyRow>(txWS, { defval: "" });
    const sales = txRaw
      .map(r => {
        const date = toISODate(r["Date"]);
        if (!date) return null;
        const units =
          toNum(r["SM7b"]) +
          toNum(r["SM7db"]) +
          toNum(r["TLM103"]) +
          toNum(r["U87"]);

        const profit = toNum(r["Total Profit "]);
        if (!units && !profit) return null;

        return {
          date,
          item: "",
          units_sold: units,
          profit
        };
      })
      .filter(Boolean);

    await supabase.from("inventory").delete().neq("id", 0);
    await supabase.from("sales").delete().neq("id", 0);

    if (inventory.length) await supabase.from("inventory").insert(inventory);
    if (sales.length) await supabase.from("sales").insert(sales);

    setMsg(`Imported ${inventory.length} inventory rows and ${sales.length} sales rows.`);
  }

  return (
    <div className="page">
      <h1>Import / Export</h1>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={e => setFile(e.target.files?.[0] ?? null)}
      />

      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={importAll}>
          IMPORT ALL
        </button>
      </div>

      {msg && <div className="card" style={{ marginTop: 12 }}>{msg}</div>}
    </div>
  );
}
