import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type RawRow = Record<string, unknown>;

type SaleRow = {
  id: string;
  date: string;
  unitsSold: number;
  profit: number;
  note: string;
};

function num(v: unknown): number {
  const n = Number((v ?? 0) as any);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSale(r: RawRow): SaleRow {
  const date = String((r as any).date ?? (r as any).Date ?? "").trim();

  const idRaw =
    (r as any).id ??
    (r as any).uuid ??
    (r as any).ID ??
    (r as any).Id ??
    `${date}-${Math.random()}`;

  return {
    id: String(idRaw),
    date,
    unitsSold: num((r as any).units_sold ?? (r as any).unitsSold ?? (r as any)["Units Sold"] ?? (r as any).UnitsSold),
    profit: num((r as any).profit ?? (r as any).Profit ?? (r as any)["Total Profit"] ?? (r as any)["Total Profit "]),
    note: String((r as any).note ?? (r as any).Note ?? "").trim(),
  };
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [msg, setMsg] = useState<string>("");

  async function loadSales(): Promise<void> {
    setMsg("");
    setLoading(true);

    const res = await supabase.from("sales").select("*");

    if (res.error) {
      console.error(res.error);
      setMsg(`Error loading sales: ${res.error.message}`);
      setRows([]);
      setLoading(false);
      return;
    }

    const normalized: SaleRow[] = (res.data ?? [])
      .map((r: any) => normalizeSale(r as RawRow))
      .filter((r: SaleRow) => r.date);

    normalized.sort((a: SaleRow, b: SaleRow) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    void loadSales();
  }, []);

  const totals = useMemo(() => {
    const totalUnits = rows.reduce((s: number, r: SaleRow) => s + num(r.unitsSold), 0);
    const totalProfit = rows.reduce((s: number, r: SaleRow) => s + num(r.profit), 0);
    return { totalUnits, totalProfit };
  }, [rows]);

  if (loading) return <div className="page muted">Loading sales…</div>;

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0 }}>Sales</h1>
        <button className="btn" onClick={() => void loadSales()}>Refresh</button>
      </div>

      {msg && <div className="card" style={{ marginTop: 12 }}>{msg}</div>}

      <div className="card" style={{ marginTop: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <span className="pill">Total Units Sold: {totals.totalUnits}</span>
          <span className="pill">
            Total Profit: ${totals.totalProfit.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
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
            {rows.map((r: SaleRow) => (
              <tr key={r.id}>
                <td>{r.date}</td>
                <td>{r.unitsSold}</td>
                <td>${num(r.profit).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                <td>{r.note}</td>
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
