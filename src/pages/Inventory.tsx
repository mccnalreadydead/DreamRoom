import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InventoryRow = {
  id: number;
  item: string;
  qty: number | null;
  unit_cost: number | null;
  resale_price: number | null;
  create_at?: string | null;
};

function toNum(v: any): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export default function Inventory() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");
    const { data, error } = await supabase
      .from("inventory")
      .select("id,item,qty,unit_cost,resale_price,create_at")
      .order("item", { ascending: true });

    if (error) setErr(error.message);
    setRows((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addItem() {
    const name = prompt("Item name?");
    if (!name) return;
    setErr("");
    const { error } = await supabase.from("inventory").insert([
      { item: name.trim(), qty: 0, unit_cost: 0, resale_price: 0 },
    ]);
    if (error) setErr(error.message);
    await load();
  }

  async function saveRow(r: InventoryRow) {
    setErr("");
    const payload = {
      item: r.item?.trim(),
      qty: r.qty ?? 0,
      unit_cost: r.unit_cost ?? 0,
      resale_price: r.resale_price ?? 0,
    };

    const { error } = await supabase.from("inventory").update(payload).eq("id", r.id);
    if (error) setErr(error.message);
    await load();
  }

  async function deleteRow(id: number) {
    const ok = confirm("Delete this inventory item?");
    if (!ok) return;
    setErr("");
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) setErr(error.message);
    await load();
  }

  const totalValue = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.resale_price ?? 0) * Number(r.qty ?? 0)), 0);
  }, [rows]);

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Inventory</h1>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={addItem}>+ Add Item</button>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Estimated resale value (resale × qty): <b>${totalValue.toFixed(2)}</b>
      </p>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
            <thead>
              <tr>
                {["Item", "Qty", "Unit Cost", "Resell", "Profit/Unit", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      letterSpacing: 0.3,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const qty = Number(r.qty ?? 0);
                const unit = Number(r.unit_cost ?? 0);
                const resell = Number(r.resale_price ?? 0);
                const profitUnit = resell - unit;
                const low = qty < 5;

                return (
                  <tr key={r.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <input
                        className="input"
                        value={r.item ?? ""}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) => (x.id === r.id ? { ...x, item: e.target.value } : x))
                          )
                        }
                      />
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <input
                        className="input"
                        style={{
                          width: 90,
                          borderColor: low ? "rgba(255,80,80,0.55)" : undefined,
                          color: low ? "rgba(255,120,120,1)" : undefined,
                          fontWeight: low ? 900 : 700,
                        }}
                        value={r.qty ?? 0}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, qty: toNum(e.target.value) ?? 0 } : x
                            )
                          )
                        }
                      />
                      {low ? (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4, color: "rgba(255,140,140,0.95)" }}>
                          Low stock
                        </div>
                      ) : null}
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <input
                        className="input"
                        style={{ width: 120 }}
                        value={r.unit_cost ?? 0}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, unit_cost: toNum(e.target.value) ?? 0 } : x
                            )
                          )
                        }
                      />
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <input
                        className="input"
                        style={{ width: 120 }}
                        value={r.resale_price ?? 0}
                        onChange={(e) =>
                          setRows((prev) =>
                            prev.map((x) =>
                              x.id === r.id ? { ...x, resale_price: toNum(e.target.value) ?? 0 } : x
                            )
                          )
                        }
                      />
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <b>${profitUnit.toFixed(2)}</b>
                    </td>

                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button className="btn primary" onClick={() => saveRow(r)}>Save</button>
                        <button className="btn" onClick={() => deleteRow(r.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }} className="muted">
                    No inventory yet. Click “Add Item”.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
          Tip: Qty turns red under 5. Sales entries will deduct inventory automatically.
        </p>
      </div>
    </div>
  );
}
