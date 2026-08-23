import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type SaleRow = {
  id: number;
  sale_date: string | null;
  notes: string | null;
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
  name?: string | null;
  item?: string | null;
  cost?: number | null;
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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

type TimeframeType = "current" | "last3" | "last6" | "year" | "custom" | "all";

export default function SalesMetrics() {
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [saleLines, setSaleLines] = useState<SaleLineRow[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [timeframe, setTimeframe] = useState<TimeframeType>("current");
  const [year, setYear] = useState<string>(String(new Date().getFullYear()));
  const [month, setMonth] = useState<string>(String(new Date().getMonth() + 1).padStart(2, "0"));

  const yearOptions = useMemo(() => {
    const years = [];
    for (let i = 0; i < 8; i++) {
      years.push(String(new Date().getFullYear() - i));
    }
    return years;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setErr("");

        const [salesRes, linesRes, invRes] = await Promise.all([
          supabase.from("sales").select("id,sale_date,notes"),
          supabase.from("sale_lines").select("sale_id,item_id,units,price,fees"),
          supabase.from("inventory").select("id,item,cost"),
        ]);

        if (salesRes.error) throw salesRes.error;
        if (linesRes.error) throw linesRes.error;
        if (invRes.error) throw invRes.error;

        setSales(salesRes.data || []);
        setSaleLines(linesRes.data || []);
        setInventory(invRes.data || []);
      } catch (e: any) {
        setErr(e.message || "Failed to load sales");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const invNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const item of inventory) {
      const name = String(item.item ?? item.name ?? "").trim() || "Unknown";
      map.set(item.id, name);
    }
    return map;
  }, [inventory]);

  const invCostById = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of inventory) {
      map.set(item.id, Math.max(0, toNum(item.cost, 0)));
    }
    return map;
  }, [inventory]);

  const dateRange = useMemo(() => {
    const today = new Date();
    
    if (timeframe === "current") {
      const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
      const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return { startDate, endDate };
    } else if (timeframe === "last3") {
      const endDate = new Date();
      const startDate = addMonths(new Date(), -3);
      return { startDate, endDate };
    } else if (timeframe === "last6") {
      const endDate = new Date();
      const startDate = addMonths(new Date(), -6);
      return { startDate, endDate };
    } else if (timeframe === "year") {
      const startDate = new Date(`${year}-01-01`);
      const endDate = new Date(`${year}-12-31`);
      return { startDate, endDate };
    } else if (timeframe === "all") {
      const startDate = new Date("1970-01-01");
      const endDate = new Date();
      return { startDate, endDate };
    } else {
      // custom
      const startDate = new Date(`${year}-${month}-01`);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      return { startDate, endDate };
    }
  }, [timeframe, year, month]);

  const filteredSalesWithLines = useMemo(() => {
    const linesBySale = new Map<number, SaleLineRow[]>();
    for (const line of saleLines) {
      if (!linesBySale.has(line.sale_id)) {
        linesBySale.set(line.sale_id, []);
      }
      linesBySale.get(line.sale_id)!.push(line);
    }

    const filtered = sales.filter((s) => {
      if (!s.sale_date) return false;
      const saleDate = new Date(s.sale_date);
      return saleDate >= dateRange.startDate && saleDate <= dateRange.endDate;
    });

    const result = filtered.map((s) => ({
      sale: s,
      lines: linesBySale.get(s.id) ?? [],
    }));

    return result.sort((a, b) => (b.sale.sale_date || "").localeCompare(a.sale.sale_date || ""));
  }, [sales, saleLines, dateRange]);

  const stats = useMemo(() => {
    let totalProfit = 0;
    let totalFees = 0;
    let saleCount = 0;
    const products = new Set<string>();

    for (const { lines } of filteredSalesWithLines) {
      if (lines.length > 0) {
        saleCount++;
        for (const line of lines) {
          const units = Math.max(0, toNum(line.units, 0));
          const price = toNum(line.price, 0);
          const fees = Math.max(0, toNum(line.fees, 0));
          const cost = invCostById.get(line.item_id) ?? 0;
          totalProfit += price - fees - cost * units;
          totalFees += fees;
          const name = invNameById.get(line.item_id) ?? "Unknown";
          products.add(name);
        }
      }
    }

    return {
      totalProfit,
      totalFees,
      saleCount,
      productCount: products.size,
    };
  }, [filteredSalesWithLines, invNameById, invCostById]);

  const groupedItemTotals = useMemo(() => {
    const byItem = new Map<string, { units: number; profit: number }>();

    for (const { lines } of filteredSalesWithLines) {
      for (const line of lines) {
        const itemName = invNameById.get(line.item_id) ?? "Unknown";
        const units = Math.max(0, toNum(line.units, 0));
        const price = toNum(line.price, 0);
        const fees = Math.max(0, toNum(line.fees, 0));
        const cost = invCostById.get(line.item_id) ?? 0;
        const profit = price - fees - cost * units;

        const current = byItem.get(itemName) ?? { units: 0, profit: 0 };
        current.units += units;
        current.profit += profit;
        byItem.set(itemName, current);
      }
    }

    const totalProfit = Array.from(byItem.values()).reduce((sum, item) => sum + item.profit, 0);

    return Array.from(byItem.entries())
      .map(([itemName, values]) => ({
        itemName,
        units: values.units,
        profit: values.profit,
        share: totalProfit > 0 ? (values.profit / totalProfit) * 100 : 0,
      }))
      .sort((a, b) => b.units - a.units || b.profit - a.profit);
  }, [filteredSalesWithLines, invNameById, invCostById]);

  return (
    <div style={{ padding: "20px 16px 32px", color: "rgba(255,255,255,0.95)", fontFamily: "'Segoe UI', sans-serif" }}>
      <style>{`
        .salesMetricsCard {
          background: linear-gradient(135deg, rgba(20, 14, 16, 0.85) 0%, rgba(25, 16, 20, 0.85) 100%);
          border: 1px solid rgba(255, 143, 42, 0.28);
          border-radius: 14px;
          box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 143, 42, 0.14);
          padding: 18px;
          backdrop-filter: blur(12px);
        }

        .smTitle {
          font-size: clamp(32px, 6vw, 44px);
          font-weight: 900;
          margin: 0 0 8px 0;
          background: linear-gradient(135deg, #ff8f2a 0%, #ff5e00 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .smSubtitle {
          font-size: 14px;
          color: rgba(255, 150, 160, 0.75);
          margin-bottom: 20px;
          font-weight: 600;
        }

        .kpiRow {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }

        .kpiCard {
          background: linear-gradient(135deg, rgba(35, 20, 23, 0.7) 0%, rgba(28, 16, 20, 0.7) 100%);
          border: 1px solid rgba(255, 143, 42, 0.26);
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.3), 0 0 20px rgba(255, 143, 42, 0.12);
          transition: all 0.3s ease;
        }

        .kpiCard:hover {
          border-color: rgba(255, 176, 94, 0.55);
          box-shadow: 0 10px 28px rgba(255, 143, 42, 0.2), 0 0 30px rgba(255, 143, 42, 0.12);
          transform: translateY(-2px);
        }

        .kpiLabel {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 150, 160, 0.75);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 6px;
        }

        .kpiValue {
          font-size: clamp(18px, 3vw, 24px);
          font-weight: 900;
          color: rgba(255, 200, 200, 0.95);
          text-shadow: 0 2px 8px rgba(220, 50, 60, 0.2);
        }

        .quickBtns {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }

        .quickBtn {
          padding: 10px 14px;
          border-radius: 10px;
          border: 1.5px solid rgba(255, 143, 42, 0.34);
          background: rgba(30, 20, 22, 0.6);
          color: rgba(255, 255, 255, 0.85);
          cursor: pointer;
          font-weight: 700;
          font-size: 12px;
          white-space: nowrap;
          transition: all 0.25s ease;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
        }

        .quickBtn:hover {
          border-color: rgba(255, 176, 94, 0.68);
          background: rgba(44, 24, 10, 0.82);
          box-shadow: 0 6px 14px rgba(255, 143, 42, 0.2);
          transform: translateY(-2px);
        }

        .quickBtn.active {
          border-color: rgba(255, 182, 102, 0.88);
          background: linear-gradient(135deg, rgba(255, 143, 42, 0.42) 0%, rgba(255, 94, 0, 0.42) 100%);
          color: rgba(255, 227, 192, 1);
          box-shadow: 0 6px 16px rgba(255, 143, 42, 0.3);
          font-weight: 800;
        }

        .filterSection {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
        }

        .filterField {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .filterLabel {
          font-size: 12px;
          font-weight: 700;
          color: rgba(255, 150, 160, 0.75);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .filterInput {
          border: 1.5px solid rgba(220, 50, 60, 0.3);
          border-radius: 10px;
          background: rgba(18, 12, 14, 0.8);
          color: rgba(255, 255, 255, 0.92);
          padding: 10px 12px;
          font-size: 14px;
          outline: none;
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
          transition: all 0.25s ease;
          font-weight: 500;
        }

        .filterInput:hover {
          border-color: rgba(220, 80, 90, 0.5);
          box-shadow: 0 6px 14px rgba(220, 50, 60, 0.15);
        }

        .filterInput:focus {
          border-color: rgba(255, 100, 110, 0.7);
          box-shadow: 0 0 0 3px rgba(220, 50, 60, 0.15), 0 6px 16px rgba(220, 50, 60, 0.2);
        }

        .filterInput option {
          background: rgba(18, 12, 14, 0.95);
          color: rgba(255, 255, 255, 0.92);
        }

        .salesList {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .saleItem {
          background: linear-gradient(135deg, rgba(25, 16, 20, 0.8) 0%, rgba(20, 12, 16, 0.8) 100%);
          border: 1.5px solid rgba(220, 50, 60, 0.25);
          border-radius: 12px;
          padding: 14px;
          box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3), 0 0 15px rgba(220, 50, 60, 0.08);
          transition: all 0.3s ease;
        }

        .saleItem:hover {
          border-color: rgba(255, 80, 90, 0.5);
          box-shadow: 0 8px 24px rgba(220, 50, 60, 0.25), 0 0 20px rgba(220, 50, 60, 0.12);
          transform: translateY(-2px);
          background: linear-gradient(135deg, rgba(35, 20, 25, 0.9) 0%, rgba(28, 16, 22, 0.9) 100%);
        }

        .saleHeader {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 10px;
          gap: 10px;
        }

        .saleDate {
          font-size: 12px;
          color: rgba(255, 150, 160, 0.75);
          font-weight: 600;
        }

        .saleRevenue {
          font-size: clamp(16px, 2vw, 20px);
          font-weight: 900;
          color: rgba(255, 200, 200, 0.95);
          text-shadow: 0 2px 6px rgba(220, 50, 60, 0.2);
        }

        .saleItems {
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 13px;
        }

        .saleItemRow {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          color: rgba(255, 255, 255, 0.75);
        }

        .saleItemName {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: rgba(255, 180, 190, 0.9);
          font-weight: 600;
        }

        .saleItemValue {
          flex: 0 0 auto;
          text-align: right;
          color: rgba(255, 255, 255, 0.85);
          font-weight: 700;
        }

        .noData {
          text-align: center;
          padding: 30px 20px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 14px;
        }

        .errorBox {
          background: rgba(50, 20, 20, 0.6);
          border: 1.5px solid rgba(255, 100, 100, 0.4);
          border-radius: 12px;
          padding: 14px;
          color: rgba(255, 200, 200, 0.9);
          font-size: 14px;
          margin-bottom: 16px;
          box-shadow: 0 4px 12px rgba(220, 50, 60, 0.15);
        }

        @media (max-width: 768px) {
          .filterSection {
            grid-template-columns: repeat(2, 1fr);
          }
          .kpiRow {
            grid-template-columns: repeat(2, 1fr);
          }
          .quickBtns {
            gap: 6px;
          }
          .quickBtn {
            padding: 8px 12px;
            font-size: 11px;
          }
        }

        @media (max-width: 480px) {
          .filterSection {
            grid-template-columns: 1fr;
          }
          .kpiRow {
            grid-template-columns: 1fr;
          }
          .saleHeader {
            flex-direction: column;
            align-items: flex-start;
          }
          .quickBtns {
            flex-direction: column;
          }
          .quickBtn {
            width: 100%;
          }
        }
      `}</style>

      <div style={{ marginBottom: 20 }}>
        <h1 className="smTitle">Sales Metrics</h1>
        <div className="smSubtitle">Review your sales performance and product breakdown</div>
      </div>

      <div className="salesMetricsCard">
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255, 150, 160, 0.8)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            ⚡ Quick Select
          </div>
          <div className="quickBtns">
            <button
              className={`quickBtn ${timeframe === "current" ? "active" : ""}`}
              onClick={() => setTimeframe("current")}
            >
              Current Month
            </button>
            <button
              className={`quickBtn ${timeframe === "last3" ? "active" : ""}`}
              onClick={() => setTimeframe("last3")}
            >
              Last 3 Months
            </button>
            <button
              className={`quickBtn ${timeframe === "last6" ? "active" : ""}`}
              onClick={() => setTimeframe("last6")}
            >
              Last 6 Months
            </button>
            <button
              className={`quickBtn ${timeframe === "year" ? "active" : ""}`}
              onClick={() => setTimeframe("year")}
            >
              Full Year
            </button>
            <button
              className={`quickBtn ${timeframe === "all" ? "active" : ""}`}
              onClick={() => setTimeframe("all")}
            >
              All Time
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255, 150, 160, 0.8)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            📅 Custom Selection
          </div>
          <div className="filterSection">
            {timeframe === "year" && (
              <div className="filterField">
                <label className="filterLabel">Year</label>
                <select className="filterInput" value={year} onChange={(e) => setYear(e.target.value)}>
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {timeframe === "custom" && (
              <>
                <div className="filterField">
                  <label className="filterLabel">Year</label>
                  <select className="filterInput" value={year} onChange={(e) => setYear(e.target.value)}>
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="filterField">
                  <label className="filterLabel">Month</label>
                  <select className="filterInput" value={month} onChange={(e) => setMonth(e.target.value)}>
                    {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => {
                      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                      return (
                        <option key={m} value={m}>
                          {monthNames[parseInt(m) - 1]}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </>
            )}

            <button
              className={`quickBtn ${timeframe === "custom" ? "active" : ""}`}
              onClick={() => setTimeframe("custom")}
              style={{ gridColumn: "span 1" }}
            >
              Select Month
            </button>
          </div>
        </div>

        {err && <div className="errorBox">{err}</div>}

        <div className="kpiRow">
          <div className="kpiCard">
            <div className="kpiLabel">💰 Total Profit</div>
            <div className="kpiValue">{money(stats.totalProfit)}</div>
          </div>
          <div className="kpiCard">
            <div className="kpiLabel">📊 Total Sales</div>
            <div className="kpiValue">{stats.saleCount}</div>
          </div>
          <div className="kpiCard">
            <div className="kpiLabel">📦 Products Sold</div>
            <div className="kpiValue">{stats.productCount}</div>
          </div>
          <div className="kpiCard">
            <div className="kpiLabel">💸 Fees</div>
            <div className="kpiValue">{money(stats.totalFees)}</div>
          </div>
        </div>

        <div style={{ marginTop: 6, marginBottom: 22 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255, 180, 190, 0.95)", marginBottom: 12 }}>
            Item Totals (Grouped for Selected Timeframe)
          </div>

          {loading ? (
            <div className="noData">Loading item totals…</div>
          ) : groupedItemTotals.length === 0 ? (
            <div className="noData">No item totals found for this timeframe.</div>
          ) : (
            <div className="salesList">
              {groupedItemTotals.map((item) => (
                <div key={item.itemName} className="saleItem">
                  <div className="saleHeader" style={{ marginBottom: 8 }}>
                    <div className="saleItemName" style={{ fontSize: 14 }}>{item.itemName}</div>
                    <div className="saleRevenue" style={{ fontSize: 16 }}>{item.units.toLocaleString()} sold</div>
                  </div>
                  <div className="saleItems">
                    <div className="saleItemRow">
                      <span className="saleItemName">Profit</span>
                      <span className="saleItemValue">{money(item.profit)}</span>
                    </div>
                    <div className="saleItemRow">
                      <span className="saleItemName">Share of period profit</span>
                      <span className="saleItemValue">{item.share.toFixed(1)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: "rgba(255, 180, 190, 0.95)", marginBottom: 12 }}>
            Sales Breakdown
          </div>

          {loading ? (
            <div className="noData">Loading sales data…</div>
          ) : filteredSalesWithLines.length === 0 ? (
            <div className="noData">No sales found for this timeframe.</div>
          ) : (
            <div className="salesList">
              {filteredSalesWithLines.map(({ sale, lines }) => {
                let saleTotal = 0;
                for (const line of lines) {
                  const units = Math.max(0, toNum(line.units, 0));
                  const price = toNum(line.price, 0);
                  const fees = Math.max(0, toNum(line.fees, 0));
                  const cost = invCostById.get(line.item_id) ?? 0;
                  saleTotal += price - fees - cost * units;
                }

                return (
                  <div key={sale.id} className="saleItem">
                    <div className="saleHeader">
                      <div>
                        <div className="saleDate">Sale #{sale.id} • {sale.sale_date}</div>
                        {sale.notes && <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>📝 {sale.notes}</div>}
                      </div>
                      <div className="saleRevenue">{money(saleTotal)}</div>
                    </div>

                    <div className="saleItems">
                      {lines.map((line, idx) => {
                        const itemName = invNameById.get(line.item_id) ?? "Unknown";
                        const units = toNum(line.units, 0);
                        const price = toNum(line.price, 0);
                        const fees = Math.max(0, toNum(line.fees, 0));
                        const cost = invCostById.get(line.item_id) ?? 0;
                        const lineProfit = price - fees - cost * Math.max(0, units);

                        return (
                          <div key={idx} className="saleItemRow">
                            <span className="saleItemName">{itemName}</span>
                            <span className="saleItemValue">
                              {units > 0 ? `${units}x ` : ""}
                              {money(lineProfit)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
