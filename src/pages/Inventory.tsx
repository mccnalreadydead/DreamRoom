// src/pages/Inventory.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

type InvType = "D" | "C";

type InventoryRow = {
  id: number;
  item: string;
  qty: number;
  unit_cost: number;
  resale_price: number;
  inv_type: InvType;
};

type CatalogItem = {
  id: number;
  name: string;
  category?: string;
};

function norm(s: any) {
  return String(s ?? "").trim();
}
function normKey(s: any) {
  return norm(s).toLowerCase();
}
function toNum(v: any, fallback = 0) {
  if (v == null || v === "") return fallback;
  const cleaned = String(v).replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}
function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function Inventory() {
  const [invType, setInvType] = useState<InvType>("D");

  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // mobile search/filter
  const [q, setQ] = useState("");

  // always-latest rows for autosave reads
  const rowsRef = useRef<InventoryRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // autosave
  const timersRef = useRef<Record<number, number>>({});
  const [savingIds, setSavingIds] = useState<Record<number, boolean>>({});
  const [dirtyIds, setDirtyIds] = useState<Record<number, boolean>>({});

  // Add Item sheet
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [addCost, setAddCost] = useState(0);
  const [addResell, setAddResell] = useState(0);

  // Action menu
  const [menuForId, setMenuForId] = useState<number | null>(null);

  async function loadInventory(type: InvType) {
    const { data, error } = await supabase
      .from("inventory")
      .select("id,item,qty,unit_cost,resale_price,inv_type")
      .eq("inv_type", type)
      .order("item", { ascending: true });

    if (error) throw error;
    setRows((data as any) ?? []);
  }

  async function loadCatalog() {
    const { data, error } = await supabase
      .from("item_catalog")
      .select("id,name,category")
      .order("name", { ascending: true });

    if (error) throw error;
    setCatalog((data as any) ?? []);
  }

  async function loadAll(type: InvType) {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadInventory(type), loadCatalog()]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll(invType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invType]);

  function openAdd() {
    setAddName("");
    setAddQty(0);
    setAddCost(0);
    setAddResell(0);
    setAddOpen(true);
  }
  function closeAdd() {
    setAddOpen(false);
  }

  async function upsertCatalogItem(name: string) {
    // insert, ignore duplicates
    const { error } = await supabase.from("item_catalog").insert([{ name, category: "Accessories" }]);
    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const isDup = msg.includes("duplicate") || msg.includes("unique");
      if (!isDup) throw error;
    }
    await loadCatalog();
  }

  async function ensureInventoryRowExists(itemName: string, type: InvType) {
    const { data, error } = await supabase
      .from("inventory")
      .select("id")
      .eq("item", itemName)
      .eq("inv_type", type)
      .maybeSingle();

    if (error) throw error;

    if (!data?.id) {
      const { error: insErr } = await supabase
        .from("inventory")
        .insert([{ item: itemName, qty: 0, unit_cost: 0, resale_price: 0, inv_type: type }]);
      if (insErr) throw insErr;

      await loadInventory(type);
    }
  }

  async function addItemSubmit() {
    const name = norm(addName);
    if (!name) {
      setErr("Please enter a name for the item.");
      return;
    }

    setErr("");
    setLoading(true);
    try {
      await upsertCatalogItem(name);
      await ensureInventoryRowExists(name, invType);

      const { error } = await supabase
        .from("inventory")
        .update({
          qty: Math.max(0, Number(addQty || 0)),
          unit_cost: Math.max(0, Number(addCost || 0)),
          resale_price: Math.max(0, Number(addResell || 0)),
        })
        .eq("item", name)
        .eq("inv_type", invType);

      if (error) throw error;

      await loadInventory(invType);
      closeAdd();
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  function scheduleAutoSave(id: number) {
    setDirtyIds((p) => ({ ...p, [id]: true }));
    const prev = timersRef.current[id];
    if (prev) window.clearTimeout(prev);

    timersRef.current[id] = window.setTimeout(() => {
      void saveRowById(id);
    }, 650) as unknown as number;
  }

  function updateRowLocal(id: number, patch: Partial<InventoryRow>) {
    setRows((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    scheduleAutoSave(id);
  }

  async function saveRowById(id: number) {
    const r = rowsRef.current.find((x) => x.id === id);
    if (!r) return;

    setSavingIds((p) => ({ ...p, [id]: true }));
    setErr("");

    const payload = {
      item: norm(r.item),
      qty: Math.max(0, Number(r.qty ?? 0)),
      unit_cost: Math.max(0, Number(r.unit_cost ?? 0)),
      resale_price: Math.max(0, Number(r.resale_price ?? 0)),
      inv_type: r.inv_type,
    };

    const { error } = await supabase.from("inventory").update(payload).eq("id", id);

    if (error) {
      setErr(error.message);
      setSavingIds((p) => ({ ...p, [id]: false }));
      return;
    }

    setDirtyIds((p) => ({ ...p, [id]: false }));
    setSavingIds((p) => ({ ...p, [id]: false }));
  }

  async function flushPendingSaves() {
    for (const k of Object.keys(timersRef.current)) {
      const id = Number(k);
      const t = timersRef.current[id];
      if (t) window.clearTimeout(t);
    }
    timersRef.current = {};

    const ids = Object.entries(dirtyIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));

    for (const id of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await saveRowById(id);
      } catch {
        // ignore
      }
    }
  }

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "hidden") void flushPendingSaves();
    };
    window.addEventListener("visibilitychange", onVis);

    return () => {
      window.removeEventListener("visibilitychange", onVis);
      void flushPendingSaves();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirtyIds]);

  async function deleteRow(id: number) {
    const ok = confirm("Delete this inventory item?");
    if (!ok) return;

    setErr("");
    const { error } = await supabase.from("inventory").delete().eq("id", id);
    if (error) setErr(error.message);

    setMenuForId(null);
    await loadInventory(invType);
  }

  async function bumpQty(id: number, delta: number) {
    const r = rowsRef.current.find((x) => x.id === id);
    if (!r) return;
    const nextQty = Math.max(0, Number(r.qty ?? 0) + delta);
    updateRowLocal(id, { qty: nextQty });
    await saveRowById(id);
  }

  // unique dropdown options
  const options = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of catalog) {
      const k = normKey(c.name);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(norm(c.name));
    }
    out.sort((a, b) => a.localeCompare(b));
    return out;
  }, [catalog]);

  const filteredRows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => {
      const hay = `${r.item ?? ""}`.toLowerCase();
      return hay.includes(s);
    });
  }, [rows, q]);

  const totalResaleValue = useMemo(() => {
    return rows.reduce(
      (sum, r) => sum + Math.max(0, Number(r.qty ?? 0)) * Math.max(0, Number(r.resale_price ?? 0)),
      0
    );
  }, [rows]);

  const tabTitle = invType === "D" ? "Devan’s Inventory" : "Chad’s Inventory";

  return (
    <div className="page invM-page">
      <style>{`
        /* =======================
           MOBILE-FIRST INVENTORY UI
           iPhone safe-area friendly
           ======================= */

        .invM-page{
          position: relative;
          isolation: isolate;
          padding-bottom: calc(92px + env(safe-area-inset-bottom)); /* room for bottom bar */
        }
        .invM-page:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(820px 420px at 10% 12%, rgba(90,140,255,0.14), transparent 60%),
            radial-gradient(560px 420px at 90% 14%, rgba(212,175,55,0.10), transparent 55%),
            radial-gradient(900px 560px at 50% 98%, rgba(0,0,0,0.88), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.40), rgba(0,0,0,0.88));
          opacity: .98;
        }
        .invM-page > *{ position: relative; z-index: 1; }

        /* Header block */
        .invM-head{
          display:flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
        }

        .invM-topRow{
          display:flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }

        .invM-title{
          display:flex;
          flex-direction: column;
          gap: 6px;
        }
        .invM-title h1{
          margin: 0;
          font-size: 18px;
          letter-spacing: 0.2px;
        }

        .invM-kpi{
          display:flex;
          align-items:center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .invM-pill{
          font-size: 12px;
          font-weight: 950;
          padding: 7px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.95);
          white-space: nowrap;
        }

        /* Segmented control */
        .invM-seg{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .invM-seg button{
          border-radius: 999px;
          border: 1px solid rgba(120,160,255,0.18);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.88);
          padding: 10px 12px;
          font-weight: 950;
          letter-spacing: 0.2px;
          cursor: pointer;
        }
        .invM-seg button.active{
          border-color: rgba(152,90,255,0.40);
          background: linear-gradient(180deg, rgba(152,90,255,0.20), rgba(255,255,255,0.03));
          box-shadow: 0 12px 30px rgba(0,0,0,0.26);
        }

        /* Search bar */
        .invM-search{
          display:flex;
          gap: 10px;
          align-items:center;
        }
        .invM-search .input{
          height: 44px; /* thumb-friendly */
          border-radius: 16px;
        }

        /* Cards list */
        .invM-list{
          display:flex;
          flex-direction: column;
          gap: 10px;
        }

        .invM-card{
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.14);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.08), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.06), transparent 60%),
            rgba(0,0,0,0.42);
          backdrop-filter: blur(12px);
          box-shadow: 0 22px 70px rgba(0,0,0,0.35);
          padding: 12px;
        }

        .invM-rowTop{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }

        .invM-itemCol{
          flex: 1 1 auto;
          min-width: 0;
          display:flex;
          flex-direction: column;
          gap: 8px;
        }

        .invM-itemLabel{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.68);
          letter-spacing: 0.2px;
        }

        .invM-select{
          height: 46px;
          border-radius: 16px;
          font-weight: 950;
        }

        .invM-actions{
          flex: 0 0 auto;
          display:flex;
          flex-direction: column;
          align-items:flex-end;
          gap: 8px;
        }

        .invM-kebab{
          width: 42px;
          height: 42px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          cursor: pointer;
        }
        .invM-statusPill{
          font-size: 11px;
          font-weight: 950;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.70);
          white-space: nowrap;
        }

        .invM-statusPill.low{
          border-color: rgba(255,80,80,0.30);
          background: rgba(255,80,80,0.10);
          color: rgba(255,160,160,0.95);
        }

        /* Qty big +/- */
        .invM-qtyRow{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 12px;
          padding-top: 10px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }

        .invM-qtyBlock{
          display:flex;
          align-items:center;
          gap: 10px;
        }

        .invM-qtyBtn{
          width: 52px;
          height: 46px;
          border-radius: 16px;
          border: 1px solid rgba(152,90,255,0.26);
          background: rgba(152,90,255,0.12);
          color: rgba(255,255,255,0.92);
          font-weight: 950;
          font-size: 18px;
          cursor: pointer;
        }
        .invM-qtyBtn:active{ transform: translateY(1px); }

        .invM-qtyInput{
          width: 92px;
          height: 46px;
          border-radius: 16px;
          text-align: center;
          font-weight: 950;
          font-size: 16px;
        }

        /* Compact cost/resale */
        .invM-moneyRow{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        .invM-fieldLabel{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.66);
          margin-bottom: 6px;
        }
        .invM-moneyInput{
          height: 46px;
          border-radius: 16px;
          font-weight: 950;
        }

        /* Mini menu */
        .invM-menu{
          position: absolute;
          right: 0;
          top: 48px;
          min-width: 160px;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(10,10,16,0.82);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 60px rgba(0,0,0,0.45);
          overflow: hidden;
          z-index: 50;
        }
        .invM-menu button{
          width: 100%;
          text-align: left;
          padding: 12px 12px;
          border: 0;
          background: transparent;
          color: rgba(255,255,255,0.90);
          font-weight: 950;
          cursor: pointer;
        }
        .invM-menu button:hover{
          background: rgba(255,255,255,0.06);
        }
        .invM-menu .danger{
          color: rgba(255,160,160,0.95);
        }

        /* Bottom action bar (always reachable) */
        .invM-bottomBar{
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 120;
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
          background: rgba(10,10,16,0.78);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-top: 1px solid rgba(255,255,255,0.10);
        }
        .invM-bottomInner{
          max-width: 980px;
          margin: 0 auto;
          display:flex;
          gap: 10px;
          align-items:center;
        }
        .invM-bottomInner .btn{
          height: 46px;
          border-radius: 16px;
          width: 100%;
        }

        /* Add item as bottom sheet */
        .invM-overlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display:flex;
          align-items:flex-end;
          justify-content:center;
          padding: 10px;
          z-index: 200;
        }
        .invM-sheet{
          width: min(980px, 100%);
          border-radius: 22px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.10), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.08), transparent 60%),
            rgba(8,10,18,0.92);
          box-shadow: 0 24px 70px rgba(0,0,0,0.55);
          backdrop-filter: blur(12px);
          padding: 14px;
          padding-bottom: calc(14px + env(safe-area-inset-bottom));
        }
        .invM-sheet h2{ margin: 0; font-size: 16px; }
        .invM-sheetGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 12px;
        }
        .invM-sheetGrid .full{ grid-column: 1 / -1; }
        .invM-sheet .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 950;
          font-size: 16px;
        }
        .invM-sheet textarea.input{
          min-height: 110px;
        }
        @media (max-width: 520px){
          .invM-sheetGrid{ grid-template-columns: 1fr; }
        }

        /* Desktop/table fallback (optional) */
        .invM-desktopTable{ display:none; }

        @media (min-width: 980px){
          .invM-page{
            padding-bottom: calc(88px + env(safe-area-inset-bottom));
          }
        }

        /* Reduce accidental zoom on iOS */
        input, select, textarea { font-size: 16px; }
      `}</style>

      <div className="invM-head">
        <div className="invM-topRow">
          <div className="invM-title">
            <h1>{tabTitle}</h1>
            <div className="invM-kpi">
              <span className="invM-pill">Total Resale: {money(totalResaleValue)}</span>
              {loading ? <span className="muted">Loading…</span> : null}
            </div>
          </div>

          <div className="invM-seg" aria-label="Inventory selector">
            <button type="button" className={invType === "D" ? "active" : ""} onClick={() => setInvType("D")}>
              Devan
            </button>
            <button type="button" className={invType === "C" ? "active" : ""} onClick={() => setInvType("C")}>
              Chad
            </button>
          </div>
        </div>

        <div className="invM-search">
          <input
            className="input"
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>

        {err ? (
          <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)" }}>
            <b style={{ color: "salmon" }}>Error:</b> {err}
          </div>
        ) : null}
      </div>

      <div className="invM-list">
        {filteredRows.map((r) => {
          const low = Number(r.qty ?? 0) < 1;
          const isSaving = !!savingIds[r.id];
          const isDirty = !!dirtyIds[r.id];

          // keep dropdown unique: don't show r.item twice
          const dropdown = options.filter((x) => normKey(x) !== normKey(r.item));

          return (
            <div className="invM-card" key={r.id}>
              <div className="invM-rowTop">
                <div className="invM-itemCol">
                  <div className="invM-itemLabel">Item</div>

                  <select
                    className="input invM-select"
                    value={r.item}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__ADD_NEW__") {
                        openAdd();
                        return;
                      }
                      updateRowLocal(r.id, { item: v });
                    }}
                    onBlur={() => void saveRowById(r.id)}
                  >
                    <option value={r.item}>{r.item}</option>
                    {dropdown.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__ADD_NEW__">+ Add new item…</option>
                  </select>
                </div>

                <div className="invM-actions" style={{ position: "relative" }}>
                  <button
                    className="invM-kebab"
                    type="button"
                    onClick={() => setMenuForId((p) => (p === r.id ? null : r.id))}
                    aria-label="Row menu"
                  >
                    ⋯
                  </button>

                  <div className={`invM-statusPill ${low ? "low" : ""}`}>
                    {isSaving ? "Saving…" : isDirty ? "Edited" : low ? "Low" : "OK"}
                  </div>

                  {menuForId === r.id ? (
                    <div className="invM-menu" role="menu">
                      <button type="button" onClick={() => { void saveRowById(r.id); setMenuForId(null); }}>
                        Save now
                      </button>
                      <button type="button" className="danger" onClick={() => void deleteRow(r.id)}>
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="invM-qtyRow">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div className="invM-itemLabel">Qty</div>
                  <div className="invM-qtyBlock">
                    <button className="invM-qtyBtn" type="button" onClick={() => void bumpQty(r.id, -1)}>
                      –
                    </button>
                    <input
                      className="input invM-qtyInput"
                      inputMode="numeric"
                      value={r.qty ?? 0}
                      onChange={(e) => updateRowLocal(r.id, { qty: toNum(e.target.value, 0) })}
                      onBlur={() => void saveRowById(r.id)}
                      style={{
                        borderColor: low ? "rgba(255,80,80,0.45)" : undefined,
                        color: low ? "rgba(255,170,170,1)" : undefined,
                      }}
                    />
                    <button className="invM-qtyBtn" type="button" onClick={() => void bumpQty(r.id, 1)}>
                      +
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div className="invM-itemLabel">Quick</div>
                  <button className="btn" type="button" onClick={() => void bumpQty(r.id, 5)} style={{ height: 46, borderRadius: 16 }}>
                    +5
                  </button>
                </div>
              </div>

              <div className="invM-moneyRow">
                <div>
                  <div className="invM-fieldLabel">Cost</div>
                  <input
                    className="input invM-moneyInput"
                    inputMode="decimal"
                    value={r.unit_cost ?? 0}
                    onChange={(e) => updateRowLocal(r.id, { unit_cost: toNum(e.target.value, 0) })}
                    onBlur={() => void saveRowById(r.id)}
                  />
                </div>

                <div>
                  <div className="invM-fieldLabel">Resale</div>
                  <input
                    className="input invM-moneyInput"
                    inputMode="decimal"
                    value={r.resale_price ?? 0}
                    onChange={(e) => updateRowLocal(r.id, { resale_price: toNum(e.target.value, 0) })}
                    onBlur={() => void saveRowById(r.id)}
                  />
                </div>
              </div>

              <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
                Value:{" "}
                <b style={{ color: "rgba(255,255,255,0.90)" }}>
                  {money(Math.max(0, Number(r.qty ?? 0)) * Math.max(0, Number(r.resale_price ?? 0)))}
                </b>
              </div>
            </div>
          );
        })}

        {!filteredRows.length ? (
          <div className="card" style={{ padding: 12 }}>
            <div className="muted">
              No items match your search.
              <div style={{ marginTop: 8 }}>
                <button className="btn" type="button" onClick={openAdd}>
                  + Add Item
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom bar (always visible, perfect for phone) */}
      <div className="invM-bottomBar">
        <div className="invM-bottomInner">
          <button className="btn primary" type="button" onClick={openAdd}>
            + Add Item
          </button>
          <button className="btn" type="button" onClick={() => void loadAll(invType)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Add Item Bottom Sheet */}
      {addOpen ? (
        <div className="invM-overlay" onClick={closeAdd}>
          <div className="invM-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <h2>Add Item</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  This adds it to your dropdown catalog and to <b>{tabTitle}</b>.
                </div>
              </div>

              <button className="btn" type="button" onClick={closeAdd} style={{ height: 46, borderRadius: 16 }}>
                Close
              </button>
            </div>

            <div className="invM-sheetGrid">
              <div className="full">
                <div className="invM-fieldLabel">Name</div>
                <input
                  className="input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Example: SM7B, Cable, Stand..."
                  autoFocus
                />
              </div>

              <div>
                <div className="invM-fieldLabel">Starting Qty</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="invM-fieldLabel">Unit Cost</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={addCost}
                  onChange={(e) => setAddCost(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="invM-fieldLabel">Resale Price</div>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={addResell}
                  onChange={(e) => setAddResell(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void addItemSubmit()} disabled={loading}>
                {loading ? "Creating…" : "Create Item"}
              </button>
              <button className="btn" type="button" onClick={closeAdd} disabled={loading}>
                Cancel
              </button>
            </div>

            <div className="muted" style={{ marginTop: 10, fontSize: 12 }}>
              Tip: If you can’t see the keyboard / fields on iPhone, scroll inside this sheet — it’s built to stay on-screen.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
