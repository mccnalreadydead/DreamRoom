import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SaleRow = {
  id?: any;
  date?: string | null;
  item?: string | null;
  unitsSold?: number;
  units_sold?: number;
  profit?: number;
  note?: string | null;
};

async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

function num(v: any) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  async function loadSales() {
    setMsg("");
    setLoading(true);

    const user_id = await getUserId();

    // Try user-scoped select first; if it fails (no user_id col), fallback
    let res = user_id
      ? await supabase.from("sales").select("*").eq("user_id", user_id).order("date", { ascending: false })
      : await supabase.from("sales").select("*").order("date", { ascending: false });

    if (res.error && user_id) {
      res = await supabase.from("sales").select("*").order("date", { ascending: false });
    }

    if (res.error) {
      console.error(res.error);
      setMsg(`Error loading sales: ${res.error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    setRows((res.data as SaleRow[]) || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSales();
  }, []);

  const totals = useMemo(() => {
    const totalUnits = rows.reduce((s, r) => s + num(r.unitsSold ?? r.units_sold), 0);
    const totalProfit = rows.reduce((s, r) => s + num(r.profit), 0);
    return { totalUnits, totalProfit };
  }, [rows]);

  if (loading) return <div className="page muted">Loading sales…</div>;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Sales</h1>
        <button className="btn" onClick={loadSales}>Refresh</button>
      </div>

      {msg && <div className="card" style={{ marginTop: 12 }}>{msg}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span className="pill">Total Units Sold: {totals.totalUnits}</span>
          <span className="pill">Total Profit: ${totals.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 140 }}>Date</th>
              <th style={{ width: 140 }}>Units</th>
              <th style={{ width: 160 }}>Profit</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={String(r.id ?? idx)}>
                <td>{r.date ?? ""}</td>
                <td>{num(r.unitsSold ?? r.units_sold)}</td>
                <td>${num(r.profit).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <div className="muted" style={{ marginTop: 12 }}>
            No sales rows found. Import your Excel again.
          </div>
        )}
      </div>
    </div>
  );
}
