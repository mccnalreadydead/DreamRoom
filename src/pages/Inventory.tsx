import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

function load(key: string): Row[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, rows: Row[]) {
  localStorage.setItem(key, JSON.stringify(rows));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function getQty(row: Row) {
  const v =
    row.qty ?? row.Qty ?? row.quantity ?? row.Quantity ?? row.stock ?? row.Stock ?? row.inStock ?? row.InStock;
  return toNumber(v);
}

function setQty(row: Row, newQty: number) {
  // Try to preserve whatever column exists; otherwise create "Quantity"
  if ("qty" in row) row.qty = newQty;
  else if ("Qty" in row) row.Qty = newQty;
  else if ("quantity" in row) row.quantity = newQty;
  else if ("Quantity" in row) row.Quantity = newQty;
  else if ("stock" in row) row.stock = newQty;
  else if ("Stock" in row) row.Stock = newQty;
  else if ("inStock" in row) row.inStock = newQty;
  else if ("InStock" in row) row.InStock = newQty;
  else row.Quantity = newQty;
}

export default function Inventory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [query, setQuery] = useState("");

  function reload() {
    setRows(load("inventory"));
  }

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => JSON.stringify(r).toLowerCase().includes(q));
  }, [rows, query]);

  const cols = useMemo(() => {
    const first = filtered[0];
    if (!first) return [];
    // Always include Quantity column if present
    const keys = Object.keys(first);
    return keys.slice(0, 20);
  }, [filtered]);

  function updateQtyAt(index: number, newQty: number) {
    const next = [...rows];
    const row = { ...next[index] };
    setQty(row, Math.max(0, newQty));
    next[index] = row;
    setRows(next);
    save("inventory", next);
  }

  return (
    <div className="page">
      <div className="row">
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            className="input"
            placeholder="Search inventory…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 260 }}
          />
          <button className="btn" onClick={reload}>Reload</button>
        </div>
      </div>

      <p className="muted">
        Key: <span className="pill">inventory</span> — Rows: <span className="pill">{rows.length}</span>
      </p>

      <div className="card">
        {rows.length === 0 ? (
          <p className="muted">Inventory is empty. Go to Import/Export and click IMPORT ALL.</p>
        ) : (
          <div className="tableWrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Qty</th>
                  <th>Adjust</th>
                  {cols.map((k) => <th key={k}>{k}</th>)}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  // We need the correct index in the original rows array to save changes
                  const originalIndex = rows.indexOf(r);
                  const qty = getQty(r);
                  const low = qty < 5;

                  return (
                    <tr key={i} className={low ? "lowRow" : ""}>
                      <td className={low ? "lowQty" : ""}>{qty}</td>
                      <td>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button className="btn" onClick={() => updateQtyAt(originalIndex, qty - 1)}>-</button>
                          <input
                            className="input"
                            style={{ width: 90 }}
                            value={String(qty)}
                            onChange={(e) => updateQtyAt(originalIndex, toNumber(e.target.value))}
                          />
                          <button className="btn" onClick={() => updateQtyAt(originalIndex, qty + 1)}>+</button>
                        </div>
                      </td>
                      {cols.map((k) => <td key={k}>{String(r[k] ?? "")}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="muted" style={{ marginTop: 10 }}>
        Low stock rule: qty &lt; 5 turns red.
      </p>
    </div>
  );
}

