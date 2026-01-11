import { useMemo, useState } from "react";
import * as XLSX from "xlsx";

/* ------------------ helpers ------------------ */

function dispatchUpdate() {
  window.dispatchEvent(new Event("ad-storage-updated"));
}

function saveRows(key: string, rows: any[]) {
  localStorage.setItem(key, JSON.stringify(rows));
}

function loadRows(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Excel serial date (45989) OR "45989" -> YYYY-MM-DD
function excelDateToISO(v: any) {
  if (typeof v === "number" && v > 20000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n) && n > 20000) return excelDateToISO(n);
    }
    return s;
  }

  return String(v ?? "").trim();
}

// Trim column names (your Excel has trailing spaces)
function cleanKeys(row: any) {
  const out: any = {};
  Object.keys(row || {}).forEach((k) => {
    out[String(k).trim()] = row[k];
  });
  return out;
}

function sheetToRows(wb: XLSX.WorkBook, sheetName: string) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }) as any[];
  return rows.map(cleanKeys);
}

function findSheet(wb: XLSX.WorkBook, includes: string[]) {
  const names = wb.SheetNames || [];
  const lower = names.map((n) => ({ raw: n, l: n.toLowerCase().trim() }));
  for (const inc of includes) {
    const hit = lower.find((x) => x.l.includes(inc));
    if (hit) return hit.raw;
  }
  return "";
}

/* ------------------ NORMALIZERS (your exact Excel) ------------------ */

function normalizeInventory(rows: any[]) {
  // Your columns: Item name, QTY, Cost, Profit, etc.
  return rows
    .filter((r) => String(r["Item name"] ?? "").trim() !== "")
    .map((r) => ({
      item: String(r["Item name"] ?? "").trim(),
      qty: toNumber(r["QTY"]),
      unitCost: toNumber(r["Cost"]),
      profit: toNumber(r["Profit"]),
    }));
}

function normalizeSales(rows: any[]) {
  // Your sheet: Transaction Log
  // Columns: Date, SM7b, SM7db, TLM103, U87, Total Profit, units sold
  return rows
    .filter((r) => r["Date"] != null && r["Date"] !== "")
    .map((r) => {
      const productCols = ["SM7b", "SM7db", "TLM103", "U87"];
      const sumUnits = productCols.reduce((s, k) => s + toNumber(r[k]), 0);
      const unitsSold = toNumber(r["units sold"]) || sumUnits;

      return {
        date: excelDateToISO(r["Date"]),
        unitsSold,
        profit: toNumber(r["Total Profit"]),
        source: "import",
      };
    });
}

/* ------------------ COMPONENT ------------------ */

export default function ImportExport() {
  const [file, setFile] = useState<File | null>(null);
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const counts = useMemo(() => {
    return {
      inventory: loadRows("inventory").length,
      sales: loadRows("sales").length,
      tracking: loadRows("tracking").length,
    };
  }, [msg, err]);

  async function chooseFile(f: File) {
    setErr("");
    setMsg("");
    setFile(f);

    try {
      const buf = await f.arrayBuffer();
      const book = XLSX.read(buf, { type: "array" });
      setWb(book);
      setMsg(`Loaded workbook. Sheets: ${book.SheetNames.join(", ")}`);
    } catch (e: any) {
      setWb(null);
      setErr(e?.message || String(e));
    }
  }

  function importAll() {
    setErr("");
    setMsg("");
    if (!wb) return setMsg("Choose a file first.");

    const invSheet = findSheet(wb, ["inventory"]);
    const salesSheet = findSheet(wb, ["transaction"]);

    const invRaw = invSheet ? sheetToRows(wb, invSheet) : [];
    const salesRaw = salesSheet ? sheetToRows(wb, salesSheet) : [];

    const inventory = normalizeInventory(invRaw);
    const sales = normalizeSales(salesRaw);

    saveRows("inventory", inventory);
    saveRows("sales", sales);

    dispatchUpdate();

    setMsg(
      `✅ IMPORT COMPLETE
Inventory: ${inventory.length} rows (sheet "${invSheet || "NOT FOUND"}")
Sales: ${sales.length} rows (sheet "${salesSheet || "NOT FOUND"}")`
    );
  }

  function clearAll() {
    localStorage.removeItem("inventory");
    localStorage.removeItem("sales");
    localStorage.removeItem("tracking");
    dispatchUpdate();
    setMsg("Cleared inventory/sales/tracking from local storage.");
    setErr("");
  }

  return (
    <div className="page">
      <h1>Import / Export</h1>

      <div className="card">
        {/* ✅ ALWAYS VISIBLE FILE PICKER */}
        <label className="label">Upload Excel file</label>

        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) chooseFile(f);
          }}
          style={{
            display: "block",
            width: "100%",
            padding: "10px",
            borderRadius: "10px",
            border: "1px solid rgba(255,255,255,0.15)",
            background: "rgba(255,255,255,0.06)",
            color: "white",
          }}
        />

        <div className="muted" style={{ marginTop: 10 }}>
          Selected: <span className="pill">{file ? file.name : "none"}</span>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn primary" onClick={importAll} disabled={!wb}>
            IMPORT ALL
          </button>
          <button className="btn" onClick={clearAll}>
            Clear Saved Data
          </button>
        </div>

        {(msg || err) && (
          <div className="card" style={{ marginTop: 14 }}>
            {msg && <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{msg}</p>}
            {err && <p style={{ margin: 0, color: "salmon" }}>❌ {err}</p>}
          </div>
        )}

        <p className="muted" style={{ marginTop: 12 }}>
          Saved rows →
          <span className="pill" style={{ marginLeft: 8 }}>inventory: {counts.inventory}</span>
          <span className="pill" style={{ marginLeft: 8 }}>sales: {counts.sales}</span>
          <span className="pill" style={{ marginLeft: 8 }}>tracking: {counts.tracking}</span>
        </p>
      </div>
    </div>
  );
}
