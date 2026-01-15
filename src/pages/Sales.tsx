import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

/** -----------------------------
 *  Utilities
 *  ----------------------------- */
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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
function makeTempId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

/** -----------------------------
 *  Types
 *  ----------------------------- */
type Client = { id: number; name: string | null };

type Seller = { id: number; name: string; active?: boolean | null };

type Item = {
  id: number;
  name: string;
  cost: number; // unit cost
};

type SaleLineDraft = {
  tempId: string;
  item_id: number | null;
  qty: number;
  price: number;
  fees: number;
};

type SaleHeader = {
  id: number;
  sale_date: string | null;
  notes: string | null;
  client_id: number | null;
  seller_id: number | null;
  created_at?: string | null;
};

type SaleLineRow = {
  id: number;
  sale_id: number;
  item_id: number;
  qty: number;
  price: number;
  fees: number;
};

/** -----------------------------
 *  Table Auto-Detect
 *  ----------------------------- */
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
  // Try with active first
  const withActive = await supabase.from(tableName).select("id,name,active").order("name", { ascending: true });
  if (!withActive.error) {
    const raw = ((withActive.data as any) ?? []) as any[];
    return raw
      .map((x) => ({ id: Number(x.id), name: String(x.name ?? ""), active: x.active ?? true }))
      .filter((x) => x.name.trim().length > 0 && x.active !== false);
  }

  // Fallback: no active column
  const noActive = await supabase.from(tableName).select("id,name").order("name", { ascending: true });
  if (noActive.error) {
    throw new Error(noActive.error.message);
  }
  const raw = ((noActive.data as any) ?? []) as any[];
  return raw
    .map((x) => ({ id: Number(x.id), name: String(x.name ?? ""), active: true }))
    .filter((x) => x.name.trim().length > 0);
}

/** -----------------------------
 *  Component
 *  ----------------------------- */
export default function Sales() {
  // detected table names
  const [tSales, setTSales] = useState<string | null>(null);
  const [tLines, setTLines] = useState<string | null>(null);
  const [tSellers, setTSellers] = useState<string | null>(null);

  // master data
  const [clients, setClients] = useState<Client[]>([]);
  const [sellers, setSellers] = useState<Seller[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  // add-sale form
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedSellerId, setSelectedSellerId] = useState<number | null>(null);
  const [saleDate, setSaleDate] = useState<string>(todayISO());
  const [saleNote, setSaleNote] = useState<string>("");

  const [lines, setLines] = useState<SaleLineDraft[]>([
    { tempId: makeTempId(), item_id: null, qty: 1, price: 0, fees: 0 },
  ]);

  // sales list
  const [sales, setSales] = useState<(SaleHeader & { lines: SaleLineRow[] })[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // filters
  const now = new Date();
  const [filterMode, setFilterMode] = useState<"day" | "month" | "year" | "all">("all");
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterDay, setFilterDay] = useState<number>(now.getDate());
  const [filterSellerId, setFilterSellerId] = useState<number | "all">("all");

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

  const clientById = useMemo(() => {
    const m = new Map<number, Client>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const yearsOptions = useMemo(() => {
    const yNow = new Date().getFullYear();
    const ys: number[] = [];
    for (let y = yNow - 5; y <= yNow + 1; y++) ys.push(y);
    return ys;
  }, []);

  const daysInMonth = useMemo(() => {
    const dt = new Date(filterYear, filterMonth, 0);
    const n = dt.getDate();
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [filterYear, filterMonth]);

  /** -----------------------------
   *  Load / Detect on Mount
   *  ----------------------------- */
  useEffect(() => {
    (async () => {
      setErr("");

      const [salesTable, linesTable, sellersTable] = await Promise.all([
        detectSalesHeaderTable(),
        detectSaleLinesTable(),
        detectSellersTable(),
      ]);

      setTSales(salesTable);
      setTLines(linesTable);
      setTSellers(sellersTable);

      // clients
      const cRes = await supabase.from("clients").select("id,name").order("name", { ascending: true });
      if (cRes.error) setErr(`Clients error: ${cRes.error.message}`);
      setClients(((cRes.data as any) ?? []) as Client[]);

      // items
      const iRes = await supabase.from("item_catalog").select("id,name,cost").order("name", { ascending: true });
      if (iRes.error) setErr((e) => e || `Item catalog error: ${iRes.error.message}`);
      const rawItems = (((iRes.data as any) ?? []) as any[]).map((x) => ({
        id: Number(x.id),
        name: String(x.name ?? ""),
        cost: safeNum(x.cost),
      }));
      setItems(rawItems.filter((x) => x.name.trim().length > 0));

      // sellers
      if (sellersTable) {
        try {
          const s = await loadSellersSafe(sellersTable);
          setSellers(s);
        } catch (e: any) {
          setErr((prev) => prev || `Sellers error: ${e?.message ?? String(e)}`);
          setSellers([]);
        }
      } else {
        setSellers([]);
      }
    })();
  }, []);

  /** -----------------------------
   *  Line helpers
   *  ----------------------------- */
  function addLine() {
    setLines((prev) => [...prev, { tempId: makeTempId(), item_id: null, qty: 1, price: 0, fees: 0 }]);
  }
  function removeLine(tempId: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((x) => x.tempId !== tempId)));
  }
  function updateLine(tempId: string, patch: Partial<SaleLineDraft>) {
    setLines((prev) => prev.map((x) => (x.tempId === tempId ? { ...x, ...patch } : x)));
  }

  const formProfit = useMemo(() => {
    let total = 0;
    for (const ln of lines) {
      if (!ln.item_id) continue;
      const it = itemById.get(ln.item_id);
      const unitCost = safeNum(it?.cost);
      const qty = Math.max(0, safeNum(ln.qty));
      const price = safeNum(ln.price);
      const fees = safeNum(ln.fees);
      total += price - fees - unitCost * qty;
    }
    return total;
  }, [lines, itemById]);

  /** -----------------------------
   *  Fetch sales list
   *  ----------------------------- */
  async function fetchSales() {
    if (!tSales) return setErr("Could not detect your Sales header table. (Expected column: sale_date)");
    if (!tLines) return setErr("Could not detect your Sale lines table. (Expected columns: sale_id,item_id,qty,price,fees)");

    setLoading(true);
    setErr("");

    let start: string | null = null;
    let endExclusive: string | null = null;

    if (filterMode === "day") {
      const y = filterYear,
        m = filterMonth,
        d = filterDay;
      start = `${y}-${pad2(m)}-${pad2(d)}`;
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 1);
      endExclusive = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    } else if (filterMode === "month") {
      const y = filterYear,
        m = filterMonth;
      start = `${y}-${pad2(m)}-01`;
      const dt = new Date(y, m - 1, 1);
      dt.setMonth(dt.getMonth() + 1);
      endExclusive = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
    } else if (filterMode === "year") {
      const y = filterYear;
      start = `${y}-01-01`;
      endExclusive = `${y + 1}-01-01`;
    }

    let q = supabase
      .from(tSales)
      .select("id,sale_date,notes,client_id,seller_id,created_at")
      .order("sale_date", { ascending: false })
      .limit(500);

    if (start) q = q.gte("sale_date", start);
    if (endExclusive) q = q.lt("sale_date", endExclusive);
    if (filterSellerId !== "all") q = q.eq("seller_id", filterSellerId);

    const sRes = await q;
    if (sRes.error) {
      setErr(`Sales load error (${tSales}): ${sRes.error.message}`);
      setSales([]);
      setLoading(false);
      return;
    }

    const headers: SaleHeader[] = ((sRes.data as any) ?? []) as any[];
    const saleIds = headers.map((x) => x.id);

    let lineRows: SaleLineRow[] = [];
    if (saleIds.length) {
      const lRes = await supabase.from(tLines).select("id,sale_id,item_id,qty,price,fees").in("sale_id", saleIds);
      if (lRes.error) {
        setErr(`Sale lines load error (${tLines}): ${lRes.error.message}`);
      } else {
        lineRows = (((lRes.data as any) ?? []) as any[]).map((x) => ({
          id: x.id,
          sale_id: x.sale_id,
          item_id: x.item_id,
          qty: safeNum(x.qty),
          price: safeNum(x.price),
          fees: safeNum(x.fees),
        }));
      }
    }

    const bySale = new Map<number, SaleLineRow[]>();
    for (const ln of lineRows) {
      const arr = bySale.get(ln.sale_id) ?? [];
      arr.push(ln);
      bySale.set(ln.sale_id, arr);
    }

    setSales(headers.map((h) => ({ ...h, lines: bySale.get(h.id) ?? [] })));
    setLoading(false);
  }

  useEffect(() => {
    if (!tSales || !tLines) return;
    void fetchSales();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tSales, tLines]);

  /** -----------------------------
   *  Save sale
   *  ----------------------------- */
  async function saveSale() {
    if (!tSales) return setErr("Could not detect your Sales header table.");
    if (!tLines) return setErr("Could not detect your Sale lines table.");

    setSaving(true);
    setErr("");

    const validLines = lines.filter((l) => l.item_id && safeNum(l.qty) > 0);
    if (!validLines.length) {
      setErr("Add at least one item (with qty > 0).");
      setSaving(false);
      return;
    }

    try {
      const headerPayload = {
        sale_date: saleDate,
        notes: saleNote.trim() ? saleNote.trim() : null,
        client_id: selectedClientId,
        seller_id: selectedSellerId,
      };

      const ins = await supabase.from(tSales).insert([headerPayload]).select("id").single();
      if (ins.error) throw new Error(ins.error.message);

      const saleId = ins.data.id as number;

      const linePayload = validLines.map((l) => ({
        sale_id: saleId,
        item_id: l.item_id,
        qty: safeNum(l.qty),
        price: safeNum(l.price),
        fees: safeNum(l.fees),
      }));

      const lIns = await supabase.from(tLines).insert(linePayload);
      if (lIns.error) throw new Error(lIns.error.message);

      setSelectedClientId(null);
      setSelectedSellerId(null);
      setSaleDate(todayISO());
      setSaleNote("");
      setLines([{ tempId: makeTempId(), item_id: null, qty: 1, price: 0, fees: 0 }]);

      await fetchSales();
    } catch (e: any) {
      setErr(`Save error: ${e?.message ?? String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  /** -----------------------------
   *  Delete sale
   *  ----------------------------- */
  async function deleteSale(saleId: number) {
    if (!tSales || !tLines) return;

    const ok = window.confirm("Delete this sale? (Cannot be undone)");
    if (!ok) return;

    setErr("");
    try {
      const dl1 = await supabase.from(tLines).delete().eq("sale_id", saleId);
      if (dl1.error) throw new Error(dl1.error.message);

      const dl2 = await supabase.from(tSales).delete().eq("id", saleId);
      if (dl2.error) throw new Error(dl2.error.message);

      await fetchSales();
    } catch (e: any) {
      setErr(`Delete error: ${e?.message ?? String(e)}`);
    }
  }

  /** -----------------------------
   *  Compute profit/unit list
   *  ----------------------------- */
  const salesWithComputed = useMemo(() => {
    return sales.map((s) => {
      let profit = 0;
      let units = 0;

      for (const ln of s.lines) {
        const it = itemById.get(ln.item_id);
        const unitCost = safeNum(it?.cost);
        const qty = safeNum(ln.qty);
        const price = safeNum(ln.price);
        const fees = safeNum(ln.fees);
        profit += price - fees - unitCost * qty;
        units += qty;
      }

      return { ...s, profit, units };
    });
  }, [sales, itemById]);

  const loadedProfit = useMemo(() => salesWithComputed.reduce((a, s: any) => a + safeNum(s.profit), 0), [salesWithComputed]);

  /** -----------------------------
   *  Export CSV (loaded view)
   *  ----------------------------- */
  function exportCSV() {
    const header = ["Sale Date", "Client", "Seller", "Items", "Units", "Revenue", "Fees", "Cost", "Profit", "Note"];
    const out: string[] = [header.map(csvEscape).join(",")];

    for (const s of salesWithComputed as any[]) {
      const clientName = s.client_id ? (clientById.get(s.client_id)?.name ?? "") : "";
      const sellerName = s.seller_id ? (sellerById.get(s.seller_id)?.name ?? "") : "";

      const itemsList = s.lines
        .map((ln: any) => {
          const nm = itemById.get(ln.item_id)?.name ?? `Item#${ln.item_id}`;
          return `${nm} (${safeNum(ln.qty)})`;
        })
        .join(" | ");

      const revenue = s.lines.reduce((a: number, ln: any) => a + safeNum(ln.price), 0);
      const fees = s.lines.reduce((a: number, ln: any) => a + safeNum(ln.fees), 0);
      const cost = s.lines.reduce(
        (a: number, ln: any) => a + safeNum(itemById.get(ln.item_id)?.cost) * safeNum(ln.qty),
        0
      );

      out.push(
        [
          s.sale_date ?? "",
          clientName ?? "",
          sellerName ?? "",
          itemsList,
          s.units ?? 0,
          revenue,
          fees,
          cost,
          s.profit ?? 0,
          s.notes ?? "",
        ]
          .map(csvEscape)
          .join(",")
      );
    }

    let label = "all";
    if (filterMode === "day") label = `${filterYear}-${pad2(filterMonth)}-${pad2(filterDay)}`;
    if (filterMode === "month") label = `${filterYear}-${pad2(filterMonth)}`;
    if (filterMode === "year") label = `${filterYear}`;
    downloadTextFile(`sales_export_${label}.csv`, out.join("\n"));
  }

  return (
    <div className="salesPage">
      <style>{`
        .salesPage{
          padding: 14px;
          max-width: 1200px;
          margin: 0 auto;
          color: rgba(255,255,255,0.92);
        }

        .topRow{
          display:flex;
          align-items:flex-start;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom:12px;
        }
        .title{
          font-size: 28px;
          font-weight: 950;
          letter-spacing: .2px;
          margin: 0;
        }
        .sub{
          opacity:.85;
          margin-top:6px;
          font-size: 14px;
        }

        .btn{
          border:1px solid rgba(255,255,255,.12);
          background: rgba(20,20,28,.55);
          color:#fff;
          padding:10px 14px;
          border-radius:14px;
          font-weight:900;
          cursor:pointer;
          white-space:nowrap;
        }
        .btn:active{ transform: scale(.99); }
        .btnPrimary{
          background: rgba(118, 68, 255, .18);
          border-color: rgba(130, 90, 255, .35);
        }
        .btnDanger{
          background: rgba(255, 80, 80, .12);
          border-color: rgba(255, 80, 80, .28);
        }

        .pill{
          display:inline-flex;
          align-items:center;
          gap:8px;
          padding:6px 10px;
          border-radius:999px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.18);
          font-size: 12px;
          font-weight:950;
          color: #ffd77a;
        }

        .card{
          border:1px solid rgba(255,255,255,.10);
          background: linear-gradient(180deg, rgba(18,18,28,.72), rgba(10,10,16,.72));
          border-radius: 18px;
          padding: 14px;
          box-shadow: 0 10px 40px rgba(0,0,0,.35);
          backdrop-filter: blur(10px);
        }
        .cardHeader{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          flex-wrap:wrap;
          margin-bottom: 10px;
        }
        .cardTitle{
          font-size: 18px;
          font-weight: 950;
          margin: 0;
        }

        .grid{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        .row2{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .field label{
          display:block;
          font-size:12px;
          opacity:.85;
          margin-bottom:6px;
          font-weight:950;
        }

        .input, .select{
          width:100%;
          border-radius: 16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(10,10,18,.55);
          color:#fff;
          padding: 12px 12px;
          outline:none;
          font-weight:900;
          line-height: 1.1;
          height: 46px;
          font-size: 16px; /* iOS zoom fix */
        }

        .muted{
          opacity:.75;
          font-size:12px;
          margin-top:6px;
        }

        .lines{
          margin-top: 12px;
          display:flex;
          flex-direction:column;
          gap:10px;
        }
        .line{
          border:1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.16);
          border-radius: 16px;
          padding: 10px;
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap:10px;
          align-items:end;
        }
        .line .itemField{ grid-column: 1 / -1; }
        .line .feesField{ grid-column: 1 / 2; }
        .line .removeField{ grid-column: 2 / 3; display:flex; justify-content:flex-end; }
        .xBtn{
          width:46px;
          height:46px;
          border-radius: 16px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.22);
          color:#fff;
          font-size:20px;
          cursor:pointer;
          display:flex;
          align-items:center;
          justify-content:center;
        }
        .profitMini{
          margin-top: 6px;
          font-size: 12px;
          opacity: .85;
          font-weight: 950;
        }

        .bottomActions{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          margin-top: 10px;
        }

        .filters{
          display:flex;
          gap:10px;
          flex-wrap:wrap;
          align-items:flex-end;
        }
        .seg{
          display:flex;
          gap:8px;
          flex-wrap:wrap;
        }
        .seg button{
          padding:8px 12px;
          border-radius: 999px;
          border:1px solid rgba(255,255,255,.12);
          background: rgba(0,0,0,.18);
          color:#fff;
          font-weight:950;
          cursor:pointer;
        }
        .seg button.active{
          border-color: rgba(130, 90, 255, .45);
          background: rgba(118, 68, 255, .20);
        }

        .tableWrap{
          overflow:auto;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,.10);
          background: rgba(0,0,0,.10);
        }
        table{
          width:100%;
          border-collapse: collapse;
          min-width: 860px;
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

        @media (min-width: 820px){
          .row2{ grid-template-columns: 1fr 1fr; }
          .line{
            grid-template-columns: 1.25fr .55fr .75fr .75fr auto;
            align-items:end;
          }
          .line .itemField{ grid-column: auto; }
          .line .feesField{ grid-column: auto; }
          .line .removeField{ grid-column: auto; }
        }
      `}</style>

      <div className="topRow">
        <div>
          <h1 className="title">Sales</h1>
          <div className="sub">
            Loaded profit: <b>{money(loadedProfit)}</b>
          </div>
          <div className="muted" style={{ marginTop: 6 }}>
            Tables → items: <b>item_catalog</b>, sales: <b>{tSales ?? "detecting..."}</b>, lines:{" "}
            <b>{tLines ?? "detecting..."}</b>, sellers: <b>{tSellers ?? "detecting..."}</b>
          </div>
        </div>

        <button className="btn" onClick={fetchSales} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {err ? (
        <div className="card" style={{ borderColor: "rgba(255,80,80,.35)", marginBottom: 12 }}>
          <b style={{ color: "#ff9a9a" }}>Error:</b> <span style={{ opacity: 0.9 }}>{err}</span>
        </div>
      ) : null}

      <div className="card">
        <div className="cardHeader">
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h2 className="cardTitle">Add Sale</h2>
            <span className="pill">Form profit: {money(formProfit)}</span>
          </div>
        </div>

        <div className="grid">
          <div className="field">
            <label>Client (optional)</label>
            <select
              className="select"
              value={selectedClientId ?? ""}
              onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No client selected</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed client"}
                </option>
              ))}
            </select>
            <div className="muted">Clients come from your Clients page/table.</div>
          </div>

          <div className="row2">
            <div className="field">
              <label>Date</label>
              <input className="input" type="date" value={saleDate} onChange={(e) => setSaleDate(e.target.value)} />
            </div>

            <div className="field">
              <label>Salesperson (optional)</label>
              <select
                className="select"
                value={selectedSellerId ?? ""}
                onChange={(e) => setSelectedSellerId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">No salesperson selected</option>
                {sellers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="muted">Sellers auto-detected from sales_people / sale_sellers.</div>
            </div>
          </div>

          <div className="field">
            <label>Note (optional, applies to all lines)</label>
            <input
              className="input"
              placeholder="Optional note for the whole sale..."
              value={saleNote}
              onChange={(e) => setSaleNote(e.target.value)}
            />
          </div>

          <div className="lines">
            {lines.map((ln) => {
              const it = ln.item_id ? itemById.get(ln.item_id) : null;
              const unitCost = safeNum(it?.cost);
              const qty = Math.max(0, safeNum(ln.qty));
              const price = safeNum(ln.price);
              const fees = safeNum(ln.fees);
              const profit = ln.item_id ? price - fees - unitCost * qty : 0;

              return (
                <div className="line" key={ln.tempId}>
                  <div className="field itemField">
                    <label>Item</label>
                    <select
                      className="select"
                      value={ln.item_id ?? ""}
                      onChange={(e) =>
                        updateLine(ln.tempId, { item_id: e.target.value ? Number(e.target.value) : null })
                      }
                    >
                      <option value="">Select...</option>
                      {items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                    <div className="muted">
                      Cost: <b>{money(unitCost)}</b> (from item_catalog)
                    </div>
                  </div>

                  <div className="field">
                    <label>Units</label>
                    <input
                      className="input"
                      inputMode="numeric"
                      value={ln.qty}
                      onChange={(e) => updateLine(ln.tempId, { qty: safeNum(e.target.value) })}
                    />
                  </div>

                  <div className="field">
                    <label>Total price ($)</label>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={ln.price}
                      onChange={(e) => updateLine(ln.tempId, { price: safeNum(e.target.value) })}
                    />
                  </div>

                  <div className="field feesField">
                    <label>Fees ($)</label>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={ln.fees}
                      onChange={(e) => updateLine(ln.tempId, { fees: safeNum(e.target.value) })}
                    />
                    <div className="profitMini">
                      Line profit: <b>{money(profit)}</b>
                    </div>
                  </div>

                  <div className="removeField">
                    <button className="xBtn" onClick={() => removeLine(ln.tempId)} title="Remove line">
                      ×
                    </button>
                  </div>
                </div>
              );
            })}

            <div className="bottomActions">
              <button className="btn" onClick={addLine}>
                + Add line
              </button>
              <button className="btn btnPrimary" onClick={saveSale} disabled={saving}>
                {saving ? "Saving..." : "Save Sale"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardHeader">
          <div>
            <h2 className="cardTitle" style={{ marginBottom: 4 }}>
              Recent Sales
            </h2>
            <div className="muted">Filter by Day / Month / Year. Export what you’re viewing.</div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span className="pill">Loaded profit: {money(loadedProfit)}</span>
            <button className="btn" onClick={exportCSV} disabled={loading}>
              Export CSV
            </button>
          </div>
        </div>

        <div className="filters" style={{ marginBottom: 12 }}>
          <div>
            <div className="muted" style={{ marginBottom: 6, fontWeight: 950 }}>
              Range
            </div>
            <div className="seg">
              <button className={filterMode === "all" ? "active" : ""} onClick={() => setFilterMode("all")}>
                All
              </button>
              <button className={filterMode === "day" ? "active" : ""} onClick={() => setFilterMode("day")}>
                Day
              </button>
              <button className={filterMode === "month" ? "active" : ""} onClick={() => setFilterMode("month")}>
                Month
              </button>
              <button className={filterMode === "year" ? "active" : ""} onClick={() => setFilterMode("year")}>
                Year
              </button>
            </div>
          </div>

          <div className="field" style={{ minWidth: 140 }}>
            <label>Year</label>
            <select className="select" value={filterYear} onChange={(e) => setFilterYear(Number(e.target.value))}>
              {yearsOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          {filterMode === "day" || filterMode === "month" ? (
            <div className="field" style={{ minWidth: 160 }}>
              <label>Month</label>
              <select className="select" value={filterMonth} onChange={(e) => setFilterMonth(Number(e.target.value))}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {pad2(m)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {filterMode === "day" ? (
            <div className="field" style={{ minWidth: 140 }}>
              <label>Day</label>
              <select className="select" value={filterDay} onChange={(e) => setFilterDay(Number(e.target.value))}>
                {daysInMonth.map((d) => (
                  <option key={d} value={d}>
                    {pad2(d)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="field" style={{ minWidth: 220 }}>
            <label>Salesperson</label>
            <select
              className="select"
              value={filterSellerId}
              onChange={(e) => setFilterSellerId(e.target.value === "all" ? "all" : Number(e.target.value))}
            >
              <option value="all">All</option>
              {sellers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <button className="btn btnPrimary" onClick={fetchSales} disabled={loading}>
            {loading ? "Loading..." : "Apply"}
          </button>
        </div>

        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Client</th>
                <th>Seller</th>
                <th>Items</th>
                <th>Units</th>
                <th>Profit</th>
                <th>Note</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {salesWithComputed.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ opacity: 0.8 }}>
                    {loading ? "Loading..." : "No sales found for this filter."}
                  </td>
                </tr>
              ) : (
                (salesWithComputed as any[]).map((s) => {
                  const clientName = s.client_id ? clientById.get(s.client_id)?.name ?? "—" : "—";
                  const sellerName = s.seller_id ? sellerById.get(s.seller_id)?.name ?? "—" : "—";

                  const itemsText =
                    s.lines
                      .map((ln: any) => `${itemById.get(ln.item_id)?.name ?? `Item#${ln.item_id}`} (${safeNum(ln.qty)})`)
                      .join(", ") || "—";

                  return (
                    <tr key={s.id}>
                      <td>{s.sale_date ?? "—"}</td>
                      <td>{clientName ?? "—"}</td>
                      <td>{sellerName ?? "—"}</td>
                      <td style={{ maxWidth: 420 }}>{itemsText}</td>
                      <td>{s.units ?? 0}</td>
                      <td>{money(s.profit ?? 0)}</td>
                      <td style={{ maxWidth: 240 }}>{s.notes ?? "—"}</td>
                      <td>
                        <button className="btn btnDanger" onClick={() => deleteSale(s.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="muted" style={{ marginTop: 10 }}>
          Export downloads exactly what you’re filtered to.
        </div>
      </div>
    </div>
  );
}
