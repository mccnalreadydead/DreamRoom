import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SaleRow = {
  id: number;
  date: string | null; // YYYY-MM-DD
  profit: number | null;
  units_sold: number | null;
};

type RangeKey = "cur" | "last" | "m3" | "m12";

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "short" }) + " " + String(d.getFullYear()).slice(2);
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>("m12");
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const { start, endExclusive, title } = useMemo(() => {
    const now = new Date();
    const curStart = startOfMonth(now);
    const nextStart = addMonths(curStart, 1);
    const lastStart = addMonths(curStart, -1);

    if (range === "cur") return { start: curStart, endExclusive: nextStart, title: "Current Month" };
    if (range === "last") return { start: lastStart, endExclusive: curStart, title: "Last Month" };
    if (range === "m3") return { start: addMonths(curStart, -2), endExclusive: nextStart, title: "Last 3 Months" };
    return { start: addMonths(curStart, -11), endExclusive: nextStart, title: "Last 12 Months" };
  }, [range]);

  async function load() {
    setLoading(true);
    setErr("");

    // Sales table in your Supabase looks like "Sales"
    const { data, error } = await supabase
      .from("Sales")
      .select("id,date,profit,units_sold")
      .gte("date", toISO(start))
      .lt("date", toISO(endExclusive))
      .order("date", { ascending: true });

    if (error) setErr(error.message);
    setSales((data as any) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [range]);

  const totals = useMemo(() => {
    const profit = sales.reduce((s, r) => s + Number(r.profit ?? 0), 0);
    const units = sales.reduce((s, r) => s + Number(r.units_sold ?? 0), 0);
    const count = sales.length;
    return { profit, units, count };
  }, [sales]);

  // build monthly bars between start..endExclusive
  const bars = useMemo(() => {
    const byMonth = new Map<string, number>();
    const cursor = new Date(start.getTime());
    cursor.setDate(1);

    while (cursor < endExclusive) {
      byMonth.set(`${cursor.getFullYear()}-${cursor.getMonth()}`, 0);
      cursor.setMonth(cursor.getMonth() + 1);
    }

    for (const r of sales) {
      if (!r.date) continue;
      const d = new Date(r.date + "T00:00:00");
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(r.profit ?? 0));
    }

    const items: { label: string; value: number }[] = [];
    const c2 = new Date(start.getTime());
    c2.setDate(1);

    while (c2 < endExclusive) {
      const key = `${c2.getFullYear()}-${c2.getMonth()}`;
      items.push({ label: monthLabel(c2), value: byMonth.get(key) ?? 0 });
      c2.setMonth(c2.getMonth() + 1);
    }

    return items;
  }, [sales, start, endExclusive]);

  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className={range === "cur" ? "btn primary" : "btn"} onClick={() => setRange("cur")}>
            Current Month
          </button>
          <button className={range === "last" ? "btn primary" : "btn"} onClick={() => setRange("last")}>
            Last Month
          </button>
          <button className={range === "m3" ? "btn primary" : "btn"} onClick={() => setRange("m3")}>
            Last 3
          </button>
          <button className={range === "m12" ? "btn primary" : "btn"} onClick={() => setRange("m12")}>
            Last 12
          </button>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        View: <b>{title}</b>
      </p>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      {/* stat cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(12, 1fr)",
          gap: 12,
          marginTop: 12,
        }}
      >
        <div className="card" style={{ gridColumn: "span 4", padding: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Profit</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>${totals.profit.toFixed(2)}</div>
        </div>
        <div className="card" style={{ gridColumn: "span 4", padding: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Units Sold</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{totals.units}</div>
        </div>
        <div className="card" style={{ gridColumn: "span 4", padding: 12 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>Sales Entries</div>
          <div style={{ fontSize: 28, fontWeight: 900 }}>{totals.count}</div>
        </div>
      </div>

      {/* bar chart */}
      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>Profit by Month</h2>

        <div style={{ display: "grid", gap: 10 }}>
          {bars.map((b) => {
            const pct = (b.value / max) * 100;
            return (
              <div key={b.label} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px", gap: 10, alignItems: "center" }}>
                <div className="muted" style={{ fontWeight: 800, fontSize: 12 }}>{b.label}</div>
                <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: "rgba(212,175,55,0.55)",
                    }}
                  />
                </div>
                <div style={{ textAlign: "right", fontWeight: 900 }}>${b.value.toFixed(0)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .page h1 { font-size: 26px; }
          .page .card { border-radius: 14px; }
          .page div[style*="gridTemplateColumns: repeat(12"] > .card {
            grid-column: span 12 !important;
          }
          .page .card div[style*="fontSize: 28px"] { font-size: 22px !important; }
        }
      `}</style>
    </div>
  );
}
