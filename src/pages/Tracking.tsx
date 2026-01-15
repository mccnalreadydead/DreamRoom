import { useEffect, useMemo, useState } from "react";
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

  // ✅ NEW (small change): modal for viewing contents
  const [openContents, setOpenContents] = useState(false);
  const [contentsText, setContentsText] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return entries;

    return entries.filter((e) => {
      return (
        (e.trackingNumber ?? "").toLowerCase().includes(q) ||
        (e.contents ?? "").toLowerCase().includes(q)
      );
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

  return (
    <div className="page trackingSun">
      <style>{`
        /* =========================
           SUNSHINE / INVITING THEME (visual only)
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
            radial-gradient(980px 520px at 18% 8%, rgba(255,220,120,0.22), transparent 60%),
            radial-gradient(760px 520px at 92% 16%, rgba(255,170,60,0.16), transparent 62%),
            radial-gradient(820px 620px at 45% 96%, rgba(0,0,0,0.90), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,0.20), rgba(0,0,0,0.88));
          opacity: .98;
        }

        /* sun rays + shimmer */
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
              rgba(255,230,140,0.08) 14deg,
              rgba(255,255,255,0.00) 34deg,
              rgba(255,190,90,0.06) 52deg,
              rgba(255,255,255,0.00) 76deg,
              rgba(255,230,140,0.07) 94deg,
              rgba(255,255,255,0.00) 120deg),
            repeating-radial-gradient(circle at 24% 14%,
              rgba(255,255,255,0.00) 0 14px,
              rgba(255,220,120,0.10) 16px,
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
            0 0 18px rgba(255,220,120,0.20),
            0 0 28px rgba(255,170,60,0.14),
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
          border: 1px solid rgba(255,220,120,0.18);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.32), 0 0 28px rgba(255,220,120,0.06);
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
            radial-gradient(520px 220px at 20% 0%, rgba(255,220,120,0.12), transparent 60%),
            radial-gradient(620px 260px at 85% 20%, rgba(255,170,60,0.10), transparent 62%);
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
          text-shadow: 0 0 16px rgba(255,220,120,0.10);
        }

        /* Inputs: sunshine focus glow (visual only) */
        .trackingSun .input{
          transition: box-shadow .15s ease, border-color .15s ease, filter .15s ease;
        }
        .trackingSun .input:focus{
          border-color: rgba(255,220,120,0.28) !important;
          box-shadow: 0 0 0 4px rgba(255,220,120,0.12) !important;
        }

        /* Save button: glow + shimmer */
        .trackingSun .btn.primary{
          position: relative;
          box-shadow: 0 0 0 2px rgba(255,220,120,0.05), 0 0 22px rgba(255,220,120,0.10);
          transition: transform .05s ease, box-shadow .15s ease, border-color .15s ease, filter .15s ease;
          overflow: hidden;
        }
        .trackingSun .btn.primary:hover{
          box-shadow: 0 0 0 3px rgba(255,220,120,0.10), 0 0 30px rgba(255,220,120,0.16);
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

        /* Row glow for recently added items (best-effort visual):
           We don't know which is "newest", but we can add a hover glow and a soft ambient glow for all rows. */
        .trackingSun .table tbody tr{
          transition: background .15s ease, box-shadow .15s ease, filter .15s ease;
        }
        .trackingSun .table tbody tr:hover{
          background: rgba(255,220,120,0.05);
          box-shadow: inset 0 0 0 1px rgba(255,220,120,0.10);
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
          <input className="input" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />

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
                <td style={{ fontFamily: "monospace" }}>{e.trackingNumber}</td>
                <td>{e.datePurchasedISO ?? ""}</td>

                {/* ✅ SMALL CHANGE: Contents becomes a button that opens a big modal */}
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

      {/* ✅ Contents Modal */}
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
    </div>
  );
}
