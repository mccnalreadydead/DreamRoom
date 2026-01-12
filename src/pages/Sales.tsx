import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

type Sale = {
  id?: number;
  date: string;
  item: string;
  units_sold: number;
  profit: number;
  note?: string;
};

export default function Sales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadSales() {
    setLoading(true);
    const { data } = await supabase
      .from("sales")
      .select("*")
      .order("date", { ascending: false });

    setSales(data || []);
    setLoading(false);
  }

  useEffect(() => {
    loadSales();
  }, []);

  if (loading) {
    return <div className="page muted">Loading sales…</div>;
  }

  return (
    <div className="page">
      <h1>Sales</h1>

      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Units Sold</th>
            <th>Profit</th>
          </tr>
        </thead>
        <tbody>
          {sales.map(s => (
            <tr key={s.id}>
              <td>{s.date}</td>
              <td>{s.units_sold}</td>
              <td>${s.profit}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {sales.length === 0 && (
        <div className="muted" style={{ marginTop: 12 }}>
          No sales yet.
        </div>
      )}
    </div>
  );
}
