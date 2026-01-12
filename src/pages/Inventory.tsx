<h1 style={{ padding: 20 }}>✅ INVENTORY UPDATED RIGHT NOW</h1>
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InvRow = {
  id: number;
  item: string;
  qty: number | null;
  unit_cost: number | null;
  resale_price: number | null;
};

function toNum(v: any) {
  if (v == null || v === "") return null;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function Inventory() {
  const [rows, setRows] = useState<InvRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Form
  const [item, setItem] = useState("");
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [resalePrice, setResalePrice] = useState("");

  async function load() {
    setError("");
    setStatus("Loading inventory...");
    const { data, error } = await supabase
      .from("inventory")
      .select("id,item,qty,unit_cost,resale_price")
      .order("id", { ascending: false })
      .limit(500);

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setRows((data as InvRow[]) ?? []);
    setStatus(`Loaded ${data?.length ?? 0} item(s).`);
  }

  useEffect(() => {
    load();
  }, []);

  async function addItem() {
    setError("");
    setStatus("");

    const payload = {
      item: item.trim(),
      qty: toNum(qty) ?? 0,
      unit_cost: toNum(unitCost),
      resale_price: toNum(resalePrice),
    };

    if (!payload.item) {
      setError("Item name is required.");
      return;
    }

    setStatus("Saving item...");
    const { error } = await supabase.from("inventory").insert([payload]);
    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Saved. Refreshing...");
    setItem("");
    setQty("1");
    setUnitCost("");
    setResalePrice("");
    await load();
  }

  const totalInventoryValue = useMemo(() => {
    // Not “profit”, just quick inventory value estimate (resale_price * qty)
    return rows.reduce((sum, r) => sum + (Number(r.resale_price || 0) * Number(r.qty || 0)), 0);
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2>Inventory</h2>

      {status && <p>{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div style={{ display: "grid", gap: 10, maxWidth: 520 }}>
        <h3>Add Inventory Item</h3>

        <label>
          Item name
          <input value={item} onChange={(e) => setItem(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Qty
          <input value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Unit cost (what you paid)
          <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Resale price (target sell price)
          <input value={resalePrice} onChange={(e) => setResalePrice(e.target.value)} style={{ width: "100%" }} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addItem}>Save Item</button>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <p style={{ opacity: 0.85 }}>
        Estimated resale value (resale_price × qty): <b>{totalInventoryValue.toFixed(2)}</b>
      </p>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>ID</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Item</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Qty</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Unit Cost</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Resale Price</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.id}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.item}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.qty ?? ""}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.unit_cost ?? ""}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.resale_price ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
