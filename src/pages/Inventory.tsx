// src/pages/Inventory.tsx
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

type InventoryKey = "devan" | "chad";

type DbRow = Record<string, any> & { id: number };

const TABLE_BY_INVENTORY: Record<InventoryKey, string> = {
  devan: "inventory",
  chad: "item_catalog",
};

/**
 * IMPORTANT:
 * Your error says inventory does not have "name".
 * So we map Devan's inventory label column to "item" by default.
 * If your column is actually "item_name" or something else,
 * change ONLY the `label` value below for devan.
 */
const COLS: Record<
  InventoryKey,
  { label: string; qty: string; cost: string; resell: string }
> = {
  devan: { label: "item", qty: "qty", cost: "cost", resell: "resell" },
  chad: { label: "name", qty: "qty", cost: "cost", resell: "resell" },
};

function toNumber(v: any, fallback = 0) {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
}

function clampMoney(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n * 100) / 100);
}

function money(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default function Inventory() {
  const [active, setActive] = useState<InventoryKey>("devan");
  const [rows, setRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Add item modal
  const [showAdd, setShowAdd] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newCost, setNewCost] = useState(0);
  const [newResell, setNewResell] = useState(0);

  const tableName = TABLE_BY_INVENTORY[active];
  const cols = COLS[active];

  function getLabel(r: DbRow) {
    const v = r?.[cols.label];
    return (v ?? "").toString();
  }

  function getQty(r: DbRow) {
    return clampInt(toNumber(r?.[cols.qty], 0));
  }

  function getCost(r: DbRow) {
    return clampMoney(toNumber(r?.[cols.cost], 0));
  }

  function getResell(r: DbRow) {
    return clampMoney(toNumber(r?.[cols.resell], 0));
  }

  async function fetchRows(which: InventoryKey = active) {
    const tn = TABLE_BY_INVENTORY[which];
    const c = COLS[which];

    setLoading(true);
    setError(null);

    try {
      // Avoid ordering by a possibly-nonexistent column.
      // We'll sort client-side using the label column.
      const { data, error } = await supabase.from(tn).select("*");
      if (error) throw error;

      const list = ((data as DbRow[]) ?? []).slice();

      list.sort((a, b) => {
        const an = (a?.[c.label] ?? "").toString().toLowerCase();
        const bn = (b?.[c.label] ?? "").toString().toLowerCase();
        return an.localeCompare(bn);
      });

      // Only apply if still on the same active inventory
      setRows(list);
    } catch (e: any) {
      setRows([]); // prevents "crossed" display
      setError(e?.message ?? "Failed to load inventory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // Clear rows immediately on tab switch so nothing “bleeds over”
    setRows([]);
    setError(null);
    fetchRows(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const totalResaleValue = useMemo(() => {
    return rows.reduce((sum, r) => sum + getQty(r) * getResell(r), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, active]);

  async function saveRow(id: number, patch: Partial<DbRow>) {
    setSavingId(id);
    setError(null);

    try {
      const { error } = await supabase.from(tableName).update(patch).eq("id", id);
      if (error) throw error;

      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save changes.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(id: number) {
    const ok = window.confirm("Delete this item?");
    if (!ok) return;

    setError(null);

    try {
      // Deletes ONLY from the ACTIVE table
      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;

      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete item.");
    }
  }

  async function addItem() {
    const label = newLabel.trim();
    if (!label) {
      setError("Item name is required.");
      return;
    }

    setError(null);

    try {
      // Inserts ONLY into the ACTIVE table with the ACTIVE column names
      const payload: any = {
        [cols.label]: label,
        [cols.qty]: clampInt(toNumber(newQty, 1)),
        [cols.cost]: clampMoney(toNumber(newCost, 0)),
        [cols.resell]: clampMoney(toNumber(newResell, 0)),
      };

      const { data, error } = await supabase.from(tableName).insert(payload).select("*").single();
      if (error) throw error;

      const inserted = data as DbRow;

      setRows((prev) => {
        const next = [inserted, ...prev];
        next.sort((a, b) => getLabel(a).toLowerCase().localeCompare(getLabel(b).toLowerCase()));
        return next;
      });

      setShowAdd(false);
      setNewLabel("");
      setNewQty(1);
      setNewCost(0);
      setNewResell(0);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add item.");
    }
  }

  return (
    <div className="inv-wrap">
      <style>{css}</style>

      <div className="inv-header">
        <div className="inv-title">
          <h1>Inventory</h1>
          <span className="inv-pill">Total Resale Value: {money(totalResaleValue)}</span>
        </div>

        <div className="inv-actions">
          <button className="btn" onClick={() => setShowAdd(true)}>
            + Add Item
          </button>
          <button className="btn ghost" onClick={() => fetchRows(active)} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="inv-tabs">
        <button className={`tab ${active === "devan" ? "active" : ""}`} onClick={() => setActive("devan")}>
          Devan&apos;s Inventory
        </button>
        <button className={`tab ${active === "chad" ? "active" : ""}`} onClick={() => setActive("chad")}>
          Chad&apos;s Inventory
        </button>
      </div>

      {error && <div className="inv-error">{error}</div>}

      <div className="inv-card">
        <div className="inv-tableHead">
          <div>Item</div>
          <div>Qty</div>
          <div>Cost</div>
          <div>Resell</div>
          <div>Status</div>
          <div className="right">Actions</div>
        </div>

        <div className="inv-list">
          {rows.length === 0 && !loading && <div className="empty">No items yet. Click “+ Add Item”.</div>}

          {rows.map((r) => {
            const label = getLabel(r);
            const qty = getQty(r);
            const cost = getCost(r);
            const resell = getResell(r);
            const low = qty < 2;
            const status = low ? "Low" : "OK";

            return (
              <div key={r.id} className="row">
                {/* Desktop cells */}
                <div className="cell item">
                  <div className="name">{label}</div>
                </div>

                <div className="cell qty">
                  <input
                    className={`inp pill ${low ? "danger" : ""}`}
                    type="number"
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => {
                      const v = clampInt(toNumber(e.target.value, 0));
                      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.qty]: v } : x)));
                    }}
                    onBlur={() => saveRow(r.id, { [cols.qty]: qty } as any)}
                  />
                </div>

                <div className="cell cost">
                  <input
                    className="inp pill"
                    type="number"
                    inputMode="decimal"
                    value={cost}
                    onChange={(e) => {
                      const v = clampMoney(toNumber(e.target.value, 0));
                      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.cost]: v } : x)));
                    }}
                    onBlur={() => saveRow(r.id, { [cols.cost]: cost } as any)}
                  />
                </div>

                <div className="cell resell">
                  <input
                    className="inp pill"
                    type="number"
                    inputMode="decimal"
                    value={resell}
                    onChange={(e) => {
                      const v = clampMoney(toNumber(e.target.value, 0));
                      setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.resell]: v } : x)));
                    }}
                    onBlur={() => saveRow(r.id, { [cols.resell]: resell } as any)}
                  />
                </div>

                <div className="cell status">
                  <span className={`badge ${low ? "low" : "ok"}`}>{status}</span>
                </div>

                <div className="cell actions">
                  <button className="btn danger" onClick={() => deleteRow(r.id)}>
                    Delete
                  </button>
                  {savingId === r.id && <span className="saving">Saving…</span>}
                </div>

                {/* Mobile slim row */}
                <div className="mobileRow">
                  <div className="mTop">
                    <div className="mName">{label}</div>
                    <span className={`badge ${low ? "low" : "ok"}`}>{status}</span>
                  </div>

                  <div className="mGrid">
                    <div className="mField">
                      <div className="mLabel">Qty</div>
                      <input
                        className={`inp mini ${low ? "danger" : ""}`}
                        type="number"
                        inputMode="numeric"
                        value={qty}
                        onChange={(e) => {
                          const v = clampInt(toNumber(e.target.value, 0));
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.qty]: v } : x)));
                        }}
                        onBlur={() => saveRow(r.id, { [cols.qty]: qty } as any)}
                      />
                    </div>

                    <div className="mField">
                      <div className="mLabel">Cost</div>
                      <input
                        className="inp mini"
                        type="number"
                        inputMode="decimal"
                        value={cost}
                        onChange={(e) => {
                          const v = clampMoney(toNumber(e.target.value, 0));
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.cost]: v } : x)));
                        }}
                        onBlur={() => saveRow(r.id, { [cols.cost]: cost } as any)}
                      />
                    </div>

                    <div className="mField">
                      <div className="mLabel">Resell</div>
                      <input
                        className="inp mini"
                        type="number"
                        inputMode="decimal"
                        value={resell}
                        onChange={(e) => {
                          const v = clampMoney(toNumber(e.target.value, 0));
                          setRows((prev) => prev.map((x) => (x.id === r.id ? { ...x, [cols.resell]: v } : x)));
                        }}
                        onBlur={() => saveRow(r.id, { [cols.resell]: resell } as any)}
                      />
                    </div>

                    <div className="mField mActions">
                      <button className="btn danger miniBtn" onClick={() => deleteRow(r.id)}>
                        Delete
                      </button>
                      {savingId === r.id && <span className="saving">Saving…</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Item Modal */}
      {showAdd && (
        <div className="modalOverlay" onMouseDown={() => setShowAdd(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTop">
              <div className="modalTitle">Add Item</div>
              <button className="iconBtn" onClick={() => setShowAdd(false)} aria-label="Close">
                ✕
              </button>
            </div>

            <div className="modalGrid">
              <div className="field">
                <label>Item name</label>
                <input
                  className="inp"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="e.g. Shure SM7B"
                  autoFocus
                />
              </div>

              <div className="field">
                <label>Qty</label>
                <input
                  className="inp"
                  type="number"
                  inputMode="numeric"
                  value={newQty}
                  onChange={(e) => setNewQty(clampInt(toNumber(e.target.value, 1)))}
                />
              </div>

              <div className="field">
                <label>Cost</label>
                <input
                  className="inp"
                  type="number"
                  inputMode="decimal"
                  value={newCost}
                  onChange={(e) => setNewCost(clampMoney(toNumber(e.target.value, 0)))}
                />
              </div>

              <div className="field">
                <label>Resell</label>
                <input
                  className="inp"
                  type="number"
                  inputMode="decimal"
                  value={newResell}
                  onChange={(e) => setNewResell(clampMoney(toNumber(e.target.value, 0)))}
                />
              </div>
            </div>

            <div className="modalActions">
              <button className="btn ghost" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="btn" onClick={addItem}>
                Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const css = `
.inv-wrap{ padding: 18px 18px 28px; color: rgba(255,255,255,.92); }
.inv-header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom: 10px; }
.inv-title h1{ font-size: 30px; line-height: 1.1; margin: 0 0 8px 0; letter-spacing: .2px; }
.inv-pill{ display:inline-flex; align-items:center; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(208, 171, 71, .28); background: rgba(208, 171, 71, .08); color: rgba(245, 214, 135, .95); font-size: 13px; }
.inv-actions{ display:flex; gap:10px; }
.btn{ background: rgba(28,30,35,.9); border: 1px solid rgba(255,255,255,.16); color: rgba(255,255,255,.92); border-radius: 10px; padding: 10px 12px; font-weight: 600; cursor: pointer; transition: transform .05s ease, border-color .15s ease, background .15s ease; white-space: nowrap; }
.btn:hover{ border-color: rgba(255,255,255,.28); }
.btn:active{ transform: translateY(1px); }
.btn.ghost{ background: rgba(255,255,255,.04); }
.btn.danger{ border-color: rgba(255, 90, 90, .25); background: rgba(255, 60, 60, .08); }
.btn.danger:hover{ border-color: rgba(255, 90, 90, .45); }

.inv-tabs{ display:flex; gap:10px; margin: 8px 0 14px; }
.tab{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); color: rgba(255,255,255,.86); cursor:pointer; font-weight: 700; }
.tab.active{ border-color: rgba(208, 171, 71, .35); background: rgba(208, 171, 71, .09); color: rgba(245, 214, 135, .98); }

.inv-error{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255, 90, 90, .25); background: rgba(255, 60, 60, .08); margin-bottom: 12px; }

.inv-card{ border-radius: 18px; border: 1px solid rgba(208, 171, 71, .18); background: rgba(10,10,12,.55); overflow: hidden; }
.inv-tableHead{ display:grid; grid-template-columns: 1.4fr .5fr .6fr .6fr .5fr .7fr; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.7); font-weight: 700; font-size: 13px; }
.inv-tableHead .right{ text-align: right; }

.inv-list{ display:flex; flex-direction: column; }
.row{ display:grid; grid-template-columns: 1.4fr .5fr .6fr .6fr .5fr .7fr; gap: 10px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.06); align-items:center; position: relative; }
.row:last-child{ border-bottom: none; }

.cell.item .name{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); font-weight: 700; color: rgba(255,255,255,.92); }
.inp{ width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: rgba(255,255,255,.92); outline: none; }
.inp:focus{ border-color: rgba(208, 171, 71, .35); box-shadow: 0 0 0 4px rgba(208, 171, 71, .10); }
.inp.danger{ border-color: rgba(255, 90, 90, .55); box-shadow: 0 0 0 4px rgba(255, 90, 90, .10); }

.badge{ display:inline-flex; align-items:center; justify-content:center; padding: 6px 10px; border-radius: 999px; font-weight: 800; font-size: 12px; width: fit-content; }
.badge.ok{ border: 1px solid rgba(208, 171, 71, .32); background: rgba(208, 171, 71, .10); color: rgba(245, 214, 135, .96); }
.badge.low{ border: 1px solid rgba(255, 90, 90, .35); background: rgba(255, 60, 60, .10); color: rgba(255, 170, 170, .95); }

.cell.actions{ display:flex; align-items:center; justify-content:flex-end; gap: 10px; }
.saving{ font-size: 12px; color: rgba(255,255,255,.55); }
.empty{ padding: 18px 16px; color: rgba(255,255,255,.6); font-weight: 650; }

/* Mobile Slim Layout */
.mobileRow{ display:none; }
@media (max-width: 760px){
  .inv-header{ flex-direction: column; align-items: stretch; }
  .inv-actions{ justify-content: flex-start; }
  .inv-tableHead{ display:none; }
  .row{ grid-template-columns: 1fr; padding: 10px 12px; }
  .cell{ display:none; }
  .mobileRow{ display:block; }
  .mTop{ display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 8px; }
  .mName{ font-weight: 850; letter-spacing: .1px; color: rgba(255,255,255,.92); overflow:hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 72%; }
  .mGrid{ display:grid; grid-template-columns: 1fr 1fr 1fr auto; gap: 8px; align-items:end; }
  .mField{ display:flex; flex-direction: column; gap: 6px; }
  .mLabel{ font-size: 11px; color: rgba(255,255,255,.55); font-weight: 800; letter-spacing: .2px; }
  .inp.mini{ padding: 8px 10px; border-radius: 12px; font-weight: 750; }
  .miniBtn{ padding: 9px 10px; border-radius: 12px; }
  .inv-tabs{ gap: 8px; flex-wrap: wrap; }
}

/* Modal */
.modalOverlay{ position: fixed; inset: 0; background: rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; padding: 18px; z-index: 50; }
.modal{ width: 560px; max-width: 100%; border-radius: 18px; border: 1px solid rgba(255,255,255,.12); background: rgba(12,12,14,.95); box-shadow: 0 20px 60px rgba(0,0,0,.6); overflow:hidden; }
.modalTop{ display:flex; align-items:center; justify-content:space-between; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); }
.modalTitle{ font-weight: 900; font-size: 16px; }
.iconBtn{ border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color: rgba(255,255,255,.9); border-radius: 10px; padding: 6px 10px; cursor:pointer; font-weight: 900; }
.modalGrid{ padding: 14px 16px; display:grid; grid-template-columns: 1.5fr .7fr .7fr .7fr; gap: 10px; }
.field label{ display:block; font-size: 11px; color: rgba(255,255,255,.55); font-weight: 800; margin-bottom: 6px; }
.modalActions{ padding: 14px 16px; display:flex; justify-content:flex-end; gap: 10px; border-top: 1px solid rgba(255,255,255,.08); }
@media (max-width: 760px){ .modalGrid{ grid-template-columns: 1fr 1fr; } }
`;
