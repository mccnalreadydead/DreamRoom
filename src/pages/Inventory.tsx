import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";

type InventoryRow = {
  id: number;
  item: string;
  qty: number;
  unit_cost: number;
  resale_price: number;
  create_at?: string | null;
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
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // ✅ always-latest rows for autosave reads (prevents stale saves)
  const rowsRef = useRef<InventoryRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // autosave
  const timersRef = useRef<Record<number, number>>({});
  const [savingIds, setSavingIds] = useState<Record<number, boolean>>({});
  const [dirtyIds, setDirtyIds] = useState<Record<number, boolean>>({});

  // Add Item modal
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addQty, setAddQty] = useState(0);
  const [addCost, setAddCost] = useState(0);
  const [addResell, setAddResell] = useState(0);

  async function loadInventory() {
    const { data, error } = await supabase
      .from("inventory")
      .select("id,item,qty,unit_cost,resale_price,create_at")
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

  async function loadAll() {
    setLoading(true);
    setErr("");
    try {
      await Promise.all([loadInventory(), loadCatalog()]);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

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
    const { error } = await supabase.from("item_catalog").insert([{ name, category: "Accessories" }]);

    if (error) {
      const msg = String(error.message || "").toLowerCase();
      const isDup = msg.includes("duplicate") || msg.includes("unique");
      if (!isDup) throw error;
    }

    await loadCatalog();
  }

  async function ensureInventoryRowExists(itemName: string) {
    const { data, error } = await supabase.from("inventory").select("id").eq("item", itemName).maybeSingle();
    if (error) throw error;

    if (!data?.id) {
      const { error: insErr } = await supabase
        .from("inventory")
        .insert([{ item: itemName, qty: 0, unit_cost: 0, resale_price: 0 }]);
      if (insErr) throw insErr;

      await loadInventory();
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
      await ensureInventoryRowExists(name);

      const { error } = await supabase
        .from("inventory")
        .update({
          qty: Math.max(0, Number(addQty || 0)),
          unit_cost: Math.max(0, Number(addCost || 0)),
          resale_price: Math.max(0, Number(addResell || 0)),
        })
        .eq("item", name);

      if (error) throw error;

      await loadInventory();
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
      if (document.visibilityState === "hidden") {
        void flushPendingSaves();
      }
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
    await loadInventory();
  }

  async function bumpQty(id: number, delta: number) {
    const r = rowsRef.current.find((x) => x.id === id);
    if (!r) return;
    const nextQty = Math.max(0, Number(r.qty ?? 0) + delta);
    updateRowLocal(id, { qty: nextQty });
    await saveRowById(id);
  }

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

  // ✅ Total inventory resale value (qty * resale_price)
  const totalResaleValue = useMemo(() => {
    return rows.reduce(
      (sum, r) => sum + Math.max(0, Number(r.qty ?? 0)) * Math.max(0, Number(r.resale_price ?? 0)),
      0
    );
  }, [rows]);

  return (
    <div className="page inv-page">
      <style>{`
        .inv-page{ position: relative; isolation: isolate; }
        .inv-page:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          background:
            radial-gradient(700px 360px at 10% 10%, rgba(212,175,55,0.10), transparent 60%),
            radial-gradient(520px 360px at 90% 18%, rgba(120,0,0,0.16), transparent 55%),
            radial-gradient(820px 520px at 50% 95%, rgba(0,0,0,0.85), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.40), rgba(0,0,0,0.80));
          opacity: .95;
        }
        .inv-page > *{ position: relative; z-index: 1; }

        .inv-top{ justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
        .inv-topBtns{ display:flex; gap:10px; flex-wrap: wrap; }

        .inv-pill{
          font-size: 12px;
          font-weight: 950;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.95);
          white-space: nowrap;
        }

        .inv-card{
          margin-top: 12px;
          padding: 12px;
          border-radius: 16px;
          border: 1px solid rgba(212,175,55,0.16);
          background: rgba(0,0,0,0.40);
          backdrop-filter: blur(10px);
        }

        /* ✅ Reduce layout shifting */
        .inv-tableWrap{ overflow-x: hidden; margin-top: 6px; }
        .inv-table{ width:100%; border-collapse: collapse; table-layout: fixed; }
        .inv-table th, .inv-table td { overflow: hidden; text-overflow: ellipsis; }

        @media (max-width: 980px){
          .inv-tableWrap{ overflow-x:auto; }
          .inv-table{ min-width: 920px; table-layout: auto; }
          select.input, input.input { font-size: 16px; } /* iOS zoom fix */
        }

        .inv-table th{
          text-align:left;
          padding: 7px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.72);
          font-size: 11px;
          letter-spacing: 0.35px;
          font-weight: 950;
          white-space: nowrap;
        }
        .inv-table td{
          padding: 7px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          vertical-align: middle;
        }

        .inv-input{
          padding: 0.42em 0.65em;
          height: 36px;
          line-height: 36px;
          box-sizing: border-box;
          border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          outline: none;
        }
        .inv-input:focus{
          border-color: rgba(212,175,55,0.35);
          box-shadow: 0 0 0 3px rgba(212,175,55,0.10);
        }

        /* ✅ Dropdown readability */
        .inv-select{ background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.92); }
        .inv-select option, .inv-select optgroup{
          background: #0b0b0d !important;
          color: #ffffff !important;
        }

        /* ✅ THIS is the jump fix: prevent wrapping + reserve space for save pill */
        .inv-itemRow{
          display:flex;
          gap:8px;
          flex-wrap: nowrap;
          align-items:center;
        }
        .inv-select{
          flex: 1 1 auto;
          min-width: 180px;
        }
        .inv-saveState{
          width: 78px;          /* always the same width */
          text-align: center;
          font-size: 11px;
          font-weight: 900;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.68);
          white-space: nowrap;
          flex: 0 0 auto;
        }

        .inv-qtyWrap{ display:flex; gap: 8px; align-items:center; }
        .inv-plus{
          padding: 0.45em 0.8em;
          height: 36px;
          border-radius: 12px;
          font-weight: 950;
          border: 1px solid rgba(212,175,55,0.20);
          background: rgba(212,175,55,0.10);
        }

        .inv-qty{ width: 78px; }
        .inv-money{ width: 96px; }

        .inv-lowPill{
          font-size: 11px;
          font-weight: 950;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(255,80,80,0.30);
          background: rgba(255,80,80,0.10);
          color: rgba(255,140,140,0.95);
          white-space: nowrap;
        }
        .inv-okPill{
          font-size: 11px;
          font-weight: 950;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.92);
          white-space: nowrap;
        }

        /* Modal */
        .inv-overlay{
          position: fixed; inset:0;
          background: rgba(0,0,0,0.72);
          display:flex; align-items:center; justify-content:center;
          padding:14px;
          z-index: 60;
        }
        .inv-modal{
          width: min(720px, 100%);
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(212,175,55,0.18);
          background: rgba(10,10,10,0.86);
          box-shadow: 0 18px 60px rgba(0,0,0,0.45);
        }
        .inv-modalGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }
        .inv-label{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.68);
          margin-bottom: 6px;
        }
        @media (max-width: 780px){
          .inv-modalGrid{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="row inv-top">
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>Inventory</h1>
          <span className="inv-pill">Total Resale Value: {money(totalResaleValue)}</span>
        </div>

        <div className="inv-topBtns">
          <button className="btn" type="button" onClick={openAdd}>
            + Add Item
          </button>
          <button className="btn" type="button" onClick={loadAll} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card inv-card">
        <div className="inv-tableWrap">
          <table className="inv-table">
            <thead>
              <tr>
                {["Item", "Qty", "Cost", "Resell", "Status", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const low = Number(r.qty ?? 0) < 5;
                const isSaving = !!savingIds[r.id];
                const isDirty = !!dirtyIds[r.id];

                return (
                  <tr key={r.id}>
                    <td>
                      <div className="inv-itemRow">
                        <select
                          className="input inv-input inv-select"
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

                          {options.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}

                          <option value="__ADD_NEW__">+ Add new item…</option>
                        </select>

                        {/* ✅ Always reserve space (prevents vertical jump) */}
                        <span
                          className="inv-saveState"
                          style={{ opacity: isSaving || isDirty ? 1 : 0, pointerEvents: "none" }}
                        >
                          {isSaving ? "Saving…" : isDirty ? "Edited" : "Saved"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="inv-qtyWrap">
                        <input
                          className="input inv-input inv-qty"
                          style={{
                            borderColor: low ? "rgba(255,80,80,0.55)" : undefined,
                            color: low ? "rgba(255,120,120,1)" : undefined,
                            fontWeight: 900, // stable font weight = less micro-shift
                          }}
                          value={r.qty ?? 0}
                          onChange={(e) => updateRowLocal(r.id, { qty: toNum(e.target.value, 0) })}
                          onBlur={() => void saveRowById(r.id)}
                        />
                        <button className="btn inv-plus" type="button" onClick={() => void bumpQty(r.id, 1)}>
                          +
                        </button>
                      </div>
                    </td>

                    <td>
                      <input
                        className="input inv-input inv-money"
                        value={r.unit_cost ?? 0}
                        onChange={(e) => updateRowLocal(r.id, { unit_cost: toNum(e.target.value, 0) })}
                        onBlur={() => void saveRowById(r.id)}
                      />
                    </td>

                    <td>
                      <input
                        className="input inv-input inv-money"
                        value={r.resale_price ?? 0}
                        onChange={(e) => updateRowLocal(r.id, { resale_price: toNum(e.target.value, 0) })}
                        onBlur={() => void saveRowById(r.id)}
                      />
                    </td>

                    <td>{low ? <span className="inv-lowPill">Low</span> : <span className="inv-okPill">OK</span>}</td>

                    <td>
                      <button className="btn" type="button" onClick={() => void deleteRow(r.id)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="muted" style={{ padding: 12 }}>
                    No items yet. Click “Add Item” to create your first one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen ? (
        <div className="inv-overlay" onClick={closeAdd}>
          <div className="inv-modal card" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <h2 style={{ margin: 0 }}>Add Item</h2>
              <button className="btn" type="button" onClick={closeAdd}>
                Close
              </button>
            </div>

            <div className="inv-modalGrid">
              <div>
                <div className="inv-label">Name</div>
                <input
                  className="input inv-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Example: Custom named mic"
                />
              </div>

              <div>
                <div className="inv-label">Starting Qty</div>
                <input
                  className="input inv-input"
                  type="number"
                  min={0}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="inv-label">Unit Cost</div>
                <input
                  className="input inv-input"
                  type="number"
                  min={0}
                  value={addCost}
                  onChange={(e) => setAddCost(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="inv-label">Resale Price</div>
                <input
                  className="input inv-input"
                  type="number"
                  min={0}
                  value={addResell}
                  onChange={(e) => setAddResell(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>
            </div>

            <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn primary" type="button" onClick={() => void addItemSubmit()}>
                Create Item
              </button>
              <button className="btn" type="button" onClick={closeAdd}>
                Cancel
              </button>
            </div>

            <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
              This adds it to your dropdown list AND creates it in inventory so you can track qty.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
