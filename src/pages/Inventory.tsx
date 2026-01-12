import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InvRow = {
  id: number;
  item: string;
  qty: number | null;
  unit_cost: number | null;
  resale_price: number | null;
};

function toNumOrNull(v: any) {
  if (v == null || v === "") return null;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function Inventory() {
  const [rows, setRows] = useState<InvRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // add form
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
      .limit(2000);

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
      qty: Math.trunc(toNumOrNull(qty) ?? 0),
      unit_cost: toNumOrNull(unitCost),
      resale_price: toNumOrNull(resalePrice),
    };

    if (!payload.item) return setError("Item name is required.");

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

  async function saveRow(r: InvRow) {
    setError("");
    setStatus(`Saving "${r.item}"...`);

    const { error } = await supabase
      .from("inventory")
      .update({
        qty: r.qty ?? 0,
        unit_cost: r.unit_cost,
        resale_price: r.resale_price,
      })
      .eq("id", r.id);

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Saved.");
  }

  async function deleteRow(r: InvRow) {
    const ok = window.confirm(`Delete "${r.item}"? This cannot be undone.`);
    if (!ok) return;

    setError("");
    setStatus(`Deleting "${r.item}"...`);

    const { error } = await supabase.from("inventory").delete().eq("id", r.id);
    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Deleted. Refreshing...");
    await load();
  }

  const totalResaleValue = useMemo(() => {
    return rows.reduce(
      (sum, r) => sum + Number(r.resale_price || 0) * Number(r.qty || 0),
      0
    );
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .grid { display: grid; gap: 12px; }
        .twoCol { grid-template-columns: 1fr 1fr; }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.04); }
        .btnRow { display:flex; gap: 8px; flex-wrap: wrap; }
        input { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.25); color: inherit; }
        button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: inherit; cursor: pointer; }
        button:hover { background: rgba(255,255,255,0.10); }
        .danger { border-color: rgba(255,80,80,0.35); }
        .danger:hover { background: rgba(255,80,80,0.15); }
        .muted { opacity: 0.85; }
        .tableWrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.10); text-align: left; white-space: nowrap; }
        .qtyLow { border-color: rgba(255,80,80,0.55) !important; }
        .qtyLowText { color: salmon; font-weight: 800; }
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
          <h3 style={{ marginTop: 0 }}>Summary</h3>
          <p className="muted">
            Estimated resale value (resale_price × qty): <b>{totalResaleValue.toFixed(2)}</b>
          </p>
          <p className="muted">Qty will highlight red when below 5.</p>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* MOBILE CARDS */}
      <div className="mobileOnly">
        <h3>Items ({rows.length})</h3>
        <div className="grid">
          {rows.map((r) => {
            const low = Number(r.qty || 0) < 5;
            return (
              <div className="card" key={r.id}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{r.item}</div>

                <div className="grid" style={{ marginTop: 10 }}>
                  <label>
                    Qty {low ? <span className="qtyLowText">(LOW)</span> : null}
                    <input
                      className={low ? "qtyLow" : ""}
                      value={String(r.qty ?? 0)}
                      onChange={(e) => {
                        const v = Math.trunc(toNumOrNull(e.target.value) ?? 0);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, qty: v } : x)));
                      }}
                      inputMode="numeric"
                    />
                  </label>

                  <label>
                    Unit cost
                    <input
                      value={String(r.unit_cost ?? "")}
                      onChange={(e) => {
                        const v = toNumOrNull(e.target.value);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_cost: v } : x)));
                      }}
                      inputMode="decimal"
                    />
                  </label>

                  <label>
                    Resale price
                    <input
                      value={String(r.resale_price ?? "")}
                      onChange={(e) => {
                        const v = toNumOrNull(e.target.value);
                        setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, resale_price: v } : x)));
                      }}
                      inputMode="decimal"
                    />
                  </label>

                  <div className="btnRow">
                    <button onClick={() => saveRow(r)}>Save</button>
                    <button className="danger" onClick={() => deleteRow(r)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DESKTOP TABLE */}
      <div className="desktopOnly">
        <h3>Items ({rows.length})</h3>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Qty</th>
                <th>Unit Cost</th>
                <th>Resale</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const low = Number(r.qty || 0) < 5;
                return (
                  <tr key={r.id}>
                    <td>{r.item}</td>
                    <td style={{ minWidth: 120 }}>
                      <input
                        className={low ? "qtyLow" : ""}
                        value={String(r.qty ?? 0)}
                        onChange={(e) => {
                          const v = Math.trunc(toNumOrNull(e.target.value) ?? 0);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, qty: v } : x)));
                        }}
                        inputMode="numeric"
                      />
                      {low ? <div className="qtyLowText">Low</div> : null}
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input
                        value={String(r.unit_cost ?? "")}
                        onChange={(e) => {
                          const v = toNumOrNull(e.target.value);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, unit_cost: v } : x)));
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{ minWidth: 140 }}>
                      <input
                        value={String(r.resale_price ?? "")}
                        onChange={(e) => {
                          const v = toNumOrNull(e.target.value);
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, resale_price: v } : x)));
                        }}
                        inputMode="decimal"
                      />
                    </td>
                    <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button onClick={() => saveRow(r)}>Save</button>
                      <button className="danger" onClick={() => deleteRow(r)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr>
                  <td colSpan={5} className="muted">
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
