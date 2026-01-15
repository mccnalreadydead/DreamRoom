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
  seller_name?: string | null; // ✅ NEW
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
              border: "1px solid rgba(60,200,120,0.22)",
              background: "rgba(0,0,0,0.80)",
              backdropFilter: "blur(14px)",
              boxShadow: "0 18px 55px rgba(0,0,0,0.45), 0 0 28px rgba(60,200,120,0.10)",
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
                      background: value === it.id ? "rgba(60,200,120,0.16)" : "transparent",
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
  // ✅ Requested labels
  const ALL_YEARS = "All time - years";
  const ALL_MONTHS = "All time - months";

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
  const [year, setYear] = useState<string>(ALL_YEARS);
  const [month, setMonth] = useState<string>(ALL_MONTHS);
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
      // 1) Load sale headers (include seller_id)
      const salesRes = await supabase
        .from("sales")
        .select("id,sale_date,created_at,notes,client_id,seller_id")
        .order("sale_date", { ascending: false })
        .limit(200);

      if (salesRes.error) throw salesRes.error;

      const salesRows = (salesRes.data as any[]) ?? [];
      const saleIds = salesRows.map((s) => s.id).filter(Boolean);

      if (saleIds.length === 0) {
        setRecent([]);
        setLoading(false);
        return;
      }

      // 2) Try to load sale_lines (SAFE: don’t break if table doesn’t exist)
      let linesRows: any[] = [];
      try {
        const linesRes = await supabase
          .from("sale_lines")
          .select("sale_id,item_id,units,price,fees")
          .in("sale_id", saleIds);

        if (linesRes.error) throw linesRes.error;
        linesRows = (linesRes.data as any[]) ?? [];
      } catch (e: any) {
        console.warn("sale_lines not available (safe fallback):", e?.message ?? e);
        linesRows = [];
      }

      // 3) Load inventory names for the item_ids
      const itemIds = Array.from(new Set(linesRows.map((l) => l.item_id).filter(Boolean)));

      const invMap = new Map<number, { name: string; cost: number }>();
      if (itemIds.length > 0) {
        const invRes = await supabase.from("inventory").select("id,item,cost").in("id", itemIds);
        if (invRes.error) throw invRes.error;

        for (const r of (invRes.data as any[]) ?? []) {
          invMap.set(Number(r.id), { name: String(r.item ?? "").trim(), cost: Number(r.cost ?? 0) });
        }
      }

      // 4) Client names
      const clientIds = Array.from(new Set(salesRows.map((s) => s.client_id).filter(Boolean)));
      const clientMap = new Map<number, string>();

      if (clientIds.length > 0) {
        const cRes = await supabase.from("clients").select("id,name").in("id", clientIds);
        if (cRes.error) throw cRes.error;

        for (const c of (cRes.data as any[]) ?? []) {
          clientMap.set(Number(c.id), String(c.name ?? "Unnamed"));
        }
      }

      // ✅ 5) Seller names (Salesperson column)
      const sellerIds = Array.from(new Set(salesRows.map((s) => s.seller_id).filter(Boolean)));
      const sellerMap = new Map<number, string>();

      if (sellerIds.length > 0) {
        const sRes = await supabase.from("sales_people").select("id,name").in("id", sellerIds);
        if (!sRes.error) {
          for (const s of (sRes.data as any[]) ?? []) {
            sellerMap.set(Number(s.id), String(s.name ?? "Unnamed"));
          }
        }
      }

      // 6) Group lines by sale_id
      const linesBySale = new Map<number, any[]>();
      for (const l of linesRows) {
        const sid = Number(l.sale_id);
        if (!linesBySale.has(sid)) linesBySale.set(sid, []);
        linesBySale.get(sid)!.push(l);
      }

      const mapped: RecentSale[] = salesRows.map((s) => {
        const sid = Number(s.id);
        const saleLines = linesBySale.get(sid) ?? [];

        const distinctItemIds = Array.from(new Set(saleLines.map((l) => l.item_id).filter(Boolean)));
        const firstItemName =
          distinctItemIds.length > 0 ? (invMap.get(Number(distinctItemIds[0]))?.name ?? "—") : "—";

        const item_name = distinctItemIds.length <= 1 ? firstItemName : `Multiple items (${distinctItemIds.length})`;

        const units = saleLines.reduce((sum, l) => sum + Number(l.units ?? 0), 0);

        const profit = saleLines.reduce((sum, l) => {
          const cost = invMap.get(Number(l.item_id))?.cost ?? 0;
          const u = Number(l.units ?? 0);
          const price = Number(l.price ?? 0);
          const fees = Number(l.fees ?? 0);
          return sum + (price - fees - cost * u);
        }, 0);

        return {
          id: sid,
          sale_date: s.sale_date ?? null,
          created_at: s.created_at ?? null,
          client_name: s.client_id ? clientMap.get(Number(s.client_id)) ?? "—" : "—",
          seller_name: s.seller_id ? sellerMap.get(Number(s.seller_id)) ?? "—" : "—",
          item_name,
          units: saleLines.length ? units : null,
          profit: saleLines.length ? profit : null,
          note: s.notes ?? null,
        };
      });

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
    return [ALL_YEARS, ...Array.from(s).sort((a, b) => b.localeCompare(a))];
  }, [recent]);

  const months = useMemo(() => {
    if (year === ALL_YEARS) return [ALL_MONTHS];
    const s = new Set<string>();
    for (const r of recent) {
      const d = (r.sale_date ?? r.created_at ?? "").slice(0, 10);
      if (d.startsWith(year + "-")) s.add(d.slice(5, 7));
    }
    return [ALL_MONTHS, ...Array.from(s).sort((a, b) => b.localeCompare(a))];
  }, [recent, year]);

  const filteredRecent = useMemo(() => {
    return recent.filter((r) => {
      const d = (r.sale_date ?? r.created_at ?? "").slice(0, 10);
      if (!d) return false;
      if (day) return d === day;
      if (year !== ALL_YEARS && d.slice(0, 4) !== year) return false;
      if (month !== ALL_MONTHS && d.slice(5, 7) !== month) return false;
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

      // NOTE: if sale_lines doesn't exist, this will warn but not break
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
    <div className="page salesEarth">
      <style>{`
        .salesEarth{
          position: relative;
          isolation: isolate;
          padding-bottom: 20px;
        }

        /* ✅ EARTH / GREEN ENVIRONMENT BACKDROP (visual only) */
        .salesEarth:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events:none;
          z-index: 0;
          background:
            radial-gradient(980px 520px at 12% 10%, rgba(70,255,140,0.18), transparent 60%),
            radial-gradient(820px 520px at 88% 14%, rgba(40,190,110,0.14), transparent 62%),
            radial-gradient(900px 620px at 45% 98%, rgba(0,0,0,0.92), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.90));
          opacity: .98;
        }

        /* vines + caustic shimmer overlay */
        .salesEarth:after{
          content:"";
          position: fixed;
          inset: -40px;
          pointer-events:none;
          z-index: 0;
          opacity: 0.58;
          mix-blend-mode: screen;
          filter: blur(0.2px) saturate(1.25);
          background:
            repeating-radial-gradient(circle at 18% 12%,
              rgba(255,255,255,0.00) 0 12px,
              rgba(120,255,170,0.10) 14px,
              rgba(255,255,255,0.00) 26px),
            repeating-radial-gradient(circle at 72% 38%,
              rgba(0,255,120,0.00) 0 14px,
              rgba(0,255,120,0.08) 16px,
              rgba(0,255,120,0.00) 30px),
            /* vine strands */
            linear-gradient(115deg, transparent 0%, rgba(70,255,140,0.06) 24%, transparent 44%),
            linear-gradient(65deg, transparent 0%, rgba(40,190,110,0.05) 22%, transparent 46%);
          animation: earthShimmer 6.2s ease-in-out infinite;
        }

        @keyframes earthShimmer{
          0%{ transform: translate3d(0,0,0); opacity: 0.50; }
          50%{ transform: translate3d(10px,-8px,0); opacity: 0.68; }
          100%{ transform: translate3d(0,0,0); opacity: 0.50; }
        }

        .salesEarth > *{ position: relative; z-index: 1; }

        .salesHeader{
          display:flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
          flex-wrap: wrap;
        }

        /* ✅ Big glowing title that still fits mobile */
        .salesTitle{
          min-width: 0;
        }
        .salesTitle h1{
          margin:0;
          font-size: 30px;
          letter-spacing: .3px;
          font-weight: 950;
          position: relative;
          display: inline-block;
          text-shadow:
            0 0 18px rgba(70,255,140,0.18),
            0 0 26px rgba(40,190,110,0.14),
            0 18px 60px rgba(0,0,0,0.70);
        }
        .salesTitle h1 .titleShimmer{
          position:absolute;
          inset:-2px -18px -2px -18px;
          border-radius: 14px;
          pointer-events:none;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 35%,
            rgba(200,255,220,0.26) 45%,
            rgba(255,255,255,0.06) 55%,
            transparent 70%
          );
          transform: translateX(-65%) skewX(-10deg);
          mix-blend-mode: screen;
          opacity: 0.75;
          animation: titleSweep 2.9s linear infinite;
        }

        @keyframes titleSweep{
          0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.52; }
          40%  { opacity: 0.92; }
          100% { transform: translateX(70%) skewX(-10deg); opacity: 0.56; }
        }

        .salesTitle .muted{
          margin-top: 6px;
          text-shadow: 0 0 18px rgba(70,255,140,0.08);
        }

        .salesCard{
          margin-top: 12px;
          border-radius: 18px;
          border: 1px solid rgba(60,200,120,0.18);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.32), 0 0 28px rgba(60,200,120,0.06);
          padding: 14px;
          position: relative;
        }

        /* subtle “living” glow on cards */
        .salesCard:before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 18px;
          pointer-events:none;
          background:
            radial-gradient(520px 220px at 20% 0%, rgba(70,255,140,0.12), transparent 60%),
            radial-gradient(620px 260px at 85% 20%, rgba(40,190,110,0.10), transparent 62%);
          opacity: 0.75;
          filter: blur(10px);
          animation: cardBreath 6.8s ease-in-out infinite;
        }
        @keyframes cardBreath{
          0%{ opacity: 0.55; transform: translate3d(0,0,0) scale(1); }
          50%{ opacity: 0.95; transform: translate3d(6px,-4px,0) scale(1.01); }
          100%{ opacity: 0.55; transform: translate3d(0,0,0) scale(1); }
        }
        .salesCard > *{ position: relative; z-index: 1; }

        .topRow{
          display:flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* green pill */
        .pillGold{
          font-size: 12px;
          font-weight: 950;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(70,255,140,0.22);
          background: rgba(70,255,140,0.10);
          color: rgba(230,255,240,0.92);
          white-space: nowrap;
          box-shadow: 0 0 0 2px rgba(70,255,140,0.06), 0 0 18px rgba(70,255,140,0.08);
        }

        .clientRow{
          display:grid;
          grid-template-columns: 1fr auto;
          gap: 10px;
          margin-top: 12px;
          align-items: stretch;
        }

        /* make section labels glow subtly */
        .label{
          font-size: 12px;
          font-weight: 900;
          color: rgba(220,255,235,0.72);
          margin-bottom: 6px;
          text-shadow: 0 0 16px rgba(70,255,140,0.10);
        }

        .lineHeader{
          display:grid;
          grid-template-columns: 1.8fr 0.7fr 0.9fr 0.9fr auto;
          gap: 10px;
          margin-top: 14px;
          padding: 0 2px;
          color: rgba(235,255,245,0.84);
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

        /* glowing remove button */
        .xBtn{
          width: 44px;
          height: 44px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.9);
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 0 0 2px rgba(70,255,140,0.05), 0 0 18px rgba(70,255,140,0.10);
          transition: transform .05s ease, border-color .15s ease, box-shadow .15s ease, filter .15s ease;
        }
        .xBtn:hover{
          border-color: rgba(70,255,140,0.22);
          box-shadow: 0 0 0 3px rgba(70,255,140,0.08), 0 0 26px rgba(70,255,140,0.14);
          filter: brightness(1.12);
        }
        .xBtn:active{ transform: translateY(1px); }

        .lineProfit{
          margin-top: 8px;
          font-size: 12px;
          color: rgba(255,255,255,0.70);
          text-shadow: 0 0 18px rgba(70,255,140,0.06);
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
          align-items: flex-start;
          gap: 10px;
          flex-wrap: wrap;
        }

        /* ✅ Recent Sales glow */
        .recentWrap{
          border-color: rgba(70,255,140,0.22);
          box-shadow: 0 18px 60px rgba(0,0,0,0.34), 0 0 34px rgba(70,255,140,0.10);
        }

        /* ✅ CONDENSED + UNIFORM FILTERS (visual only) */
        .filters{
          display:grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          width: min(720px, 100%);
          align-items: end;
        }
        .filters .input{ height: 44px; border-radius: 16px; }

        @media (max-width: 820px){
          .filters{
            grid-template-columns: 1fr;
          }
          .label{ text-align: left !important; }
        }

        .salesTable{
          margin-top: 12px;
          overflow: hidden;
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(0,0,0,0.26);
          box-shadow: 0 0 26px rgba(70,255,140,0.06);
        }

        /* ✅ Added Salesperson column */
        .salesTableHead, .salesTableRow{
          display:grid;
          grid-template-columns: 150px 140px 160px 1fr 110px 120px 1.2fr 120px;
          gap: 10px;
          padding: 12px 12px;
          align-items: center;
        }

        .salesTableHead{
          font-size: 12px;
          font-weight: 950;
          color: rgba(220,255,235,0.72);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          text-shadow: 0 0 18px rgba(70,255,140,0.06);
        }
        .salesTableRow{
          border-bottom: 1px solid rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.88);
        }
        .salesTableRow:last-child{ border-bottom: 0; }

        .salesTableRow:hover{
          background: rgba(70,255,140,0.05);
          box-shadow: inset 0 0 0 1px rgba(70,255,140,0.10);
        }

        .right{ text-align: right; }
        .bold{
          font-weight: 950;
          text-shadow: 0 0 14px rgba(70,255,140,0.10);
        }

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
            color: rgba(220,255,235,0.72);
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

        /* Inputs: keep behavior, just add a green focus glow (visual only) */
        .input{
          transition: box-shadow .15s ease, border-color .15s ease, filter .15s ease;
        }
        .input:focus{
          border-color: rgba(70,255,140,0.26) !important;
          box-shadow: 0 0 0 4px rgba(70,255,140,0.10) !important;
        }

        /* Buttons: green glow pulse */
        .btn{
          box-shadow: 0 0 0 2px rgba(70,255,140,0.04), 0 0 18px rgba(70,255,140,0.06);
          transition: transform .05s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
        }
        .btn:hover{
          box-shadow: 0 0 0 3px rgba(70,255,140,0.08), 0 0 26px rgba(70,255,140,0.10);
          filter: brightness(1.08);
        }

        /* Accessibility */
        @media (prefers-reduced-motion: reduce){
          .salesEarth:after{ animation:none; }
          .salesTitle h1 .titleShimmer{ animation:none; }
          .salesCard:before{ animation:none; }
        }

        input, select, textarea { font-size: 16px; }
      `}</style>

      <div className="salesHeader">
        <div className="salesTitle">
          <h1>
            Sales
            <span className="titleShimmer" aria-hidden="true" />
          </h1>
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
          <h2 style={{ margin: 0, textShadow: "0 0 16px rgba(70,255,140,0.10)" }}>Add Sale</h2>
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
            placeholder="Optional notes..."
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

                {/* ✅ FIX: allow empty typing so you don't get "0100" */}
                <input
                  className="input"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={l.price === 0 ? "" : l.price}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLine(i, { price: v === "" ? 0 : Number(v) });
                  }}
                  placeholder="Price Paid"
                />

                {/* ✅ (recommended) same fix for Fees */}
                <input
                  className="input"
                  type="number"
                  min={0}
                  inputMode="decimal"
                  value={l.fees === 0 ? "" : l.fees}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLine(i, { fees: v === "" ? 0 : Number(v) });
                  }}
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
          <h2 style={{ margin: 0, textShadow: "0 0 16px rgba(70,255,140,0.14)" }}>Recent Sales</h2>

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
                  setMonth(ALL_MONTHS);
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
            <div>Salesperson</div>
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

                {/* ✅ NEW COLUMN */}
                <div data-k="Salesperson">{r.seller_name ?? "—"}</div>

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
