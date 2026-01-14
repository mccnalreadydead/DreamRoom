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

  // always-latest rows for autosave reads
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
  setLoading(true);

  try {
    // find the row so we know the item name
    const row = rowsRef.current.find((x) => x.id === id);
    const itemName = row?.item;

    // ✅ instantly remove from UI so dropdown refreshes right away
    setRows((prev) => prev.filter((x) => x.id !== id));

    // delete from inventory
    const delInv = await supabase.from("inventory").delete().eq("id", id);
    if (delInv.error) throw delInv.error;

    // OPTIONAL: if you want "delete means delete everywhere"
    if (itemName) {
      // only delete from item_catalog if it's not used in ANY inventory row (D or C)
      const check = await supabase
        .from("inventory")
        .select("id")
        .eq("item", itemName)
        .limit(1);

      if (check.error) throw check.error;

      const stillUsed = (check.data ?? []).length > 0;

      if (!stillUsed) {
        // remove from catalog
        const delCat = await supabase.from("item_catalog").delete().eq("name", itemName);
        if (delCat.error) throw delCat.error;

        // also remove locally so dropdown updates immediately
        setCatalog((prev) => prev.filter((c) => normKey(c.name) !== normKey(itemName)));
      }
    }

    // reload to stay perfectly synced
    await loadAll(invType);
  } catch (e: any) {
    setErr(e?.message ?? String(e));
    // if something fails, re-sync from server
    await loadAll(invType);
  } finally {
    setLoading(false);
  }
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

  const totalResaleValue = useMemo(() => {
    return rows.reduce(
      (sum, r) => sum + Math.max(0, Number(r.qty ?? 0)) * Math.max(0, Number(r.resale_price ?? 0)),
      0
    );
  }, [rows]);

  const tabTitle = invType === "D" ? "Devan's-Inventory" : "Chad's-Inventory";

  return (
    <div className="page inv2-page">
      <style>{`
        .inv2-page{ position: relative; isolation: isolate; }
        .inv2-page:before{
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
        .inv2-page > *{ position: relative; z-index: 1; }

        .inv2-top{ justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
        .inv2-topBtns{ display:flex; gap:10px; flex-wrap: wrap; }

        .inv2-tabs{
          display:flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items:center;
          margin-bottom: 10px;
        }
        .inv2-tabBtn{
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(120,160,255,0.22);
          background: linear-gradient(180deg, rgba(18,30,60,0.55), rgba(10,14,28,0.55));
          color: rgba(255,255,255,0.86);
          font-weight: 950;
          letter-spacing: 0.2px;
          box-shadow: 0 10px 28px rgba(0,0,0,0.25);
          transition: transform .08s ease, border-color .12s ease, filter .12s ease;
          user-select: none;
        }
        .inv2-tabBtn:hover{ filter: brightness(1.05); }
        .inv2-tabBtn:active{ transform: translateY(1px); }
        .inv2-tabBtnActive{
          border-color: rgba(212,175,55,0.34);
          box-shadow: 0 14px 40px rgba(0,0,0,0.30);
          background:
            radial-gradient(520px 120px at 20% 0%, rgba(212,175,55,0.16), transparent 60%),
            linear-gradient(180deg, rgba(22,34,70,0.72), rgba(10,14,28,0.62));
          color: rgba(255,255,255,0.92);
        }

        .inv2-pill{
          font-size: 12px;
          font-weight: 950;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.95);
          white-space: nowrap;
        }

        .inv2-card{
          margin-top: 12px;
          padding: 12px;
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.08), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.06), transparent 60%),
            rgba(0,0,0,0.42);
          backdrop-filter: blur(12px);
          box-shadow: 0 22px 70px rgba(0,0,0,0.35);
        }

        .inv2-tableWrap{ overflow-x: hidden; margin-top: 6px; }
        .inv2-table{ width:100%; border-collapse: collapse; table-layout: fixed; }
        .inv2-table th, .inv2-table td { overflow: hidden; text-overflow: ellipsis; }

        @media (max-width: 980px){
          .inv2-tableWrap{ overflow-x:auto; }
          .inv2-table{ min-width: 940px; table-layout: auto; }
          select.inv2-input, input.inv2-input { font-size: 16px; } /* iOS zoom fix */
        }

        .inv2-table th{
          text-align:left;
          padding: 8px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.10);
          color: rgba(255,255,255,0.72);
          font-size: 11px;
          letter-spacing: 0.38px;
          font-weight: 950;
          white-space: nowrap;
        }
        .inv2-table td{
          padding: 8px 8px;
          border-bottom: 1px solid rgba(255,255,255,0.06);
          vertical-align: middle;
        }

        /* Make inputs match the rest of your app: dark blue glass, white text */
        .inv2-input{
          padding: 0.46em 0.70em;
          height: 38px;
          line-height: 38px;
          box-sizing: border-box;
          border-radius: 14px;
          border: 1px solid rgba(120,160,255,0.18);
          background:
            linear-gradient(180deg, rgba(18,30,60,0.62), rgba(10,14,28,0.62));
          color: rgba(255,255,255,0.92);
          outline: none;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.03),
            0 10px 26px rgba(0,0,0,0.22);
        }
        .inv2-input:focus{
          border-color: rgba(212,175,55,0.36);
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.03),
            0 0 0 3px rgba(212,175,55,0.10),
            0 14px 34px rgba(0,0,0,0.28);
        }

        /* Dropdown readability */
        .inv2-select{ color: rgba(255,255,255,0.92); }
        .inv2-select option, .inv2-select optgroup{
          background: #070a14 !important;
          color: #ffffff !important;
        }

        /* Prevent wrapping + reserve space for save pill */
        .inv2-itemRow{
          display:flex;
          gap:10px;
          flex-wrap: nowrap;
          align-items:center;
        }
        .inv2-select{ flex: 1 1 auto; min-width: 200px; }

        .inv2-saveState{
          width: 86px;
          text-align: center;
          font-size: 11px;
          font-weight: 950;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            linear-gradient(180deg, rgba(18,30,60,0.50), rgba(10,14,28,0.50));
          color: rgba(255,255,255,0.72);
          white-space: nowrap;
          flex: 0 0 auto;
          box-shadow: 0 10px 26px rgba(0,0,0,0.20);
        }

        .inv2-qtyWrap{ display:flex; gap: 8px; align-items:center; }
        .inv2-plus{
          padding: 0.48em 0.85em;
          height: 38px;
          border-radius: 14px;
          font-weight: 950;
          border: 1px solid rgba(212,175,55,0.22);
          background:
            radial-gradient(420px 120px at 20% 0%, rgba(212,175,55,0.16), transparent 55%),
            linear-gradient(180deg, rgba(18,30,60,0.55), rgba(10,14,28,0.55));
          box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        }

        .inv2-qty{ width: 86px; }
        .inv2-money{ width: 110px; }

        .inv2-lowPill{
          font-size: 11px;
          font-weight: 950;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255,80,80,0.30);
          background: rgba(255,80,80,0.10);
          color: rgba(255,140,140,0.95);
          white-space: nowrap;
        }
        .inv2-okPill{
          font-size: 11px;
          font-weight: 950;
          padding: 5px 10px;
          border-radius: 999px;
          border: 1px solid rgba(212,175,55,0.22);
          background: rgba(212,175,55,0.10);
          color: rgba(212,175,55,0.92);
          white-space: nowrap;
        }

        /* Modal */
        .inv2-overlay{
          position: fixed; inset:0;
          background: rgba(0,0,0,0.74);
          display:flex; align-items:center; justify-content:center;
          padding:14px;
          z-index: 60;
        }
        .inv2-modal{
          width: min(740px, 100%);
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.16);
          background:
            radial-gradient(900px 220px at 30% 0%, rgba(90,140,255,0.10), transparent 60%),
            radial-gradient(680px 220px at 85% 0%, rgba(212,175,55,0.08), transparent 60%),
            rgba(8,10,18,0.88);
          box-shadow: 0 24px 70px rgba(0,0,0,0.48);
          backdrop-filter: blur(12px);
        }
        .inv2-modalGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-top: 12px;
        }
        .inv2-label{
          font-size: 12px;
          font-weight: 950;
          color: rgba(255,255,255,0.68);
          margin-bottom: 6px;
        }
        @media (max-width: 780px){
          .inv2-modalGrid{ grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="inv2-tabs">
        <button
          type="button"
          className={`inv2-tabBtn ${invType === "D" ? "inv2-tabBtnActive" : ""}`}
          onClick={() => setInvType("D")}
        >
          Devans-Inventory
        </button>
        <button
          type="button"
          className={`inv2-tabBtn ${invType === "C" ? "inv2-tabBtnActive" : ""}`}
          onClick={() => setInvType("C")}
        >
          Chads-Inventory
        </button>
      </div>

      <div className="row inv2-top">
        <div style={{ display: "flex", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
          <h1 style={{ margin: 0 }}>{tabTitle}</h1>
          <span className="inv2-pill">Total Resale Value: {money(totalResaleValue)}</span>
        </div>

        <div className="inv2-topBtns">
          <button className="btn" type="button" onClick={openAdd}>
            + Add Item
          </button>
          <button className="btn" type="button" onClick={() => void loadAll(invType)} disabled={loading}>
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="card" style={{ padding: 12, borderColor: "rgba(255,100,100,0.35)", marginTop: 12 }}>
          <b style={{ color: "salmon" }}>Error:</b> {err}
        </div>
      ) : null}

      <div className="card inv2-card">
        <div className="inv2-tableWrap">
          <table className="inv2-table">
            <thead>
              <tr>
                {["Item", "Qty", "Cost", "Resell", "Status", "Actions"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((r) => {
                const low = Number(r.qty ?? 0) < 1;
                const isSaving = !!savingIds[r.id];
                const isDirty = !!dirtyIds[r.id];

                return (
                  <tr key={r.id}>
                    <td>
                      <div className="inv2-itemRow">
                        <select
                          className="inv2-input inv2-select"
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

                        <span
                          className="inv2-saveState"
                          style={{ opacity: isSaving || isDirty ? 1 : 0, pointerEvents: "none" }}
                        >
                          {isSaving ? "Saving…" : isDirty ? "Edited" : "Saved"}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className="inv2-qtyWrap">
                        <input
                          className="inv2-input inv2-qty"
                          style={{
                            borderColor: low ? "rgba(255,80,80,0.55)" : undefined,
                            color: low ? "rgba(255,140,140,1)" : undefined,
                            fontWeight: 950,
                          }}
                          value={r.qty ?? 0}
                          onChange={(e) => updateRowLocal(r.id, { qty: toNum(e.target.value, 0) })}
                          onBlur={() => void saveRowById(r.id)}
                        />
                        <button className="btn inv2-plus" type="button" onClick={() => void bumpQty(r.id, 1)}>
                          +
                        </button>
                      </div>
                    </td>

                    <td>
                      <input
                        className="inv2-input inv2-money"
                        value={r.unit_cost ?? 0}
                        onChange={(e) => updateRowLocal(r.id, { unit_cost: toNum(e.target.value, 0) })}
                        onBlur={() => void saveRowById(r.id)}
                      />
                    </td>

                    <td>
                      <input
                        className="inv2-input inv2-money"
                        value={r.resale_price ?? 0}
                        onChange={(e) => updateRowLocal(r.id, { resale_price: toNum(e.target.value, 0) })}
                        onBlur={() => void saveRowById(r.id)}
                      />
                    </td>

                    <td>{low ? <span className="inv2-lowPill">Low</span> : <span className="inv2-okPill">OK</span>}</td>

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
                    No items yet in {tabTitle}. Click “Add Item” to create your first one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {addOpen ? (
        <div className="inv2-overlay" onClick={closeAdd}>
          <div className="inv2-modal" onClick={(e) => e.stopPropagation()}>
            <div className="row" style={{ alignItems: "center" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <h2 style={{ margin: 0 }}>Add Item</h2>
                <div className="muted" style={{ fontSize: 12 }}>
                  Adds to <b>{tabTitle}</b> and your dropdown catalog.
                </div>
              </div>

              <button className="btn" type="button" onClick={closeAdd}>
                Close
              </button>
            </div>

            <div className="inv2-modalGrid">
              <div>
                <div className="inv2-label">Name</div>
                <input
                  className="inv2-input"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Example: Charger, Part, Product name..."
                />
              </div>

              <div>
                <div className="inv2-label">Starting Qty</div>
                <input
                  className="inv2-input"
                  type="number"
                  min={0}
                  value={addQty}
                  onChange={(e) => setAddQty(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="inv2-label">Unit Cost</div>
                <input
                  className="inv2-input"
                  type="number"
                  min={0}
                  value={addCost}
                  onChange={(e) => setAddCost(Math.max(0, Number(e.target.value || 0)))}
                />
              </div>

              <div>
                <div className="inv2-label">Resale Price</div>
                <input
                  className="inv2-input"
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
              Pro tip: You can also select “+ Add new item…” from the dropdown.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
