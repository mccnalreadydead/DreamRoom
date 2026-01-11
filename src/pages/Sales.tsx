import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

function load(key: string): Row[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(key: string, rows: Row[]) {
  localStorage.setItem(key, JSON.stringify(rows));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function normalizeDate(v: any) {
  if (typeof v === "number" && v > 20000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return s;
  }
  return "";
}

function getYearMonth(dateStr: string) {
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!m) return { year: "", month: "" };
  return { year: m[1], month: m[2] };
}

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function getItemName(i: any): string {
  return (
    i?.name ??
    i?.item ??
    i?.product ??
    i?.title ??
    i?.sku ??
    ""
  );
}

function getQty(i: any): number {
  return toNumber(i?.qty ?? i?.quantity ?? i?.onHand ?? i?.stock ?? 0);
}

function setQty(i: any, newQty: number) {
  if ("qty" in i) i.qty = newQty;
  else if ("quantity" in i) i.quantity = newQty;
  else if ("onHand" in i) i.onHand = newQty;
  else if ("stock" in i) i.stock = newQty;
  else i.qty = newQty; // fallback
}

function getUnitCost(i: any): number {
  return toNumber(i?.unitCost ?? i?.cost ?? i?.wholesale ?? i?.buyPrice ?? 0);
}

export default function Sales() {
  const [sales, setSales] = useState<Row[]>([]);
  const [inventory, setInventory] = useState<Row[]>([]);

  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");

  // Add sale fields
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newItem, setNewItem] = useState<string>("");
  const [newUnits, setNewUnits] = useState<string>("1");
  const [newPriceEach, setNewPriceEach] = useState<string>("0");
  const [newNote, setNewNote] = useState<string>("");

  function reloadAll() {
    setSales(load("sales"));
    setInventory(load("inventory"));
  }

  useEffect(() => {
    reloadAll();
    const onUpdate = () => reloadAll();
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const inventoryOptions = useMemo(() => {
    const names = inventory
      .map(getItemName)
      .map((n) => String(n || "").trim())
      .filter(Boolean);

    // unique + sorted
    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
  }, [inventory]);

  const normalizedSales = useMemo(() => {
    return sales.map((r) => {
      const date = normalizeDate(r.date);
      const ym = getYearMonth(date);
      const unitsSold = toNumber(r.unitsSold);
      const priceEach = toNumber(r.priceEach);
      const revenue = toNumber(r.revenue ?? unitsSold * priceEach);
      const profit = toNumber(r.profit); // keep if provided
      return {
        ...r,
        date,
        __year: ym.year,
        __month: ym.month,
        unitsSold,
        priceEach,
        revenue,
        profit,
      };
    });
  }, [sales]);

  const yearOptions = useMemo(() => {
    const s = new Set<string>();
    normalizedSales.forEach((r: any) => r.__year && s.add(r.__year));
    return Array.from(s).sort();
  }, [normalizedSales]);

  const filtered = useMemo(() => {
    return normalizedSales.filter((r: any) => {
      if (year !== "all" && r.__year !== year) return false;
      if (month !== "all" && r.__month !== month) return false;
      return true;
    });
  }, [normalizedSales, year, month]);

  const totals = useMemo(() => {
    return {
      units: filtered.reduce((s: number, r: any) => s + toNumber(r.unitsSold), 0),
      revenue: filtered.reduce((s: number, r: any) => s + toNumber(r.revenue), 0),
      profit: filtered.reduce((s: number, r: any) => s + toNumber(r.profit), 0),
    };
  }, [filtered]);

  function addSale() {
    const date = normalizeDate(newDate);
    const item = newItem.trim();
    const unitsSold = toNumber(newUnits);
    const priceEach = toNumber(newPriceEach);

    if (!date) return alert("Pick a date.");
    if (!item) return alert("Pick an item you sold.");
    if (unitsSold <= 0) return alert("Units sold must be at least 1.");

    // Deduct inventory
    const invCopy = [...inventory];
    const invIndex = invCopy.findIndex((x) => getItemName(x).trim() === item);

    if (invIndex === -1) {
      return alert(`That item isn't in inventory: "${item}"`);
    }

    const currentQty = getQty(invCopy[invIndex]);
    if (currentQty < unitsSold) {
      return alert(`Not enough stock. You have ${currentQty}, trying to sell ${unitsSold}.`);
    }

    setQty(invCopy[invIndex], currentQty - unitsSold);

    // Compute revenue and profit (profit = (priceEach - unitCost) * unitsSold)
    const unitCost = getUnitCost(invCopy[invIndex]);
    const revenue = unitsSold * priceEach;
    const profit = (priceEach - unitCost) * unitsSold;

    // Save sale row
    const nextSales = [
      {
        date,
        item,
        unitsSold,
        priceEach,
        revenue,
        profit,
        note: newNote.trim(),
        source: "manual",
      },
      ...sales,
    ];

    save("inventory", invCopy);
    save("sales", nextSales);

    setInventory(invCopy);
    setSales(nextSales);

    // reset inputs
    setNewUnits("1");
    setNewPriceEach("0");
    setNewNote("");
  }

  return (
    <div className="page">
      <h1>Sales</h1>

      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr", gap: 14 }}>
        <div>
          {/* Add Sale */}
          <div className="card" style={{ padding: 16 }}>
            <h2 style={{ fontSize: 18 }}>Add New Sale</h2>

            <label className="label">Date</label>
            <input className="input" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />

            <label className="label">Item Sold</label>
            <select className="input" value={newItem} onChange={(e) => setNewItem(e.target.value)}>
              <option value="">Select an item…</option>
              {inventoryOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>

            <label className="label">Units Sold</label>
            <input className="input" value={newUnits} onChange={(e) => setNewUnits(e.target.value)} />

            <label className="label">Sale Price (Each)</label>
            <input className="input" value={newPriceEach} onChange={(e) => setNewPriceEach(e.target.value)} />

            <label className="label">Note</label>
            <input className="input" value={newNote} onChange={(e) => setNewNote(e.target.value)} />

            <button className="btn primary" onClick={addSale} style={{ marginTop: 12 }}>
              Add Sale + Deduct Inventory
            </button>

            <p className="muted" style={{ marginTop: 10 }}>
              This will subtract the sold quantity from Inventory automatically.
            </p>
          </div>

          {/* Filter */}
          <div className="card" style={{ marginTop: 14 }}>
            <h2>Filter Sales</h2>

            <label className="label">Year</label>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">All Years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <label className="label">Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">All Months</option>
              {MONTHS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>

            <div className="muted" style={{ marginTop: 10 }}>
              Units: {totals.units} | Revenue: ${totals.revenue.toLocaleString()} | Profit: ${totals.profit.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Sales table */}
        <div className="card">
          <h2>Sales List</h2>
          {filtered.length === 0 ? (
            <p className="muted">No sales found.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Units</th>
                  <th>Price Each</th>
                  <th>Revenue</th>
                  <th>Profit</th>
                  <th>Note</th>
                  <th>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any, i: number) => (
                  <tr key={i}>
                    <td>{r.date}</td>
                    <td>{r.item}</td>
                    <td>{r.unitsSold}</td>
                    <td>${toNumber(r.priceEach).toLocaleString()}</td>
                    <td>${toNumber(r.revenue).toLocaleString()}</td>
                    <td>${toNumber(r.profit).toLocaleString()}</td>
                    <td>{r.note}</td>
                    <td>{r.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
