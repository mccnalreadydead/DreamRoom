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
  profit: number | null;
};

function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export default function Dashboard() {
  const [inv, setInv] = useState<InvRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    setStatus("Loading dashboard...");

    const [{ data: invData, error: invErr }, { data: salesData, error: salesErr }] =
      await Promise.all([
        supabase.from("inventory").select("id,item,qty,unit_cost,resale_price").limit(5000),
        supabase.from("Sales").select("id,date,profit").limit(10000),
      ]);

    if (invErr) return (setError(invErr.message), setStatus(""));
    if (salesErr) return (setError(salesErr.message), setStatus(""));

    setInv((invData as InvRow[]) ?? []);
    setSales((salesData as SaleRow[]) ?? []);
    setStatus("✅ Updated.");
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const invCount = inv.length;
    const totalQty = inv.reduce((sum, r) => sum + Number(r.qty || 0), 0);
    const costBasis = inv.reduce((sum, r) => sum + Number(r.qty || 0) * Number(r.unit_cost || 0), 0);
    const resaleValue = inv.reduce((sum, r) => sum + Number(r.qty || 0) * Number(r.resale_price || 0), 0);
    const potentialProfit = resaleValue - costBasis;

    const profitAllTime = sales.reduce((sum, r) => sum + Number(r.profit || 0), 0);

    // last 12 months buckets
    const now = new Date();
    const months: { key: string; profit: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(d), profit: 0 });
    }
    const idx: Record<string, number> = {};
    months.forEach((m, i) => (idx[m.key] = i));

    for (const r of sales) {
      if (!r.date) continue;
      const k = r.date.slice(0, 7);
      const i = idx[k];
      if (i == null) continue;
      months[i].profit += Number(r.profit || 0);
    }

    const profitThisMonth = months[months.length - 1]?.profit ?? 0;

    return { invCount, totalQty, costBasis, resaleValue, potentialProfit, profitAllTime, profitThisMonth, months };
  }, [inv, sales]);

  const maxBar = useMemo(() => {
    const max = Math.max(...stats.months.map((m) => m.profit), 0);
    return max <= 0 ? 1 : max;
  }, [stats.months]);

  return (
    <div style={{ padding: 16 }}>
      <style>{`
        .grid { display:grid; gap: 10px; }
        .cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        .card {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.04);
        }
        .label { opacity: 0.8; font-size: 13px; }
        .value { font-size: 22px; font-weight: 800; margin-top: 4px; }
        button {
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(255,255,255,0.06);
          color: inherit;
          cursor: pointer;
        }
        button:hover { background: rgba(255,255,255,0.10); }
        .chartWrap {
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 12px;
          padding: 12px;
          background: rgba(255,255,255,0.04);
        }
        .chart {
          display: grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 6px;
          align-items: end;
          height: 160px;
          margin-top: 10px;
        }
        .bar {
          width: 100%;
          border-radius: 8px 8px 4px 4px;
          background: rgba(255,255,255,0.20);
          border: 1px solid rgba(255,255,255,0.18);
          position: relative;
        }
        .barLabel {
          font-size: 11px;
          opacity: 0.8;
          text-align: center;
          margin-top: 6px;
        }
        .barTip {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          top: -22px;
          font-size: 11px;
          opacity: 0.9;
          white-space: nowrap;
        }

        /* Mobile: smaller cards + smaller numbers */
        @media (max-width: 700px) {
          .cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
          .card { padding: 10px; }
          .value { font-size: 18px; }
          .chart { height: 140px; gap: 5px; }
        }
        @media (max-width: 420px) {
          .cards { grid-template-columns: 1fr; }
        }
      `}</style>

      <h2>Dashboard</h2>
      {status && <p style={{ opacity: 0.85 }}>{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={load}>Refresh</button>
      </div>

      <div className="grid cards" style={{ marginTop: 12 }}>
        <div className="card">
          <div className="label">Inventory items</div>
          <div className="value">{stats.invCount}</div>
        </div>
        <div className="card">
          <div className="label">Units in stock</div>
          <div className="value">{stats.totalQty}</div>
        </div>
        <div className="card">
          <div className="label">Cost basis</div>
          <div className="value">${money(stats.costBasis)}</div>
        </div>
        <div className="card">
          <div className="label">Resale value</div>
          <div className="value">${money(stats.resaleValue)}</div>
        </div>
        <div className="card">
          <div className="label">Potential profit</div>
          <div className="value">${money(stats.potentialProfit)}</div>
        </div>
        <div className="card">
          <div className="label">Profit this month</div>
          <div className="value">${money(stats.profitThisMonth)}</div>
        </div>
        <div className="card">
          <div className="label">All-time profit</div>
          <div className="value">${money(stats.profitAllTime)}</div>
        </div>
      </div>

      <div className="chartWrap" style={{ marginTop: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h3 style={{ margin: 0 }}>Last 12 months profit</h3>
          <div style={{ opacity: 0.8, fontSize: 13 }}>
            Tap a bar label to see the month; bars scale to max month.
          </div>
        </div>

        <div className="chart">
          {stats.months.map((m) => {
            const h = Math.max(6, Math.round((m.profit / maxBar) * 160));
            return (
              <div key={m.key} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div className="bar" style={{ height: h }}>
                  <div className="barTip">${money(m.profit)}</div>
                </div>
                <div className="barLabel">{m.key.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
