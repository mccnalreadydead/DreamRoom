// src/pages/Sales.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../supabaseClient";
import { Link } from "react-router-dom";

type Client = { id: number; name: string | null };
type Person = { id: number; name: string | null };

// "name" is what the UI needs. We will map either inventory.item or item_catalog.name into this.
type Item = { id: number; name: string; cost?: number | null };

type Line = {
  itemId: number | null;
  units: number;
  price: number; // total price for the line (what you sold it for)
  fees: number; // optional fees
};

type RecentSale = {
  id: number;
  sale_date?: string | null;
  created_at?: string | null;
  client_name?: string | null;
  item_name?: string | null;
  units?: number | null;
  profit?: number | null;
  note?: string | null;
};

/**
 * Searchable dropdown (search input appears inside the dropdown)
 * ✅ FIX: Portal menu + correct "outside click" handling so clicking items works.
 */
function ItemSearchDropdown({
  value,
  items,
  placeholder = "Select item",
  onChange,
}: {
  value: number | null;
  items: Item[];
  placeholder?: string;
  onChange: (nextId: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected = useMemo(() => items.find((it) => it.id === value) ?? null, [items, value]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((it) => (it.name ?? "").toLowerCase().includes(query));
  }, [items, q]);

  const [menuPos, setMenuPos] = useState<{ left: number; top: number; width: number } | null>(null);

  // ✅ IMPORTANT FIX: treat clicks inside the PORTALED menu as "inside" too
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;

      const inWrap = wrapRef.current?.contains(t);
      const inMenu = menuRef.current?.contains(t);

      if (!inWrap && !inMenu) setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    if (!open) {
      setQ("");
      setMenuPos(null);
      return;
    }

    // focus search
    setTimeout(() => inputRef.current?.focus(), 0);

    const updatePos = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setMenuPos({ left: r.left, top: r.bottom + 8, width: r.width });
    };

    updatePos();
    window.addEventListener("scroll", updatePos, true);
    window.addEventListener("resize", updatePos);
    return () => {
      window.removeEventListener("scroll", updatePos, true);
      window.removeEventListener("resize", updatePos);
    };
  }, [open]);

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: menuPos.left,
              top: menuPos.top,
              width: menuPos.width,
              zIndex: 999999,
              borderRadius: 16,
              border: "1px solid rgba(120,160,255,0.18)",
              background: "rgba(0,0,0,0.78)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 18px 55px rgba(0,0,0,0.45)",
              overflow: "hidden",
            }}
            role="listbox"
            // extra safety: don't let clicks bubble to anything weird
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
              <input
                ref={inputRef}
                className="input"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search items…"
                style={{ height: 40, borderRadius: 14 }}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            </div>

            <div style={{ maxHeight: 260, overflow: "auto" }}>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  textAlign: "left",
                  background: "transparent",
                  border: 0,
                  color: "rgba(255,255,255,0.92)",
                  cursor: "pointer",
                }}
              >
                {placeholder}
              </button>

              {filtered.length === 0 ? (
                <div style={{ padding: "10px 12px", color: "rgba(255,255,255,0.65)" }}>No matches.</div>
              ) : (
                filtered.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => {
                      onChange(it.id);
                      setOpen(false);
                    }}
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      textAlign: "left",
                      background: value === it.id ? "rgba(120,160,255,0.14)" : "transparent",
                      border: 0,
                      color: "rgba(255,255,255,0.92)",
                      cursor: "pointer",
                    }}
                  >
                    {it.name}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        ref={btnRef}
        type="button"
        className="input"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ opacity: selected ? 1 : 0.9 }}>{selected ? selected.name : placeholder}</span>
        <span style={{ opacity: 0.9 }}>▾</span>
      </button>

      {menu}
    </div>
  );
}

export default function Sales() {
  const [clients, setClients] = useState<Client[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [clientId, setClientId] = useState<number | null>(null);
  const [sellerId, setSellerId] = useState<number | null>(null);

  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([{ itemId: null, units: 1, price: 0, fees: 0 }]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [recent, setRecent] = useState<RecentSale[]>([]);
  const [year, setYear] = useState<string>("All time");
  const [month, setMonth] = useState<string>("All time");
  const [day, setDay] = useState<string>("");

  // ✅ inventory is PRIMARY (this is where your items are)
  useEffect(() => {
    const load = async () => {
      setErr("");
      try {
        const [c, p] = await Promise.all([
          supabase.from("clients").select("id,name").order("name", { ascending: true }),
          supabase.from("sales_people").select("id,name").order("name", { ascending: true }),
        ]);

        if (c.error) throw c.error;
        if (p.error) throw p.error;

        let loadedItems: Item[] = [];

        // 1) PRIMARY: inventory (id, item, cost)
        const inv = await supabase.from("inventory").select("id,item,cost").order("item", { ascending: true });
        if (inv.error) throw inv.error;

        if (Array.isArray(inv.data) && inv.data.length > 0) {
          loadedItems = (inv.data as any[]).map((r) => ({
            id: Number(r.id),
            name: String(r.item ?? "").trim(),
            cost: r.cost ?? null,
          }));
        } else {
          // 2) fallback: item_catalog
          const cat = await supabase.from("item_catalog").select("id,name,cost").order("name", { ascending: true });
          if (cat.error) throw cat.error;

          loadedItems = (cat.data as any[]).map((r) => ({
            id: Number(r.id),
            name: String(r.name ?? "").trim(),
            cost: r.cost ?? null,
          }));
        }

        loadedItems = loadedItems
          .filter((x) => Number.isFinite(x.id) && x.name && x.name.trim().length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));

        setClients((c.data as any) ?? []);
        setPeople((p.data as any) ?? []);
        setItems(loadedItems);

        console.log("Loaded items:", loadedItems.length, loadedItems.slice(0, 10));
      } catch (e: any) {
        setErr(e?.message ?? String(e));
      }
    };

    void load();
  }, []);

  // ✅ Profit math: price - fees - (cost * units)
  const formProfit = useMemo(() => {
    return lines.reduce((sum, l) => {
      const item = items.find((i) => i.id === l.itemId);
      const cost = Number(item?.cost ?? 0);
      const units = Number(l.units ?? 0);
      const price = Number(l.price ?? 0);
      const fees = Number(l.fees ?? 0);
      return sum + (price - fees - cost * units);
    }, 0);
  }, [lines, items]);

  const totalProfitAllTime = useMemo(() => {
    const hasProfit = recent.some((r) => typeof r.profit === "number");
    if (!hasProfit) return null;
    return recent.reduce((s, r) => s + Number(r.profit ?? 0), 0);
  }, [recent]);

  function setLine(i: number, patch: Partial<Line>) {
    setLines((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function addLine() {
    setLines((prev) => [...prev, { itemId: null, units: 1, price: 0, fees: 0 }]);
  }

  function removeLine(i: number) {
    setLines((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      return next.length ? next : [{ itemId: null, units: 1, price: 0, fees: 0 }];
    });
  }

  async function loadRecent() {
    setLoading(true);
    setErr("");
    try {
      const fallback = await supabase
        .from("sales")
        .select("id,sale_date,created_at,notes")
        .order("sale_date", { ascending: false })
        .limit(200);

      if (fallback.error) throw fallback.error;

      const mapped: RecentSale[] = ((fallback.data as any[]) ?? []).map((r) => ({
        id: r.id,
        sale_date: r.sale_date ?? null,
        created_at: r.created_at ?? null,
        note: r.notes ?? null,
      }));

      setRecent(mapped);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const years = useMemo(() => {
    const s = new Set<string>();
    for (const r of recent) {
      const d = (r.sale_date ?? r.created_at ?? "").slice(0, 10);
      if (d && d.length >= 4) s.add(d.slice(0, 4));
    }
    return ["All time", ...Array.from(s).sort((a, b) => b.localeCompare(a))];
  }, [recent]);

  const months = useMemo(() => {
    if (year === "All time") return ["All time"];
    const s = new Set<string>();
    for (const r of recent) {
      const d = (r.sale_date ?? r.created_at ?? "").slice(0, 10);
      if (d.startsWith(year + "-")) s.add(d.slice(5, 7));
    }
    return ["All time", ...Array.from(s).sort((a, b) => b.localeCompare(a))];
  }, [recent, year]);

  const filteredRecent = useMemo(() => {
    return recent.filter((r) => {
      const d = (r.sale_date ?? r.created_at ?? "").slice(0, 10);
      if (!d) return false;
      if (day) return d === day;
      if (year !== "All time" && d.slice(0, 4) !== year) return false;
      if (month !== "All time" && d.slice(5, 7) !== month) return false;
      return true;
    });
  }, [recent, year, month, day]);

  async function deleteSale(id: number) {
    const ok = confirm("Delete this sale?");
    if (!ok) return;

    setErr("");
    try {
      const del = await supabase.from("sales").delete().eq("id", id);
      if (del.error) throw del.error;
      await loadRecent();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    }
  }

  async function saveSale() {
    if (!date) return alert("Please choose a date.");
    if (!lines.length) return alert("Add at least one line.");
    if (lines.some((l) => !l.itemId)) return alert("Please select an item for every line.");

    setLoading(true);
    setErr("");
    try {
      const saleInsert = await supabase
        .from("sales")
        .insert([
          {
            sale_date: date,
            client_id: clientId,
            seller_id: sellerId,
            notes: note || null,
          },
        ])
        .select("id")
        .single();

      if (saleInsert.error) throw saleInsert.error;

      const saleId = (saleInsert.data as any)?.id;
      if (!saleId) throw new Error("Sale saved, but no sale ID returned.");

      const linesPayload = lines.map((l) => ({
        sale_id: saleId,
        item_id: l.itemId,
        units: Number(l.units || 0),
        price: Number(l.price || 0),
        fees: Number(l.fees || 0),
      }));

      const lineInsert = await supabase.from("sale_lines").insert(linesPayload);
      if (lineInsert.error) {
        console.warn("sale_lines insert failed (table may not exist):", lineInsert.error.message);
      }

      setClientId(null);
      setSellerId(null);
      setDate(new Date().toISOString().slice(0, 10));
      setNote("");
      setLines([{ itemId: null, units: 1, price: 0, fees: 0 }]);

      await loadRecent();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page salesNebula">
      <style>{`
        .salesNebula{
          position: relative;
          isolation: isolate;
          padding-bottom: 20px;
        }
        .salesNebula:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events:none;
          z-index: 0;
          background:
            radial-gradient(820px 420px at 10% 12%, rgba(90,140,255,0.14), transparent 60%),
            radial-gradient(560px 420px at 90% 14%, rgba(152,90,255,0.14), transparent 55%),
            radial-gradient(720px 520px at 75% 35%, rgba(212,175,55,0.08), transparent 60%),
            radial-gradient(900px 560px at 50% 98%, rgba(0,0,0,0.88), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.40), rgba(0,0,0,0.88));
          opacity: .98;
        }
        .salesNebula > *{ position: relative; z-index: 1; }

        .salesHeader{
          display:flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }
        .salesTitle h1{ margin:0; font-size: 28px; letter-spacing: .2px; }
        .salesTitle .muted{ margin-top: 6px; }

        .salesCard{
          margin-top: 12px;
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.14);
          background: rgba(0,0,0,0.36);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.32);
          padding: 14px;
        }

        .topRow{
          display:flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .pillGold{
          font-size: 12px;
          font-weight: 950;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(255,255,255,0.88);
          white-space: nowrap;
        }

        .clientRow{
          display:grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 12px;
          align-items: stretch;
        }

        .label{
          font-size: 12px;
          font-weight: 900;
          color: rgba(255,255,255,0.55);
          margin-bottom: 6px;
        }

        .lineHeader{
          display:grid;
          grid-template-columns: 1.8fr 0.7fr 0.9fr 0.9fr auto;
          gap: 10px;
          margin-top: 14px;
          padding: 0 2px;
          color: rgba(255,255,255,0.78);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: .15px;
          text-shadow: 0 1px 10px rgba(0,0,0,0.55);
        }

        .lineRow{
          display:grid;
          grid-template-columns: 1.8fr 0.7fr 0.9fr 0.9fr auto;
          gap: 10px;
          margin-top: 10px;
          align-items: center;
        }

        .xBtn{
          width: 44px;
          height: 44px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.9);
          font-weight: 950;
          cursor: pointer;
        }

        .lineProfit{
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.65);
        }

        .actionsRow{
          display:flex;
          gap: 10px;
          margin-top: 12px;
          flex-wrap: wrap;
        }

        .recentWrap{
          margin-top: 14px;
        }
        .recentHeader{
          display:flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .filters{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
          width: min(520px, 100%);
        }
        .filters .input{ height: 44px; border-radius: 16px; }

        .salesTable{
          margin-top: 12px;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.30);
        }
        .salesTableHead, .salesTableRow{
          display:grid;
          grid-template-columns: 160px 140px 1fr 110px 120px 1.2fr 120px;
          gap: 10px;
          padding: 12px 12px;
          align-items: center;
        }
        .salesTableHead{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.55);
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .salesTableRow{
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.88);
        }
        .salesTableRow:last-child{ border-bottom: 0; }

        .right{ text-align: right; }
        .bold{ font-weight: 950; }

        @media (max-width: 900px){
          .salesTableHead{ display:none; }
          .salesTableRow{
            grid-template-columns: 1fr;
            gap: 6px;
          }
          .salesTableRow > div{
            display:flex;
            justify-content: space-between;
            gap: 10px;
            font-size: 13px;
          }
          .salesTableRow > div:before{
            content: attr(data-k);
            color: rgba(255,255,255,0.55);
            font-weight: 900;
          }
        }

        @media (max-width: 720px){
          .lineHeader{
            display:grid;
            grid-template-columns: 1.55fr 0.65fr 0.9fr 0.9fr auto;
            gap: 8px;
            font-size: 11px;
          }

          .lineRow{
            grid-template-columns: 1fr;
            gap: 8px;
          }
          .xBtn{
            width: 100%;
            height: 44px;
          }
        }

        input, select, textarea { font-size: 16px; }
      `}</style>

      <div className="salesHeader">
        <div className="salesTitle">
          <h1>Sales</h1>
          <div className="muted">
            {totalProfitAllTime == null
              ? `Total profit (all time): $${(0).toFixed(2)}`
              : `Total profit (all time): $${totalProfitAllTime.toFixed(2)}`}
          </div>
        </div>

        <button className="btn" type="button" onClick={() => void loadRecent()} disabled={loading}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, marginTop: 12, borderColor: "rgba(255,100,100,0.35)" }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="salesCard">
        <div className="topRow">
          <h2 style={{ margin: 0 }}>Add Sale</h2>
          <span className="pillGold">Form profit: ${formProfit.toFixed(2)}</span>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="label">Date</div>
          <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="label">Client (optional)</div>
          <div className="clientRow">
            <select
              className="input"
              value={clientId ?? ""}
              onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">No client selected</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? "Unnamed"}
                </option>
              ))}
            </select>

            <Link className="btn primary" to="/clients">
              + New Client
            </Link>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="label">Salesperson</div>
          <select
            className="input"
            value={sellerId ?? ""}
            onChange={(e) => setSellerId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Select…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name ?? "Unnamed"}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="label">Note (optional, applies to all lines)</div>
          <input
            className="input"
            placeholder="Optional note for the whole sale…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="lineHeader">
          <div>Item</div>
          <div>Units</div>
          <div>Sale Price</div>
          <div>Fees</div>
          <div className="right">Remove</div>
        </div>

        {lines.map((l, i) => {
          const item = items.find((x) => x.id === l.itemId);
          const cost = Number(item?.cost ?? 0);
          const profit = Number(l.price ?? 0) - Number(l.fees ?? 0) - cost * Number(l.units ?? 0);

          return (
            <div key={i} style={{ marginTop: 10 }}>
              <div className="lineRow">
                <ItemSearchDropdown
                  value={l.itemId}
                  items={items}
                  placeholder="Select item"
                  onChange={(nextId) => setLine(i, { itemId: nextId })}
                />

                <input
                  className="input"
                  type="number"
                  min={1}
                  value={l.units}
                  onChange={(e) => setLine(i, { units: Math.max(1, Number(e.target.value || 1)) })}
                />

                <input
                  className="input"
                  type="number"
                  min={0}
                  value={l.price}
                  onChange={(e) => setLine(i, { price: Math.max(0, Number(e.target.value || 0)) })}
                  placeholder="Total sale $"
                />

                <input
                  className="input"
                  type="number"
                  min={0}
                  value={l.fees}
                  onChange={(e) => setLine(i, { fees: Math.max(0, Number(e.target.value || 0)) })}
                  placeholder="Fees $"
                />

                <button className="xBtn" type="button" onClick={() => removeLine(i)} title="Remove line">
                  ✕
                </button>
              </div>

              <div className="lineProfit">Line profit ${profit.toFixed(2)}</div>
            </div>
          );
        })}

        <div className="actionsRow">
          <button className="btn" type="button" onClick={addLine}>
            + Add line
          </button>
          <button className="btn primary" type="button" onClick={() => void saveSale()} disabled={loading}>
            {loading ? "Saving…" : "Save Sale"}
          </button>
        </div>
      </div>

      <div className="salesCard recentWrap">
        <div className="recentHeader">
          <h2 style={{ margin: 0 }}>Recent Sales</h2>

          <div className="filters">
            <div>
              <div className="label" style={{ textAlign: "right" }}>
                Choose year
              </div>
              <select
                className="input"
                value={year}
                onChange={(e) => {
                  setYear(e.target.value);
                  setMonth("All time");
                  setDay("");
                }}
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="label" style={{ textAlign: "right" }}>
                Choose month
              </div>
              <select
                className="input"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setDay("");
                }}
              >
                {months.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="label" style={{ textAlign: "right" }}>
                Choose day
              </div>
              <input className="input" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="salesTable" style={{ marginTop: 12 }}>
          <div className="salesTableHead">
            <div>Date</div>
            <div>Client</div>
            <div>Item</div>
            <div className="right">Units</div>
            <div className="right">Profit</div>
            <div>Note</div>
            <div className="right">Actions</div>
          </div>

          {filteredRecent.length === 0 ? (
            <div style={{ padding: 12 }} className="muted">
              No sales found for that filter.
            </div>
          ) : (
            filteredRecent.map((r) => (
              <div key={r.id} className="salesTableRow">
                <div data-k="Date">{(r.sale_date ?? r.created_at ?? "").slice(0, 10) || "—"}</div>
                <div data-k="Client">{r.client_name ?? "—"}</div>
                <div data-k="Item" className="bold">
                  {r.item_name ?? "—"}
                </div>
                <div data-k="Units" className="right">
                  {r.units ?? "—"}
                </div>
                <div data-k="Profit" className="right">
                  {r.profit == null ? "—" : `$${Number(r.profit).toFixed(2)}`}
                </div>
                <div data-k="Note">{r.note ?? "—"}</div>
                <div data-k="Actions" className="right">
                  <button className="btn" type="button" onClick={() => void deleteSale(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
