import { useEffect, useMemo, useRef, useState } from "react";
import { addTracking, getTracking, deleteTracking } from "../lib/store";

export default function Tracking() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onUpdate = () => setTick((x) => x + 1);
    window.addEventListener("ad_store_updated", onUpdate);
    return () => window.removeEventListener("ad_store_updated", onUpdate);
  }, []);

  const entries = useMemo(() => getTracking(), [tick]);

  const [trackingNumber, setTrackingNumber] = useState("");
  const [datePurchasedISO, setDatePurchasedISO] = useState(new Date().toISOString().slice(0, 10));
  const [contents, setContents] = useState("");
  const [cost, setCost] = useState<number>(0);
  const [search, setSearch] = useState("");

  // contents modal (kept)
  const [openContents, setOpenContents] = useState(false);
  const [contentsText, setContentsText] = useState("");

  // copy toast (kept)
  const [toast, setToast] = useState<string>("");

  // ✅ NEW: Card view toggle (defaults to cards on small screens, table on desktop)
  const [mobileView, setMobileView] = useState<"cards" | "table">(() => {
    if (typeof window === "undefined") return "table";
    return window.matchMedia && window.matchMedia("(max-width: 820px)").matches ? "cards" : "table";
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      return (e.trackingNumber ?? "").toLowerCase().includes(q) || (e.contents ?? "").toLowerCase().includes(q);
    });
  }, [entries, search]);

  function submit() {
    const tn = trackingNumber.trim();
    if (!tn) return;

    addTracking({
      trackingNumber: tn,
      datePurchasedISO: datePurchasedISO || undefined,
      contents: contents.trim() || undefined,
      cost: Number(cost) || undefined,
    });

    setTrackingNumber("");
    setContents("");
    setCost(0);
  }

  function handleDelete(id: string) {
    if (!confirm("Delete this tracking entry?")) return;
    deleteTracking(id);
  }

  function viewContents(text: string) {
    setContentsText(text || "");
    setOpenContents(true);
  }

  async function copyToClipboard(text: string) {
    const value = (text || "").trim();
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        ta.style.top = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setToast("Copied!");
      window.setTimeout(() => setToast(""), 1200);
    } catch {
      setToast("Copy failed");
      window.setTimeout(() => setToast(""), 1400);
    }
  }

  // ESC closes modal (tiny QoL)
  const escBoundRef = useRef(false);
  useEffect(() => {
    if (escBoundRef.current) return;
    escBoundRef.current = true;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenContents(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="page trackingSun">
      <style>{`
          /* =========================
            HAUNTED LANTERN / GRAVEYARD THEME (visual only)
            ========================= */
        .trackingSun{
          position: relative;
          isolation: isolate;
          padding-bottom: 20px;
        }
        .trackingSun:before{
          content:"";
          position: fixed;
          inset: 0;
          pointer-events:none;
          z-index: 0;
          background:
            radial-gradient(980px 520px at 18% 8%, rgba(255,150,70,0.20), transparent 60%),
            radial-gradient(760px 520px at 92% 16%, rgba(255,94,34,0.16), transparent 62%),
            radial-gradient(820px 620px at 45% 96%, rgba(0,0,0,0.90), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.20), rgba(0,0,0,0.88));
          opacity: .98;
        }

        /* lantern rays + ember shimmer */
        .trackingSun:after{
          content:"";
          position: fixed;
          inset: -60px;
          pointer-events:none;
          z-index: 0;
          opacity: 0.55;
          mix-blend-mode: screen;
          filter: blur(0.25px) saturate(1.15);
          background:
            conic-gradient(from 210deg at 18% 10%,
              rgba(255,255,255,0.00) 0deg,
              rgba(255,190,120,0.08) 14deg,
              rgba(255,255,255,0.00) 34deg,
              rgba(255,120,58,0.06) 52deg,
              rgba(255,255,255,0.00) 76deg,
              rgba(255,170,104,0.07) 94deg,
              rgba(255,255,255,0.00) 120deg),
            repeating-radial-gradient(circle at 24% 14%,
              rgba(255,255,255,0.00) 0 14px,
              rgba(255,150,70,0.10) 16px,
              rgba(255,255,255,0.00) 30px);
          animation: sunShimmer 6.2s ease-in-out infinite;
        }
        @keyframes sunShimmer{
          0%{ transform: translate3d(0,0,0); opacity: 0.45; }
          50%{ transform: translate3d(10px,-8px,0); opacity: 0.72; }
          100%{ transform: translate3d(0,0,0); opacity: 0.45; }
        }

        .trackingSun > *{ position: relative; z-index: 1; }

        /* Title: glimmer + glow */
        .trackTitle{
          display: inline-block;
          position: relative;
          margin: 0 0 10px 0;
          font-weight: 950;
          letter-spacing: .3px;
          text-shadow:
            0 0 18px rgba(255,150,70,0.20),
            0 0 28px rgba(255,94,34,0.14),
            0 18px 60px rgba(0,0,0,0.70);
        }
        .trackTitle .titleSweep{
          position:absolute;
          inset:-4px -18px -4px -18px;
          border-radius: 14px;
          pointer-events:none;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 35%,
            rgba(255,245,210,0.30) 45%,
            rgba(255,255,255,0.08) 55%,
            transparent 70%
          );
          transform: translateX(-70%) skewX(-10deg);
          mix-blend-mode: screen;
          opacity: 0.75;
          animation: titleSweep 2.9s linear infinite;
        }
        @keyframes titleSweep{
          0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          40%  { opacity: 0.95; }
          100% { transform: translateX(70%) skewX(-10deg); opacity: 0.58; }
        }

        /* Cards: warmer glow */
        .trackingSun .card{
          border: 1px solid rgba(255,150,70,0.18);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.32), 0 0 28px rgba(255,150,70,0.08);
          position: relative;
          overflow: hidden;
        }
        .trackingSun .card:before{
          content:"";
          position:absolute;
          inset:-1px;
          pointer-events:none;
          border-radius: inherit;
          background:
            radial-gradient(520px 220px at 20% 0%, rgba(255,150,70,0.12), transparent 60%),
            radial-gradient(620px 260px at 85% 20%, rgba(255,94,34,0.10), transparent 62%);
          opacity: 0.75;
          filter: blur(10px);
          animation: cardBreath 6.8s ease-in-out infinite;
        }
        @keyframes cardBreath{
          0%{ opacity: 0.55; transform: translate3d(0,0,0) scale(1); }
          50%{ opacity: 0.95; transform: translate3d(6px,-4px,0) scale(1.01); }
          100%{ opacity: 0.55; transform: translate3d(0,0,0) scale(1); }
        }
        .trackingSun .card > *{ position: relative; z-index: 1; }

        /* Make headings subtly glow */
        .trackingSun h2{
          text-shadow: 0 0 16px rgba(255,150,70,0.12);
        }

        /* Inputs: sunshine focus glow (visual only) */
        .trackingSun .input{
          transition: box-shadow .15s ease, border-color .15s ease, filter .15s ease;
          width: 100%;
          box-sizing: border-box;
        }
        .trackingSun .input:focus{
          border-color: rgba(255,150,70,0.28) !important;
          box-shadow: 0 0 0 4px rgba(255,150,70,0.12) !important;
        }

        /* Save button: glow + shimmer */
        .trackingSun .btn.primary{
          position: relative;
          box-shadow: 0 0 0 2px rgba(255,150,70,0.05), 0 0 22px rgba(255,150,70,0.10);
          transition: transform .05s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
          overflow: hidden;
        }
        .trackingSun .btn.primary:hover{
          box-shadow: 0 0 0 3px rgba(255,150,70,0.10), 0 0 30px rgba(255,150,70,0.16);
          filter: brightness(1.08);
        }
        .trackingSun .btn.primary:active{ transform: translateY(1px); }
        .trackingSun .btn.primary:after{
          content:"";
          position:absolute;
          inset:-6px -60px;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 35%,
            rgba(255,245,210,0.26) 45%,
            rgba(255,255,255,0.08) 55%,
            transparent 70%
          );
          transform: translateX(-70%) skewX(-10deg);
          opacity: 0.75;
          animation: btnSweep 2.6s linear infinite;
          pointer-events:none;
        }
        @keyframes btnSweep{
          0%   { transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          35%  { opacity: 0.90; }
          100% { transform: translateX(70%) skewX(-10deg); opacity: 0.58; }
        }

        /* Contents button look */
        .contentsBtn{
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 800;
          box-shadow: 0 0 0 2px rgba(255,220,120,0.04), 0 0 18px rgba(255,220,120,0.07);
          transition: transform .05s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
          white-space: nowrap;
        }
        .contentsBtn:hover{
          border-color: rgba(255,220,120,0.26);
          box-shadow: 0 0 0 3px rgba(255,220,120,0.08), 0 0 26px rgba(255,220,120,0.10);
          filter: brightness(1.08);
        }
        .contentsBtn:active{ transform: translateY(1px); }

        /* Copy button */
        .copyBtn{
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 900;
          box-shadow: 0 0 0 2px rgba(255,220,120,0.04), 0 0 18px rgba(255,220,120,0.07);
          transition: transform .05s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
          white-space: nowrap;
        }
        .copyBtn:hover{
          border-color: rgba(255,220,120,0.26);
          box-shadow: 0 0 0 3px rgba(255,220,120,0.08), 0 0 26px rgba(255,220,120,0.10);
          filter: brightness(1.08);
        }
        .copyBtn:active{ transform: translateY(1px); }

        /* Tracking number row (input + copy) */
        .tnRow{
          display:flex;
          gap: 10px;
          align-items:center;
        }
        .tnRow .input{ flex: 1 1 auto; min-width: 0; }
        @media (max-width: 520px){
          .tnRow{
            flex-direction: column;
            align-items: stretch;
          }
          .copyBtn{ width: 100%; }
        }

        /* ✅ View toggle */
        .viewToggleRow{
          display:flex;
          align-items:center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 10px;
          margin-bottom: 8px;
        }
        .segmented{
          display:flex;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          border-radius: 12px;
          overflow: hidden;
        }
        .segBtn{
          padding: 8px 10px;
          font-weight: 950;
          border: 0;
          cursor: pointer;
          background: transparent;
          color: rgba(255,255,255,0.86);
        }
        .segBtn.active{
          background: rgba(255,220,120,0.12);
          color: rgba(255,255,255,0.95);
        }

        /* ✅ TABLE: make table scrollable within card */
        .tableWrap{
          width: 100%;
          overflow-x: auto;
          overflow-y: hidden;
          -webkit-overflow-scrolling: touch;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.02);
        }
        .tableWrap:focus{ outline: none; }

        .table{
          width: 100%;
          border-collapse: collapse;
          min-width: 720px;
        }
        .table th, .table td{
          padding: 10px 12px;
          vertical-align: middle;
        }

        .monoCell{
          font-family: monospace;
          white-space: nowrap;
        }

        @media (max-width: 480px){
          .table th, .table td{ padding: 9px 10px; }
        }

        /* ✅ CARD LIST (mobile-friendly) */
        .cardList{
          display: grid;
          gap: 12px;
          margin-top: 8px;
        }
        .entryCard{
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.03);
          border-radius: 16px;
          padding: 12px;
          box-shadow: inset 0 0 0 1px rgba(255,220,120,0.04);
        }
        .entryTop{
          display:flex;
          align-items:flex-start;
          justify-content: space-between;
          gap: 10px;
        }
        .entryLabel{
          font-size: 12px;
          opacity: 0.72;
          font-weight: 900;
          letter-spacing: .2px;
          margin-bottom: 4px;
        }
        .entryValue{
          font-size: 14px;
          font-weight: 900;
          color: rgba(255,255,255,0.92);
          word-break: break-word;
        }
        .entryMono{
          font-family: monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 100%;
        }
        .entryGrid{
          display:grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        @media (max-width: 420px){
          .entryGrid{ grid-template-columns: 1fr; }
        }

        .entryActions{
          display:flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .entryActions .btn,
        .entryActions .copyBtn,
        .entryActions .contentsBtn{
          padding: 8px 10px;
          border-radius: 12px;
        }

        /* Modal for contents */
        .sunOverlay{
          position: fixed;
          inset: 0;
          background: rgba(0,0,0,0.72);
          display:flex;
          align-items:center;
          justify-content:center;
          padding: 14px;
          z-index: 80;
        }
        .sunModal{
          width: min(760px, 100%);
          border-radius: 18px;
          border: 1px solid rgba(255,220,120,0.18);
          background: rgba(0,0,0,0.86);
          backdrop-filter: blur(14px);
          box-shadow: 0 22px 70px rgba(0,0,0,0.60), 0 0 34px rgba(255,220,120,0.10);
          overflow: hidden;
        }
        .sunModalTop{
          display:flex;
          justify-content: space-between;
          align-items:center;
          gap: 10px;
          padding: 12px 14px;
          border-bottom: 1px solid rgba(255,255,255,0.08);
        }
        .sunModalTitle{
          font-weight: 950;
          text-shadow: 0 0 16px rgba(255,220,120,0.10);
        }
        .sunClose{
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.06);
          color: rgba(255,255,255,0.92);
          border-radius: 10px;
          padding: 8px 10px;
          cursor: pointer;
          font-weight: 900;
        }
        .sunModalBody{
          padding: 14px;
        }
        .sunText{
          width: 100%;
          min-height: 220px;
          resize: none;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.92);
          padding: 12px;
          outline: none;
          font-size: 15px;
          line-height: 1.35;
          box-shadow: inset 0 0 0 1px rgba(255,220,120,0.06);
        }

        /* Toast */
        .toast{
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          z-index: 90;
          padding: 10px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255,220,120,0.18);
          background: rgba(0,0,0,0.78);
          backdrop-filter: blur(10px);
          color: rgba(255,255,255,0.92);
          font-weight: 900;
          box-shadow: 0 18px 60px rgba(0,0,0,0.55), 0 0 24px rgba(255,220,120,0.10);
          pointer-events: none;
          white-space: nowrap;
        }

        @media (prefers-reduced-motion: reduce){
          .trackingSun:after{ animation:none; }
          .trackTitle .titleSweep{ animation:none; }
          .trackingSun .card:before{ animation:none; }
          .trackingSun .btn.primary:after{ animation:none; }
        }
      `}</style>

      <h1 className="trackTitle">
        Tracking
        <span className="titleSweep" aria-hidden="true" />
      </h1>

      <div className="grid2">
        <div className="card">
          <h2>Add Tracking</h2>

          <label className="label">Tracking Number</label>
          <div className="tnRow">
            <input className="input" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <button className="copyBtn" type="button" onClick={() => copyToClipboard(trackingNumber)} title="Copy">
              Copy
            </button>
          </div>

          <label className="label">Date Purchased</label>
          <input
            className="input"
            type="date"
            value={datePurchasedISO}
            onChange={(e) => setDatePurchasedISO(e.target.value)}
          />

          <label className="label">Contents</label>
          <input className="input" value={contents} onChange={(e) => setContents(e.target.value)} />

          <label className="label">Cost</label>
          <input className="input" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} />

          <button className="btn primary" onClick={submit}>
            Save Tracking
          </button>
        </div>

        <div className="card">
          <h2>Search</h2>
          <input
            className="input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tracking or contents"
          />
          <p className="muted">
            Showing {filtered.length} of {entries.length}
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>All Tracking Entries</h2>

        {/* ✅ NEW: View toggle */}
        <div className="viewToggleRow">
          <span className="muted">View</span>
          <div className="segmented" role="tablist" aria-label="Tracking view">
            <button
              className={`segBtn ${mobileView === "cards" ? "active" : ""}`}
              type="button"
              onClick={() => setMobileView("cards")}
              aria-pressed={mobileView === "cards"}
            >
              Cards
            </button>
            <button
              className={`segBtn ${mobileView === "table" ? "active" : ""}`}
              type="button"
              onClick={() => setMobileView("table")}
              aria-pressed={mobileView === "table"}
            >
              Table
            </button>
          </div>
        </div>

        {mobileView === "table" ? (
          <>
            <div className="tableWrap" role="region" aria-label="Tracking entries table" tabIndex={0}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Date</th>
                    <th>Contents</th>
                    <th>Cost</th>
                    <th style={{ width: 80 }}>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td className="monoCell">
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span>{e.trackingNumber}</span>
                          <button
                            className="copyBtn"
                            type="button"
                            onClick={() => copyToClipboard(e.trackingNumber ?? "")}
                            title="Copy tracking number"
                            style={{ padding: "6px 8px", borderRadius: 10 }}
                          >
                            Copy
                          </button>
                        </div>
                      </td>

                      <td>{e.datePurchasedISO ?? ""}</td>

                      <td className="muted">
                        {(e.contents ?? "").trim().length ? (
                          <button className="contentsBtn" type="button" onClick={() => viewContents(e.contents ?? "")}>
                            View
                          </button>
                        ) : (
                          ""
                        )}
                      </td>

                      <td>{e.cost ? `$${e.cost}` : ""}</td>
                      <td>
                        <button className="btn danger" onClick={() => handleDelete(e.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}

                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No tracking entries found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="muted" style={{ marginTop: 10 }}>
              Tip: On mobile, swipe left/right on the table to see all columns.
            </p>
          </>
        ) : (
          <div className="cardList" aria-label="Tracking entries cards">
            {filtered.map((e) => (
              <div className="entryCard" key={e.id}>
                <div className="entryTop">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="entryLabel">Tracking #</div>
                    <div className="entryValue entryMono" title={e.trackingNumber ?? ""}>
                      {e.trackingNumber ?? ""}
                    </div>
                  </div>
                </div>

                <div className="entryGrid">
                  <div>
                    <div className="entryLabel">Date Purchased</div>
                    <div className="entryValue">{e.datePurchasedISO ?? ""}</div>
                  </div>
                  <div>
                    <div className="entryLabel">Cost</div>
                    <div className="entryValue">{e.cost ? `$${e.cost}` : ""}</div>
                  </div>
                </div>

                <div className="entryActions">
                  <button
                    className="copyBtn"
                    type="button"
                    onClick={() => copyToClipboard(e.trackingNumber ?? "")}
                    title="Copy tracking number"
                  >
                    Copy
                  </button>

                  {(e.contents ?? "").trim().length ? (
                    <button className="contentsBtn" type="button" onClick={() => viewContents(e.contents ?? "")}>
                      View Contents
                    </button>
                  ) : null}

                  <button className="btn danger" onClick={() => handleDelete(e.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {filtered.length === 0 && <div className="muted">No tracking entries found.</div>}
          </div>
        )}
      </div>

      {/* Contents Modal */}
      {openContents && (
        <div className="sunOverlay" onMouseDown={() => setOpenContents(false)}>
          <div className="sunModal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="sunModalTop">
              <div className="sunModalTitle">Contents</div>
              <button className="sunClose" type="button" onClick={() => setOpenContents(false)}>
                Close
              </button>
            </div>
            <div className="sunModalBody">
              <textarea className="sunText" value={contentsText} readOnly />
            </div>
          </div>
        </div>
      )}

      {!!toast && <div className="toast">{toast}</div>}
    </div>
  );
}
