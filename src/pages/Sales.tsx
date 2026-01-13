import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SaleRow = {
  id: number;
  date: string | null;       // YYYY-MM-DD
  item: string | null;
  units_sold: number | null;
  profit: number | null;
  note: string | null;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toInt(v: any): number {
  const n = Math.floor(Number(String(v).replace(/[^0-9-]/g, "")));
  return Number.isFinite(n) ? n : 0;
}

function toNum(v: any): number {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // new sale form
  const [date, setDate] = useState<string>(todayISO());
  const [item, setItem] = useState<string>("");
  const [units, setUnits] = useState<number>(1);
  const [profit, setProfit] = useState<number>(0);
  const [note, setNote] = useState<string>("");

  async function load() {
    setLoading(true);
    setErr("");

    const inv = await supabase.from("inventory").select("item").order("item", { ascending: true });
    if (inv.error) setErr(inv.error.message);
    setInventoryItems((inv.data ?? []).map((x: any) => x.item));

    // NOTE: your table in Supabase is named Sales (capital S) in the UI
    const sales = await supabase
      .from("Sales")
      .select("id,date,item,units_sold,profit,note")
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (sales.error) setErr(sales.error.message);
    setRows((sales.data as any) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addSale() {
    if (!item.trim()) {
      alert("Pick an item.");
      return;
    }

    setErr("");

    // 1) insert sale
    const { error: insErr } = await supabase.from("Sales").insert([
      {
        date,
        item: item.trim(),
        units_sold: units,
        profit,
        note: note.trim() || null,
      },
    ]);

    if (insErr) {
      setErr(insErr.message);
      return;
    }

    // 2) deduct inventory qty for that item
    // (simple + reliable approach: read qty, update qty)
    const invRow = await supabase
      .from("inventory")
      .select("id,qty")
      .eq("item", item.trim())
      .maybeSingle();

    if (invRow.data?.id != null) {
      const currentQty = Number(invRow.data.qty ?? 0);
      const nextQty = Math.max(0, currentQty - Number(units ?? 0));

      const upd = await supabase.from("inventory").update({ qty: nextQty }).eq("id", invRow.data.id);
      if (upd.error) {
        // Sale still saved; inventory update failed
        setErr(`Sale saved, but inventory could not update: ${upd.error.message}`);
      }
    } else {
      // not found: sale still saved, just no inventory row to deduct
      setErr("Sale saved, but no matching inventory item was found to deduct from.");
    }

    // reset form
    setUnits(1);
    setProfit(0);
    setNote("");

    await load();
  }

  async function deleteSale(id: number) {
    const ok = confirm("Delete this sale entry?");
    if (!ok) return;

    setErr("");
    const { error } = await supabase.from("Sales").delete().eq("id", id);
    if (error) setErr(error.message);
    await load();
  }

  const totalProfit = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.profit ?? 0), 0);
  }, [rows]);

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Sales</h1>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Total profit (all time): <b>${totalProfit.toFixed(2)}</b>
      </p>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Add Sale</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 10,
          }}
        >
          <div style={{ gridColumn: "span 3" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Date</div>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Item</div>
            <select className="input" value={item} onChange={(e) => setItem(e.target.value)}>
              <option value="">Select…</option>
              {inventoryItems.map((it) => (
                <option key={it} value={it}>{it}</option>
              ))}
            </select>
          </div>

          <div style={{ gridColumn: "span 2" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Units</div>
            <input
              className="input"
              value={units}
              onChange={(e) => setUnits(toInt(e.target.value))}
            />
          </div>

          <div style={{ gridColumn: "span 3" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Profit ($)</div>
            <input
              className="input"
              value={profit}
              onChange={(e) => setProfit(toNum(e.target.value))}
            />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Note (optional)</div>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div style={{ gridColumn: "span 12", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={addSale}>Save Sale</button>
          </div>
        </div>

        <style>{`
          @media (max-width: 760px) {
            .page .card h2 { font-size: 18px; }
            .page .card > div[style*="grid-template-columns"] {
              grid-template-columns: repeat(6, 1fr) !important;
            }
            .page .card > div[style*="grid-template-columns"] > div {
              grid-column: span 6 !important;
            }
          }
        `}</style>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <h2 style={{ marginTop: 0 }}>Recent Sales</h2>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                {["Date", "Item", "Units", "Profit", "Note", "Actions"].map((h) => (
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
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {r.date ?? ""}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <b>{r.item ?? ""}</b>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    {Number(r.units_sold ?? 0)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    ${Number(r.profit ?? 0).toFixed(2)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="muted">{r.note ?? ""}</span>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <button className="btn" onClick={() => deleteSale(r.id)}>Delete</button>
                  </td>
                </tr>
              ))}

              {!rows.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }} className="muted">
                    No sales yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
