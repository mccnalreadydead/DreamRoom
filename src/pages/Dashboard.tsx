import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type RangeKey = "current" | "last" | "3" | "6" | "12";

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}
function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
}
function labelMonth(d: Date) {
  return `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

/**
 * If your Sales page is already working, Dashboard should point to the SAME table.
 * This loader tries: Sales, sales, "Sales" (quoted) to avoid schema cache/name mismatch issues.
 */
const SALES_TABLE_CANDIDATES = ["Sales", "sales", '"Sales"'] as const;

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

export default function Dashboard() {
  const [sales, setSales] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [range, setRange] = useState<RangeKey>("6");

  const now = new Date();

  async function tryLoadAnyTable() {
    let lastError = "";

    for (const t of SALES_TABLE_CANDIDATES) {
      const res = await supabase.from(t as any).select("*").limit(1000);
      if (!res.error) {
        return { table: t, data: res.data ?? [], error: "" };
      }
      lastError = res.error.message;
    }

    return { table: "", data: [], error: lastError || "Unable to load Sales table." };
  }

  async function loadSales() {
    setLoading(true);
    setErr("");

    const res = await tryLoadAnyTable();
    if (res.error) {
      setErr(res.error);
      setSales([]);
      setLoading(false);
      return;
    }

    setSales(res.data);
    setLoading(false);
  }

  useEffect(() => {
    loadSales();
  }, []);

  // Date/profit detection (safe)
  function getDate(s: any): Date | null {
    const raw =
      s?.sold_at ??
      s?.date ??
      s?.created_at ??
      s?.create_at ??
      s?.createdAt ??
      s?.timestamp ??
      null;

    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function getProfit(s: any): number {
    const p = s?.profit ?? s?.total_profit ?? s?.amount ?? s?.net ?? s?.total ?? 0;
    const n = Number(p);
    return Number.isFinite(n) ? n : 0;
  }

  // Window
  const windowMonths = useMemo(() => {
    const curStart = startOfMonth(now);

    if (range === "current") return { start: curStart, count: 1, title: "Current Month" };
    if (range === "last") return { start: addMonths(curStart, -1), count: 1, title: "Last Month" };
    if (range === "3") return { start: addMonths(curStart, -2), count: 3, title: "Last 3 Months" };
    if (range === "6") return { start: addMonths(curStart, -5), count: 6, title: "Last 6 Months" };
    return { start: addMonths(curStart, -11), count: 12, title: "Last 12 Months" };
  }, [range]);

  const monthly = useMemo(() => {
    const { start, count } = windowMonths;

    const months: { key: string; label: string; total: number }[] = [];
    for (let i = 0; i < count; i++) {
      const d = addMonths(start, i);
      months.push({ key: ymKey(d), label: labelMonth(d), total: 0 });
    }
    const map = new Map(months.map((m) => [m.key, m]));

    for (const s of sales) {
      const d = getDate(s);
      if (!d) continue;
      const k = ymKey(startOfMonth(d));
      const bucket = map.get(k);
      if (!bucket) continue;
      bucket.total += getProfit(s);
    }

    return months;
  }, [sales, windowMonths]);

  const totalProfit = useMemo(() => monthly.reduce((a, m) => a + m.total, 0), [monthly]);
  const maxVal = useMemo(() => Math.max(1, ...monthly.map((m) => m.total)), [monthly]);

  return (
    <div className="page dash-page">
      <div className="row dash-top">
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h1 style={{ margin: 0 }}>Dashboard</h1>
          <span className="dash-sigil">⟡</span>
        </div>

        <div className="dash-controls">
          <button className={range === "current" ? "dash-pill active" : "dash-pill"} onClick={() => setRange("current")}>
            Current
          </button>
          <button className={range === "last" ? "dash-pill active" : "dash-pill"} onClick={() => setRange("last")}>
            Last
          </button>
          <button className={range === "3" ? "dash-pill active" : "dash-pill"} onClick={() => setRange("3")}>
            3 mo
          </button>
          <button className={range === "6" ? "dash-pill active" : "dash-pill"} onClick={() => setRange("6")}>
            6 mo
          </button>
          <button className={range === "12" ? "dash-pill active" : "dash-pill"} onClick={() => setRange("12")}>
            12 mo
          </button>

          <button className="btn" onClick={loadSales} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dash-sub">
        <div className="dash-kpi">
          <div className="dash-kpiLabel">{windowMonths.title}</div>
          <div className="dash-kpiValue">{money(totalProfit)}</div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpiLabel">Avg / month</div>
          <div className="dash-kpiValue">{money(totalProfit / Math.max(1, monthly.length))}</div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpiLabel">Best month</div>
          <div className="dash-kpiValue">
            {(() => {
              const best = [...monthly].sort((a, b) => b.total - a.total)[0];
              return best ? best.label : "—";
            })()}
          </div>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card dash-card">
        <div className="row" style={{ alignItems: "center", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Monthly Profit</h2>
          <span className="dash-hint">{windowMonths.title}</span>
        </div>

        {/* Monthly breakdown ABOVE the graph */}
        <div className="dash-breakdown">
          <div className="dash-breakHead">
            <div>Month</div>
            <div style={{ textAlign: "right" }}>Profit</div>
            <div style={{ textAlign: "right" }}>% of best</div>
          </div>

          {monthly.map((m) => {
            const pct = Math.max(0, Math.min(100, (m.total / maxVal) * 100));
            return (
              <div key={m.key} className="dash-breakRow">
                <div className="dash-breakMonth">{m.label}</div>
                <div className="dash-breakProfit">{money(m.total)}</div>
                <div className="dash-breakPct">{pct.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>

        {/* Vertical bar chart (normal size) */}
        <div className="dash-chart" aria-label="Monthly profit bar chart">
          {monthly.map((m) => {
            const h = Math.max(3, Math.round((m.total / maxVal) * 100));
            const exact = money(m.total);

            return (
              <div key={m.key} className="dash-barCol" title={`${m.label}: ${exact}`}>
                <div className="dash-barTrack">
                  <div className="dash-barFill" style={{ height: `${h}%` }} />
                </div>
                <div className="dash-barLabel">{m.label}</div>
                <div className="dash-barValue">{exact}</div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .dash-page{ position: relative; isolation: isolate; }
        .dash-page::before{
          content:""; position: fixed; inset:0; pointer-events:none; z-index:0;
          background:
            radial-gradient(900px 360px at 18% 10%, rgba(212,175,55,0.12), transparent 60%),
            radial-gradient(720px 340px at 82% 18%, rgba(80,130,255,0.08), transparent 62%),
            radial-gradient(500px 220px at 40% 80%, rgba(160,0,0,0.08), transparent 70%),
            linear-gradient(180deg, rgba(0,0,0,0.50), rgba(0,0,0,0.82));
        }
        .dash-page > *{ position: relative; z-index: 1; }

        .dash-top{ align-items:center; gap:10px; flex-wrap: wrap; }
        .dash-sigil{ color: rgba(212,175,55,0.92); font-weight: 900; text-shadow: 0 0 18px rgba(212,175,55,0.25); }

        .dash-controls{ display:flex; gap:8px; flex-wrap: wrap; align-items:center; }
        .dash-pill{
          border-radius: 999px; padding: 10px 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.88);
          font-weight: 900; cursor:pointer;
        }
        .dash-pill.active{
          border-color: rgba(212,175,55,0.40);
          background: rgba(212,175,55,0.12);
        }

        .dash-sub{
          margin-top: 10px;
          display:grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap: 10px;
        }
        .dash-kpi{
          border-radius: 16px;
          border: 1px solid rgba(212,175,55,0.18);
          background: rgba(255,255,255,0.05);
          padding: 10px;
        }
        .dash-kpiLabel{ font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.70); }
        .dash-kpiValue{ margin-top: 6px; font-size: 18px; font-weight: 900; }

        .dash-card{
          margin-top: 10px;
          padding: 10px;
          border: 1px solid rgba(212,175,55,0.12);
          background: rgba(0,0,0,0.28);
        }
        .dash-hint{ font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.65); }

        /* Monthly breakdown table ABOVE chart */
        .dash-breakdown{
          margin-top: 10px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          overflow: hidden;
        }
        .dash-breakHead{
          display:grid;
          grid-template-columns: 1fr auto auto;
          gap: 12px;
          padding: 10px 10px;
          font-size: 11px;
          font-weight: 900;
          color: rgba(255,255,255,0.62);
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .dash-breakRow{
          display:grid;
          grid-template-columns: 1fr auto auto;
          gap: 12px;
          padding: 10px 10px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.84);
        }
        .dash-breakRow:last-child{ border-bottom:none; }
        .dash-breakMonth{ color: rgba(255,255,255,0.86); }
        .dash-breakProfit{ text-align:right; color: rgba(255,255,255,0.78); white-space: nowrap; }
        .dash-breakPct{ text-align:right; color: rgba(212,175,55,0.78); white-space: nowrap; }

        /* Vertical bar chart (normal size), improved spacing */
        .dash-chart{
          margin-top: 12px;
          display:grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(86px, 1fr);
          gap: 10px;
          align-items:end;
          overflow-x:auto;
          padding-bottom: 6px;
        }
        .dash-barCol{ display:flex; flex-direction:column; align-items:center; gap:6px; min-width:86px; }
        .dash-barTrack{
          width: 100%;
          height: 190px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.035);
          overflow:hidden;
          display:flex;
          align-items:flex-end;
          justify-content:center;
        }
        .dash-barFill{
          width: 56%;
          border-radius: 12px;
          background: rgba(212,175,55,0.22);
          border: 1px solid rgba(212,175,55,0.25);
        }
        .dash-barLabel{ font-size: 11px; font-weight: 900; color: rgba(255,255,255,0.85); text-align:center; line-height:1.1; }
        .dash-barValue{ font-size: 11px; font-weight: 900; color: rgba(255,255,255,0.62); text-align:center; }

        /* Mobile polish: table becomes easier to read, chart bars become compact */
        @media (max-width: 760px){
          .dash-sub{ grid-template-columns: 1fr; }

          .dash-breakHead{ padding: 10px 8px; }
          .dash-breakRow{ padding: 10px 8px; }
          .dash-breakHead, .dash-breakRow{
            grid-template-columns: 1fr auto;
          }
          .dash-breakPct{ display:none; } /* hides 3rd column on mobile for readability */

          .dash-chart{
            grid-auto-columns: minmax(74px, 1fr);
            gap: 8px;
          }
          .dash-barCol{ min-width:74px; }
          .dash-barTrack{ height: 160px; }
          .dash-barFill{ width: 50%; }
          .dash-barValue{ display:none; } /* hides value under bar on mobile to reduce clutter */
        }
      `}</style>
    </div>
  );
}
