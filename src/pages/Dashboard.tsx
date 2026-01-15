import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

type NextEvent = {
  date: string;           // YYYY-MM-DD
  title: string;          // derived from bullets/details
  bullets: string[];
  details: string | null;
};

// ✅ Minimal shape we need for charting
type ProfitRow = {
  dateISO: string;   // YYYY-MM-DD
  profit: number;    // computed from sale_lines + inventory.cost
};

export default function Dashboard() {
  const [sales, setSales] = useState<ProfitRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [range, setRange] = useState<RangeKey>("6");

  // Next Event widget state
  const [nextEvent, setNextEvent] = useState<NextEvent | null>(null);
  const [eventErr, setEventErr] = useState("");
  const [eventLoading, setEventLoading] = useState(false);

  const now = new Date();

  // ✅ THIS is the key fix: compute profit the SAME way Sales.tsx does
  async function loadSales() {
    setLoading(true);
    setErr("");

    try {
      // 1) Load sales headers
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

      // 2) Load sale lines
      const linesRes = await supabase
        .from("sale_lines")
        .select("sale_id,item_id,units,price,fees")
        .in("sale_id", saleIds);

      if (linesRes.error) throw linesRes.error;

      const linesRows = (linesRes.data as any[]) ?? [];

      // 3) Build inventory cost map for item_ids in lines
      const itemIds = Array.from(new Set(linesRows.map((l) => l.item_id).filter(Boolean)));

      const costMap = new Map<number, number>();
      if (itemIds.length) {
        const invRes = await supabase
          .from("inventory")
          .select("id,cost")
          .in("id", itemIds);

        if (invRes.error) throw invRes.error;

        for (const r of (invRes.data as any[]) ?? []) {
          costMap.set(Number(r.id), Number(r.cost ?? 0));
        }
      }

      // 4) Group lines by sale_id
      const linesBySale = new Map<number, any[]>();
      for (const l of linesRows) {
        const sid = Number(l.sale_id);
        if (!linesBySale.has(sid)) linesBySale.set(sid, []);
        linesBySale.get(sid)!.push(l);
      }

      // 5) Compute profit per sale, return {dateISO, profit}
      const computed: ProfitRow[] = salesRows.map((s) => {
        const sid = Number(s.id);
        const saleLines = linesBySale.get(sid) ?? [];

        const profit = saleLines.reduce((sum, l) => {
          const cost = costMap.get(Number(l.item_id)) ?? 0;
          const u = Number(l.units ?? 0);
          const price = Number(l.price ?? 0);
          const fees = Number(l.fees ?? 0);
          return sum + (price - fees - cost * u);
        }, 0);

        const dateISO =
          (String(s.sale_date ?? "").slice(0, 10) || "") ||
          (String(s.created_at ?? "").slice(0, 10) || "");

        return {
          dateISO: dateISO || "1970-01-01",
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

    // We expect calendar_notes(note_date, bullets[], details)
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

    const title =
      bullets[0] ||
      (details ? details.trim().slice(0, 42) + (details.trim().length > 42 ? "…" : "") : "Event");

    setNextEvent({
      date: String(row.note_date),
      title,
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

  // ✅ Date helper uses our computed dateISO
  function getDate(s: ProfitRow): Date | null {
    const raw = s?.dateISO ?? null;
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function getProfit(s: ProfitRow): number {
    const n = Number(s?.profit ?? 0);
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
          <h1 style={{ margin: 0 }}>☁️ Into The Dream ☁️</h1>
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

          <button
            className="btn"
            onClick={() => {
              loadSales();
              loadNextEvent();
            }}
            disabled={loading || eventLoading}
          >
            {loading || eventLoading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* KPIs + Next Event */}
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

        <div className="dash-kpi dash-nextEvent">
          <div className="dash-kpiLabel">Next Event</div>

          {eventErr ? (
            <div className="dash-nextSmall" style={{ color: "salmon" }}>
              {eventErr}
            </div>
          ) : nextEvent ? (
            <>
              <div className="dash-kpiValue" style={{ fontSize: 16 }}>
                {nextEvent.title}
              </div>
              <div className="dash-nextSmall">
                <b>{nextEvent.date}</b>
                {nextEvent.bullets?.length ? ` • ${nextEvent.bullets.length} bullet(s)` : ""}
              </div>
              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link to="/calendar" className="btn primary" style={{ textDecoration: "none" }}>
                  Open Calendar
                </Link>
                <button className="btn" type="button" onClick={loadNextEvent} disabled={eventLoading}>
                  {eventLoading ? "Loading…" : "Refresh"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="dash-kpiValue" style={{ fontSize: 16 }}>
                No upcoming events
              </div>
              <div className="dash-nextSmall">Add one in your Event Calendar ✨</div>
              <div style={{ marginTop: 10 }}>
                <Link to="/calendar" className="btn primary" style={{ textDecoration: "none" }}>
                  Add Event
                </Link>
              </div>
            </>
          )}
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
        .dash-page > *{ position: relative; z-index: 1; }

        /* =========================================================
           ULTRA INTENSE PURPLE GLOW + PURPLE RAIN (VISUAL ONLY)
           CHANGE REQUEST:
           - big purple "balls" should drift UP way slower + be bigger
           - keep intensity
           ========================================================= */

        /* Massive aura + BIG ORBS (slow dreamy rise) */
        .dash-page::before{
          content:"";
          position:absolute;
          inset:-40px;
          z-index:0;
          pointer-events:none;

          background:
            /* Deep aura layers */
            radial-gradient(1200px 720px at 20% 0%, rgba(185,120,255,0.42), transparent 62%),
            radial-gradient(1100px 680px at 85% 18%, rgba(120,70,255,0.34), transparent 64%),
            radial-gradient(1200px 760px at 55% 110%, rgba(90,35,220,0.40), transparent 62%),
            radial-gradient(900px 520px at 50% 40%, rgba(220,160,255,0.16), transparent 60%),
            radial-gradient(700px 460px at 12% 82%, rgba(0,210,255,0.07), transparent 65%),
            linear-gradient(180deg, rgba(20,8,40,0.35), rgba(0,0,0,0.18)),

            /* BIG DREAM ORBS (BIGGER) */
            radial-gradient(circle,
              rgba(255,255,255,0.18) 0 6px,
              rgba(210,150,255,0.78) 14px,
              rgba(140,90,255,0.40) 38px,
              rgba(90,35,220,0.22) 70px,
              transparent 115px),
            radial-gradient(circle,
              rgba(255,255,255,0.16) 0 6px,
              rgba(190,120,255,0.74) 14px,
              rgba(120,70,255,0.38) 36px,
              rgba(90,35,220,0.20) 68px,
              transparent 112px),
            radial-gradient(circle,
              rgba(255,255,255,0.16) 0 6px,
              rgba(220,160,255,0.70) 14px,
              rgba(150,100,255,0.36) 36px,
              rgba(95,45,230,0.20) 68px,
              transparent 112px);

          background-size:
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,
            100% 100%,

            /* big orb fields */
            620px 1400px,
            700px 1600px,
            660px 1500px;

          /* Start positions: orbs start lower so they can drift UP */
          background-position:
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,
            50% 50%,

            12% 140%,
            52% 160%,
            86% 150%;

          filter: blur(14px) saturate(1.25);
          opacity: 1;
          mix-blend-mode: screen;
          transform: translateZ(0);

          /* Aura pulse stays, orb rise is separate + VERY slow */
          animation:
            dashAuraPulse 6.2s ease-in-out infinite,
            dashOrbsRise 26s linear infinite;
        }

        /* Dense purple rain (still intense + fast) */
        .dash-page::after{
          content:"";
          position:absolute;
          inset:-44px;
          z-index:0;
          pointer-events:none;

          background:
            /* MID droplets (tons) */
            radial-gradient(circle, rgba(210,150,255,0.28) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(170,110,255,0.24) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(120,70,255,0.22) 0 1px, transparent 6px),
            radial-gradient(circle, rgba(220,160,255,0.22) 0 1px, transparent 6px),

            /* FINE mist rain (insane density) */
            radial-gradient(circle, rgba(230,190,255,0.18) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(190,130,255,0.16) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(140,90,255,0.14) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(90,35,220,0.12) 0 1px, transparent 4px),

            /* soft streak veil for "rain" feel */
            repeating-linear-gradient(
              165deg,
              rgba(190,130,255,0.10) 0px,
              rgba(190,130,255,0.10) 1px,
              transparent 1px,
              transparent 14px
            );

          background-size:
            260px 520px,
            280px 560px,
            300px 600px,
            320px 640px,

            160px 260px,
            170px 280px,
            180px 300px,
            190px 320px,

            100% 100%;

          background-position:
            22% -60%,
            52% -110%,
            76% -90%,
            92% -130%,

            12% -40%,
            38% -180%,
            64% -120%,
            88% -240%,

            0% 0%;

          mix-blend-mode: screen;
          opacity: 0.92;
          filter: blur(0.10px) saturate(1.25);
          transform: translateZ(0);

          animation:
            dashRainFallFast 0.95s linear infinite,
            dashRainFallMed 1.35s linear infinite,
            dashRainFallSlow 2.30s linear infinite,
            dashRainDrift 1.10s ease-in-out infinite,
            dashRainFlicker 0.70s ease-in-out infinite;
        }

        @keyframes dashAuraPulse{
          0%   { transform: translate3d(0px,0px,0px) scale(1);   filter: blur(14px) saturate(1.15); opacity: 0.92; }
          35%  { transform: translate3d(6px,-3px,0px) scale(1.03); filter: blur(15px) saturate(1.35); opacity: 1; }
          70%  { transform: translate3d(-5px,2px,0px) scale(1.02); filter: blur(16px) saturate(1.45); opacity: 0.98; }
          100% { transform: translate3d(0px,0px,0px) scale(1);   filter: blur(14px) saturate(1.15); opacity: 0.92; }
        }

        /* BIG ORBS rise upward VERY SLOW (dreamy) */
        @keyframes dashOrbsRise{
          0%{
            background-position:
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,

              12% 140%,
              52% 160%,
              86% 150%;
          }
          100%{
            background-position:
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,
              50% 50%,

              12% -120%,
              52% -150%,
              86% -135%;
          }
        }

        @keyframes dashRainFallFast{
          0%{
            background-position:
              22% -60%,
              52% -110%,
              76% -90%,
              92% -130%,

              12% -40%,
              38% -180%,
              64% -120%,
              88% -240%,

              0% 0%;
          }
          100%{
            background-position:
              22% 320%,
              52% 360%,
              76% 340%,
              92% 380%,

              12% 520%,
              38% 580%,
              64% 560%,
              88% 620%,

              0% 0%;
          }
        }

        @keyframes dashRainFallMed{
          0%{ transform: translate3d(0px,0px,0px) scale(1); }
          100%{ transform: translate3d(0px,4px,0px) scale(1.01); }
        }

        @keyframes dashRainFallSlow{
          0%,100%{ filter: blur(0.10px) saturate(1.25); }
          50%{ filter: blur(0.22px) saturate(1.45); }
        }

        @keyframes dashRainDrift{
          0%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
          25%{ transform: translate3d(8px,-1px,0px) skewX(-0.7deg); }
          50%{ transform: translate3d(-10px,0px,0px) skewX(0.9deg); }
          75%{ transform: translate3d(7px,1px,0px) skewX(-0.5deg); }
          100%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
        }

        @keyframes dashRainFlicker{
          0%,100%{ opacity: 0.86; }
          20%{ opacity: 0.98; }
          45%{ opacity: 0.88; }
          65%{ opacity: 1; }
          85%{ opacity: 0.90; }
        }

        @media (prefers-reduced-motion: reduce){
          .dash-page::before, .dash-page::after{ animation:none; }
        }

        .dash-top{ align-items:center; gap:10px; flex-wrap: wrap; }

        .dash-sigil{
          color: rgba(212,175,55,0.92);
          font-weight: 900;
          text-shadow:
            0 0 24px rgba(190,130,255,0.40),
            0 0 30px rgba(120,70,255,0.26),
            0 0 18px rgba(212,175,55,0.25);
        }

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
          grid-template-columns: repeat(4, minmax(0,1fr));
          gap: 10px;
        }
        .dash-kpi{
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          padding: 10px;
        }
        .dash-kpiLabel{ font-size: 12px; font-weight: 900; color: rgba(255,255,255,0.70); }
        .dash-kpiValue{ margin-top: 6px; font-size: 18px; font-weight: 900; }
        .dash-nextSmall{ margin-top: 6px; font-size: 12px; font-weight: 850; color: rgba(255,255,255,0.68); }

        .dash-nextEvent{
          border-color: rgba(var(--violet), 0.25);
          background:
            radial-gradient(220px 140px at 20% 10%, rgba(var(--violet),0.18), transparent 60%),
            radial-gradient(220px 140px at 90% 60%, rgba(var(--pink),0.10), transparent 62%),
            rgba(255,255,255,0.05);
          box-shadow:
            0 0 0 1px rgba(var(--violet),0.10) inset,
            0 16px 40px rgba(var(--violet),0.10);
        }

        .dash-card{
          margin-top: 10px;
          padding: 10px;
          background: rgba(0,0,0,0.28);
        }
        .dash-hint{ font-size: 12px; font-weight: 800; color: rgba(255,255,255,0.65); }

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
        .dash-breakProfit{ text-align:right; color: rgba(255,255,255,0.78); white-space: nowrap; }
        .dash-breakPct{ text-align:right; color: rgba(212,175,55,0.78); white-space: nowrap; }

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

        @media (max-width: 760px){
          .dash-sub{ grid-template-columns: 1fr; }

          .dash-breakHead, .dash-breakRow{ grid-template-columns: 1fr auto; }
          .dash-breakPct{ display:none; }

          .dash-chart{ grid-auto-columns: minmax(74px, 1fr); gap: 8px; }
          .dash-barCol{ min-width:74px; }
          .dash-barTrack{ height: 160px; }
          .dash-barFill{ width: 50%; }
          .dash-barValue{ display:none; }
        }
      `}</style>
    </div>
  );
}
