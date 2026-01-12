import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type RawRow = Record<string, unknown>;

type InventoryRow = {
  id: string; // always store as string for safety
  item: string;
  qty: number;
  unitCost: number;
  resalePrice: number;
  profit: number;
};

function num(v: unknown): number {
  const n = Number((v ?? 0) as any);
  return Number.isFinite(n) ? n : 0;
}

function money(v: unknown): string {
  const n = num(v);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function normalizeRow(r: RawRow): InventoryRow {
  const item = String((r as any).item ?? "").trim();

  const idRaw =
    (r as any).id ??
    (r as any).uuid ??
    (r as any).ID ??
    (r as any).Id ??
    item;

  return {
    id: String(idRaw),
    item,
    qty: num((r as any).qty ?? (r as any).Qty ?? (r as any).QTY ?? (r as any).quantity ?? (r as any).Quantity),
    unitCost: num((r as any).unit_cost ?? (r as any).unitCost ?? (r as any).cost ?? (r as any).Cost),
    resalePrice: num((r as any).resale_price ?? (r as any).resalePrice ?? (r as any)["Used Sell Price"] ?? (r as any)["Used Sell"]),
    profit: num((r as any).profit ?? (r as any).Profit),
  };
}

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>("");

  async function loadInventory(): Promise<void> {
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

    const normalized: InventoryRow[] = (res.data ?? [])
      .map((r: any) => normalizeRow(r as RawRow))
      .filter((r: InventoryRow) => r.item);

    normalized.sort((a: InventoryRow, b: InventoryRow) => a.item.localeCompare(b.item));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void loadInventory();
  }, []);

  const lowStockIds = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of rows) if ((r.qty ?? 0) < 5) s.add(r.id);
    return s;
  }, [rows]);

  function onQtyChange(id: string, value: string): void {
    const next = num(value);
    setRows((prev: InventoryRow[]) => prev.map((r: InventoryRow) => (r.id === id ? { ...r, qty: next } : r)));
  }

  async function saveQty(id: string, nextQty: number): Promise<void> {
    setMsg("");
    setSavingId(id);

    // try update by id (most common)
    const res = await supabase.from("inventory").update({ qty: nextQty }).eq("id", id);

    setSavingId(null);

    if (res.error) {
      console.error(res.error);
      setMsg(`Could not save qty: ${res.error.message}`);
      return;
    }

    setRows((prev: InventoryRow[]) => prev.map((r: InventoryRow) => (r.id === id ? { ...r, qty: nextQty } : r)));
  }

  if (loading) return <div className="page muted">Loading inventory…</div>;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Inventory</h1>
        <button className="btn" onClick={() => void loadInventory()}>Refresh</button>
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
            {rows.map((r: InventoryRow) => {
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

                  <td>{money(r.unitCost)}</td>
                  <td>{money(r.resalePrice)}</td>
                  <td>{money(r.profit)}</td>

                  <td>
                    <button
                      className="btn primary"
                      onClick={() => void saveQty(r.id, Number(r.qty ?? 0))}
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
