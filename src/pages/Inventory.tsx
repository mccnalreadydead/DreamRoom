import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type RawRow = Record<string, any>;

type InventoryRow = {
  id: any;
  item: string;
  qty: number;
  unitCost: number;
  resalePrice: number;
  profit: number;
};

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function money(v: any) {
  const n = num(v);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeRow(r: RawRow): InventoryRow {
  const item =
    String(r.item ?? r["Item name"] ?? r["Item Name"] ?? r["Item"] ?? "").trim();

  return {
    id: r.id ?? r.uuid ?? r.ID ?? r.Id ?? item, // fallback key
    item,
    qty: num(r.qty ?? r.Qty ?? r.QTY ?? r.quantity ?? r.Quantity),
    unitCost: num(r.unit_cost ?? r.unitCost ?? r.cost ?? r.Cost),
    resalePrice: num(r.resale_price ?? r.resalePrice ?? r["Used Sell Price"] ?? r["Used Sell"]),
    profit: num(r.profit ?? r.Profit),
  };
}

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<any>(null);
  const [msg, setMsg] = useState("");

  async function loadInventory() {
    setMsg("");
    setLoading(true);

    const res = await supabase.from("inventory").select("*");

    if (res.error) {
      console.error(res.error);
      setMsg(`Error loading inventory: ${res.error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    const normalized = (res.data ?? [])
      .map(normalizeRow)
      .filter((r) => r.item);

    normalized.sort((a, b) => a.item.localeCompare(b.item));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const lowStockIds = useMemo(() => {
    const s = new Set<any>();
    for (const r of rows) if ((r.qty ?? 0) < 5) s.add(r.id);
    return s;
  }, [rows]);

  function onQtyChange(id: any, value: string) {
    const next = num(value);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, qty: next } : r)));
  }

  async function saveQty(id: any, nextQty: number) {
    setMsg("");
    setSavingId(id);

    // Update qty (assumes your table uses "qty" – which it should)
    const res = await supabase.from("inventory").update({ qty: nextQty }).eq("id", id);

    setSavingId(null);

    if (res.error) {
      console.error(res.error);
      setMsg(`Could not save qty: ${res.error.message}`);
      return;
    }

    // keep UI in sync
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, qty: nextQty } : r)));
  }

  if (loading) return <div className="page muted">Loading inventory…</div>;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <button className="btn" onClick={loadInventory}>Refresh</button>
      </div>

      {msg && <div className="card" style={{ marginTop: 12 }}>{msg}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: "42%" }}>Item</th>
              <th style={{ width: 140 }}>Qty</th>
              <th style={{ width: 140 }}>Unit Cost</th>
              <th style={{ width: 140 }}>Resell</th>
              <th style={{ width: 140 }}>Profit</th>
              <th style={{ width: 120 }}>Save</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((r) => {
              const low = lowStockIds.has(r.id);
              return (
                <tr key={String(r.id)} style={low ? { outline: "2px solid rgba(255,0,0,0.35)" } : undefined}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{r.item}</div>
                    {low && <div className="muted" style={{ marginTop: 2 }}>Low stock</div>}
                  </td>

                  <td>
                    <input
                      type="number"
                      value={r.qty ?? 0}
                      onChange={(e) => onQtyChange(r.id, e.target.value)}
                      className="input"
                      style={{ width: "100%" }}
                    />
                  </td>

                  <td>{money(r.unitCost)}</td>
                  <td>{money(r.resalePrice)}</td>
                  <td>{money(r.profit)}</td>

                  <td>
                    <button
                      className="btn primary"
                      onClick={() => saveQty(r.id, Number(r.qty ?? 0))}
                      disabled={savingId === r.id}
                      style={{ width: "100%" }}
                    >
                      {savingId === r.id ? "Saving…" : "Save"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="muted" style={{ marginTop: 12 }}>
            No inventory rows found. Import your Excel again.
          </div>
        )}
      </div>
    </div>
  );
}
