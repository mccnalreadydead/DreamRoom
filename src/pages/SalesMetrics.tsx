import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function safeNum(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}
function csvEscape(v: any) {
  const s = String(v ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function downloadTextFile(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type Seller = { id: number; name: string; active?: boolean | null };
type Item = { id: number; name: string; cost: number };

type SaleHeader = {
  id: number;
  sale_date: string | null;
  seller_id: number | null;
  notes: string | null;
};

type SaleLineRow = {
  id: number;
  sale_id: number;
  item_id: number;
  qty: number;
  price: number;
  fees: number;
};

async function detectFirstWorkingTable(candidates: string[], selectCols: string) {
  for (const t of candidates) {
    const res = await supabase.from(t).select(selectCols).limit(1);
    if (!res.error) return t;
  }
  return null;
}

async function detectSalesHeaderTable() {
  return detectFirstWorkingTable(["sales", "Sales", "SalesHeader", "sale_headers"], "id,sale_date");
}

async function detectSaleLinesTable() {
  return detectFirstWorkingTable(
    ["sale_lines", "Sales", "sales_lines", "sale_items", "sales_items", "line_items"],
    "id,sale_id,item_id,qty,price,fees"
  );
}

async function detectSellersTable() {
  return detectFirstWorkingTable(["sales_people", "sale_sellers", "people", "sellers"], "id,name");
}

async function loadSellersSafe(tableName: string): Promise<Seller[]> {
  const withActive = await supabase.from(tableName).select("id,name,active").order("name", { ascending: true });
  if (!withActive.error) {
    const raw = ((withActive.data as any) ?? []) as any[];
    return raw
      .map((x) => ({ id: Number(x.id), name: String(x.name ?? ""), active: x.active ?? true }))
      .filter((x) => x.name.trim().length > 0 && x.active !== false);
  }

  const noActive = await supabase.from(tableName).select("id,name").order("name", { ascending: true });
  if (noActive.error) throw new Error(noActive.error.message);

  const raw = ((noActive.data as any) ?? []) as any[];
  return raw.map((x) => ({ id: Number(x.id), name: String(x.name ?? ""), active: true })).filter((x) => x.name.trim().length > 0);
}

function monthStartEndExclusive(y: number, m: number) {
  const start = `${y}-${pad2(m)}-01`;
  const dt = new Date(y, m - 1, 1);
  dt.setMonth(dt.getMonth() + 1);
  const endExclusive = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
  return { start, endExclusive };
}

export default function SalesMetrics() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [tSales, setTSales] = useState<string | null>(null);
  const [tLines, setTLines] = useState<string | null>(null);
  const [tSellers, setTSellers] = useState<string | null>(null);

  const [sellers, setSellers] = useState<Seller[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [sales, setSales] = useState<SaleHeader[]>([]);
  const [lines, setLines] = useState<SaleLineRow[]>([]);

  const [selectedSellerIds, setSelectedSellerIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const yearsOptions = useMemo(() => {
    const yNow = new Date().getFullYear();
    const ys: number[] = [];
    for (let y = yNow - 5; y <= yNow + 1; y++) ys.push(y);
    return ys;
  }, []);

  const itemById = useMemo(() => {
    const m = new Map<number, Item>();
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items]);

  const sellerById = useMemo(() => {
    const m = new Map<number, Seller>();
    for (const s of sellers) m.set(s.id, s);
    return m;
  }, [sellers]);

  function toggleSeller(id: number) {
    setSelectedSellerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }
  function clearSellers() {
    setSelectedSellerIds([]);
  }

  async function loadAll() {
    setLoading(true);
    setErr("");

    try {
      const [salesTable, linesTable, sellersTable] = await Promise.all([
        detectSalesHeaderTable(),
        detectSaleLinesTable(),
        detectSellersTable(),
      ]);

      setTSales(salesTable);
      setTLines(linesTable);
      setTSellers(sellersTable);

      if (!salesTable) throw new Error("Could not detect Sales header table (needs: sale_date).");
      if (!linesTable) throw new Error("Could not detect Sale lines table (needs: sale_id,item_id,qty,price,fees).");

      // items
      const iRes = await supabase.from("item_catalog").select("id,name,cost").order("name", { ascending: true });
      if (iRes.error) throw iRes.error;

      const mappedItems = (((iRes.data as any) ?? []) as any[]).map((x) => ({
        id: Number(x.id),
        name: String(x.name ?? ""),
        cost: safeNum(x.cost),
      }));
      setItems(mappedItems.filter((x) => x.name.trim().length > 0));

      // sellers
      if (sellersTable) {
        const s = await loadSellersSafe(sellersTable);
        setSellers(s);
      } else {
        setSellers([]);
      }

      // sales for month
      const { start, endExclusive } = monthStartEndExclusive(year, month);
      const sRes = await supabase
        .from(salesTable)
        .select("id,sale_date,seller_id,notes")
        .gte("sale_date", start)
        .lt("sale_date", endExclusive)
        .order("sale_date", { ascending: false })
        .limit(2500);

      if (sRes.error) throw sRes.error;

      const saleRows: SaleHeader[] = (((sRes.data as any) ?? []) as any[]).map((x) => ({
        id: Number(x.id),
        sale_date: x.sale_date ?? null,
        seller_id: x.seller_id ?? null,
        notes: x.notes ?? null,
      }));

      setSales(saleRows);

      const saleIds = saleRows.map((x) => x.id);
      if (!saleIds.length) {
        setLines([]);
        setLoading(false);
        return;
      }

      const lRes = await supabase.from(linesTable).select("id,sale_id,item_id,qty,price,fees").in("sale_id", saleIds);
      if (lRes.error) throw lRes.error;

      const mappedLines: SaleLineRow[] = ((((lRes.data as any) ?? []) as any[]) as any[]).map((x) => ({
        id: Number(x.id),
        sale_id: Number(x.sale_id),
        item_id: Number(x.item_id),
        qty: safeNum(x.qty),
        price: safeNum(x.price),
        fees: safeNum(x.fees),
      }));

      setLines(mappedLines);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setSales([]);
      setLines([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const filteredSales = useMemo(() => {
    if (selectedSellerIds.length === 0) return sales;
    const allow = new Set(selectedSellerIds);
    return sales.filter((s) => s.seller_id != null && allow.has(s.seller_id));
  }, [sales, selectedSellerIds]);

  const linesBySale = useMemo(() => {
    const m = new Map<number, SaleLineRow[]>();
    for (const ln of lines) {
      const arr = m.get(ln.sale_id) ?? [];
      arr.push(ln);
      m.set(ln.sale_id, arr);
    }
    return m;
  }, [lines]);

  const computedSales = useMemo(() => {
    return filteredSales.map((s) => {
      const sLines = linesBySale.get(s.id) ?? [];

      const revenue = sLines.reduce((a, ln) => a + safeNum(ln.price), 0);
      const fees = sLines.reduce((a, ln) => a + safeNum(ln.fees), 0);
      const cost = sLines.reduce((a, ln) => a + safeNum(itemById.get(ln.item_id)?.cost) * safeNum(ln.qty), 0);

      const itemsCount = sLines.length;
      const profit = revenue - fees - cost;

      const sellerName = s.seller_id ? sellerById.get(s.seller_id)?.name ?? "Unknown" : "—";

      return { ...s, revenue, fees, cost, profit, itemsCount, sellerName };
    });
  }, [filteredSales, linesBySale, itemById, sellerById]);

  const totals = useMemo(() => {
    const count = computedSales.length;
    const totalProfit = computedSales.reduce((a: number, s: any) => a + safeNum(s.profit), 0);
    const totalRevenue = computedSales.reduce((a: number, s: any) => a + safeNum(s.revenue), 0);
    const totalItems = computedSales.reduce((a: number, s: any) => a + safeNum(s.itemsCount), 0);

    const avgItemsPerSale = count ? totalItems / count : 0;
    const avgSellingPricePerSale = count ? totalRevenue / count : 0;

    return { count, totalProfit, totalRevenue, avgItemsPerSale, avgSellingPricePerSale };
  }, [computedSales]);

  const perSeller = useMemo(() => {
    const m = new Map<
      number,
      { sellerId: number; name: string; salesCount: number; profit: number; itemsTotal: number; revenueTotal: number }
    >();

    for (const s of computedSales as any[]) {
      if (!s.seller_id) continue;
      const id = s.seller_id as number;

      const cur =
        m.get(id) ?? {
          sellerId: id,
          name: s.sellerName as string,
          salesCount: 0,
          profit: 0,
          itemsTotal: 0,
          revenueTotal: 0,
        };

      cur.salesCount += 1;
      cur.profit += safeNum(s.profit);
      cur.itemsTotal += safeNum(s.itemsCount);
      cur.revenueTotal += safeNum(s.revenue);

      m.set(id, cur);
    }

    return Array.from(m.values()).sort((a, b) => b.profit - a.profit);
  }, [computedSales]);

  function exportCSV() {
    const label = `${year}-${pad2(month)}`;
    const header = ["Seller", "Sales Count", "Total Profit", "Avg Items / Sale", "Avg Selling Price / Sale", "Total Revenue"];
    const out: string[] = [header.map(csvEscape).join(",")];

    const rows = perSeller.length
      ? perSeller
      : [
          {
            sellerId: 0,
            name: "All (no seller assigned)",
            salesCount: totals.count,
            profit: totals.totalProfit,
            itemsTotal: totals.avgItemsPerSale * totals.count,
            revenueTotal: totals.totalRevenue,
          },
        ];

    for (const r of rows as any[]) {
      const avgItems = r.salesCount ? r.itemsTotal / r.salesCount : 0;
      const avgSale = r.salesCount ? r.revenueTotal / r.salesCount : 0;

      out.push(
        [r.name, r.salesCount, r.profit, avgItems.toFixed(2), avgSale.toFixed(2), r.revenueTotal].map(csvEscape).join(",")
      );
    }

    downloadTextFile(`sales_metrics_${label}.csv`, out.join("\n"));
  }

  return (
    <div className="page">
      <style>{`
        .smTop{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
        }
        .smControls{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:center;
          justify-content:flex-end;
        }

        .chipRow{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
          margin-top:10px;
        }
        .chip{
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.18);
          padding:8px 10px;
          border-radius:999px;
          font-weight:950;
          cursor:pointer;
        }
        .chipOn{
          border-color: rgba(130, 90, 255, .45);
          background: rgba(118, 68, 255, .20);
        }

        .smGrid{
          display:grid;
          grid-template-columns: repeat(12, 1fr);
          gap: 10px;
          margin-top: 12px;
        }
        .smCard{
          grid-column: span 6;
          padding: 12px;
        }
        .kpi{
          font-size: 12px;
          color: rgba(255,255,255,0.70);
          font-weight: 950;
        }
        .val{
          margin-top: 4px;
          font-size: 22px;
          font-weight: 950;
          letter-spacing: 0.2px;
        }

        .tableWrap{
          margin-top: 12px;
          overflow:auto;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.10);
        }
        table{
          width:100%;
          border-collapse: collapse;
          min-width: 760px;
        }
        th, td{
          padding: 12px;
          text-align:left;
          border-bottom: 1px solid rgba(255,255,255,.08);
          vertical-align: top;
          font-weight: 900;
        }
        th{
          font-size: 12px;
          opacity: .85;
          font-weight: 950;
        }
        td{
          font-size: 14px;
        }

        .list{
          margin-top: 12px;
          padding: 12px;
        }
        .row{
          display:flex;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .row:last-child{ border-bottom: none; }
        .left{
          min-width: 0;
          display:flex;
          flex-direction: column;
          gap: 2px;
        }
        .title{
          font-weight: 950;
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sub{
          font-size: 12px;
          color: rgba(255,255,255,0.65);
          overflow:hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .right{
          text-align:right;
          display:flex;
          flex-direction: column;
          gap: 2px;
          flex: 0 0 auto;
        }

        /* iOS zoom fix */
        select.input, input.input { font-size: 16px; }

        @media (max-width: 820px){
          .smCard{ grid-column: span 12; }
        }
      `}</style>

      <div className="row smTop">
        <div>
          <h1 style={{ margin: 0 }}>Sales Metrics</h1>
          <div className="muted" style={{ marginTop: 6 }}>
            Month + Year + multi-seller metrics. Tables → items: <b>item_catalog</b>, sales: <b>{tSales ?? "detecting..."}</b>, lines: <b>{tLines ?? "detecting..."}</b>, sellers: <b>{tSellers ?? "detecting..."}</b>
          </div>
        </div>

        <div className="smControls">
          <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ minWidth: 120 }}>
            {yearsOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ minWidth: 120 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{pad2(m)}</option>
            ))}
          </select>

          <button className="btn" type="button" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>

          <button className="btn" type="button" onClick={exportCSV} disabled={loading}>
            Export CSV
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> <span className="muted">{err}</span>
        </div>
      ) : null}

      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950 }}>Salespeople</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {selectedSellerIds.length === 0 ? "All sellers selected" : `${selectedSellerIds.length} selected`}
          </div>
        </div>

        <div className="chipRow">
          <button className={`chip ${selectedSellerIds.length === 0 ? "chipOn" : ""}`} onClick={clearSellers}>
            All
          </button>

          {sellers.map((p) => {
            const on = selectedSellerIds.includes(p.id);
            return (
              <button key={p.id} className={`chip ${on ? "chipOn" : ""}`} onClick={() => toggleSeller(p.id)}>
                {p.name}
              </button>
            );
          })}
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Tip: tap multiple names to compare. Leave on “All” to see everyone.
        </div>
      </div>

      <div className="smGrid">
        <div className="card smCard">
          <div className="kpi">Sales Count</div>
          <div className="val">{totals.count}</div>
        </div>

        <div className="card smCard">
          <div className="kpi">Total Profit</div>
          <div className="val">{money(totals.totalProfit)}</div>
        </div>

        <div className="card smCard">
          <div className="kpi">Avg Items / Sale</div>
          <div className="val">{Number.isFinite(totals.avgItemsPerSale) ? totals.avgItemsPerSale.toFixed(2) : "0.00"}</div>
        </div>

        <div className="card smCard">
          <div className="kpi">Avg Selling Price / Sale</div>
          <div className="val">{money(totals.avgSellingPricePerSale)}</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, padding: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950 }}>Seller Breakdown</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {perSeller.length ? `Showing ${perSeller.length}` : "No seller-tagged sales yet"}
          </div>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Seller</th>
                <th>Sales</th>
                <th>Total Profit</th>
                <th>Avg Items/Sale</th>
                <th>Avg Selling Price/Sale</th>
              </tr>
            </thead>
            <tbody>
              {perSeller.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ opacity: 0.8 }}>
                    If you don’t see sellers here, sales probably don’t have seller_id filled yet.
                  </td>
                </tr>
              ) : (
                perSeller.map((r) => {
                  const avgItems = r.salesCount ? r.itemsTotal / r.salesCount : 0;
                  const avgSale = r.salesCount ? r.revenueTotal / r.salesCount : 0;
                  return (
                    <tr key={r.sellerId}>
                      <td>{r.name}</td>
                      <td>{r.salesCount}</td>
                      <td>{money(r.profit)}</td>
                      <td>{avgItems.toFixed(2)}</td>
                      <td>{money(avgSale)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card list">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
          <div style={{ fontWeight: 950 }}>Recent Sales (this month)</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Showing {Math.min(computedSales.length, 30)} of {computedSales.length}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          {(computedSales as any[]).slice(0, 30).map((s) => (
            <div key={s.id} className="row">
              <div className="left">
                <div className="title">{s.sale_date ?? "—"} • {s.sellerName}</div>
                <div className="sub">
                  Items: {s.itemsCount} • Revenue: {money(s.revenue)} • Notes: {s.notes ?? "—"}
                </div>
              </div>
              <div className="right">
                <div style={{ fontWeight: 950 }}>{money(s.revenue)}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  Profit: {money(s.profit)}
                </div>
              </div>
            </div>
          ))}

          {computedSales.length === 0 ? <div className="muted" style={{ padding: 10 }}>No sales found for this month.</div> : null}
        </div>
      </div>
    </div>
  );
}
