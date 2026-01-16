// src/pages/SalesMetrics.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SellerRow = {
  id: number;
  name: string;
  active?: boolean | null;
  created_at?: string | null;
};

type SaleRow = {
  id: number;
  sale_date: string | null; // YYYY-MM-DD
  seller_id: number | null;
  notes: string | null;
  created_at?: string | null;
  seller_name?: string | null; // derived
};

type SaleLineRow = {
  sale_id: number;
  item_id: number;
  units: number | null;
  price: number | null;
  fees: number | null;
};

type InvRow = {
  id: number;
  cost: number | null;
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
  if (m === "ALL") return "All time";
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

// ✅ DISPLAY NAMES (visual-only): Chad -> Chadillac, Devan -> Devan the Dude
function nicknameFor(name: string) {
  const n = norm(name);
  if (n === "chad") return "Chadillac";
  if (n === "devan") return "Devan the Dude";
  return "";
}
function displaySellerName(name: string) {
  const nick = nicknameFor(name);
  return nick || name;
}

// ✅ for styling recent rows (visual-only)
function sellerTone(name: string | null | undefined) {
  const n = norm(String(name ?? ""));
  if (n === "chad") return "chad";
  if (n === "devan") return "devan";
  return "other";
}

export default function SalesMetrics() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // filters
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [seller, setSeller] = useState<string>("ALL"); // stores REAL name

  // data
  const [sellerTable, setSellerTable] = useState<string>("sales_people");
  const [sellers, setSellers] = useState<SellerRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleLines, setSaleLines] = useState<SaleLineRow[]>([]);
  const [inv, setInv] = useState<InvRow[]>([]);

  // add salesperson sheet (kept)
  const [addOpen, setAddOpen] = useState(false);
  const [newSellerName, setNewSellerName] = useState("");

  async function detectSellerTable(): Promise<string> {
    const candidates = ["sales_people", "sale_sellers", "sellers"];
    for (const t of candidates) {
      const res = await supabase.from(t).select("id").limit(1);
      if (!res.error) return t;
    }
    return "sales_people";
  }

  async function loadAll() {
    setLoading(true);
    setErr("");

    try {
      const st = await detectSellerTable();
      setSellerTable(st);

      // 1) sellers
      const sRes = await supabase.from(st).select("id,name,active,created_at").order("name", { ascending: true });
      const sellerRows = !sRes.error ? (((sRes.data as any) ?? []) as SellerRow[]) : [];
      setSellers(sellerRows);

      // map seller_id -> name
      const sellerIdToName = new Map<number, string>();
      for (const r of sellerRows) sellerIdToName.set(Number(r.id), String(r.name ?? ""));

      // 2) sales headers
      const salesRes = await supabase
        .from("sales")
        .select("id,sale_date,created_at,notes,seller_id")
        .order("sale_date", { ascending: false })
        .limit(5000);

      if (salesRes.error) throw salesRes.error;

      const salesRows = (((salesRes.data as any) ?? []) as SaleRow[]).map((r) => ({
        ...r,
        seller_name: r.seller_id != null ? sellerIdToName.get(Number(r.seller_id)) ?? null : null,
      }));

      setSales(salesRows);

      const saleIds = salesRows.map((s) => s.id).filter(Boolean);
      if (!saleIds.length) {
        setSaleLines([]);
        setInv([]);
        setLoading(false);
        return;
      }

      // sale_lines
      const linesRes = await supabase.from("sale_lines").select("sale_id,item_id,units,price,fees").in("sale_id", saleIds);
      if (linesRes.error) throw linesRes.error;

      const linesRows = ((linesRes.data as any) ?? []) as SaleLineRow[];
      setSaleLines(linesRows);

      // inventory costs
      const itemIds = Array.from(new Set(linesRows.map((l) => l.item_id).filter(Boolean))).map(Number);
      if (!itemIds.length) {
        setInv([]);
        return;
      }

      const invRes = await supabase.from("inventory").select("id,cost").in("id", itemIds);
      if (invRes.error) throw invRes.error;
      setInv(((invRes.data as any) ?? []) as InvRow[]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSellers([]);
      setSales([]);
      setSaleLines([]);
      setInv([]);
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

  // ✅ ONLY CHANGE (logic): All-time filter for Year / Month
  const filteredSales = useMemo(() => {
    const allTime = year === "ALL" || month === "ALL";

    return sales.filter((r) => {
      const { y, m } = ymFromISO(r.sale_date);

      if (!allTime) {
        if (year && y !== year) return false;
        if (month && m !== month) return false;
      }

      if (seller !== "ALL") {
        const sName = (r.seller_name ?? "").trim();
        if (sName !== seller) return false;
      }
      return true;
    });
  }, [sales, seller, year, month]);

  const linesBySale = useMemo(() => {
    const map = new Map<number, SaleLineRow[]>();
    for (const l of saleLines) {
      const sid = Number(l.sale_id);
      const arr = map.get(sid) ?? [];
      arr.push(l);
      map.set(sid, arr);
    }
    return map;
  }, [saleLines]);

  const invCostById = useMemo(() => {
    const map = new Map<number, number>();
    for (const r of inv) map.set(Number(r.id), toNum(r.cost, 0));
    return map;
  }, [inv]);

  const metrics = useMemo(() => {
    const count = filteredSales.length;

    let sumSales = 0;
    let sumFees = 0;
    let sumCost = 0;
    let sumProfit = 0;
    let totalUnits = 0;

    for (const s of filteredSales) {
      const saleId = Number(s.id);
      const ls = linesBySale.get(saleId) ?? [];

      let salePrice = 0;
      let saleFees = 0;
      let saleCost = 0;
      let saleUnits = 0;

      for (const l of ls) {
        const price = toNum(l.price, 0);
        const fees = toNum(l.fees, 0);
        const units = Math.max(0, toNum(l.units, 0));
        const costEach = invCostById.get(Number(l.item_id)) ?? 0;

        salePrice += price;
        saleFees += fees;
        saleUnits += units;
        saleCost += costEach * units;
      }

      sumSales += salePrice;
      sumFees += saleFees;
      sumCost += saleCost;
      totalUnits += saleUnits;
      sumProfit += salePrice - saleFees - saleCost;
    }

    return {
      count,
      sumSales,
      sumProfit,
      sumFees,
      sumCost,
      avgSellingPricePerSale: count ? sumSales / count : 0,
      avgItemsPerSale: count ? totalUnits / count : 0,
      avgProfitPerSale: count ? sumProfit / count : 0,
    };
  }, [filteredSales, linesBySale, invCostById]);

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

  const timeLabel = useMemo(() => {
    const allTime = year === "ALL" || month === "ALL";
    if (allTime) return "All time";
    return `${monthName(month)} ${year}`;
  }, [year, month]);

  return (
    <div className="page smX">
      {/* ✅ VISUAL ONLY: Platinum / diamond black+white theme. Function unchanged. */}
      <style>{`
        .smX{
          position: relative;
          isolation: isolate;
          overflow: hidden;
        }
        .smX > *{ position: relative; z-index: 2; }

        /* =========================================================
           DIAMOND STUDDED BACKDROP (VISUAL ONLY)
           - Black/white/gray
           - Subtle "flutter" shimmer
           ========================================================= */
        .smX::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events:none;
          background:
            radial-gradient(1100px 680px at 18% 6%, rgba(255,255,255,0.08), transparent 62%),
            radial-gradient(980px 640px at 86% 18%, rgba(255,255,255,0.06), transparent 64%),
            radial-gradient(900px 620px at 45% 98%, rgba(0,0,0,0.86), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.86));
          opacity: 1;
        }

        /* Diamond pattern + sparkle caustics */
        .smX::after{
          content:"";
          position: fixed;
          inset: -60px;
          z-index: 1;
          pointer-events:none;
          opacity: 0.75;
          mix-blend-mode: screen;
          filter: saturate(0.85) contrast(1.12);
          background:
            /* DIAMOND GRID (two diagonals) */
            repeating-linear-gradient(45deg,
              rgba(255,255,255,0.00) 0 18px,
              rgba(255,255,255,0.06) 19px,
              rgba(255,255,255,0.00) 38px
            ),
            repeating-linear-gradient(-45deg,
              rgba(255,255,255,0.00) 0 18px,
              rgba(255,255,255,0.05) 19px,
              rgba(255,255,255,0.00) 38px
            ),
            /* sparkle flecks */
            radial-gradient(circle at 18% 22%, rgba(255,255,255,0.18), rgba(255,255,255,0.00) 22%),
            radial-gradient(circle at 72% 34%, rgba(255,255,255,0.14), rgba(255,255,255,0.00) 24%),
            radial-gradient(circle at 40% 68%, rgba(255,255,255,0.10), rgba(255,255,255,0.00) 28%);
          animation: diamondFlutter 7.2s ease-in-out infinite;
          transform: translateZ(0);
        }

        @keyframes diamondFlutter{
          0%   { transform: translate3d(0px,0px,0px) rotate(0.001deg); opacity: 0.58; filter: blur(0.2px); }
          35%  { transform: translate3d(10px,-8px,0px) rotate(0.001deg); opacity: 0.82; filter: blur(0.0px); }
          70%  { transform: translate3d(-8px,6px,0px) rotate(0.001deg); opacity: 0.72; filter: blur(0.15px); }
          100% { transform: translate3d(0px,0px,0px) rotate(0.001deg); opacity: 0.58; filter: blur(0.2px); }
        }

        @media (prefers-reduced-motion: reduce){
          .smX::after{ animation:none; }
        }

        /* =========================================================
           TOP AREA
           ========================================================= */
        .smX .topRow{
          display:flex; align-items:flex-start; justify-content: space-between;
          gap: 12px; flex-wrap: wrap; margin-bottom: 10px;
        }
        .smX .controls{
          display:flex; gap: 10px; flex-wrap: wrap; align-items:center; justify-content:flex-end;
        }

        /* =========================================================
           DIAMOND TITLE (VISUAL ONLY)
           ========================================================= */
        .salesTitleWrap{
          display: inline-flex;
          align-items: center;
          gap: 10px;
          position: relative;
        }

        .salesTitle{
          margin: 0;
          font-weight: 1000;
          letter-spacing: 1.2px;
          text-transform: uppercase;
          line-height: 1.02;
          position: relative;

          /* diamond gradient text */
          background: linear-gradient(90deg,
            rgba(255,255,255,0.98),
            rgba(210,210,210,0.98),
            rgba(255,255,255,0.95),
            rgba(160,160,160,0.98),
            rgba(255,255,255,0.98)
          );
          background-size: 240% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;

          text-shadow:
            0 0 18px rgba(255,255,255,0.10),
            0 0 28px rgba(255,255,255,0.08),
            0 20px 70px rgba(0,0,0,0.80);

          animation: titleDiamondSheen 2.8s linear infinite;
        }

        /* shimmer sweep across title */
        .salesTitle::after{
          content:"";
          position:absolute;
          inset: -6px -18px -6px -18px;
          border-radius: 16px;
          pointer-events:none;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 35%,
            rgba(255,255,255,0.25) 45%,
            rgba(255,255,255,0.08) 55%,
            transparent 70%
          );
          transform: translateX(-70%) skewX(-10deg);
          mix-blend-mode: screen;
          opacity: 0.85;
          animation: titleSweep 3.0s linear infinite;
        }

        @keyframes titleDiamondSheen{
          0%   { background-position: 0% 50%; }
          100% { background-position: 240% 50%; }
        }
        @keyframes titleSweep{
          0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          45%  { opacity: 0.95; }
          100% { transform: translateX(70%) skewX(-10deg); opacity: 0.60; }
        }

        .salesBadge{
          height: 26px;
          padding: 0 10px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.7px;
          color: rgba(255,255,255,0.88);
          border: 1px solid rgba(255,255,255,0.16);
          background:
            radial-gradient(160px 44px at 30% 10%, rgba(255,255,255,0.12), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,0.10), rgba(0,0,0,0.55));
          box-shadow:
            0 0 0 2px rgba(255,255,255,0.06),
            0 12px 32px rgba(0,0,0,0.45),
            0 0 22px rgba(255,255,255,0.08);
          user-select: none;
        }

        @media (max-width: 420px){
          .salesTitle{ font-size: 26px; }
        }

        /* =========================================================
           FILTERS + GRID
           ========================================================= */
        .smX .filterRow{
          margin-top: 10px; display:grid; grid-template-columns: 1fr 1fr; gap: 10px;
        }
        .smX .filterRow .full{ grid-column: 1 / -1; }

        .smX .grid{
          margin-top: 12px; display:grid; grid-template-columns: repeat(12, 1fr); gap: 10px;
        }

        /* KPI cards: platinum glass (visual only) */
        .smX .cardKpi{
          grid-column: span 6;
          padding: 12px;
          position: relative;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(0,0,0,0.30);
          backdrop-filter: blur(12px);
          box-shadow:
            0 18px 60px rgba(0,0,0,0.55),
            0 0 0 1px rgba(255,255,255,0.04) inset;
          transition: transform 0.14s ease, box-shadow 0.22s ease, border-color 0.22s ease, filter 0.22s ease;
        }

        .smX .cardKpi::before{
          content:"";
          position:absolute;
          inset:-2px;
          pointer-events:none;
          background:
            radial-gradient(720px 260px at 15% 0%, rgba(255,255,255,0.10), transparent 60%),
            radial-gradient(640px 240px at 85% 40%, rgba(255,255,255,0.08), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.06), transparent);
          opacity: 0.80;
          mix-blend-mode: screen;
        }

        .smX .cardKpi:hover{
          transform: translateY(-2px);
          border-color: rgba(255,255,255,0.26);
          box-shadow:
            0 22px 80px rgba(0,0,0,0.62),
            0 0 30px rgba(255,255,255,0.10);
          filter: brightness(1.06);
        }

        .smX .kpiLabel{
          font-size: 12px; font-weight: 950; color: rgba(255,255,255,0.72);
          position: relative; z-index: 1;
          text-shadow: 0 0 12px rgba(0,0,0,0.40);
        }

        .smX .kpiVal{
          margin-top: 5px; font-size: 22px; font-weight: 950;
          position: relative; z-index: 1;
          text-shadow:
            0 0 18px rgba(255,255,255,0.10),
            0 12px 34px rgba(0,0,0,0.65);
        }

        /* =========================================================
           BUTTON POP: premium platinum pulse (visual-only)
           ========================================================= */
        .btnPop{
          position: relative;
          isolation: isolate;
          transform: translateZ(0);
          border-color: rgba(255,255,255,0.22) !important;
          box-shadow:
            0 0 0 2px rgba(255,255,255,0.08),
            0 16px 40px rgba(0,0,0,0.44),
            0 0 28px rgba(255,255,255,0.10);
          animation: btnPopPulse 1.2s ease-in-out infinite;
        }
        .btnPop::before{
          content:"";
          position:absolute;
          inset:-3px;
          border-radius: inherit;
          pointer-events:none;
          background:
            radial-gradient(240px 90px at 30% 10%, rgba(255,255,255,0.22), transparent 65%),
            radial-gradient(260px 110px at 70% 40%, rgba(255,255,255,0.16), transparent 70%),
            linear-gradient(90deg, rgba(255,255,255,0.00), rgba(255,255,255,0.26), rgba(255,255,255,0.00));
          mix-blend-mode: screen;
          opacity: 0.72;
          filter: blur(0.1px);
          animation: btnPopSheen 1.8s linear infinite;
        }
        .btnPop::after{
          content:"";
          position:absolute;
          inset:-10px;
          border-radius: inherit;
          pointer-events:none;
          background: radial-gradient(closest-side, rgba(255,255,255,0.22), transparent 70%);
          opacity: 0.0;
          animation: btnPopRing 1.2s ease-out infinite;
        }

        @keyframes btnPopPulse{
          0%   { transform: translateY(0px) scale(1); filter: brightness(1.02) saturate(0.95); }
          50%  { transform: translateY(-1px) scale(1.02); filter: brightness(1.18) saturate(1.02); }
          100% { transform: translateY(0px) scale(1); filter: brightness(1.02) saturate(0.95); }
        }
        @keyframes btnPopSheen{
          0%   { background-position: -120% 0%; opacity: 0.55; }
          40%  { opacity: 0.95; }
          100% { background-position: 220% 0%; opacity: 0.55; }
        }
        @keyframes btnPopRing{
          0%   { opacity: 0.30; transform: scale(0.92); }
          60%  { opacity: 0.10; transform: scale(1.18); }
          100% { opacity: 0.0; transform: scale(1.28); }
        }

        @media (prefers-reduced-motion: reduce){
          .btnPop{ animation:none; }
          .btnPop::before, .btnPop::after{ animation:none; }
          .salesTitle{ animation:none; }
          .salesTitle::after{ animation:none; }
        }

        /* =========================================================
           RECENT SALES LIST (function unchanged) - subtle platinum hover
           ========================================================= */
        .smX .list{ margin-top: 12px; padding: 12px; background: rgba(0,0,0,0.26); border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; backdrop-filter: blur(12px); }
        .smX .saleRow{
          display:flex; justify-content: space-between; gap: 10px; padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .smX .saleRow:last-child{ border-bottom:none; }
        .smX .left{ min-width: 0; }
        .smX .title{
          font-weight: 950; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .smX .meta{
          margin-top: 3px; font-size: 12px; color: rgba(255,255,255,0.65);
          overflow:hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .smX .right{ text-align:right; flex: 0 0 auto; }

        /* platinum frame per seller (visual only) */
        .saleGlow{
          position: relative;
          padding: 10px 0;
          margin: 0;
        }
        .saleGlow::before{
          content:"";
          position:absolute;
          left: -10px;
          right: -10px;
          top: 0px;
          bottom: 0px;
          border-radius: 14px;
          pointer-events:none;
          opacity: 0.0;
          transform: scale(0.995);
          transition: opacity .18s ease, transform .18s ease;
          background:
            radial-gradient(420px 90px at 22% 40%, rgba(255,255,255,0.10), transparent 70%),
            radial-gradient(520px 110px at 82% 40%, rgba(255,255,255,0.08), transparent 72%),
            linear-gradient(90deg, rgba(255,255,255,0.00), rgba(255,255,255,0.14), rgba(255,255,255,0.00));
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.10) inset,
            0 0 24px rgba(255,255,255,0.06);
        }
        .saleGlow:hover::before{
          opacity: 0.78;
          transform: scale(1);
        }

        /* Slightly different tints (still black/white) */
        .saleGlow.chad::before{ filter: hue-rotate(8deg) brightness(1.02); }
        .saleGlow.devan::before{ filter: hue-rotate(-8deg) brightness(1.02); }
        .saleGlow.other::before{ filter: brightness(0.98); }

        /* Modal */
        .smX .overlay{
          position: fixed; inset: 0; background: rgba(0,0,0,0.78);
          display:flex; align-items:flex-end; justify-content:center; padding: 10px; z-index: 500;
        }
        .smX .sheet{
          width: min(980px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(255,255,255,0.18);
          background: rgba(8,10,14,0.92);
          padding: 14px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.70), 0 0 30px rgba(255,255,255,0.08);
          backdrop-filter: blur(14px);
        }

        input, select, textarea { font-size: 16px; }

        @media (max-width: 820px){
          .smX .cardKpi{ grid-column: span 12; }
          .smX .filterRow{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="topRow">
        <div>
          {/* ✅ visual-only: diamond title (text updated to "Sales Metrics") */}
          <div className="salesTitleWrap">
            <h1 className="salesTitle">Sales Metrics</h1>
            <span className="salesBadge">PLATINUM</span>
          </div>

          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Premium performance overview
          </div>

          {/* Just a small visual label line (no behavior change) */}
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 900, color: "rgba(255,255,255,0.74)" }}>
            {selectedSellerDisplay}
            {selectedSellerNickname ? <span style={{ color: "rgba(255,255,255,0.92)" }}> • {selectedSellerNickname}</span> : null}
            <span className="muted" style={{ fontWeight: 800 }}>
              {" "}
              • {timeLabel}
            </span>
          </div>
        </div>

        <div className="controls">
          {/* ✅ visual-only: platinum glow/pulse */}
          <button className="btn btnPop" type="button" onClick={() => setAddOpen(true)}>
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

      <div className="card" style={{ padding: 12, marginTop: 10, background: "rgba(0,0,0,0.26)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 18, backdropFilter: "blur(12px)" }}>
        <div style={{ fontWeight: 950, marginBottom: 8 }}>Filters</div>

        <div className="filterRow">
          <div>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              Year
            </div>

            {/* ✅ Added: ALL */}
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="ALL">All time</option>
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

            {/* ✅ Added: ALL */}
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="ALL">All time</option>
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

      <div className="card list">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <div style={{ fontWeight: 950 }}>Recent Sales (filtered)</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Showing {filteredSales.length}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {filteredSales.slice(0, 40).map((r) => {
            const ls = linesBySale.get(Number(r.id)) ?? [];
            let saleTotal = 0;
            let feeTotal = 0;
            let costTotal = 0;

            for (const l of ls) {
              const price = toNum(l.price, 0);
              const fees = toNum(l.fees, 0);
              const units = Math.max(0, toNum(l.units, 0));
              const costEach = invCostById.get(Number(l.item_id)) ?? 0;

              saleTotal += price;
              feeTotal += fees;
              costTotal += costEach * units;
            }

            const p = saleTotal - feeTotal - costTotal;
            const tone = sellerTone(r.seller_name);

            return (
              <div key={r.id} className={`saleRow saleGlow ${tone}`}>
                <div className="left" style={{ minWidth: 0 }}>
                  <div className="title">
                    {r.seller_name ? displaySellerName(r.seller_name) : "Sale"}{" "}
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
                  <div style={{ fontWeight: 950 }}>{money(saleTotal)}</div>
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

      {addOpen ? (
        <div className="overlay" onClick={() => setAddOpen(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 16 }}>Add Salesperson</h2>
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
              style={{ marginTop: 12 }}
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
