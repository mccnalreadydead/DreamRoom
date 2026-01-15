import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * This page is MOBILE-FIRST.
 * It:
 * - loads sellers (sales_people OR sale_sellers OR sellers)
 * - loads sales rows from "sales"
 * - tries to also load sale line-items if a table exists
 * - calculates:
 *    total profit, total sales, fees, avg selling price per sale,
 *    avg items per sale (best-effort via sale_lines; fallback=1 per sale)
 * - filters by Seller + Month + Year
 * - allows adding a salesperson (bottom sheet)
 *
 * Requested changes:
 * - DO NOT change layout/behavior
 * - ONLY: show nicknames in dropdown for Chad/Devan (display labels)
 * - Add cool effects (visual only) + gothic/vampiric "Sales Metrics" title
 * - Do not change anything that affects table performance
 */

type SellerRow = {
  id: number;
  name: string;
  active?: boolean | null;
  created_at?: string | null;
};

type SaleRow = {
  id: number;
  sale_date: string | null; // YYYY-MM-DD
  seller_name: string | null;
  seller_id: number | null;

  sale_price: number | null;
  cost: number | null;
  fees: number | null;
  profit: number | null;

  notes: string | null;
  created_at?: string | null;
};

type SaleLineRow = {
  id: number;
  sale_id: number;
  qty: number | null;
  price: number | null;
  fees: number | null;
};

function toNum(v: any, fallback = 0) {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function ymFromISO(iso: string | null) {
  if (!iso) return { y: "", m: "" };
  const y = iso.slice(0, 4);
  const m = iso.slice(5, 7);
  return { y, m };
}

function monthName(m: string) {
  const map: Record<string, string> = {
    "01": "Jan",
    "02": "Feb",
    "03": "Mar",
    "04": "Apr",
    "05": "May",
    "06": "Jun",
    "07": "Jul",
    "08": "Aug",
    "09": "Sep",
    "10": "Oct",
    "11": "Nov",
    "12": "Dec",
  };
  return map[m] ?? m;
}

function norm(s: string) {
  return s.trim().toLowerCase();
}

function nicknameFor(name: string) {
  const n = norm(name);
  if (n === "chad") return "Chadillac";
  if (n === "devan") return "the Dude";
  return "";
}

function displaySellerName(name: string) {
  const nick = nicknameFor(name);
  return nick || name;
}

export default function SalesMetrics() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [sellerTable, setSellerTable] = useState<string>("sales_people");
  const [salesTable] = useState<string>("sales");
  const [linesTable, setLinesTable] = useState<string | null>(null);

  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [seller, setSeller] = useState<string>("ALL");

  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleLines, setSaleLines] = useState<SaleLineRow[]>([]);

  const [addOpen, setAddOpen] = useState(false);
  const [newSellerName, setNewSellerName] = useState("");

  async function detectTables() {
    const sellerCandidates = ["sales_people", "sale_sellers", "sellers"];
    for (const t of sellerCandidates) {
      const res = await supabase.from(t).select("id").limit(1);
      if (!res.error) {
        setSellerTable(t);
        break;
      }
    }

    const lineCandidates: string[] = [];
    for (const t of lineCandidates) {
      const res = await supabase.from(t).select("id").limit(1);
      if (!res.error) {
        setLinesTable(t);
        break;
      }
    }
  }

  async function loadAll() {
    setLoading(true);
    setErr("");

    try {
      await detectTables();

      const sRes = await supabase.from(sellerTable).select("id,name,active,created_at").order("name", { ascending: true });
      if (!sRes.error) setSellers(((sRes.data as any) ?? []) as SellerRow[]);
      else setSellers([]);

      let salesData: any[] = [];
      const rich = await supabase
        .from(salesTable)
        .select("id,sale_date,price,cost,fees,notes,created_at,item,qty,event_name")
        .order("sale_date", { ascending: false });

      if (!rich.error) {
        salesData = (rich.data as any) ?? [];
      } else {
        const minimal = await supabase.from(salesTable).select("id,sale_date,notes,created_at").order("sale_date", { ascending: false });
        if (minimal.error) throw minimal.error;
        salesData = (minimal.data as any) ?? [];
      }

      setSales((salesData as any) ?? []);

      if (linesTable) {
        const lRes = await supabase.from(linesTable).select("id,sale_id,qty,price,fees").order("id", { ascending: false });
        if (!lRes.error) setSaleLines(((lRes.data as any) ?? []) as SaleLineRow[]);
        else setSaleLines([]);
      } else {
        setSaleLines([]);
      }
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSellers([]);
      setSales([]);
      setSaleLines([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yearOptions = useMemo(() => {
    const ys = new Set<string>();
    for (const r of sales) {
      const { y } = ymFromISO(r.sale_date);
      if (y) ys.add(y);
    }
    ys.add(String(new Date().getFullYear()));
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [sales]);

  const filteredSales = useMemo(() => {
    return sales.filter((r) => {
      const { y, m } = ymFromISO(r.sale_date);
      if (year && y !== year) return false;
      if (month && m !== month) return false;

      if (seller !== "ALL") {
        const s = (r.seller_name ?? "").trim();
        if (s !== seller) return false;
      }
      return true;
    });
  }, [sales, seller, year, month]);

  const linesBySale = useMemo(() => {
    const map = new Map<number, SaleLineRow[]>();
    for (const l of saleLines) {
      const arr = map.get(l.sale_id) ?? [];
      arr.push(l);
      map.set(l.sale_id, arr);
    }
    return map;
  }, [saleLines]);

  const metrics = useMemo(() => {
    const count = filteredSales.length;

    let sumSales = 0;
    let sumFees = 0;
    let sumCost = 0;
    let sumProfit = 0;
    let totalItemsAcrossSales = 0;

    for (const s of filteredSales) {
      const saleId = s.id;
      const saleLinesForSale = linesBySale.get(saleId) ?? null;

      if (saleLinesForSale && saleLinesForSale.length) {
        const saleTotalPrice = saleLinesForSale.reduce((acc, l) => acc + toNum(l.price, 0), 0);
        const saleTotalFees = saleLinesForSale.reduce((acc, l) => acc + toNum(l.fees, 0), 0);
        const saleTotalQty = saleLinesForSale.reduce((acc, l) => acc + Math.max(0, toNum(l.qty, 0)), 0);

        sumSales += saleTotalPrice;
        sumFees += saleTotalFees;
        totalItemsAcrossSales += saleTotalQty;

        const p =
          s.profit != null
            ? toNum(s.profit, 0)
            : s.sale_price != null || s.cost != null || s.fees != null
              ? toNum(s.sale_price, 0) - toNum(s.cost, 0) - toNum(s.fees, 0)
              : saleTotalPrice - saleTotalFees;

        sumProfit += p;
        sumCost += toNum(s.cost, 0);
      } else {
        sumSales += toNum(s.sale_price, 0);
        sumFees += toNum(s.fees, 0);
        sumCost += toNum(s.cost, 0);

        const p = s.profit != null ? toNum(s.profit, 0) : toNum(s.sale_price, 0) - toNum(s.cost, 0) - toNum(s.fees, 0);

        sumProfit += p;
        totalItemsAcrossSales += 1;
      }
    }

    const avgSellingPricePerSale = count ? sumSales / count : 0;
    const avgItemsPerSale = count ? totalItemsAcrossSales / count : 0;
    const avgProfitPerSale = count ? sumProfit / count : 0;

    return { count, sumSales, sumFees, sumCost, sumProfit, avgSellingPricePerSale, avgItemsPerSale, avgProfitPerSale };
  }, [filteredSales, linesBySale]);

  async function addSalesperson() {
    const name = newSellerName.trim();
    if (!name) return;

    setLoading(true);
    setErr("");

    try {
      const ins = await supabase.from(sellerTable).insert([{ name, active: true } as any]);
      if (ins.error) {
        const ins2 = await supabase.from(sellerTable).insert([{ name } as any]);
        if (ins2.error) throw ins2.error;
      }

      setNewSellerName("");
      setAddOpen(false);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  const selectedSellerDisplay = useMemo(() => {
    if (seller === "ALL") return "All Salespeople";
    return displaySellerName(seller);
  }, [seller]);

  const selectedSellerNickname = useMemo(() => {
    if (seller === "ALL") return "";
    return nicknameFor(seller);
  }, [seller]);

  return (
    <div className="page smX">
      <style>{`
        /* =========================
           SALES METRICS - VAMPIRIC / GOTHIC POLISH (VISUAL ONLY)
           ========================= */

        /* Page-only aura (cheap + safe) */
        .smX{
          position: relative;
          isolation: isolate;
        }
        .smX::before{
          content:"";
          position:absolute;
          inset:-26px;
          z-index:-1;
          pointer-events:none;
          background:
            radial-gradient(900px 520px at 18% 0%, rgba(212,175,55,0.14), transparent 60%),
            radial-gradient(720px 520px at 82% 18%, rgba(160,20,40,0.18), transparent 62%),
            radial-gradient(760px 520px at 55% 85%, rgba(140,90,255,0.12), transparent 60%),
            radial-gradient(520px 360px at 20% 80%, rgba(0,210,255,0.06), transparent 65%);
          filter: blur(10px);
          opacity: 0.98;
          animation: smAura 8.4s ease-in-out infinite;
        }

        /* =========================================
           EMBER STORM (VIOLENT) — VISUAL ONLY
           ========================================= */
        .smX::after{
          content:"";
          position:absolute;
          inset:-34px;
          z-index:-1;
          pointer-events:none;

          /* MANY ember fields + inferno base + heat shimmer-ish streak */
          background:
            /* BIG embers (rare, bright) */
            radial-gradient(circle, rgba(255,235,170,0.28) 0 2px, transparent 7px),
            radial-gradient(circle, rgba(255,160,90,0.22) 0 2px, transparent 7px),
            radial-gradient(circle, rgba(255,90,50,0.18) 0 2px, transparent 7px),

            /* MID embers (lots) */
            radial-gradient(circle, rgba(255,220,150,0.22) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(255,170,95,0.18) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(255,120,70,0.16) 0 1px, transparent 4px),
            radial-gradient(circle, rgba(255,80,40,0.14) 0 1px, transparent 4px),

            /* FINE embers (storm) */
            radial-gradient(circle, rgba(255,235,180,0.16) 0 1px, transparent 3px),
            radial-gradient(circle, rgba(255,200,120,0.14) 0 1px, transparent 3px),
            radial-gradient(circle, rgba(255,150,90,0.12) 0 1px, transparent 3px),
            radial-gradient(circle, rgba(255,105,60,0.10) 0 1px, transparent 3px),

            /* Inferno glow at bottom */
            radial-gradient(1200px 540px at 50% 120%,
              rgba(255,55,30,0.34) 0%,
              rgba(255,120,55,0.20) 28%,
              rgba(255,200,110,0.12) 52%,
              transparent 80%),

            /* Subtle hot-air shimmer streak (non-striped, soft) */
            linear-gradient(180deg, transparent 0%, rgba(255,120,55,0.06) 55%, transparent 100%);

          background-size:
            320px 620px, /* big A */
            360px 740px, /* big B */
            420px 820px, /* big C */

            240px 420px, /* mid A */
            280px 500px, /* mid B */
            320px 560px, /* mid C */
            360px 640px, /* mid D */

            140px 240px, /* fine A */
            160px 280px, /* fine B */
            180px 320px, /* fine C */
            200px 360px, /* fine D */

            100% 100%,   /* glow */
            100% 100%;   /* shimmer */

          background-position:
            12% -120%,
            76% -160%,
            44% -210%,

            20% -90%,
            52% -140%,
            86% -110%,
            66% -170%,

            10% -40%,
            36% -220%,
            62% -120%,
            88% -260%,

            50% 120%,
            50% 0%;

          mix-blend-mode: screen;
          opacity: 0.86;
          filter: blur(0.10px);
          transform: translateZ(0);

          animation:
            smEmbersFall 1.15s linear infinite,
            smEmbersFall2 1.85s linear infinite,
            smEmbersFall3 2.65s linear infinite,
            smEmbersDriftX 1.35s ease-in-out infinite,
            smEmbersFlicker 0.75s ease-in-out infinite;
        }

        @keyframes smAura{
          0% { transform: translate3d(0px,0px,0px) scale(1); opacity: 0.92; }
          50% { transform: translate3d(8px,-4px,0px) scale(1.03); opacity: 1; }
          100% { transform: translate3d(0px,0px,0px) scale(1); opacity: 0.92; }
        }

        /* Main fall (fine embers dominate) */
        @keyframes smEmbersFall{
          0%{
            background-position:
              12% -120%,
              76% -160%,
              44% -210%,

              20% -90%,
              52% -140%,
              86% -110%,
              66% -170%,

              10% -40%,
              36% -220%,
              62% -120%,
              88% -260%,

              50% 120%,
              50% 0%;
          }
          100%{
            background-position:
              12% 180%,
              76% 220%,
              44% 260%,

              20% 240%,
              52% 280%,
              86% 250%,
              66% 300%,

              10% 420%,
              36% 520%,
              62% 460%,
              88% 560%,

              50% 120%,
              50% 0%;
          }
        }

        /* Secondary fall offsets to avoid pattern lock */
        @keyframes smEmbersFall2{
          0%{ transform: translate3d(0px,0px,0px) scale(1); }
          100%{ transform: translate3d(0px,3px,0px) scale(1.01); }
        }

        /* Third layer: tiny vertical “kick” so it feels chaotic */
        @keyframes smEmbersFall3{
          0%,100%{ filter: blur(0.10px); }
          50%{ filter: blur(0.24px); }
        }

        /* Side drift (violent) */
        @keyframes smEmbersDriftX{
          0%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
          25%{ transform: translate3d(6px,-1px,0px) skewX(-0.6deg); }
          50%{ transform: translate3d(-8px,0px,0px) skewX(0.9deg); }
          75%{ transform: translate3d(5px,1px,0px) skewX(-0.4deg); }
          100%{ transform: translate3d(0px,0px,0px) skewX(0deg); }
        }

        /* Flicker (aggressive) */
        @keyframes smEmbersFlicker{
          0%,100%{ opacity: 0.78; }
          18%{ opacity: 0.92; }
          36%{ opacity: 0.80; }
          58%{ opacity: 0.95; }
          78%{ opacity: 0.84; }
        }

        @media (prefers-reduced-motion: reduce){
          .smX::before, .smX::after{ animation:none; }
        }

        .smX .topRow{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }

        /* Gothic title treatment (no external font; still legible) */
        .smX .gothTitle{
          margin: 0;
          font-weight: 1000;
          letter-spacing: 1.1px;
          font-variant: small-caps;
          font-size: clamp(30px, 7.6vw, 44px);
          line-height: 1.02;
          color: rgba(255,255,255,0.96);
          text-shadow:
            0 0 12px rgba(212,175,55,0.20),
            0 0 18px rgba(160,20,40,0.16),
            0 16px 52px rgba(0,0,0,0.68);
        }

        /* Little "blood-gold" underline rune */
        .smX .titleRune{
          display:inline-block;
          margin-top: 6px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.20);
          background:
            radial-gradient(220px 60px at 30% 0%, rgba(212,175,55,0.16), transparent 60%),
            radial-gradient(260px 80px at 80% 40%, rgba(160,20,40,0.16), transparent 62%),
            rgba(0,0,0,0.18);
          box-shadow:
            0 14px 40px rgba(0,0,0,0.35),
            0 0 18px rgba(212,175,55,0.08);
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.74);
        }
        .smX .runeDot{
          display:inline-block;
          width: 7px;
          height: 7px;
          border-radius: 999px;
          margin-right: 8px;
          background: rgba(212,175,55,0.78);
          box-shadow: 0 0 14px rgba(212,175,55,0.45);
        }

        .smX .sub{ margin-top:6px; font-size: 13px; }

        .smX .controls{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
          justify-content:flex-end;
        }

        .smX .filterRow{
          margin-top: 10px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        .smX .filterRow .full{ grid-column: 1 / -1; }

        .smX .grid{
          margin-top: 12px;
          display:grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 10px;
        }
        .smX .cardKpi{
          grid-column: span 6;
          padding: 12px;
          position: relative;
          overflow: hidden;
          transition: transform 0.12s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          border-color: rgba(255,255,255,0.10);
          box-shadow:
            0 14px 40px rgba(0,0,0,0.35),
            0 0 0 1px rgba(255,255,255,0.02) inset;
        }
        .smX .cardKpi::before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 18px;
          pointer-events:none;
          background:
            radial-gradient(600px 240px at 15% 0%, rgba(212,175,55,0.18), transparent 60%),
            radial-gradient(520px 220px at 85% 40%, rgba(160,20,40,0.14), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.04), transparent);
          opacity: 0.70;
          filter: blur(0.4px);
        }
        .smX .cardKpi:hover{
          transform: translateY(-1px);
          border-color: rgba(212,175,55,0.22);
          box-shadow:
            0 18px 55px rgba(0,0,0,0.45),
            0 0 22px rgba(212,175,55,0.10);
        }
        .smX .kpiLabel{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.70);
          position: relative;
          z-index: 1;
        }
        .smX .kpiVal{
          margin-top: 5px;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: 0.2px;
          position: relative;
          z-index: 1;
          text-shadow:
            0 0 16px rgba(212,175,55,0.12),
            0 12px 30px rgba(0,0,0,0.45);
        }

        .smX .list{
          margin-top: 12px;
          padding: 12px;
          position: relative;
          overflow: hidden;
        }
        .smX .list::before{
          content:"";
          position:absolute;
          inset:-40% -30%;
          pointer-events:none;
          background:
            linear-gradient(115deg, transparent 0%, rgba(212,175,55,0.10) 22%, transparent 45%, rgba(160,20,40,0.10) 70%, transparent 100%);
          opacity: 0.16;
          transform: rotate(-8deg);
        }

        .smX .saleRow{
          display:flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .smX .saleRow:last-child{ border-bottom:none; }
        .smX .left{ min-width: 0; }
        .smX .title{
          font-weight: 950;
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .smX .meta{
          margin-top: 3px;
          font-size: 12px;
          color: rgba(255,255,255,0.65);
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .smX .right{
          text-align:right;
          flex: 0 0 auto;
        }

        .smX .overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display:flex;
          align-items:flex-end;
          justify-content:center;
          padding: 10px;
          z-index: 500;
        }

        /* ONLY CHANGE: lift the sheet up a bit on mobile so it doesn't hug the bottom */
        .smX .sheet{
          width: min(980px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(212,175,55,0.20);
          background: rgba(8,10,18,0.92);
          box-shadow: 0 24px 70px rgba(0,0,0,0.55);
          backdrop-filter: blur(12px);
          padding: 14px;
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
          margin-bottom: calc(22px + env(safe-area-inset-bottom));
        }
        @media (max-width: 820px){
          .smX .sheet{
            margin-bottom: calc(58px + env(safe-area-inset-bottom));
          }
        }

        .smX .sheet h2{ margin:0; font-size: 16px; }
        .smX .sheet .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 900;
          font-size: 16px;
          margin-top: 12px;
        }

        input, select, textarea { font-size: 16px; }

        @media (max-width: 820px){
          .smX .cardKpi{ grid-column: span 12; }
          .smX .filterRow{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="topRow">
        <div>
          <h1 className="gothTitle">Sales Metrics</h1>

          <div className="muted sub">
            Month + Year + Seller totals. Includes avg items/sale + avg selling price/sale.
          </div>

          <div className="titleRune">
            <span className="runeDot" />
            {selectedSellerDisplay}
            {selectedSellerNickname ? <span style={{ color: "rgba(212,175,55,0.95)" }}> • {selectedSellerNickname}</span> : null}
            <span className="muted" style={{ fontWeight: 800 }}>
              {" "}
              • {monthName(month)} {year}
            </span>
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂·☁︎ ⋆.˚ ☾⭒.˚ ꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂⋆.ೃ࿔☁︎ ݁ ˖*༄꧁⎝ 𓆩༺✧༻𓆪 ⎠꧂
          </div>
        </div>

        <div className="controls">
          <button className="btn" type="button" onClick={() => setAddOpen(true)}>
            + Add Salesperson
          </button>
          <button className="btn" type="button" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> <span className="muted">{err}</span>
        </div>
      ) : null}

      {/* Filters */}
      <div className="card" style={{ padding: 12, marginTop: 10 }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Filters</div>

        <div className="filterRow">
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              Year
            </div>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              Month
            </div>
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </div>

          <div className="full">
            <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              Salesperson
            </div>

            <select className="input" value={seller} onChange={(e) => setSeller(e.target.value)}>
              <option value="ALL">All Salespeople</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.name}>
                  {displaySellerName(s.name)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid">
        <div className="card cardKpi">
          <div className="kpiLabel">Sales Count</div>
          <div className="kpiVal">{metrics.count}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Total Sales</div>
          <div className="kpiVal">{money(metrics.sumSales)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Total Profit</div>
          <div className="kpiVal">{money(metrics.sumProfit)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Avg Selling Price / Sale</div>
          <div className="kpiVal">{money(metrics.avgSellingPricePerSale)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Avg Items / Sale</div>
          <div className="kpiVal">{metrics.avgItemsPerSale.toFixed(2)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Total Fees</div>
          <div className="kpiVal">{money(metrics.sumFees)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Avg Profit / Sale</div>
          <div className="kpiVal">{money(metrics.avgProfitPerSale)}</div>
        </div>

        <div className="card cardKpi">
          <div className="kpiLabel">Total Cost (if stored)</div>
          <div className="kpiVal">{money(metrics.sumCost)}</div>
        </div>
      </div>

      {/* Recent list */}
      <div className="card list">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div style={{ fontWeight: 950 }}>Recent Sales (filtered)</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Showing {filteredSales.length}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {filteredSales.slice(0, 40).map((r) => {
            const p = r.profit != null ? toNum(r.profit, 0) : toNum(r.sale_price, 0) - toNum(r.cost, 0) - toNum(r.fees, 0);

            return (
              <div key={r.id} className="saleRow">
                <div className="left" style={{ minWidth: 0 }}>
                  <div className="title">
                    {r.seller_name ? r.seller_name : "Sale"}{" "}
                    <span className="muted" style={{ fontWeight: 900 }}>
                      • #{r.id}
                    </span>
                  </div>
                  <div className="meta">
                    {r.sale_date ?? ""}
                    {r.notes ? ` • ${r.notes}` : ""}
                  </div>
                </div>
                <div className="right">
                  <div style={{ fontWeight: 950 }}>{money(toNum(r.sale_price, 0))}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    Profit: {money(p)}
                  </div>
                </div>
              </div>
            );
          })}

          {!filteredSales.length ? <div className="muted" style={{ padding: 10 }}>No sales found for this filter.</div> : null}
        </div>
      </div>

      {/* Add salesperson sheet */}
      {addOpen ? (
        <div className="overlay" onClick={() => setAddOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div>
                <h2>Add Salesperson</h2>
                <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                  Saves to <b>{sellerTable}</b>.
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setAddOpen(false)} style={{ height: 46, borderRadius: 16 }}>
                Close
              </button>
            </div>

            <input
              className="input"
              value={newSellerName}
              onChange={(e) => setNewSellerName(e.target.value)}
              placeholder="Name (ex: Devan, Chad)"
              autoFocus
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn primary" type="button" onClick={() => void addSalesperson()} disabled={loading}>
                {loading ? "Saving…" : "Save Salesperson"}
              </button>
              <button className="btn" type="button" onClick={() => setAddOpen(false)} disabled={loading}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
