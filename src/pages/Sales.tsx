import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SaleRow = {
  id: number;
  date: string | null; // YYYY-MM-DD
  item: string;
  units_sold: number | null;
  profit: number | null;
  note: string | null;
};

function toNum(v: any) {
  if (v == null || v === "") return null;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function yyyy(dateStr: string | null) {
  if (!dateStr) return null;
  return dateStr.slice(0, 4);
}
function mm(dateStr: string | null) {
  if (!dateStr) return null;
  return dateStr.slice(5, 7);
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Form
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [item, setItem] = useState("");
  const [unitsSold, setUnitsSold] = useState("1");
  const [profit, setProfit] = useState("");
  const [note, setNote] = useState("");

  // Filters
  const [yearFilter, setYearFilter] = useState<string>("All");
  const [monthFilter, setMonthFilter] = useState<string>("All");

  async function load() {
    setError("");
    setStatus("Loading sales...");

    const { data, error } = await supabase
      .from("Sales") // IMPORTANT: capital S to match your table name
      .select("id,date,item,units_sold,profit,note")
      .order("date", { ascending: false })
      .limit(2000);

    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setRows((data as SaleRow[]) ?? []);
    setStatus(`Loaded ${data?.length ?? 0} sale(s).`);
  }

  useEffect(() => {
    load();
  }, []);

  async function addSale() {
    setError("");
    setStatus("");

    const payload = {
      date: date || null,
      item: item.trim(),
      units_sold: Math.trunc(toNum(unitsSold) ?? 0),
      profit: toNum(profit),
      note: note.trim() || null,
    };

    if (!payload.item) {
      setError("Item is required.");
      return;
    }
    if (!payload.date) {
      setError("Date is required.");
      return;
    }

    setStatus("Saving sale...");
    const { error } = await supabase.from("Sales").insert([payload]);
    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Saved. Refreshing...");
    setItem("");
    setUnitsSold("1");
    setProfit("");
    setNote("");
    await load();
  }

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const y = yyyy(r.date);
      if (y) set.add(y);
    }
    return ["All", ...Array.from(set).sort((a, b) => b.localeCompare(a))];
  }, [rows]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      const m = mm(r.date);
      if (m) set.add(m);
    }
    // 01..12
    const months = Array.from(set).sort();
    return ["All", ...months];
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const y = yyyy(r.date);
      const m = mm(r.date);
      if (yearFilter !== "All" && y !== yearFilter) return false;
      if (monthFilter !== "All" && m !== monthFilter) return false;
      return true;
    });
  }, [rows, yearFilter, monthFilter]);

  const totalProfitFiltered = useMemo(() => {
    return filtered.reduce((sum, r) => sum + Number(r.profit || 0), 0);
  }, [filtered]);

  const totalProfitAllTime = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.profit || 0), 0);
  }, [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 1100 }}>
      <h2>Sales</h2>

      {status && <p>{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div style={{ display: "grid", gap: 10, maxWidth: 620 }}>
        <h3>Add Sale</h3>

        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Item
          <input value={item} onChange={(e) => setItem(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Units sold
          <input value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Profit (your profit for this sale)
          <input value={profit} onChange={(e) => setProfit(e.target.value)} style={{ width: "100%" }} />
        </label>

        <label>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} style={{ width: "100%" }} />
        </label>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={addSale}>Save Sale</button>
          <button onClick={load}>Refresh</button>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h3>Filter</h3>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>
          Year:&nbsp;
          <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
            {availableYears.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label>
          Month:&nbsp;
          <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            {availableMonths.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>

        <div style={{ opacity: 0.9 }}>
          Filtered profit: <b>{totalProfitFiltered.toFixed(2)}</b> &nbsp;|&nbsp; All-time profit:{" "}
          <b>{totalProfitAllTime.toFixed(2)}</b>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <h3>Sales Records ({filtered.length})</h3>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Date</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Item</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Units</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Profit</th>
              <th style={{ textAlign: "left", borderBottom: "1px solid #444" }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.date ?? ""}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.item}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.units_sold ?? ""}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.profit ?? ""}</td>
                <td style={{ padding: 6, borderBottom: "1px solid #333" }}>{r.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
