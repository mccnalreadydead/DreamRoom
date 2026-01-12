import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InventoryRow = {
  id: number;
  item: string;
  qty: number;
  unit_cost: number;
  resale_price: number | null;
  profit: number;
  note?: string | null;
};

function money(n: any) {
  const v = typeof n === "number" ? n : Number(n ?? 0);
  return `$${(Number.isFinite(v) ? v : 0).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })}`;
}

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState("");

  async function loadInventory() {
    setLoading(true);
    const { data, error } = await supabase
      .from("inventory")
      .select("*")
      .order("item", { ascending: true });

    if (error) {
      console.error(error);
      setMsg("Error loading inventory.");
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((data as InventoryRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadInventory();
  }, []);

  const lowStockIds = useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) if ((r.qty ?? 0) < 5) set.add(r.id);
    return set;
  }, [rows]);

  async function saveQty(id: number, nextQty: number) {
    setMsg("");
    setSavingId(id);

    const { error } = await supabase.from("inventory").update({ qty: nextQty }).eq("id", id);

    setSavingId(null);

    if (error) {
      console.error(error);
      setMsg("Could not save qty. Try again.");
      return;
    }

    // Update local UI instantly (no full reload needed)
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, qty: nextQty } : r)));
  }

  function onQtyChange(id: number, value: string) {
    // Update UI as they type (local only), then they hit Save
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, qty: safe } : r)));
  }

  if (loading) {
    return <div className="page muted">Loading inventory…</div>;
  }

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <button className="btn" onClick={loadInventory}>Refresh</button>
      </div>

      {msg && (
        <div className="card" style={{ marginTop: 12 }}>
          {msg}
        </div>
      )}

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
                <tr key={r.id} style={low ? { outline: "2px solid rgba(255,0,0,0.35)" } : undefined}>
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

                  <td>{money(r.unit_cost)}</td>
                  <td>{money(r.resale_price ?? 0)}</td>
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
            No inventory rows found. Import your Excel file on the Import/Export page.
          </div>
        )}
      </div>

      <div className="muted" style={{ marginTop: 12 }}>
        Tip: Qty turns “Low stock” when it’s under 5.
      </div>
    </div>
  );
}
