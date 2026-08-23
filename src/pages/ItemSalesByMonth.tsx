import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { supabase } from "../supabaseClient";

type Timeframe = "month" | "last3" | "last6" | "last12" | "year" | "all";

type SaleRow = {
  id: number;
  sale_date: string | null;
};

type SaleLineRow = {
  sale_id: number;
  item_id: number;
  units: number | null;
  price: number | null;
  fees: number | null;
};

type InventoryRow = {
  id: number;
  item?: string | null;
  name?: string | null;
  cost?: number | null;
  category?: string | null;
};

type ItemMonthStat = {
  itemName: string;
  units: number;
  profit: number;
  share: number;
};

type ItemPeriodStat = {
  itemName: string;
  units: number;
  profit: number;
  share: number;
};

type MonthStat = {
  monthKey: string;
  monthLabel: string;
  totalProfit: number;
  totalUnits: number;
  items: ItemMonthStat[];
};

const MONTHS = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
const MONTH_LABELS: Record<string, string> = {
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

function toNum(v: any, fallback = 0) {
  if (v == null || v === "") return fallback;
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function monthKeyFromISO(iso: string | null) {
  if (!iso || iso.length < 7) return "";
  return iso.slice(0, 7);
}

function monthLabelFromKey(key: string) {
  if (!key || key.length < 7) return "";
  const [year, month] = key.split("-");
  return `${MONTH_LABELS[month] ?? month} ${year}`;
}

function addMonthsToKey(key: string, delta: number) {
  const [yearPart, monthPart] = key.split("-");
  let year = Number(yearPart);
  let month = Number(monthPart);

  month += delta;
  while (month > 12) {
    month -= 12;
    year += 1;
  }
  while (month < 1) {
    month += 12;
    year -= 1;
  }

  return `${year}-${String(month).padStart(2, "0")}`;
}

function rangeForTimeframe(timeframe: Timeframe, selectedYear: string, selectedMonth: string) {
  const reference = `${selectedYear}-${selectedMonth}`;

  if (timeframe === "month") return [reference];
  if (timeframe === "year") {
    return Array.from({ length: 12 }, (_, i) => `${selectedYear}-${String(i + 1).padStart(2, "0")}`);
  }

  const count = timeframe === "last3" ? 3 : timeframe === "last6" ? 6 : timeframe === "last12" ? 12 : 1;
  const items: string[] = [];
  let cursor = reference;

  for (let i = 0; i < count; i += 1) {
    items.push(cursor);
    cursor = addMonthsToKey(cursor, -1);
  }

  return items.reverse();
}

async function fetchInventoryRows() {
  const candidates = [
    "id,item,name,cost,category",
    "id,name,cost,category",
    "id,item,cost,category",
    "id,item,name,cost",
    "id,name,cost",
    "id,item,cost",
  ];

  for (const select of candidates) {
    const { data, error } = await supabase.from("inventory").select(select);
    if (!error && Array.isArray(data)) {
      return data as unknown as InventoryRow[];
    }
  }

  return [] as InventoryRow[];
}

export default function ItemSalesByMonth() {
  const now = new Date();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("last6");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, "0"));
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleLines, setSaleLines] = useState<SaleLineRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);

  const monthRange = useMemo(() => {
    if (timeframe !== "all") {
      return rangeForTimeframe(timeframe, year, month);
    }

    const keys = sales
      .map((s) => monthKeyFromISO(s.sale_date))
      .filter((k) => Boolean(k))
      .sort();

    if (!keys.length) {
      return [`${year}-${month}`];
    }

    const first = keys[0];
    const last = keys[keys.length - 1];

    const allMonths: string[] = [];
    let cursor = first;
    let guard = 0;

    while (cursor <= last && guard < 1000) {
      allMonths.push(cursor);
      cursor = addMonthsToKey(cursor, 1);
      guard += 1;
    }

    return allMonths;
  }, [timeframe, year, month, sales]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErr("");

      try {
        const [salesRes, linesRes, invRows] = await Promise.all([
          supabase.from("sales").select("id,sale_date").order("sale_date", { ascending: false }),
          supabase.from("sale_lines").select("sale_id,item_id,units,price,fees"),
          fetchInventoryRows(),
        ]);

        if (salesRes.error) throw salesRes.error;
        if (linesRes.error) throw linesRes.error;

        setSales((salesRes.data as SaleRow[]) ?? []);
        setSaleLines((linesRes.data as SaleLineRow[]) ?? []);
        setInventory(invRows ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Unable to load item sales.");
        setSales([]);
        setSaleLines([]);
        setInventory([]);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const inventoryById = useMemo(() => {
    const map = new Map<number, InventoryRow>();
    for (const item of inventory) map.set(Number(item.id), item);
    return map;
  }, [inventory]);

  const monthStats = useMemo<MonthStat[]>(() => {
    const entries = monthRange.map((monthKey: string) => {
      const monthSales = new Map<string, { units: number; profit: number }>();
      const selectedSaleIds = new Set<number>();

      for (const sale of sales) {
        if (monthKeyFromISO(sale.sale_date) === monthKey) {
          selectedSaleIds.add(Number(sale.id));
        }
      }

      for (const line of saleLines) {
        if (!selectedSaleIds.has(Number(line.sale_id))) continue;
        const item = inventoryById.get(Number(line.item_id));
        const itemName = String(item?.name ?? item?.item ?? `Item #${line.item_id}`).trim() || `Item #${line.item_id}`;
        const units = Math.max(0, toNum(line.units, 0));
        const price = toNum(line.price, 0);
        const fees = Math.max(0, toNum(line.fees, 0));
        const cost = Math.max(0, toNum(item?.cost, 0));
        const profit = price - fees - cost * units;

        const current = monthSales.get(itemName) ?? { units: 0, profit: 0 };
        current.units += units;
        current.profit += profit;
        monthSales.set(itemName, current);
      }

      const totalProfit = Array.from(monthSales.values()).reduce((sum: number, item) => sum + item.profit, 0);
      const totalUnits = Array.from(monthSales.values()).reduce((sum: number, item) => sum + item.units, 0);

      const items = Array.from(monthSales.entries())
        .map(([itemName, values]) => ({
          itemName,
          units: values.units,
          profit: values.profit,
          share: totalProfit > 0 ? (values.profit / totalProfit) * 100 : 0,
        }))
        .sort((a: ItemMonthStat, b: ItemMonthStat) => b.profit - a.profit || b.units - a.units);

      return {
        monthKey,
        monthLabel: monthLabelFromKey(monthKey),
        totalProfit,
        totalUnits,
        items,
      };
    });

    return entries;
  }, [monthRange, sales, saleLines, inventoryById]);

  const allRows = useMemo(() => {
    return monthStats.flatMap((month: MonthStat) =>
      month.items.map((item: ItemMonthStat) => ({
        monthKey: month.monthKey,
        monthLabel: month.monthLabel,
        itemName: item.itemName,
        units: item.units,
        profit: item.profit,
        share: item.share,
      }))
    );
  }, [monthStats]);

  const groupedRows = useMemo<ItemPeriodStat[]>(() => {
    const byItem = new Map<string, { units: number; profit: number }>();

    for (const row of allRows) {
      const current = byItem.get(row.itemName) ?? { units: 0, profit: 0 };
      current.units += row.units;
      current.profit += row.profit;
      byItem.set(row.itemName, current);
    }

    const totalProfit = allRows.reduce((sum, row) => sum + row.profit, 0);

    return Array.from(byItem.entries())
      .map(([itemName, values]) => ({
        itemName,
        units: values.units,
        profit: values.profit,
        share: totalProfit > 0 ? (values.profit / totalProfit) * 100 : 0,
      }))
      .sort((a, b) => b.units - a.units || b.profit - a.profit);
  }, [allRows]);

  const selectedPeriodTotalProfit = useMemo(
    () => monthStats.reduce((sum: number, month: MonthStat) => sum + month.totalProfit, 0),
    [monthStats]
  );

  const selectedPeriodTotalUnits = useMemo(
    () => monthStats.reduce((sum: number, month: MonthStat) => sum + month.totalUnits, 0),
    [monthStats]
  );

  const topItem = useMemo(() => {
    const ranked = groupedRows
      .slice()
      .sort((a: { units: number; profit: number }, b: { units: number; profit: number }) => b.units - a.units || b.profit - a.profit);
    return ranked[0] ?? null;
  }, [groupedRows]);

  const topMonth = useMemo(() => {
    if (!monthStats.length) return null;
    return monthStats.slice().sort((a: MonthStat, b: MonthStat) => b.totalProfit - a.totalProfit)[0];
  }, [monthStats]);

  const timeframeLabel = useMemo(() => {
    if (timeframe === "month") return `${monthLabelFromKey(`${year}-${month}`)}`;
    if (timeframe === "year") return `${year}`;
    if (timeframe === "last3") return `Last 3 months`;
    if (timeframe === "last6") return `Last 6 months`;
    if (timeframe === "all") return `All time`;
    return `Last 12 months`;
  }, [timeframe, year, month]);

  return (
    <div style={{ padding: "20px 16px 32px", color: "rgba(255,255,255,0.95)", fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: "linear-gradient(135deg, rgba(10,10,12,0.98) 0%, rgba(15,10,15,0.98) 100%)" }}>
      <style>{`
        /* ===== MODERN RED & BLACK COLOR SCHEME ===== */
        
        .itemSalesCard { 
          background: linear-gradient(135deg, rgba(20, 14, 16, 0.85) 0%, rgba(25, 16, 20, 0.85) 100%); 
          border: 1px solid rgba(220, 50, 60, 0.25); 
          border-radius: 16px; 
          box-shadow: 
            0 20px 50px rgba(0, 0, 0, 0.5),
            0 0 60px rgba(220, 50, 60, 0.15),
            inset 0 1px 0 rgba(255,255,255,0.08);
          backdrop-filter: blur(14px);
        }
        
        .itemSalesTitle { 
          margin: 0; 
          font-size: clamp(32px, 6vw, 48px); 
          font-weight: 900; 
          letter-spacing: 0.03em; 
          background: linear-gradient(135deg, #ff5555 0%, #cc3333 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          text-shadow: 0 20px 40px rgba(220, 50, 60, 0.3);
          filter: drop-shadow(0 10px 30px rgba(220, 50, 60, 0.2));
        }
        
        .itemSalesSubtitle { 
          margin-top: 8px; 
          color: rgba(255,255,255,0.65); 
          font-size: 14px; 
          font-weight: 600; 
          letter-spacing: 0.02em;
        }
        
        .filterSection { display: flex; flex-direction: column; gap: 16px; }
        
        .quickTimeframes { 
          display: flex; 
          gap: 10px; 
          flex-wrap: wrap; 
        }
        
        .quickBtn { 
          padding: 10px 16px; 
          border-radius: 12px; 
          border: 1.5px solid rgba(220, 50, 60, 0.3); 
          background: rgba(30, 20, 22, 0.6);
          color: rgba(255,255,255,0.85); 
          cursor: pointer; 
          font-weight: 700; 
          font-size: 13px; 
          white-space: nowrap; 
          transition: all 0.3s cubic-bezier(0.23, 1, 0.320, 1);
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }
        
        .quickBtn:hover { 
          border-color: rgba(220, 80, 90, 0.6); 
          background: rgba(50, 25, 28, 0.8);
          box-shadow: 0 6px 20px rgba(220, 50, 60, 0.25);
          transform: translateY(-2px);
        }
        
        .quickBtn.active { 
          border-color: rgba(255, 80, 90, 0.8); 
          background: linear-gradient(135deg, rgba(220, 50, 60, 0.4) 0%, rgba(180, 30, 40, 0.4) 100%);
          color: rgba(255, 200, 200, 1); 
          box-shadow: 
            0 8px 24px rgba(220, 50, 60, 0.4),
            inset 0 1px 0 rgba(255,255,255,0.1);
          font-weight: 800;
        }
        
        .detailedFilters { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); 
          gap: 14px; 
        }
        
        .field { display: flex; flex-direction: column; gap: 8px; }
        
        .field label { 
          font-size: 12px; 
          font-weight: 800; 
          letter-spacing: 0.06em; 
          text-transform: uppercase; 
          color: rgba(255, 150, 160, 0.8);
          text-shadow: 0 2px 8px rgba(220, 50, 60, 0.15);
        }
        
        .field select, .field input { 
          border: 1.5px solid rgba(220, 50, 60, 0.3); 
          border-radius: 11px; 
          background: rgba(18, 12, 14, 0.8);
          color: rgba(255,255,255,0.92); 
          padding: 12px 14px; 
          font-size: 14px; 
          min-height: 44px; 
          cursor: pointer; 
          outline: none;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          transition: all 0.25s ease;
          font-weight: 500;
        }
        
        .field select:hover, .field input:hover { 
          border-color: rgba(220, 80, 90, 0.5);
          box-shadow: 0 6px 16px rgba(220, 50, 60, 0.2);
        }
        
        .field select:focus, .field input:focus { 
          border-color: rgba(255, 100, 110, 0.7);
          box-shadow: 0 0 0 3px rgba(220, 50, 60, 0.15), 0 8px 20px rgba(220, 50, 60, 0.25);
        }
        
        .field select option { 
          background: rgba(18, 12, 14, 0.95); 
          color: rgba(255,255,255,0.92); 
          padding: 10px 14px;
        }
        
        .kpiGrid { 
          display: grid; 
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); 
          gap: 14px; 
          margin: 20px 0; 
        }
        
        .kpiBox { 
          padding: 18px; 
          border-radius: 14px;
          border: 1px solid rgba(220, 50, 60, 0.2);
          background: linear-gradient(135deg, rgba(35, 20, 23, 0.7) 0%, rgba(28, 16, 20, 0.7) 100%);
          box-shadow: 
            0 10px 30px rgba(0, 0, 0, 0.4),
            0 0 30px rgba(220, 50, 60, 0.12),
            inset 0 1px 0 rgba(255,255,255,0.06);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        
        .kpiBox:hover {
          border-color: rgba(220, 80, 90, 0.4);
          box-shadow: 
            0 14px 40px rgba(220, 50, 60, 0.25),
            0 0 40px rgba(220, 50, 60, 0.15),
            inset 0 1px 0 rgba(255,255,255,0.08);
          transform: translateY(-4px);
        }
        
        .kpiBox::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent 0%, rgba(220, 80, 90, 0.5) 50%, transparent 100%);
          opacity: 0;
          animation: shimmer 2.5s ease-in-out infinite;
        }
        
        @keyframes shimmer {
          0% { opacity: 0; }
          50% { opacity: 1; }
          100% { opacity: 0; }
        }
        
        .kpiLabel { 
          font-size: 12px; 
          font-weight: 800; 
          letter-spacing: 0.08em; 
          text-transform: uppercase; 
          color: rgba(255, 150, 160, 0.75);
        }
        
        .kpiValue { 
          margin-top: 10px; 
          font-size: clamp(20px, 3.5vw, 28px); 
          font-weight: 900;
          color: rgba(255, 200, 200, 0.95);
          text-shadow: 0 4px 12px rgba(220, 50, 60, 0.25);
        }
        
        .itemsList { 
          display: grid; 
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); 
          gap: 14px; 
        }
        
        .itemCard { 
          padding: 16px; 
          border-radius: 14px; 
          border: 1.5px solid rgba(220, 50, 60, 0.25); 
          background: linear-gradient(135deg, rgba(25, 16, 20, 0.8) 0%, rgba(20, 12, 16, 0.8) 100%);
          box-shadow: 
            0 8px 24px rgba(0,0,0,0.4),
            0 0 20px rgba(220, 50, 60, 0.1),
            inset 0 1px 0 rgba(255,255,255,0.05);
          transition: all 0.3s cubic-bezier(0.23, 1, 0.320, 1);
          position: relative;
          overflow: hidden;
        }
        
        .itemCard::before {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.05) 50%, transparent 100%);
          transition: left 0.5s ease;
        }
        
        .itemCard:hover {
          border-color: rgba(255, 80, 90, 0.5);
          box-shadow: 
            0 12px 32px rgba(220, 50, 60, 0.3),
            0 0 30px rgba(220, 50, 60, 0.15),
            inset 0 1px 0 rgba(255,255,255,0.08);
          transform: translateY(-4px);
          background: linear-gradient(135deg, rgba(35, 20, 25, 0.9) 0%, rgba(28, 16, 22, 0.9) 100%);
        }
        
        .itemCard:hover::before {
          left: 100%;
        }
        
        .itemName { 
          font-weight: 800; 
          font-size: 15px; 
          color: rgba(255, 180, 190, 1); 
          overflow: hidden; 
          text-overflow: ellipsis; 
          white-space: nowrap; 
          margin-bottom: 10px;
          text-shadow: 0 2px 8px rgba(220, 50, 60, 0.15);
        }
        
        .itemStats { 
          display: flex; 
          flex-direction: column; 
          gap: 8px; 
          font-size: 13px; 
        }
        
        .itemStat { 
          display: flex; 
          justify-content: space-between; 
          gap: 10px;
          align-items: center;
        }
        
        .itemStat label { 
          color: rgba(255,255,255,0.6); 
          font-weight: 700;
          text-transform: capitalize;
          font-size: 12px;
        }
        
        .itemStat value { 
          color: rgba(255, 200, 210, 0.95); 
          font-weight: 800;
          text-align: right;
        }
        
        .percentBar { 
          width: 100%; 
          height: 8px; 
          background: rgba(220, 50, 60, 0.12);
          border-radius: 999px; 
          overflow: hidden; 
          margin-top: 10px;
          box-shadow: inset 0 2px 6px rgba(0,0,0,0.3);
        }
        
        .percentFill { 
          height: 100%; 
          background: linear-gradient(90deg, rgba(220, 50, 60, 0.9), rgba(255, 100, 110, 0.9));
          border-radius: inherit;
          box-shadow: 0 0 12px rgba(255, 100, 110, 0.4);
        }
        
        .noData { 
          padding: 40px 20px; 
          text-align: center; 
          color: rgba(255,255,255,0.6); 
          font-size: 15px;
          font-weight: 500;
        }
        
        .errorBox {
          padding: 14px 16px;
          border-radius: 12px;
          border: 1.5px solid rgba(255, 100, 100, 0.4);
          background: rgba(50, 20, 20, 0.6);
          box-shadow: 0 4px 12px rgba(220, 50, 60, 0.2);
          margin-top: 16px;
        }
        
        .errorBox strong {
          color: rgba(255, 150, 150, 0.95);
        }
        
        .errorBox span {
          color: rgba(255,255,255,0.7);
        }
        
        @media (max-width: 768px) {
          .detailedFilters { grid-template-columns: repeat(2, 1fr); }
          .itemsList { grid-template-columns: 1fr; }
          .kpiGrid { grid-template-columns: repeat(2, 1fr); }
          .quickBtn { flex: 1; text-align: center; }
          .quickTimeframes { gap: 8px; }
        }
        
        @media (max-width: 480px) {
          .detailedFilters { grid-template-columns: 1fr; }
          .kpiGrid { grid-template-columns: 1fr; }
          .itemsList { grid-template-columns: 1fr; }
          .quickTimeframes { gap: 6px; }
          .quickBtn { padding: 8px 12px; font-size: 12px; }
          .itemSalesTitle { font-size: clamp(26px, 5vw, 36px); }
          .kpiBox { padding: 14px; }
          .itemCard { padding: 14px; }
        }
      `}</style>

      <div style={{ marginBottom: 16 }}>
        <h1 className="itemSalesTitle">Item % Sales</h1>
        <div className="itemSalesSubtitle">Track your product sales mix and profit percentages by timeframe</div>
      </div>

      <div className="itemSalesCard" style={{ padding: 20 }}>
        <div className="filterSection">
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255, 150, 160, 0.8)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>⚡ Quick select</div>
            <div className="quickTimeframes">
              <button className={`quickBtn ${timeframe === "month" ? "active" : ""}`} onClick={() => setTimeframe("month")}>This month</button>
              <button className={`quickBtn ${timeframe === "last3" ? "active" : ""}`} onClick={() => setTimeframe("last3")}>Last 3</button>
              <button className={`quickBtn ${timeframe === "last6" ? "active" : ""}`} onClick={() => setTimeframe("last6")}>Last 6</button>
              <button className={`quickBtn ${timeframe === "last12" ? "active" : ""}`} onClick={() => setTimeframe("last12")}>Last 12</button>
              <button className={`quickBtn ${timeframe === "year" ? "active" : ""}`} onClick={() => setTimeframe("year")}>Full year</button>
              <button className={`quickBtn ${timeframe === "all" ? "active" : ""}`} onClick={() => setTimeframe("all")}>All time</button>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: "rgba(255, 150, 160, 0.8)", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>📅 Or pick specific dates</div>
            <div className="detailedFilters">
              <div className="field">
                <label>Year</label>
                <select value={year} onChange={(e: ChangeEvent<HTMLSelectElement>) => setYear(e.target.value)}>
                  {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).sort((a, b) => b - a).map((y) => (<option key={y} value={String(y)}>{y}</option>))}
                </select>
              </div>
              <div className="field">
                <label>Month</label>
                <select value={month} onChange={(e: ChangeEvent<HTMLSelectElement>) => setMonth(e.target.value)}>
                  {MONTHS.map((m) => (<option key={m} value={m}>{MONTH_LABELS[m]}</option>))}
                </select>
              </div>
              <div className="field">
                <label>Viewing</label>
                <input value={timeframeLabel} readOnly style={{ fontWeight: 700 }} />
              </div>
            </div>
          </div>
        </div>

        {err && <div className="errorBox"><strong style={{ color: "#ffaaaa" }}>Error:</strong> <span>{err}</span></div>}

        <div className="kpiGrid">
          <div className="itemSalesCard kpiBox"><div className="kpiLabel">💰 Total profit</div><div className="kpiValue">{money(selectedPeriodTotalProfit)}</div></div>
          <div className="itemSalesCard kpiBox"><div className="kpiLabel">📦 Units sold</div><div className="kpiValue">{selectedPeriodTotalUnits.toLocaleString()}</div></div>
          <div className="itemSalesCard kpiBox"><div className="kpiLabel">⭐ Top product</div><div className="kpiValue" style={{ fontSize: "clamp(13px, 2.5vw, 18px)" }}>{topItem ? topItem.itemName : "—"}</div></div>
          <div className="itemSalesCard kpiBox"><div className="kpiLabel">📊 Top month</div><div className="kpiValue" style={{ fontSize: "clamp(13px, 2.5vw, 18px)" }}>{topMonth ? topMonth.monthLabel : "—"}</div></div>
        </div>

        {loading ? (
          <div className="noData">Loading item sales…</div>
        ) : (
          <div style={{ marginTop: 20 }}>
            <h2 style={{ fontSize: 16, fontWeight: 900, margin: "0 0 14px", textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(255, 180, 190, 0.95)" }}>Items sold totals (grouped for selected period)</h2>
            {groupedRows.length ? (
              <div className="itemsList">
                {groupedRows.map((row) => (
                  <div key={row.itemName} className="itemCard">
                    <div className="itemName" title={row.itemName}>{row.itemName}</div>
                    <div className="itemStats">
                      <div className="itemStat"><label>Units sold:</label><span style={{ color: "rgba(255, 200, 210, 0.95)", fontWeight: 800 }}>{row.units}</span></div>
                      <div className="itemStat"><label>Profit:</label><span style={{ color: "rgba(255, 200, 210, 0.95)", fontWeight: 800 }}>{money(row.profit)}</span></div>
                      <div className="itemStat"><label>% of period profit:</label><span style={{ color: "rgba(255, 200, 210, 0.95)", fontWeight: 800 }}>{row.share.toFixed(1)}%</span></div>
                    </div>
                    <div className="percentBar"><div className="percentFill" style={{ width: `${Math.min(row.share, 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="noData">No item sales found for this timeframe.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
