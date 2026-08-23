import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";

type RangeKey = "current" | "3" | "6" | "12" | "all";

type ProfitRow = {
  dateISO: string;
  profit: number;
};

type NextEvent = {
  date: string;
  title: string;
  bullets: string[];
  details: string | null;
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, delta: number) {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

function ymKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelMonth(d: Date) {
  return `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `$${v.toFixed(2)}`;
}

export default function Dashboard() {
  const [sales, setSales] = useState<ProfitRow[]>([]);
  const [range, setRange] = useState<RangeKey>("6");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  const [eventErr, setEventErr] = useState("");
  const [eventLoading, setEventLoading] = useState(false);

  const now = new Date();

  async function loadSales() {
    setLoading(true);
    setErr("");

    try {
      const salesRes = await supabase
        .from("sales")
        .select("id,sale_date,created_at")
        .order("sale_date", { ascending: false })
        .limit(2000);

      if (salesRes.error) throw salesRes.error;

      const salesRows = (salesRes.data as any[]) ?? [];
      const saleIds = salesRows.map((s) => s.id).filter(Boolean);

      if (!saleIds.length) {
        setSales([]);
        setLoading(false);
        return;
      }

      const linesRes = await supabase
        .from("sale_lines")
        .select("sale_id,item_id,units,price,fees")
        .in("sale_id", saleIds);
      if (linesRes.error) throw linesRes.error;

      const linesRows = (linesRes.data as any[]) ?? [];
      const itemIds = Array.from(new Set(linesRows.map((l) => l.item_id).filter(Boolean)));

      const costMap = new Map<number, number>();
      if (itemIds.length) {
        const invRes = await supabase.from("inventory").select("id,cost").in("id", itemIds);
        if (invRes.error) throw invRes.error;

        for (const r of (invRes.data as any[]) ?? []) {
          costMap.set(Number(r.id), Number(r.cost ?? 0));
        }
      }

      const linesBySale = new Map<number, any[]>();
      for (const line of linesRows) {
        const sid = Number(line.sale_id);
        if (!linesBySale.has(sid)) linesBySale.set(sid, []);
        linesBySale.get(sid)!.push(line);
      }

      const computed: ProfitRow[] = salesRows.map((sale) => {
        const sid = Number(sale.id);
        const saleLines = linesBySale.get(sid) ?? [];

        const profit = saleLines.reduce((sum, line) => {
          const cost = costMap.get(Number(line.item_id)) ?? 0;
          const units = Number(line.units ?? 0);
          const price = Number(line.price ?? 0);
          const fees = Number(line.fees ?? 0);
          return sum + (price - fees - cost * units);
        }, 0);

        const dateISO = String(sale.sale_date ?? "").slice(0, 10) || String(sale.created_at ?? "").slice(0, 10) || "1970-01-01";

        return {
          dateISO,
          profit,
        };
      });

      setSales(computed);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSales([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadNextEvent() {
    setEventLoading(true);
    setEventErr("");

    const { data, error } = await supabase
      .from("calendar_notes")
      .select("note_date, bullets, details")
      .gte("note_date", todayISO())
      .order("note_date", { ascending: true })
      .limit(1);

    if (error) {
      setEventErr(error.message);
      setNextEvent(null);
      setEventLoading(false);
      return;
    }

    const row: any = (data ?? [])[0];
    if (!row?.note_date) {
      setNextEvent(null);
      setEventLoading(false);
      return;
    }

    const bullets: string[] = Array.isArray(row.bullets) ? row.bullets.filter(Boolean).map(String) : [];
    const details: string | null = row.details != null ? String(row.details) : null;

    setNextEvent({
      date: String(row.note_date),
      title: bullets[0] || (details ? details.trim().slice(0, 42) + (details.trim().length > 42 ? "…" : "") : "Event"),
      bullets,
      details,
    });

    setEventLoading(false);
  }

  useEffect(() => {
    loadSales();
    loadNextEvent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getDate = (s: ProfitRow) => {
    const raw = s?.dateISO ?? null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  const getProfit = (s: ProfitRow) => Number.isFinite(Number(s?.profit ?? 0)) ? Number(s.profit ?? 0) : 0;

  const monthWindow = useMemo(() => {
    const curStart = startOfMonth(now);
    if (range === "current") return { start: curStart, count: 1, title: "Current Month" };
    if (range === "3") return { start: addMonths(curStart, -2), count: 3, title: "Last 3 Months" };
    if (range === "6") return { start: addMonths(curStart, -5), count: 6, title: "Last 6 Months" };
    if (range === "12") return { start: addMonths(curStart, -11), count: 12, title: "Last 12 Months" };

    const earliest = sales.reduce<Date | null>((min, s) => {
      const d = getDate(s);
      if (!d) return min;
      const month = startOfMonth(d);
      if (!min || month.getTime() < min.getTime()) return month;
      return min;
    }, null);

    const start = earliest ?? curStart;
    const diff = (curStart.getFullYear() - start.getFullYear()) * 12 + (curStart.getMonth() - start.getMonth());
    const count = Math.max(1, diff + 1);
    return { start, count, title: "All Time" };
  }, [sales, range, now]);

  const monthly = useMemo(() => {
    const { start, count } = monthWindow;
    const months: { key: string; label: string; total: number }[] = [];

    for (let i = 0; i < count; i++) {
      const d = addMonths(start, i);
      months.push({ key: ymKey(d), label: labelMonth(d), total: 0 });
    }

    const map = new Map(months.map((m) => [m.key, m]));

    for (const s of sales) {
      const d = getDate(s);
      if (!d) continue;
      const key = ymKey(startOfMonth(d));
      if (map.has(key)) map.get(key)!.total += getProfit(s);
    }

    return months;
  }, [sales, monthWindow]);

  const currentMonthProfit = useMemo(() => {
    const key = ymKey(startOfMonth(now));
    return monthly.find((m) => m.key === key)?.total ?? 0;
  }, [monthly, now]);

  const selectedWindowTotal = useMemo(() => monthly.reduce((sum, item) => sum + item.total, 0), [monthly]);

  const chartMonthly = monthly;

  const maxBar = Math.max(1, ...chartMonthly.map((m) => m.total));

  const RavenLogo = () => (
    <svg viewBox="0 0 120 100" width="72" height="58" aria-label="Raven logo" role="img">
      <g>
        <circle cx="60" cy="28" r="15" fill="#0f0f10" />
        <path d="M 72 24 L 92 22 L 77 31 Z" fill="#1b1b1d" />
        <circle cx="66" cy="24" r="4" fill="#ff5555" />
        <circle cx="67" cy="23" r="1.5" fill="#ffd166" />
        <ellipse cx="60" cy="50" rx="16" ry="20" fill="#0f0f10" />
        <path d="M 47 34 Q 26 26 12 39 Q 24 46 38 42 Q 42 40 47 34" fill="#0f0f10" />
        <path d="M 73 34 Q 95 26 108 39 Q 96 46 82 42 Q 78 40 73 34" fill="#0f0f10" />
        <path d="M 46 67 Q 38 82 34 96 Q 43 84 48 69 Z" fill="#0f0f10" />
        <path d="M 60 69 Q 60 88 60 96 Q 67 84 68 70 Z" fill="#0f0f10" />
        <path d="M 74 67 Q 82 82 86 96 Q 77 84 72 69 Z" fill="#0f0f10" />
      </g>
    </svg>
  );

  return (
    <div className="dash-page page">
      <div className="dash-top">
        <div className="dash-brandWrap">
          <RavenLogo />
          <div>
            <h1>Dream Room</h1>
          </div>
        </div>

        <div className="dash-tools">
          <select className="dash-select" value={range} onChange={(e) => setRange(e.target.value as RangeKey)}>
            <option value="current">Current month</option>
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="12">Last 12 months</option>
            <option value="all">All time</option>
          </select>

          <button className="btn" onClick={() => loadSales()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dash-summaryGrid">
        <div className="dash-statCard">
          <span>Current month</span>
          <strong>{money(currentMonthProfit)}</strong>
        </div>
        <div className="dash-statCard">
          <span>{monthWindow.title}</span>
          <strong>{money(selectedWindowTotal)}</strong>
        </div>
      </div>

      <div className="dash-kpiGrid">
        <div className="dash-kpi">
          <div className="dash-kpiLabel">Window</div>
          <div className="dash-kpiValue">{monthWindow.title}</div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpiLabel">Total</div>
          <div className="dash-kpiValue">{money(monthly.reduce((sum, item) => sum + item.total, 0))}</div>
        </div>

        <div className="dash-kpi">
          <div className="dash-kpiLabel">Best month</div>
          <div className="dash-kpiValue">{(() => {
            const best = [...monthly].sort((a, b) => b.total - a.total)[0];
            return best ? best.label : "—";
          })()}</div>
        </div>

        <div className="dash-kpi dash-nextEvent">
          <div className="dash-kpiLabel">Next event</div>
          {eventErr ? (
            <div className="dash-nextText" style={{ color: "salmon" }}>{eventErr}</div>
          ) : nextEvent ? (
            <>
              <div className="dash-kpiValue smallValue">{nextEvent.title}</div>
              <div className="dash-nextText">{nextEvent.date}</div>
              <div className="dash-eventActions">
                <Link to="/calendar" className="btn primary">Calendar</Link>
                <button className="btn" type="button" onClick={loadNextEvent} disabled={eventLoading}>{eventLoading ? "…" : "↻"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="dash-kpiValue smallValue">No upcoming events</div>
              <div className="dash-nextText">Add one in your calendar</div>
              <div className="dash-eventActions">
                <Link to="/calendar" className="btn primary">Add</Link>
              </div>
            </>
          )}
        </div>
      </div>

      {err ? <div className="dash-error">{err}</div> : null}

      <div className="dash-card">
        <div className="dash-cardHeader">
          <h2>Revenue by Month</h2>
          <span>{monthWindow.title}</span>
        </div>

        <div className="dash-table">
          {monthly.map((item) => {
            const pct = Math.max(0, Math.min(100, (item.total / maxBar) * 100));
            return (
              <div key={item.key} className="dash-row">
                <span>{item.label}</span>
                <strong>{money(item.total)}</strong>
                <em>{pct.toFixed(0)}%</em>
              </div>
            );
          })}
        </div>

        <div className="dash-chartWrap">
          <div className="dash-chart">
            {chartMonthly.map((item, idx) => {
              const height = Math.max((item.total / maxBar) * 100, 6);
              return (
                <div key={idx} className="dash-barItem">
                  <div className="dash-barValue">{money(item.total)}</div>
                  <div className="dash-barTrack">
                    <div className="dash-bar" style={{ height: `${height}%` }} title={`${item.label}: ${money(item.total)}`} />
                  </div>
                  <div className="dash-barLabel">{item.label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        :root {
          --red-1: #ff5555;
          --red-2: #cc3333;
          --red-3: #ff7a7a;
          --black-1: #08090b;
          --black-2: #111214;
          --black-3: #19191d;
          --amber: #ffb347;
          --text: rgba(255,255,255,0.96);
          --muted: rgba(255,255,255,0.72);
          --line: rgba(255, 85, 85, 0.18);
        }

        * { box-sizing: border-box; }

        body {
          background: #090a0d;
        }

        .dash-page {
          min-height: 100vh;
          padding: 16px;
          background:
            radial-gradient(circle at top left, rgba(255,85,85,0.18), transparent 26%),
            radial-gradient(circle at top right, rgba(255,180,71,0.08), transparent 24%),
            linear-gradient(180deg, #08090b 0%, #120d12 100%);
          color: var(--text);
        }

        .dash-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 16px;
          flex-wrap: wrap;
        }

        .dash-brandWrap {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .dash-brandWrap h1 {
          margin: 0;
          font-size: clamp(1.7rem, 5vw, 2.7rem);
          line-height: 1.1;
          font-weight: 900;
          background: linear-gradient(135deg, var(--red-1), var(--red-2));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .dash-tools {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .dash-select {
          min-width: 180px;
          padding: 10px 12px;
          border-radius: 10px;
          border: 1px solid var(--line);
          background: rgba(12, 11, 13, 0.9);
          color: var(--text);
          font-weight: 700;
        }

        .btn {
          border: 1px solid var(--line);
          background: rgba(25, 16, 18, 0.8);
          color: var(--text);
          border-radius: 10px;
          padding: 10px 12px;
          font-weight: 700;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }

        .btn.primary {
          background: linear-gradient(135deg, var(--red-1), var(--red-2));
          border-color: transparent;
        }

        .dash-summaryGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .dash-statCard {
          background: linear-gradient(135deg, rgba(18, 12, 16, 0.9), rgba(8, 8, 10, 0.9));
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px 16px;
          box-shadow: 0 10px 20px rgba(0,0,0,0.18);
        }

        .dash-statCard span {
          display: block;
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--amber);
          margin-bottom: 8px;
          font-weight: 800;
        }

        .dash-statCard strong {
          font-size: clamp(1.1rem, 4vw, 1.8rem);
          font-weight: 900;
          background: linear-gradient(135deg, var(--red-1), var(--red-3));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .dash-kpiGrid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .dash-kpi {
          background: linear-gradient(135deg, rgba(20,14,16,0.9), rgba(9,9,11,0.9));
          border: 1px solid var(--line);
          border-radius: 14px;
          padding: 14px;
        }

        .dash-kpiLabel {
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--amber);
          font-weight: 800;
        }

        .dash-kpiValue {
          margin-top: 8px;
          font-size: 1.1rem;
          font-weight: 800;
          line-height: 1.2;
          background: linear-gradient(135deg, var(--red-1), var(--red-3));
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .smallValue {
          font-size: 0.92rem;
        }

        .dash-nextEvent {
          background: linear-gradient(135deg, rgba(255,85,85,0.12), rgba(15, 11, 13, 0.92));
        }

        .dash-nextText {
          margin-top: 8px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.35;
        }

        .dash-eventActions {
          display: flex;
          gap: 8px;
          margin-top: 10px;
          flex-wrap: wrap;
        }

        .dash-error {
          background: rgba(120, 20, 20, 0.35);
          color: #ffd5d5;
          border: 1px solid rgba(255, 100, 100, 0.4);
          border-radius: 12px;
          padding: 12px;
          margin-bottom: 16px;
        }

        .dash-card {
          background: linear-gradient(135deg, rgba(15, 11, 13, 0.92), rgba(8, 9, 11, 0.96));
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px;
          box-shadow: 0 12px 28px rgba(0,0,0,0.2);
        }

        .dash-cardHeader {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
          flex-wrap: wrap;
        }

        .dash-cardHeader h2 {
          margin: 0;
          font-size: 1.1rem;
        }

        .dash-cardHeader span {
          color: var(--amber);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          font-weight: 800;
        }

        .dash-table {
          display: grid;
          gap: 8px;
          margin-bottom: 16px;
        }

        .dash-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 12px;
          align-items: center;
          padding: 10px 12px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 10px;
        }

        .dash-row span {
          color: var(--muted);
          font-size: 0.9rem;
        }

        .dash-row strong {
          color: var(--red-3);
          font-size: 0.95rem;
          font-weight: 800;
        }

        .dash-row em {
          color: var(--amber);
          font-style: normal;
          font-size: 0.8rem;
          font-weight: 700;
          text-align: right;
        }

        .dash-chartWrap {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: rgba(255,255,255,0.02);
          padding: 12px 8px 8px;
          overflow-x: auto;
        }

        .dash-chart {
          display: flex;
          align-items: flex-end;
          justify-content: flex-start;
          gap: 10px;
          min-height: 260px;
          padding-top: 8px;
          width: max-content;
          min-width: 100%;
        }

        .dash-barItem {
          flex: 0 0 56px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          min-width: 56px;
        }

        .dash-barTrack {
          width: 44px;
          height: 180px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.04);
          border-radius: 8px 8px 0 0;
          overflow: hidden;
        }

        .dash-bar {
          width: 100%;
          min-height: 10%;
          background: linear-gradient(180deg, var(--red-3), var(--red-2));
          border-radius: 8px 8px 0 0;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.25), 0 0 16px rgba(255,85,85,0.22);
        }

        .dash-barValue {
          font-size: 9px;
          font-weight: 800;
          color: var(--amber);
          text-align: center;
          white-space: nowrap;
        }

        .dash-barLabel {
          font-size: 9px;
          color: var(--muted);
          text-align: center;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .dash-page { padding: 12px; }

          .dash-kpiGrid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .dash-summaryGrid {
            grid-template-columns: 1fr 1fr;
          }

          .dash-chart {
            min-height: 220px;
            gap: 8px;
          }

          .dash-barTrack {
            height: 150px;
            width: 38px;
          }

          .dash-barItem {
            flex-basis: 48px;
            min-width: 48px;
          }
        }

        @media (max-width: 560px) {
          .dash-top {
            align-items: flex-start;
            flex-direction: column;
          }

          .dash-tools {
            width: 100%;
            display: grid;
            grid-template-columns: 1fr auto;
          }

          .dash-select {
            width: 100%;
            min-width: 0;
          }

          .dash-summaryGrid,
          .dash-kpiGrid {
            grid-template-columns: 1fr;
          }

          .dash-brandWrap {
            width: 100%;
          }

          .dash-row {
            grid-template-columns: 1fr auto;
          }

          .dash-row em {
            display: none;
          }

          .dash-chartWrap {
            padding: 10px 6px 6px;
          }

          .dash-barTrack {
            height: 120px;
            width: 34px;
          }

          .dash-barItem {
            flex-basis: 42px;
            min-width: 42px;
          }

          .dash-barValue {
            font-size: 8px;
          }

          .dash-barLabel {
            font-size: 8px;
          }
        }
      `}</style>
    </div>
  );
}
