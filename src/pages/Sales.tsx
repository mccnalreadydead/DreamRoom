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
  return dateStr ? dateStr.slice(0, 4) : null;
}
function mm(dateStr: string | null) {
  return dateStr ? dateStr.slice(5, 7) : null;
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Add form
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
      .from("Sales") // IMPORTANT: exact table name
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

    if (!payload.date) return setError("Date is required.");
    if (!payload.item) return setError("Item is required.");

    setStatus("Saving sale...");
    const { error } = await supabase.from("Sales").insert([payload]);
    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setItem("");
    setUnitsSold("1");
    setProfit("");
    setNote("");

    setStatus("✅ Saved. Refreshing...");
    await load();
  }

  async function deleteSale(row: SaleRow) {
    const ok = window.confirm(`Delete sale "${row.item}" on ${row.date}?`);
    if (!ok) return;

    setError("");
    setStatus("Deleting sale...");

    const { error } = await supabase.from("Sales").delete().eq("id", row.id);
    if (error) {
      setError(error.message);
      setStatus("");
      return;
    }

    setStatus("✅ Deleted. Refreshing...");
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
    return ["All", ...Array.from(set).sort()];
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

  const profitFiltered = useMemo(() => filtered.reduce((sum, r) => sum + Number(r.profit || 0), 0), [filtered]);
  const profitAll = useMemo(() => rows.reduce((sum, r) => sum + Number(r.profit || 0), 0), [rows]);

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <style>{`
        .grid { display: grid; gap: 12px; }
        .twoCol { grid-template-columns: 1fr 1fr; }
        .card { border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 12px; background: rgba(255,255,255,0.04); }
        .btnRow { display:flex; gap: 8px; flex-wrap: wrap; }
        input, select { width: 100%; padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.25); color: inherit; }
        button { padding: 10px 12px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.18); background: rgba(255,255,255,0.06); color: inherit; cursor: pointer; }
        button:hover { background: rgba(255,255,255,0.10); }
        .danger { border-color: rgba(255,80,80,0.35); }
        .danger:hover { background: rgba(255,80,80,0.15); }
        .muted { opacity: 0.85; }
        .tableWrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; border-bottom: 1px solid rgba(255,255,255,0.10); text-align: left; white-space: nowrap; }
        .mobileOnly { display: none; }
        .desktopOnly { display: block; }
        @media (max-width: 700px) {
          .twoCol { grid-template-columns: 1fr; }
          .mobileOnly { display: block; }
          .desktopOnly { display: none; }
        }
      `}</style>

      <h2>Sales</h2>

      {status && <p className="muted">{status}</p>}
      {error && <p style={{ color: "salmon" }}>{error}</p>}

      <div className="grid twoCol" style={{ marginTop: 12 }}>
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Add Sale</h3>

          <div className="grid">
            <label>
              Date
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>

            <label>
              Item
              <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="SM7B" />
            </label>

            <div className="grid twoCol">
              <label>
                Units sold
                <input value={unitsSold} onChange={(e) => setUnitsSold(e.target.value)} inputMode="numeric" />
              </label>
              <label>
                Profit
                <input value={profit} onChange={(e) => setProfit(e.target.value)} inputMode="decimal" />
              </label>
            </div>

            <label>
              Note (optional)
              <input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="btnRow">
              <button onClick={addSale}>Save Sale</button>
              <button onClick={load}>Refresh</button>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Filter</h3>

          <div className="grid">
            <label>
              Year
              <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)}>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Month
              <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>

            <div className="muted">
              Filtered profit: <b>{profitFiltered.toFixed(2)}</b>
              <br />
              All-time profit: <b>{profitAll.toFixed(2)}</b>
            </div>
          </div>
        </div>
      </div>

      <hr style={{ margin: "16px 0" }} />

      {/* MOBILE */}
      <div className="mobileOnly">
        <h3>Sales Records ({filtered.length})</h3>
        <div className="grid">
          {filtered.map((r) => (
            <div className="card" key={r.id}>
              <div style={{ fontWeight: 700 }}>{r.item}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                Date: <b>{r.date ?? ""}</b>
                <br />
                Units: <b>{r.units_sold ?? ""}</b>
                <br />
                Profit: <b>{r.profit ?? ""}</b>
                <br />
                Note: {r.note ?? ""}
              </div>
              <div className="btnRow" style={{ marginTop: 10 }}>
                <button className="danger" onClick={() => deleteSale(r)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* DESKTOP */}
      <div className="desktopOnly">
        <h3>Sales Records ({filtered.length})</h3>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Item</th>
                <th>Units</th>
                <th>Profit</th>
                <th>Note</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>{r.date ?? ""}</td>
                  <td>{r.item}</td>
                  <td>{r.units_sold ?? ""}</td>
                  <td>{r.profit ?? ""}</td>
                  <td>{r.note ?? ""}</td>
                  <td>
                    <button className="danger" onClick={() => deleteSale(r)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!filtered.length && (
                <tr>
                  <td colSpan={6} className="muted">
                    No sales yet for this filter.
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
