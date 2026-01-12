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

  // Add form
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

    setItem("");
    setQty("1");
    setUnitCost("");
    setResalePrice("");

    setStatus("✅ Saved. Refreshing...");
    await load();
  }

  async function deleteItem(row: InvRow) {
    const ok = window.confirm(`Delete "${row.item}"? This cannot be undone.`);
    if (!ok) return;

    setError("");
    setStatus(`Deleting "${row.item}"...`);

    const { error } = await supabase.from("inventory").delete().eq("id", row.id);

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Deleted. Refreshing...");
    await load();
  }

  const totalResaleValue = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.resale_price || 0) * Number(r.qty || 0), 0);
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .grid { display: grid; gap: 12px; }
        .twoCol { grid-template-columns: 1fr 1fr; }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.04); }
        .row { display:flex; gap: 10px; flex-wrap: wrap; align-items:center; }
        .btnRow { display:flex; gap: 8px; flex-wrap: wrap; }
        input { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.25); color: inherit; }
        button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: inherit; cursor: pointer; }
        button:hover { background: rgba(255,255,255,0.10); }
        .danger { border-color: rgba(255,80,80,0.35); }
        .danger:hover { background: rgba(255,80,80,0.15); }
        .tableWrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.10); text-align: left; white-space: nowrap; }
        .muted { opacity: 0.85; }
        .mobileOnly { display: none; }
        .desktopOnly { display: block; }
        @media (max-width: 700px) {
          .twoCol { grid-template-columns: 1fr; }
          .mobileOnly { display: block; }
          .desktopOnly { display: none; }
        }
      `}</style>

      <h2>Inventory</h2>

      {status && <p className="muted">{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div className="grid twoCol" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add Inventory Item</h3>

          <div className="grid">
            <label>
              Item name
              <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="Shure SM7B" />
            </label>

            <div className="grid twoCol">
              <label>
                Qty
                <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Unit cost
                <input value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" />
              </label>
            </div>

            <label>
              Resale price
              <input value={resalePrice} onChange={(e) => setResalePrice(e.target.value)} inputMode="decimal" />
            </label>

            <div className="btnRow">
              <button onClick={addItem}>Save Item</button>
              <button onClick={load}>Refresh</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Quick Summary</h3>
          <p className="muted">
            Estimated resale value (resale_price × qty): <b>{totalResaleValue.toFixed(2)}</b>
          </p>
          <p className="muted">Tip: On mobile, items show as cards with a Delete button.</p>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* MOBILE CARDS */}
      <div className="mobileOnly">
        <h3>Items ({rows.length})</h3>
        <div className="grid">
          {rows.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{r.item}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Qty: <b>{r.qty ?? 0}</b>
                <br />
                Unit cost: <b>{r.unit_cost ?? ""}</b>
                <br />
                Resale: <b>{r.resale_price ?? ""}</b>
              </div>

              <div className="btnRow" style={{ marginTop: 10 }}>
                <button className="danger" onClick={() => deleteItem(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="desktopOnly">
        <h3>Items ({rows.length})</h3>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Resale Price</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.id}</td>
                  <td>{r.item}</td>
                  <td>{r.qty ?? ""}</td>
                  <td>{r.unit_cost ?? ""}</td>
                  <td>{r.resale_price ?? ""}</td>
                  <td>
                    <button className="danger" onClick={() => deleteItem(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
