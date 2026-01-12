import { useState } from "react";
import * as XLSX from "xlsx";

type Row = Record<string, any>;

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");

  function importAll() {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      /* ================= INVENTORY ================= */
      const invSheet = wb.Sheets["Inventory"];
      const rawInv: Row[] = invSheet
        ? XLSX.utils.sheet_to_json(invSheet, { defval: "" })
        : [];

      const inventory = rawInv.map((r) => ({
        item: r["Item"] ?? "",
        qty: Number(r["Qty"] ?? r["Quantity"] ?? 0),
        unitCost: Number(r["Unit Cost"] ?? r["Cost"] ?? 0),
        profit: Number(r["Profit"] ?? 0),
      }));

      /* ================= SALES ================= */
      const salesSheet = wb.Sheets["Sales"];
      const rawSales: Row[] = salesSheet
        ? XLSX.utils.sheet_to_json(salesSheet, { defval: "" })
        : [];

      const sales = rawSales.map((r) => ({
        date: r["Date"] ?? "",
        item: r["Item"] ?? "",
        unitsSold: Number(r["Units Sold"] ?? r["Qty"] ?? 0),
        priceEach: Number(r["Price Each"] ?? 0),
        revenue: Number(r["Revenue"] ?? 0),
        profit: Number(r["Profit"] ?? 0),
      }));

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
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
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
