import { useState } from "react";
import * as XLSX from "xlsx";

type Row = Record<string, any>;

function normalizeKey(k: string) {
  return k
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeRow(row: Row) {
  const out: Row = {};
  for (const k of Object.keys(row)) {
    out[normalizeKey(k)] = row[k];
  }
  return out;
}

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  function importAll() {
    if (!file) {
      setMsg("No file selected.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      // ---- INVENTORY SHEET ----
      const invSheet =
        wb.Sheets["Inventory"] ||
        wb.Sheets["inventory"] ||
        wb.Sheets[wb.SheetNames[0]];

      const rawInv = XLSX.utils.sheet_to_json<Row>(invSheet);
      const inventory = rawInv.map((r) => {
        const n = normalizeRow(r);
        return {
          item: n.item || n.product || n.name || "",
          qty: Number(n.qty ?? n.quantity ?? 0),
          unitCost: Number(n.unitcost ?? n.cost ?? 0),
          profit: Number(n.profit ?? 0),
        };
      });

      // ---- SALES SHEET ----
      const salesSheet =
        wb.Sheets["Sales"] ||
        wb.Sheets["sales"] ||
        wb.Sheets[wb.SheetNames[1]];

      const rawSales = XLSX.utils.sheet_to_json<Row>(salesSheet || {});
      const sales = rawSales.map((r) => {
        const n = normalizeRow(r);
        return {
          date: n.date || "",
          unitsSold: Number(n.unitssold ?? n.qty ?? 0),
          profit: Number(n.profit ?? 0),
        };
      });

      localStorage.setItem("inventory", JSON.stringify(inventory));
      localStorage.setItem("sales", JSON.stringify(sales));
      window.dispatchEvent(new Event("ad-storage-updated"));

      setMsg(
        `Imported ${inventory.length} inventory rows and ${sales.length} sales rows`
      );
    };

    reader.readAsArrayBuffer(file);
  }

  return (
    <div className="page">
      <h1>Import / Export</h1>

      <input
        type="file"
        accept=".xlsx,.xls"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      <div style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={importAll}>
          IMPORT ALL
        </button>
      </div>

      {msg && (
        <pre className="card" style={{ marginTop: 12 }}>
          {msg}
        </pre>
      )}
    </div>
  );
}
