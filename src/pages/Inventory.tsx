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
const COLS: Record<InventoryKey, { label: string; qty: string; cost: string; resell: string }> = {
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

  // ✅ NEW: search + pagination (visual + list-only)
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 30;

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
    setQuery("");
    setPage(1);
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

      // ✅ keep paging sane if a new item comes in
      setPage(1);
    } catch (e: any) {
      setError(e?.message ?? "Failed to add item.");
    }
  }

  // ✅ NEW: filtered + paginated view (does not change stored data)
  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;

    return rows.filter((r) => {
      const label = getLabel(r).toLowerCase();
      return label.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, active]);

  const totalPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  }, [filteredRows.length]);

  useEffect(() => {
    // when filtering changes, snap to page 1
    setPage(1);
  }, [query, active]);

  useEffect(() => {
    // keep page in range if items removed
    if (page > totalPages) setPage(totalPages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  return (
    <div className="inv-wrap inv-underwater">
      <style>{css}</style>

      <div className="inv-header">
        <div className="inv-title">
          <h1 className="invGlowTitle">
            Inventory
            <span className="invTitleShimmer" aria-hidden="true" />
          </h1>
          <span className="inv-pill">Total Resale Value: {money(totalResaleValue)}</span>
        </div>

        <div className="inv-actions">
          <button className="btn btnGlow" onClick={() => setShowAdd(true)}>
            + Add Item
          </button>
          <button className="btn ghost btnGlowSoft" onClick={() => fetchRows(active)} disabled={loading}>
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

      {/* ✅ NEW: search + paging controls (visual only + list filtering) */}
      <div className="inv-toolbar">
        <div className="searchWrap">
          <span className="searchIcon" aria-hidden="true">
            ⌕
          </span>
          <input
            className="inp search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${active === "devan" ? "Devan" : "Chad"}'s inventory…`}
          />
          {query ? (
            <button className="iconBtn clearBtn" onClick={() => setQuery("")} aria-label="Clear search">
              ✕
            </button>
          ) : null}
        </div>

        <div className="pager">
          <div className="pagerInfo">
            Showing{" "}
            <b>
              {filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}-
              {Math.min(page * PAGE_SIZE, filteredRows.length)}
            </b>{" "}
            of <b>{filteredRows.length}</b>
          </div>

          <div className="pagerBtns">
            <button className="btn ghost pagerBtn" onClick={() => setPage(1)} disabled={page <= 1}>
              « First
            </button>
            <button className="btn ghost pagerBtn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              ‹ Prev
            </button>

            <div className="pagerPill">
              Page <b>{page}</b> / <b>{totalPages}</b>
            </div>

            <button
              className="btn ghost pagerBtn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next ›
            </button>
            <button className="btn ghost pagerBtn" onClick={() => setPage(totalPages)} disabled={page >= totalPages}>
              Last »
            </button>
          </div>
        </div>
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
          {filteredRows.length === 0 && !loading ? (
            <div className="empty">{rows.length ? "No results. Try a different search." : "No items yet. Click “+ Add Item”."}</div>
          ) : null}

          {pageRows.map((r) => {
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
                  <div className="name nameGlow">{label}</div>
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
                  <button className="btn danger btnGlowDanger" onClick={() => deleteRow(r.id)}>
                    Delete
                  </button>
                  {savingId === r.id && <span className="saving">Saving…</span>}
                </div>

                {/* Mobile slim row */}
                <div className="mobileRow">
                  <div className="mTop">
                    <div className="mName nameGlow">{label}</div>
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
                      <button className="btn danger miniBtn btnGlowDanger" onClick={() => deleteRow(r.id)}>
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

        {/* ✅ bottom pager (mobile-friendly) */}
        <div className="inv-footerPager">
          <div className="pagerPill">
            Page <b>{page}</b> / <b>{totalPages}</b> • <span className="mutedTiny">30 per page</span>
          </div>

          <div className="pagerBtns">
            <button className="btn ghost pagerBtn" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              ‹ Prev
            </button>
            <button
              className="btn ghost pagerBtn"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              Next ›
            </button>
          </div>
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
              <button className="btn ghost btnGlowSoft" onClick={() => setShowAdd(false)}>
                Cancel
              </button>
              <button className="btn btnGlow" onClick={addItem}>
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
.inv-wrap{ padding: 18px 18px 28px; color: rgba(255,255,255,.92); position: relative; isolation: isolate; }
.inv-wrap > *{ position: relative; z-index: 1; }

/* =========================
   UNDERWATER SHIMMER THEME (VISUAL ONLY)
   Uses layered gradients + animated caustics
   ========================= */
.inv-underwater::before{
  content:"";
  position:absolute;
  inset:-40px;
  z-index:0;
  pointer-events:none;

  background:
    radial-gradient(1000px 560px at 18% 0%, rgba(0,210,255,0.18), transparent 62%),
    radial-gradient(920px 560px at 86% 18%, rgba(140,90,255,0.14), transparent 64%),
    radial-gradient(980px 640px at 55% 105%, rgba(0,255,200,0.10), transparent 62%),
    linear-gradient(180deg, rgba(6,10,18,0.60), rgba(0,0,0,0.18));
  filter: blur(10px) saturate(1.25);
  opacity: 0.95;
  mix-blend-mode: screen;
  animation: uwAura 8.5s ease-in-out infinite;
  transform: translateZ(0);
}

.inv-underwater::after{
  content:"";
  position:absolute;
  inset:-60px;
  z-index:0;
  pointer-events:none;
  opacity: 0.68;
  mix-blend-mode: screen;
  transform: translateZ(0);

  /* caustics + particles */
  background:
    /* caustic layer 1 */
    repeating-radial-gradient(circle at 20% 10%,
      rgba(255,255,255,0.00) 0 10px,
      rgba(255,255,255,0.10) 12px,
      rgba(255,255,255,0.00) 22px),
    /* caustic layer 2 */
    repeating-radial-gradient(circle at 70% 35%,
      rgba(0,255,255,0.00) 0 12px,
      rgba(0,255,255,0.08) 14px,
      rgba(0,255,255,0.00) 26px),

    /* drifting bubbles */
    radial-gradient(circle at 10% 120%, rgba(255,255,255,0.22) 0 2px, rgba(255,255,255,0.10) 7px, transparent 16px),
    radial-gradient(circle at 26% 135%, rgba(255,255,255,0.18) 0 2px, rgba(255,255,255,0.08) 8px, transparent 18px),
    radial-gradient(circle at 44% 128%, rgba(255,255,255,0.16) 0 2px, rgba(255,255,255,0.07) 8px, transparent 18px),
    radial-gradient(circle at 62% 140%, rgba(255,255,255,0.20) 0 2px, rgba(255,255,255,0.09) 8px, transparent 18px),
    radial-gradient(circle at 78% 132%, rgba(255,255,255,0.16) 0 2px, rgba(255,255,255,0.07) 8px, transparent 18px),
    radial-gradient(circle at 90% 145%, rgba(255,255,255,0.18) 0 2px, rgba(255,255,255,0.08) 8px, transparent 18px),

    /* faint fog */
    linear-gradient(180deg, rgba(255,255,255,0.05), transparent 55%, rgba(0,210,255,0.04));

  background-size:
    520px 520px,
    560px 560px,

    800px 1600px,
    820px 1700px,
    780px 1650px,
    840px 1750px,
    760px 1600px,
    880px 1800px,

    100% 100%;

  background-position:
    0% 0%,
    0% 0%,

    12% 120%,
    26% 140%,
    44% 132%,
    62% 150%,
    78% 138%,
    90% 160%,

    50% 0%;

  filter: blur(0.2px) saturate(1.35);
  animation: uwCaustics 5.8s ease-in-out infinite, uwBubbles 14s linear infinite;
}

@keyframes uwAura{
  0%   { transform: translate3d(0,0,0) scale(1); opacity: .88; }
  50%  { transform: translate3d(8px,-6px,0) scale(1.02); opacity: 1; }
  100% { transform: translate3d(0,0,0) scale(1); opacity: .88; }
}

@keyframes uwCaustics{
  0%   { background-position: 0% 0%, 0% 0%, 12% 120%, 26% 140%, 44% 132%, 62% 150%, 78% 138%, 90% 160%, 50% 0%; }
  50%  { background-position: 18% 12%, 12% 18%, 12% 30%, 26% 25%, 44% 40%, 62% 22%, 78% 38%, 90% 28%, 50% 0%; }
  100% { background-position: 0% 0%, 0% 0%, 12% 120%, 26% 140%, 44% 132%, 62% 150%, 78% 138%, 90% 160%, 50% 0%; }
}

@keyframes uwBubbles{
  0%{
    background-position:
      0% 0%,
      0% 0%,

      12% 120%,
      26% 140%,
      44% 132%,
      62% 150%,
      78% 138%,
      90% 160%,

      50% 0%;
  }
  100%{
    background-position:
      0% 0%,
      0% 0%,

      12% -90%,
      26% -110%,
      44% -98%,
      62% -120%,
      78% -105%,
      90% -135%,

      50% 0%;
  }
}

@media (prefers-reduced-motion: reduce){
  .inv-underwater::before,
  .inv-underwater::after{ animation:none; }
}

/* Header */
.inv-header{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom: 10px; }
.inv-title{ min-width: 0; }

.invGlowTitle{
  position: relative;
  display: inline-block;
  font-size: 30px;
  line-height: 1.1;
  margin: 0 0 8px 0;
  letter-spacing: .4px;
  font-weight: 950;

  text-shadow:
    0 0 18px rgba(0,210,255,.16),
    0 0 26px rgba(140,90,255,.14),
    0 16px 55px rgba(0,0,0,.75);
}

.invTitleShimmer{
  position:absolute;
  inset:-2px -18px -2px -18px;
  border-radius: 14px;
  pointer-events:none;
  background: linear-gradient(
    110deg,
    transparent 0%,
    rgba(255,255,255,0.00) 35%,
    rgba(255,255,255,0.22) 45%,
    rgba(255,255,255,0.06) 55%,
    transparent 70%
  );
  transform: translateX(-65%) skewX(-10deg);
  mix-blend-mode: screen;
  opacity: 0.70;
  animation: titleSweep 2.9s linear infinite;
}

@keyframes titleSweep{
  0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.50; }
  40%  { opacity: 0.90; }
  100% { transform: translateX(70%) skewX(-10deg); opacity: 0.55; }
}

.inv-pill{ display:inline-flex; align-items:center; padding: 6px 10px; border-radius: 999px; border: 1px solid rgba(0,210,255,.22); background: rgba(0,210,255,.06); color: rgba(200,245,255,.92); font-size: 13px; max-width: 100%; overflow:hidden; text-overflow: ellipsis; white-space: nowrap; }

.inv-actions{ display:flex; gap:10px; }

/* Buttons */
.btn{
  background: rgba(28,30,35,.9);
  border: 1px solid rgba(255,255,255,.16);
  color: rgba(255,255,255,.92);
  border-radius: 10px;
  padding: 10px 12px;
  font-weight: 600;
  cursor: pointer;
  transition: transform .05s ease, border-color .15s ease, background .15s ease, box-shadow .15s ease, filter .15s ease;
  white-space: nowrap;
}
.btn:hover{
  border-color: rgba(255,255,255,.28);
  box-shadow: 0 0 0 3px rgba(255,255,255,.06);
}
.btn:active{ transform: translateY(1px); }
.btn.ghost{ background: rgba(255,255,255,.04); }
.btn.danger{ border-color: rgba(255, 90, 90, .25); background: rgba(255, 60, 60, .08); }
.btn.danger:hover{ border-color: rgba(255, 90, 90, .45); }

.btnGlow{
  box-shadow:
    0 0 0 2px rgba(0,210,255,0.10),
    0 14px 40px rgba(0,0,0,0.40),
    0 0 22px rgba(0,210,255,0.18);
  animation: btnGlowPulse 1.55s ease-in-out infinite;
  border-color: rgba(0,210,255,0.30);
}
.btnGlow:hover{
  filter: brightness(1.14) saturate(1.2);
  box-shadow:
    0 0 0 2px rgba(0,210,255,0.14),
    0 18px 52px rgba(0,0,0,0.45),
    0 0 30px rgba(0,210,255,0.22);
}
.btnGlowSoft{
  box-shadow:
    0 0 0 2px rgba(140,90,255,0.06),
    0 12px 34px rgba(0,0,0,0.35),
    0 0 20px rgba(140,90,255,0.10);
  border-color: rgba(140,90,255,0.22);
}
.btnGlowDanger{
  box-shadow:
    0 0 0 2px rgba(255,90,90,0.08),
    0 12px 34px rgba(0,0,0,0.35),
    0 0 18px rgba(255,90,90,0.12);
}

@keyframes btnGlowPulse{
  0%   { transform: translateY(0px) scale(1); filter: brightness(1.02) saturate(1.05); }
  50%  { transform: translateY(-1px) scale(1.02); filter: brightness(1.16) saturate(1.22); }
  100% { transform: translateY(0px) scale(1); filter: brightness(1.02) saturate(1.05); }
}

@media (prefers-reduced-motion: reduce){
  .invTitleShimmer{ animation:none; }
  .btnGlow{ animation:none; }
}

/* Tabs */
.inv-tabs{ display:flex; gap:10px; margin: 8px 0 14px; flex-wrap: wrap; }
.tab{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.04); color: rgba(255,255,255,.86); cursor:pointer; font-weight: 700; }
.tab.active{ border-color: rgba(0,210,255,.28); background: rgba(0,210,255,.07); color: rgba(200,245,255,.96); box-shadow: 0 0 0 3px rgba(0,210,255,0.06); }

.inv-error{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255, 90, 90, .25); background: rgba(255, 60, 60, .08); margin-bottom: 12px; }

/* Toolbar */
.inv-toolbar{
  display:flex;
  gap: 12px;
  align-items: stretch;
  justify-content: space-between;
  flex-wrap: wrap;
  margin: 10px 0 12px;
}
.searchWrap{
  flex: 1 1 320px;
  min-width: 240px;
  position: relative;
  display:flex;
  align-items:center;
  gap: 8px;
  border-radius: 14px;
  border: 1px solid rgba(0,210,255,0.18);
  background: rgba(255,255,255,0.03);
  box-shadow:
    0 0 0 2px rgba(0,210,255,0.06),
    0 14px 42px rgba(0,0,0,0.32);
  padding: 8px 10px;
}
.searchIcon{
  opacity: 0.75;
  font-weight: 900;
  transform: translateY(-1px);
  text-shadow: 0 0 12px rgba(0,210,255,0.18);
}
.inp.search{
  border: none;
  background: transparent;
  box-shadow: none;
  padding: 10px 6px;
}
.inp.search:focus{
  border: none;
  box-shadow: none;
}
.clearBtn{
  padding: 6px 10px;
  border-radius: 12px;
  box-shadow:
    0 0 0 2px rgba(255,255,255,0.05),
    0 0 18px rgba(0,210,255,0.10);
}

.pager{
  flex: 1 1 360px;
  min-width: 260px;
  border-radius: 14px;
  border: 1px solid rgba(140,90,255,0.14);
  background: rgba(0,0,0,0.18);
  box-shadow: 0 14px 42px rgba(0,0,0,0.30);
  padding: 10px 12px;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
.pagerInfo{
  font-size: 12px;
  color: rgba(255,255,255,0.72);
  font-weight: 800;
}
.pagerBtns{
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items:center;
  justify-content: space-between;
}
.pagerBtn{
  padding: 10px 12px;
}
.pagerPill{
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  font-weight: 900;
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
}
.mutedTiny{ color: rgba(255,255,255,0.60); font-weight: 800; }

/* Card + table */
.inv-card{ border-radius: 18px; border: 1px solid rgba(0,210,255,.16); background: rgba(10,10,12,.55); overflow: hidden; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
.inv-tableHead{ display:grid; grid-template-columns: 1.4fr .5fr .6fr .6fr .5fr .7fr; gap: 10px; padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,.08); color: rgba(255,255,255,.7); font-weight: 700; font-size: 13px; }
.inv-tableHead .right{ text-align: right; }

.inv-list{ display:flex; flex-direction: column; }
.row{ display:grid; grid-template-columns: 1.4fr .5fr .6fr .6fr .5fr .7fr; gap: 10px; padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,.06); align-items:center; position: relative; }
.row:last-child{ border-bottom: none; }

.cell.item .name{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.03); font-weight: 700; color: rgba(255,255,255,.92); }

.nameGlow{
  text-shadow:
    0 0 14px rgba(0,210,255,0.12),
    0 0 18px rgba(140,90,255,0.10);
}

.inp{ width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.03); color: rgba(255,255,255,.92); outline: none; }
.inp:focus{ border-color: rgba(0,210,255, .35); box-shadow: 0 0 0 4px rgba(0,210,255, .10); }
.inp.danger{ border-color: rgba(255, 90, 90, .55); box-shadow: 0 0 0 4px rgba(255, 90, 90, .10); }

.badge{ display:inline-flex; align-items:center; justify-content:center; padding: 6px 10px; border-radius: 999px; font-weight: 800; font-size: 12px; width: fit-content; }
.badge.ok{ border: 1px solid rgba(0,210,255,.22); background: rgba(0,210,255,.06); color: rgba(200,245,255,.92); }
.badge.low{ border: 1px solid rgba(255, 90, 90, .35); background: rgba(255, 60, 60, .10); color: rgba(255, 170, 170, .95); }

.cell.actions{ display:flex; align-items:center; justify-content:flex-end; gap: 10px; }
.saving{ font-size: 12px; color: rgba(255,255,255,.55); }
.empty{ padding: 18px 16px; color: rgba(255,255,255,.6); font-weight: 650; }

/* Footer pager */
.inv-footerPager{
  display:flex;
  justify-content: space-between;
  align-items:center;
  gap: 10px;
  padding: 12px 14px;
  border-top: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
}

/* Mobile Slim Layout */
.mobileRow{ display:none; }
@media (max-width: 760px){
  .inv-wrap{ padding: 14px 12px 22px; }
  .inv-header{ flex-direction: column; align-items: stretch; gap: 10px; }
  .inv-actions{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .btn{ width: 100%; justify-content:center; }
  .inv-tableHead{ display:none; }
  .row{ grid-template-columns: 1fr; padding: 10px 12px; }
  .cell{ display:none; }
  .mobileRow{ display:block; }

  .mTop{ display:flex; align-items:center; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
  .mName{ font-weight: 850; letter-spacing: .1px; color: rgba(255,255,255,.92); overflow:hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70%; }

  .mGrid{
    display:grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items:end;
  }

  .mField{ display:flex; flex-direction: column; gap: 6px; min-width: 0; }
  .mLabel{ font-size: 11px; color: rgba(255,255,255,.55); font-weight: 800; letter-spacing: .2px; }

  .inp.mini{ padding: 10px 12px; border-radius: 12px; font-weight: 750; width: 100%; }

  .mActions{
    grid-column: 1 / -1;
    display:flex;
    justify-content:flex-end;
    align-items:center;
    gap: 10px;
    margin-top: 2px;
  }
  .miniBtn{ padding: 10px 12px; border-radius: 12px; width: auto; }

  .inv-tabs{ gap: 8px; }
  .tab{ flex: 1 1 auto; text-align:center; }

  .inv-toolbar{ gap: 10px; }
  .pagerBtns{ justify-content: flex-start; }
  .inv-footerPager{ flex-direction: column; align-items: stretch; }
  .inv-footerPager .pagerBtns{ justify-content: space-between; width: 100%; }
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
