import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InvRow = {
  id: number;
  item: string;
  qty: number | null;
  unit_cost: number | null;
  resale_price: number | null;
};

type SaleRow = {
  id: number;
  date: string | null; // YYYY-MM-DD
  item: string;
  units_sold: number | null;
  profit: number | null;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function Dashboard() {
  const [inv, setInv] = useState<InvRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    setStatus("Loading dashboard stats...");

    const [{ data: invData, error: invErr }, { data: salesData, error: salesErr }] = await Promise.all([
      supabase
        .from("inventory")
        .select("id,item,qty,unit_cost,resale_price")
        .order("id", { ascending: false })
        .limit(2000),
      supabase
        .from("Sales")
        .select("id,date,item,units_sold,profit")
        .order("date", { ascending: false })
        .limit(5000),
    ]);

    if (invErr) {
      setError(invErr.message);
      setStatus("");
      return;
    }
    if (salesErr) {
      setError(salesErr.message);
      setStatus("");
      return;
    }

    setInv((invData as InvRow[]) ?? []);
    setSales((salesData as SaleRow[]) ?? []);
    setStatus("✅ Dashboard updated.");
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const invCount = inv.length;

    const totalQty = inv.reduce((sum, r) => sum + Number(r.qty || 0), 0);

    const totalCostBasis = inv.reduce(
      (sum, r) => sum + Number(r.qty || 0) * Number(r.unit_cost || 0),
      0
    );

    const totalResaleValue = inv.reduce(
      (sum, r) => sum + Number(r.qty || 0) * Number(r.resale_price || 0),
      0
    );

    const potentialProfit = totalResaleValue - totalCostBasis;

    const salesCount = sales.length;
    const totalProfitAllTime = sales.reduce((sum, r) => sum + Number(r.profit || 0), 0);

    // current month profit
    const now = new Date();
    const y = String(now.getFullYear());
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const ym = `${y}-${m}`;

    const profitThisMonth = sales.reduce((sum, r) => {
      if (!r.date) return sum;
      if (r.date.slice(0, 7) !== ym) return sum;
      return sum + Number(r.profit || 0);
    }, 0);

    // last 6 months summary (profit)
    const map: Record<string, number> = {};
    for (const r of sales) {
      if (!r.date) continue;
      const key = r.date.slice(0, 7); // YYYY-MM
      map[key] = (map[key] || 0) + Number(r.profit || 0);
    }
    const months = Object.keys(map).sort().slice(-6);
    const last6 = months.map((k) => ({ month: k, profit: map[k] }));

    return {
      invCount,
      totalQty,
      totalCostBasis,
      totalResaleValue,
      potentialProfit,
      salesCount,
      totalProfitAllTime,
      profitThisMonth,
      last6,
    };
  }, [inv, sales]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .grid { display:grid; gap: 12px; }
        .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.04); }
        .label { opacity: 0.8; font-size: 13px; }
        .value { font-size: 22px; font-weight: 800; margin-top: 6px; }
        button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: inherit; cursor: pointer; }
        button:hover { background: rgba(255,255,255,0.10); }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.10); text-align: left; white-space: nowrap; }
        .tableWrap { overflow-x:auto; }
        @media (max-width: 900px) { .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 520px) { .cards { grid-template-columns: 1fr; } }
      `}</style>

      <h2>Dashboard</h2>
      {status && <p style={{ opacity: 0.85 }}>{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button onClick={load}>Refresh Stats</button>
      </div>

      <div className="grid cards" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="label">Inventory items</div>
          <div className="value">{stats.invCount}</div>
        </div>

        <div className="card">
          <div className="label">Total units in stock</div>
          <div className="value">{stats.totalQty}</div>
        </div>

        <div className="card">
          <div className="label">Inventory cost basis</div>
          <div className="value">${money(stats.totalCostBasis)}</div>
        </div>

        <div className="card">
          <div className="label">Inventory resale value</div>
          <div className="value">${money(stats.totalResaleValue)}</div>
        </div>

        <div className="card">
          <div className="label">Potential profit (resale − cost)</div>
          <div className="value">${money(stats.potentialProfit)}</div>
        </div>

        <div className="card">
          <div className="label">Sales records</div>
          <div className="value">{stats.salesCount}</div>
        </div>

        <div className="card">
          <div className="label">Profit this month</div>
          <div className="value">${money(stats.profitThisMonth)}</div>
        </div>

        <div className="card">
          <div className="label">All-time profit</div>
          <div className="value">${money(stats.totalProfitAllTime)}</div>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h3>Last 6 months profit</h3>
      <div className="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th>Profit</th>
            </tr>
          </thead>
          <tbody>
            {stats.last6.map((r) => (
              <tr key={r.month}>
                <td>{r.month}</td>
                <td>${money(r.profit)}</td>
              </tr>
            ))}
            {!stats.last6.length && (
              <tr>
                <td colSpan={2} style={{ opacity: 0.8 }}>
                  No sales yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
