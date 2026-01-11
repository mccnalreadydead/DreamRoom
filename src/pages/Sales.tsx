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

// Excel serial date (45989) OR "45989" -> YYYY-MM-DD
function excelSerialToISO(v: any) {
  if (typeof v === "number" && v > 20000) {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d+(\.\d+)?$/.test(s)) {
      const n = Number(s);
      if (Number.isFinite(n) && n > 20000) return excelSerialToISO(n);
    }
    return s;
  }

  return String(v ?? "").trim();
}

// Always return YYYY-MM-DD if possible
function normalizeDate(v: any) {
  const iso = excelSerialToISO(v);

  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;

  const d = new Date(iso);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return String(iso ?? "").trim();
}

function getYearMonth(dateStr: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return { year: "", month: "" };
  return { year: m[1], month: m[2] };
}

export default function Sales() {
  const [rows, setRows] = useState<Row[]>([]);
  const [year, setYear] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");

  // Add-sale form
  const [newDate, setNewDate] = useState<string>(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [newUnits, setNewUnits] = useState<string>("1");
  const [newProfit, setNewProfit] = useState<string>("0");
  const [newNote, setNewNote] = useState<string>("");

  function reload() {
    setRows(load("sales"));
  }

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  // Normalize each row so filtering works even if old imports had weird date format
  const normalized = useMemo(() => {
    return rows.map((r) => {
      const date = normalizeDate(r.date ?? r.Date ?? r.SoldDate ?? r.timestamp ?? "");
      const ym = getYearMonth(date);
      return {
        ...r,
        date,
        __year: ym.year,
        __month: ym.month,
        unitsSold: toNumber(r.unitsSold ?? r["units sold"] ?? r.qty ?? r.Qty ?? 0),
        profit: toNumber(r.profit ?? r.Profit ?? r["Total Profit"] ?? 0),
        note: String(r.note ?? r.Note ?? r.notes ?? r.Notes ?? ""),
      };
    });
  }, [rows]);

  const yearOptions = useMemo(() => {
    const set = new Set<string>();
    normalized.forEach((r: any) => {
      if (r.__year) set.add(r.__year);
    });
    return Array.from(set).sort();
  }, [normalized]);

  const filtered = useMemo(() => {
    return normalized.filter((r: any) => {
      if (year !== "all" && r.__year !== year) return false;
      if (month !== "all" && r.__month !== month) return false;
      return true;
    });
  }, [normalized, year, month]);

  // Keep newest first (by date)
  const filteredSorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
    return copy;
  }, [filtered]);

  const totals = useMemo(() => {
    const units = filteredSorted.reduce((s: number, r: any) => s + toNumber(r.unitsSold), 0);
    const profit = filteredSorted.reduce((s: number, r: any) => s + toNumber(r.profit), 0);
    return { units, profit };
  }, [filteredSorted]);

  function addSale() {
    const date = normalizeDate(newDate);
    const unitsSold = Math.max(0, toNumber(newUnits));
    const profit = toNumber(newProfit);
    const note = newNote.trim();

    if (!date) return alert("Pick a date.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert("Date must be YYYY-MM-DD (use the date picker).");
    if (unitsSold <= 0) return alert("Units sold must be 1 or more.");

    const newRow: Row = {
      date,
      unitsSold,
      profit,
      note,
      source: "manual",
      createdAt: new Date().toISOString(),
    };

    const next = [newRow, ...rows];
    setRows(next);
    save("sales", next);

    setNewUnits("1");
    setNewProfit("0");
    setNewNote("");
  }

  function clearFilters() {
    setYear("all");
    setMonth("all");
  }

  return (
    <div className="page">
      <div className="row">
        <h1 style={{ margin: 0 }}>Sales</h1>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn" onClick={reload}>Reload</button>
          <button className="btn" onClick={clearFilters}>Clear Filters</button>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "360px 1fr",
          gap: 14,
          marginTop: 14,
          alignItems: "start",
        }}
      >
        {/* LEFT PANEL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {/* ✅ ADD NEW SALE FIRST (BIGGER + LARGER TEXT) */}
          <div className="card" style={{ padding: 16 }}>
            <h2 style={{ marginTop: 0, fontSize: 20 }}>Add New Sale</h2>

            <label className="label" style={{ fontSize: 14 }}>Date</label>
            <input
              className="input"
              style={{ fontSize: 14, padding: 12 }}
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
              <div>
                <label className="label" style={{ fontSize: 14 }}>Units sold</label>
                <input
                  className="input"
                  style={{ fontSize: 14, padding: 12 }}
                  value={newUnits}
                  onChange={(e) => setNewUnits(e.target.value)}
                />
              </div>
              <div>
                <label className="label" style={{ fontSize: 14 }}>Profit ($)</label>
                <input
                  className="input"
                  style={{ fontSize: 14, padding: 12 }}
                  value={newProfit}
                  onChange={(e) => setNewProfit(e.target.value)}
                />
              </div>
            </div>

            <label className="label" style={{ marginTop: 10, fontSize: 14 }}>Note (optional)</label>
            <input
              className="input"
              style={{ fontSize: 14, padding: 12 }}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
            />

            <div style={{ marginTop: 12 }}>
              <button className="btn primary" style={{ fontSize: 14, padding: "10px 14px" }} onClick={addSale}>
                Add Sale
              </button>
            </div>

            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Adds a manual sale and updates Dashboard automatically.
            </p>
          </div>

          {/* ✅ FILTER SALES SECOND (UNCHANGED LOGIC) */}
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Filter Sales</h2>

            <label className="label">Year</label>
            <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value="all">All years</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <label className="label" style={{ marginTop: 10 }}>Month</label>
            <select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>
              <option value="all">All months</option>
              {Array.from({ length: 12 }).map((_, i) => {
                const mm = String(i + 1).padStart(2, "0");
                return <option key={mm} value={mm}>{mm}</option>;
              })}
            </select>

            <div className="grid3" style={{ marginTop: 12 }}>
              <div className="card" style={{ margin: 0 }}>
                <div className="kpiLabel">Rows (filtered)</div>
                <div className="kpiValue">{filteredSorted.length}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="kpiLabel">Units (filtered)</div>
                <div className="kpiValue">{totals.units.toLocaleString()}</div>
              </div>
              <div className="card" style={{ margin: 0 }}>
                <div className="kpiLabel">Profit (filtered)</div>
                <div className="kpiValue">${totals.profit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
              </div>
            </div>

            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              Data key: <span className="pill">sales</span> — total saved rows: <span className="pill">{rows.length}</span>
            </p>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Sales List</h2>

          {filteredSorted.length === 0 ? (
            <p className="muted">
              No rows match your filter.
              <br />
              If you expected data, go to <b>Import/Export</b> and click <b>IMPORT ALL</b> again.
            </p>
          ) : (
            <div className="tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 130 }}>Date</th>
                    <th style={{ width: 120 }}>Units Sold</th>
                    <th style={{ width: 140 }}>Profit</th>
                    <th>Note</th>
                    <th style={{ width: 120 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSorted.map((r: any, i: number) => (
                    <tr key={i}>
                      <td>{String(r.date ?? "")}</td>
                      <td>{toNumber(r.unitsSold).toLocaleString()}</td>
                      <td>${toNumber(r.profit).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td>{String(r.note ?? "")}</td>
                      <td>{String(r.source ?? (r.createdAt ? "manual" : "import"))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Tip: set Year + Month on the left to see November/December totals.
          </p>
        </div>
      </div>
    </div>
  );
}
