// src/pages/Sales.tsx
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
  client_id: number | null;
};

type SaleLine = {
  item: string;
  units: number;
  profit: number;
};

type ClientRow = {
  id: number;
  name: string | null;
  phone: string | null;
  email: string | null;
  last_spoken: string | null; // YYYY-MM-DD
  notes: string | null;
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
  if (!iso || iso.length < 4) return "";
  return iso.slice(0, 4);
}

function getMonth(iso: string | null) {
  if (!iso || iso.length < 7) return "";
  return iso.slice(5, 7);
}

function monthLabel(mm: string) {
  const mi = Number(mm) - 1;
  if (!Number.isFinite(mi) || mi < 0 || mi > 11) return mm;
  const d = new Date(2000, mi, 1);
  return d.toLocaleString(undefined, { month: "long" });
}

function norm(s: any) {
  return String(s ?? "").trim();
}

export default function Sales() {
  const [rows, setRows] = useState<SaleRow[]>([]);
  const [inventoryItems, setInventoryItems] = useState<string[]>([]);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Filters
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");

  // Draft autosave
  const { state: draft, setState: setDraft, clear: clearDraft } = useLocalDraft("dead-inventory:sales:draft", {
    date: todayISO(),
    note: "",
    client_id: null as number | null,
    lines: [{ item: "", units: 1, profit: 0 }] as SaleLine[],
  });

  const date = draft.date as string;
  const note = (draft.note as string) ?? "";
  const lines = draft.lines as SaleLine[];
  const clientId = (draft.client_id as number | null) ?? null;

  // Client picker state (search)
  const [clientSearch, setClientSearch] = useState("");
  const [clientPickerOpen, setClientPickerOpen] = useState(false);

  // Quick add client modal
  const [clientAddOpen, setClientAddOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [newClientEmail, setNewClientEmail] = useState("");
  const [newClientLastSpoken, setNewClientLastSpoken] = useState<string>("");
  const [newClientNotes, setNewClientNotes] = useState("");

  const clientMap = useMemo(() => {
    const m = new Map<number, ClientRow>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const selectedClient = useMemo(() => {
    if (!clientId) return null;
    return clientMap.get(clientId) ?? null;
  }, [clientId, clientMap]);

  const filteredClients = useMemo(() => {
    const q = norm(clientSearch).toLowerCase();
    if (!q) return clients.slice(0, 30);
    const out = clients.filter((c) => {
      const name = String(c.name ?? "").toLowerCase();
      const email = String(c.email ?? "").toLowerCase();
      const phone = String(c.phone ?? "").toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
    return out.slice(0, 50);
  }, [clients, clientSearch]);

  async function load() {
    setLoading(true);
    setErr("");

    const inv = await supabase.from("inventory").select("item").order("item", { ascending: true });
    if (inv.error) setErr(inv.error.message);
    setInventoryItems((inv.data ?? []).map((x: any) => x.item));

    const cl = await supabase
      .from("clients")
      .select("id,name,phone,email,last_spoken,notes")
      .order("name", { ascending: true });

    if (cl.error) setErr(cl.error.message);
    setClients((cl.data as any) ?? []);

    const sales = await supabase
      .from("Sales")
      .select("id,date,item,units_sold,profit,note,client_id")
      .order("date", { ascending: false })
      .order("id", { ascending: false });

    if (sales.error) setErr(sales.error.message);
    setRows((sales.data as any) ?? []);

    setLoading(false);
  }

  useEffect(() => {
    void load();
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

    const inserts = cleanLines.map((ln) => ({
      date,
      item: ln.item,
      units_sold: ln.units,
      profit: ln.profit,
      note: String(note || "").trim() || null,
      client_id: clientId ?? null,
    }));

    const { error: insErr } = await supabase.from("Sales").insert(inserts);
    if (insErr) {
      setErr(insErr.message);
      return;
    }

    // deduct inventory per line item
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

    setDraft({ date: todayISO(), note: "", client_id: null, lines: [{ item: "", units: 1, profit: 0 }] });
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
    list.sort((a, b) => Number(a) - Number(b));
    return list;
  }, [rows, filterYear]);

  useEffect(() => {
    if (filterMonth === "all") return;
    if (!monthOptions.includes(filterMonth)) setFilterMonth("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterYear, rows]);

  const filteredRows = useMemo(() => {
    const base = rows.filter((r) => {
      const y = getYear(r.date);
      const m = getMonth(r.date);
      const yearOk = filterYear === "all" ? true : y === filterYear;
      const monthOk = filterMonth === "all" ? true : m === filterMonth;
      return yearOk && monthOk;
    });

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

  function openClientPicker() {
    setClientPickerOpen(true);
    setClientSearch("");
  }

  function chooseClient(id: number | null) {
    setDraft((d: any) => ({ ...d, client_id: id }));
    setClientPickerOpen(false);
    setClientSearch("");
  }

  function openQuickAddClient() {
    setNewClientName("");
    setNewClientPhone("");
    setNewClientEmail("");
    setNewClientLastSpoken("");
    setNewClientNotes("");
    setClientAddOpen(true);
  }

  async function createClientQuick() {
    setErr("");
    const payload = {
      name: norm(newClientName) || null,
      phone: norm(newClientPhone) || null,
      email: norm(newClientEmail) || null,
      last_spoken: norm(newClientLastSpoken) || null,
      notes: norm(newClientNotes) || null,
    };

    const { data, error } = await supabase.from("clients").insert([payload]).select("id").maybeSingle();
    if (error) {
      setErr(error.message);
      return;
    }

    await load();
    const newId = (data as any)?.id ?? null;
    if (newId) {
      setDraft((d: any) => ({ ...d, client_id: newId }));
    }
    setClientAddOpen(false);
  }

  return (
    <div className="page sales2-page">
      <style>{`
        .sales2-page{ position: relative; isolation: isolate; }
        .sales2-page:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(820px 420px at 10% 12%, rgba(90,140,255,0.14), transparent 60%),
            radial-gradient(560px 420px at 90% 14%, rgba(212,175,55,0.12), transparent 55%),
            radial-gradient(900px 560px at 50% 98%, rgba(0,0,0,0.88), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.86));
          opacity: .98;
        }
        .sales2-page > *{ position: relative; z-index: 1; }

        .sales2-pill{
          font-size: 12px;
          font-weight: 950;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.95);
          white-space: nowrap;
        }

        .sales2-input{
          padding: 0.46em 0.70em;
          height: 38px;
          line-height: 38px;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid rgba(120,160,255,0.18);
          background: linear-gradient(180deg, rgba(18,30,60,0.62), rgba(10,14,28,0.62));
          color: rgba(255,255,255,0.92);
          outline: none;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03), 0 10px 26px rgba(0,0,0,0.22);
        }
        .sales2-input:focus{
          border-color: rgba(212,175,55,0.36);
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.03), 0 0 0 3px rgba(212,175,55,0.10), 0 14px 34px rgba(0,0,0,0.28);
        }
        select.sales2-input option{
          background: #070a14 !important;
          color: #ffffff !important;
        }

        .sales2-clientChip{
          display:flex;
          gap: 10px;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 16px;
          border: 1px solid rgba(120,160,255,0.16);
          background: radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.08), transparent 60%),
                      radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.06), transparent 60%),
                      rgba(0,0,0,0.42);
          backdrop-filter: blur(12px);
          box-shadow: 0 22px 70px rgba(0,0,0,0.35);
        }

        .sales2-overlay{
          position: fixed; inset:0;
          background: rgba(0,0,0,0.74);
          display:flex; align-items:center; justify-content:center;
          padding:14px;
          z-index: 60;
        }
        .sales2-modal{
          width: min(760px, 100%);
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.16);
          background: radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.10), transparent 60%),
                      radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.08), transparent 60%),
                      rgba(8,10,18,0.88);
          box-shadow: 0 24px 70px rgba(0,0,0,0.48);
          backdrop-filter: blur(12px);
        }
        .sales2-modalGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }
        @media (max-width: 780px){
          .sales2-modalGrid{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="row" style={{ alignItems: "center" }}>
        <h1 style={{ margin: 0 }}>Sales</h1>
        <button className="btn" onClick={() => void load()} disabled={loading}>
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
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Add Sale</h2>
            <span className="sales2-pill">Form profit: ${formTotalProfit.toFixed(2)}</span>
          </div>
        </div>

        {/* Client selector (optional) */}
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
            Client (optional)
          </div>

          <div className="sales2-clientChip">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1.15 }}>
                {selectedClient?.name?.trim()
                  ? selectedClient.name
                  : selectedClient
                  ? `Client #${selectedClient.id}`
                  : "No client selected"}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {selectedClient
                  ? [selectedClient.email, selectedClient.phone].filter(Boolean).join(" • ") || "No contact details"
                  : "Tag a client to this sale (searchable)."}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <button className="btn" type="button" onClick={openClientPicker}>
                {selectedClient ? "Change" : "Select"}
              </button>
              {selectedClient ? (
                <button className="btn" type="button" onClick={() => chooseClient(null)}>
                  Clear
                </button>
              ) : null}
              <button className="btn primary" type="button" onClick={openQuickAddClient}>
                + New Client
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(12, 1fr)", gap: 10, marginTop: 12 }}>
          <div style={{ gridColumn: "span 4" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
              Date
            </div>
            <input
              className="sales2-input"
              type="date"
              value={date}
              onChange={(e) => setDraft((d: any) => ({ ...d, date: e.target.value }))}
              style={{ width: "100%" }}
            />
          </div>

          <div style={{ gridColumn: "span 8" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
              Note (optional, applies to all lines)
            </div>
            <input
              className="sales2-input"
              value={note}
              onChange={(e) => setDraft((d: any) => ({ ...d, note: e.target.value }))}
              style={{ width: "100%" }}
              placeholder="Optional note for the whole sale..."
            />
          </div>

          <div style={{ gridColumn: "span 12" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
              Items
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              {lines.map((ln, idx) => (
                <div
                  key={idx}
                  className="card"
                  style={{
                    padding: 12,
                    borderColor: "rgba(120,160,255,0.14)",
                    background: "rgba(0,0,0,0.35)",
                    display: "grid",
                    gridTemplateColumns: "4fr 2fr 2fr auto",
                    gap: 10,
                    alignItems: "center",
                    borderRadius: 18,
                  }}
                >
                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                      Item
                    </div>
                    <select
                      className="sales2-input"
                      value={ln.item}
                      onChange={(e) => updateLine(idx, { item: e.target.value })}
                      style={{ width: "100%" }}
                    >
                      <option value="">Select…</option>
                      {inventoryItems.map((it) => (
                        <option key={it} value={it}>
                          {it}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                      Units
                    </div>
                    <input
                      className="sales2-input"
                      value={ln.units}
                      onChange={(e) => updateLine(idx, { units: toInt(e.target.value) })}
                      style={{ width: "100%" }}
                    />
                  </div>

                  <div>
                    <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
                      Profit ($)
                    </div>
                    <input
                      className="sales2-input"
                      value={ln.profit}
                      onChange={(e) => updateLine(idx, { profit: toNum(e.target.value) })}
                      style={{ width: "100%" }}
                    />
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
              <button className="btn primary" type="button" onClick={() => void addSale()}>
                Save Sale
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @media (max-width: 760px) {
            .sales2-page .card > div[style*="grid-template-columns: repeat(12"] {
              grid-template-columns: repeat(6, 1fr) !important;
            }
            .sales2-page .card > div[style*="grid-template-columns: repeat(12"] > div {
              grid-column: span 6 !important;
            }
            .sales2-page .card .card[style*="grid-template-columns: 4fr"]{
              grid-template-columns: 1fr !important;
            }
          }
        `}</style>
      </div>

      <div className="card" style={{ padding: 12, marginTop: 12 }}>
        <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <h2 style={{ marginTop: 0 }}>Recent Sales</h2>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
              Year
            </div>
            <select
              className="sales2-input"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              style={{ minWidth: 140 }}
            >
              <option value="all">All</option>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            <div className="muted" style={{ fontSize: 12, fontWeight: 900 }}>
              Month
            </div>
            <select
              className="sales2-input"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              style={{ minWidth: 170 }}
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
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 980 }}>
            <thead>
              <tr>
                {["Date", "Client", "Item", "Units", "Profit", "Note", "Actions"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderBottom: "1px solid rgba(255,255,255,0.10)",
                      color: "rgba(255,255,255,0.75)",
                      fontSize: 12,
                      letterSpacing: 0.3,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {filteredRows.map((r) => {
                const c = r.client_id ? clientMap.get(r.client_id) : null;
                const cname = c?.name?.trim() ? c.name : r.client_id ? `Client #${r.client_id}` : "";
                const csub = c ? [c.email, c.phone].filter(Boolean).join(" • ") : "";

                return (
                  <tr key={r.id}>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>{r.date ?? ""}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
                      {cname ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                          <b style={{ color: "rgba(255,255,255,0.92)" }}>{cname}</b>
                          <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {csub || "—"}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
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
                      <button className="btn" onClick={() => void deleteSale(r.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filteredRows.length ? (
                <tr>
                  <td colSpan={7} style={{ padding: 14 }} className="muted">
                    No sales yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {/* Client Picker */}
      {clientPickerOpen ? (
        <div className="sales2-overlay" onClick={() => setClientPickerOpen(false)}>
          <div className="sales2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 style={{ margin: 0 }}>Select Client</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  Search by name, email, or phone.
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button className="btn" type="button" onClick={() => chooseClient(null)}>
                  Clear
                </button>
                <button className="btn" type="button" onClick={() => setClientPickerOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <input
                className="sales2-input"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="Search clients..."
                style={{ width: "100%" }}
                autoFocus
              />
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 2 }}>
              {filteredClients.map((c) => {
                const title = c?.name?.trim() ? c.name : `Client #${c.id}`;
                const sub = [c.email, c.phone].filter(Boolean).join(" • ") || "No contact details";
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="btn"
                    onClick={() => chooseClient(c.id)}
                    style={{
                      textAlign: "left",
                      padding: 12,
                      borderRadius: 16,
                      border: "1px solid rgba(120,160,255,0.16)",
                      background:
                        "radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.10), transparent 60%), rgba(0,0,0,0.38)",
                    }}
                  >
                    <div style={{ fontWeight: 950, color: "rgba(255,255,255,0.92)" }}>{title}</div>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {sub}
                    </div>
                  </button>
                );
              })}

              {!filteredClients.length ? (
                <div className="muted" style={{ padding: 10 }}>
                  No matches. You can create a new client.
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={openQuickAddClient}>
                + New Client
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick Add Client */}
      {clientAddOpen ? (
        <div className="sales2-overlay" onClick={() => setClientAddOpen(false)}>
          <div className="sales2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 style={{ margin: 0 }}>New Client</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  Nothing is required — save whatever you have.
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setClientAddOpen(false)}>
                Close
              </button>
            </div>

            <div className="sales2-modalGrid">
              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Name
                </div>
                <input className="sales2-input" value={newClientName} onChange={(e) => setNewClientName(e.target.value)} style={{ width: "100%" }} />
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Phone
                </div>
                <input className="sales2-input" value={newClientPhone} onChange={(e) => setNewClientPhone(e.target.value)} style={{ width: "100%" }} />
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Email
                </div>
                <input className="sales2-input" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} style={{ width: "100%" }} />
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Last spoken (optional)
                </div>
                <input
                  className="sales2-input"
                  type="date"
                  value={newClientLastSpoken}
                  onChange={(e) => setNewClientLastSpoken(e.target.value)}
                  style={{ width: "100%" }}
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <div className="muted" style={{ fontSize: 12, fontWeight: 900, marginBottom: 6 }}>
                  Notes (optional)
                </div>
                <input
                  className="sales2-input"
                  value={newClientNotes}
                  onChange={(e) => setNewClientNotes(e.target.value)}
                  style={{ width: "100%" }}
                  placeholder="Anything you want to remember about them..."
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void createClientQuick()}>
                Save Client
              </button>
              <button className="btn" type="button" onClick={() => setClientAddOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
