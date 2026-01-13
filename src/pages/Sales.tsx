import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";
import { useLocalDraft } from "../hooks/useLocalDraft";

type SaleRow = {
  id: number;
  date: string | null; // YYYY-MM-DD
  item: string | null;
  units_sold: number | null;
  profit: number | null;
  note: string | null;
};

type SaleLine = {
  item: string;
  units: number;
  profit: number;
};

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toInt(v: any): number {
  const n = Math.floor(Number(String(v).replace(/[^0-9-]/g, "")));
  return Number.isFinite(n) ? n : 0;
}

function toNum(v: any): number {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function getYear(iso: string | null) {
  // "YYYY-MM-DD" -> "YYYY"
  if (!iso || iso.length < 4) return "";
  return iso.slice(0, 4);
}

function getMonth(iso: string | null) {
  // "YYYY-MM-DD" -> "01".."12"
  if (!iso || iso.length < 7) return "";
  return iso.slice(5, 7);
}

function monthLabel(mm: string) {
  const mi = Number(mm) - 1;
  if (!Number.isFinite(mi) || mi < 0 || mi > 11) return mm;
  const d = new Date(2000, mi, 1);
  return d.toLocaleString(undefined, { month: "long" });
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ✅ Filters: Year + Month dropdowns (both have "All")
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all"); // "01".."12" or "all"

  // ✅ Draft autosave (so leaving the page doesn't wipe the form)
  const { state: draft, setState: setDraft, clear: clearDraft } = useLocalDraft("dead-inventory:sales:draft", {
    date: todayISO(),
    note: "",
    lines: [{ item: "", units: 1, profit: 0 }] as SaleLine[],
  });

  const date = draft.date as string;
  const note = draft.note as string;
  const lines = draft.lines as SaleLine[];

  async function load() {
    setLoading(true);
    setErr("");

    const inv = await supabase.from("inventory").select("item").order("item", { ascending: true });
    if (inv.error) setErr(inv.error.message);
    setInventoryItems((inv.data ?? []).map((x: any) => x.item));

    const sales = await supabase
      .from("Sales")
      .select("id,date,item,units_sold,profit,note")
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (sales.error) setErr(sales.error.message);
    setRows((sales.data as any) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function addLine() {
    setDraft((d: any) => ({
      ...d,
      lines: [...(d.lines ?? []), { item: "", units: 1, profit: 0 }],
    }));
  }

  function removeLine(idx: number) {
    setDraft((d: any) => {
      const next = [...(d.lines ?? [])];
      next.splice(idx, 1);
      return { ...d, lines: next.length ? next : [{ item: "", units: 1, profit: 0 }] };
    });
  }

  function updateLine(idx: number, patch: Partial<SaleLine>) {
    setDraft((d: any) => {
      const next = [...(d.lines ?? [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...d, lines: next };
    });
  }

  const formTotalProfit = useMemo(() => {
    return lines.reduce((sum, ln) => sum + Number(ln.profit ?? 0), 0);
  }, [lines]);

  async function addSale() {
    // validate at least 1 valid line
    const cleanLines = lines
      .map((ln) => ({
        item: String(ln.item ?? "").trim(),
        units: Math.max(0, Number(ln.units ?? 0)),
        profit: Number(ln.profit ?? 0),
      }))
      .filter((ln) => ln.item && ln.units > 0);

    if (!cleanLines.length) {
      alert("Add at least one line with an item and units > 0.");
      return;
    }

    setErr("");

    // 1) insert multiple sale rows (one per item line)
    const inserts = cleanLines.map((ln) => ({
      date,
      item: ln.item,
      units_sold: ln.units,
      profit: ln.profit,
      note: String(note || "").trim() || null,
    }));

    const { error: insErr } = await supabase.from("Sales").insert(inserts);
    if (insErr) {
      setErr(insErr.message);
      return;
    }

    // 2) deduct inventory per line item
    // (read qty -> update qty)
    for (const ln of cleanLines) {
      const invRow = await supabase.from("inventory").select("id,qty").eq("item", ln.item).maybeSingle();

      if (invRow.error) {
        setErr(`Sale saved, but inventory lookup failed for "${ln.item}": ${invRow.error.message}`);
        continue;
      }

      if (invRow.data?.id != null) {
        const currentQty = Number(invRow.data.qty ?? 0);
        const nextQty = Math.max(0, currentQty - Number(ln.units ?? 0));
        const upd = await supabase.from("inventory").update({ qty: nextQty }).eq("id", invRow.data.id);

        if (upd.error) {
          setErr(`Sale saved, but inventory could not update for "${ln.item}": ${upd.error.message}`);
        }
      } else {
        setErr(`Sale saved, but no matching inventory item found to deduct for "${ln.item}".`);
      }
    }

    // reset form
    setDraft({ date: todayISO(), note: "", lines: [{ item: "", units: 1, profit: 0 }] });
    clearDraft();

    await load();
  }

  async function deleteSale(id: number) {
    const ok = confirm("Delete this sale entry?");
    if (!ok) return;

    setErr("");
    const { error } = await supabase.from("Sales").delete().eq("id", id);
    if (error) setErr(error.message);
    await load();
  }

  const totalProfit = useMemo(() => {
    return rows.reduce((sum, r) => sum + Number(r.profit ?? 0), 0);
  }, [rows]);

  // ✅ Build year options from actual data (newest -> oldest)
  const yearOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of rows) {
      const y = getYear(r.date);
      if (!y) continue;
      if (seen.has(y)) continue;
      seen.add(y);
      list.push(y);
    }
    return list;
  }, [rows]);

  // ✅ Build month options from actual data.
  // If a year is selected, only show months that exist in that year.
  // If year = all, show any months that exist across all years.
  const monthOptions = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of rows) {
      const y = getYear(r.date);
      const m = getMonth(r.date);
      if (!m) continue;
      if (filterYear !== "all" && y !== filterYear) continue;
      if (seen.has(m)) continue;
      seen.add(m);
      list.push(m);
    }

    // Sort months in calendar order 01..12
    list.sort((a, b) => Number(a) - Number(b));
    return list;
  }, [rows, filterYear]);

  // ✅ If the user switches year, and the current month no longer exists, reset month to All
  useEffect(() => {
    if (filterMonth === "all") return;
    if (!monthOptions.includes(filterMonth)) {
      setFilterMonth("all");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, rows]);

  // ✅ Filter + sort rows by date (always ordered by date)
  const filteredRows = useMemo(() => {
    const base = rows.filter((r) => {
      const y = getYear(r.date);
      const m = getMonth(r.date);

      const yearOk = filterYear === "all" ? true : y === filterYear;
      const monthOk = filterMonth === "all" ? true : m === filterMonth;

      return yearOk && monthOk;
    });

    // Keep predictable order: date desc, then id desc (null dates last)
    base.sort((a, b) => {
      const ad = a.date ?? "";
      const bd = b.date ?? "";
      if (ad && bd) {
        if (ad > bd) return -1;
        if (ad < bd) return 1;
      } else if (ad && !bd) return -1;
      else if (!ad && bd) return 1;

      const ai = Number(a.id ?? 0);
      const bi = Number(b.id ?? 0);
      return bi - ai;
    });

    return base;
  }, [rows, filterYear, filterMonth]);

  const filteredTotalProfit = useMemo(() => {
    return filteredRows.reduce((sum, r) => sum + Number(r.profit ?? 0), 0);
  }, [filteredRows]);

  const filterLabel = useMemo(() => {
    if (filterYear === "all" && filterMonth === "all") return "All time";
    if (filterYear !== "all" && filterMonth === "all") return `Year: ${filterYear}`;
    if (filterYear === "all" && filterMonth !== "all") return `Month: ${monthLabel(filterMonth)}`;
    return `${monthLabel(filterMonth)} ${filterYear}`;
  }, [filterYear, filterMonth]);

  return (
    <div className="page">
      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Sales</h1>
        <button className="btn" onClick={load} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <p className="muted" style={{ marginTop: 8 }}>
        Total profit (all time): <b>${totalProfit.toFixed(2)}</b>
      </p>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0, marginBottom: 0 }}>Add Sale</h2>
          <div className="muted" style={{ fontSize: 13 }}>
            Form total profit: <b>${formTotalProfit.toFixed(2)}</b>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 10 }}>
          <div style={{ gridColumn: "span 4" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Date
            </div>
            <input
              className="input"
              type="date"
              value={date}
              onChange={(e) => setDraft((d: any) => ({ ...d, date: e.target.value }))}
            />
          </div>

          <div style={{ gridColumn: "span 8" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Note (optional, applies to all lines)
            </div>
            <input className="input" value={note} onChange={(e) => setDraft((d: any) => ({ ...d, note: e.target.value }))} />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800, marginBottom: 6 }}>
              Items
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {lines.map((ln, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: 10,
                    borderColor: "rgba(255,255,255,0.10)",
                    display: "grid",
                    gridTemplateColumns: "4fr 2fr 2fr auto",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                      Item
                    </div>
                    <select className="input" value={ln.item} onChange={(e) => updateLine(idx, { item: e.target.value })}>
                      <option value="">Select…</option>
                      {inventoryItems.map((it) => (
                        <option key={it} value={it}>
                          {it}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                      Units
                    </div>
                    <input className="input" value={ln.units} onChange={(e) => updateLine(idx, { units: toInt(e.target.value) })} />
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
                      Profit ($)
                    </div>
                    <input className="input" value={ln.profit} onChange={(e) => updateLine(idx, { profit: toNum(e.target.value) })} />
                  </div>

                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button className="btn" type="button" onClick={() => removeLine(idx)} title="Remove line">
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" type="button" onClick={addLine}>
                + Add line
              </button>
              <button className="btn primary" type="button" onClick={addSale}>
                Save Sale
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 760px) {
            .page .card h2 { font-size: 18px; }
            .page .card > div[style*="grid-template-columns: repeat(12"] {
              grid-template-columns: repeat(6, 1fr) !important;
            }
            .page .card > div[style*="grid-template-columns: repeat(12"] > div {
              grid-column: span 6 !important;
            }
          }
          @media (max-width: 760px) {
            .page .card .card[style*="grid-template-columns: 4fr"]{
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0 }}>Recent Sales</h2>

          {/* ✅ Clean filters: Year dropdown + Month dropdown + All handled via options */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Year
            </div>
            <select
              className="input"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              style={{ minWidth: 140, height: 38 }}
            >
              <option value="all">All</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <div className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
              Month
            </div>
            <select
              className="input"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              style={{ minWidth: 170, height: 38 }}
            >
              <option value="all">All</option>
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>

            <button
              className="btn"
              type="button"
              onClick={() => {
                setFilterYear("all");
                setFilterMonth("all");
              }}
              disabled={filterYear === "all" && filterMonth === "all"}
            >
              All
            </button>

            <div className="muted" style={{ fontSize: 13 }}>
              {filterLabel} profit: <b>${filteredTotalProfit.toFixed(2)}</b>
            </div>
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                {["Date", "Item", "Units", "Profit", "Note", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      letterSpacing: 0.3,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r) => (
                <tr key={r.id}>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{r.date ?? ""}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <b>{r.item ?? ""}</b>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{Number(r.units_sold ?? 0)}</td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    ${Number(r.profit ?? 0).toFixed(2)}
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <span className="muted">{r.note ?? ""}</span>
                  </td>
                  <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                    <button className="btn" onClick={() => deleteSale(r.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {!filteredRows.length ? (
                <tr>
                  <td colSpan={6} style={{ padding: 14 }} className="muted">
                    No sales yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <style>{`
          @media (max-width: 760px) {
            .page .card select.input {
              min-width: 140px !important;
            }
          }
        `}</style>
      </div>
    </div>
  );
}
