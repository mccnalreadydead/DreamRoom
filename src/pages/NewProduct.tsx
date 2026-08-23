import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  wholesale: number;
  resell: number;
  notes: string;
  createdAt: string;
};

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem("products");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveProducts(products: Product[]) {
  localStorage.setItem("products", JSON.stringify(products));
  window.dispatchEvent(new Event("ad-storage-updated"));
}

function makeId() {
  return Math.random().toString(36).slice(2) + "-" + Date.now().toString(36);
}

export default function NewProduct() {
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [wholesale, setWholesale] = useState("");
  const [resell, setResell] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setProducts(loadProducts());
    const onUpdate = () => setProducts(loadProducts());
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const stats = useMemo(() => {
    const count = products.length;
    const avgMargin = count === 0 ? 0 : products.reduce((s, p) => s + (p.resell - p.wholesale), 0) / count;
    return { count, avgMargin };
  }, [products]);

  function addProduct() {
    const n = name.trim();
    const w = toNumber(wholesale);
    const r = toNumber(resell);

    if (!n) return alert("Enter a product name.");
    if (w <= 0) return alert("Price Paid must be greater than 0.");
    if (r <= 0) return alert("Resell price must be greater than 0.");

    const p: Product = {
      id: makeId(),
      name: n,
      wholesale: w,
      resell: r,
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
    };

    const next = [p, ...products];
    setProducts(next);
    saveProducts(next);

    setName("");
    setWholesale("");
    setResell("");
    setNotes("");
  }

  function removeProduct(id: string) {
    const next = products.filter((p) => p.id !== id);
    setProducts(next);
    saveProducts(next);
  }

  return (
    <div className="page npM npEarth">
      <style>{`
        /* =========================================================
           MOBILE-FIRST RESPONSIVE LAYOUT
           ========================================================= */
        .npM-wrap{
          display:grid;
          grid-template-columns: 1fr;
          gap: 20px;
          margin-top: 20px;
          align-items:start;
        }

        @media (min-width: 980px){
          .npM-wrap{ grid-template-columns: 380px 1fr; gap: 24px; }
        }

        .npM-form .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 900;
        }

        .npM-form textarea{
          border-radius: 12px;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
        }

        .npM-form textarea:focus{
          border-color: rgba(255,152,84,0.30) !important;
          box-shadow: 0 0 0 4px rgba(255,152,84,0.12) !important;
          outline: none;
        }

        .npM-two{
          display:grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-top: 14px;
        }
        @media (min-width: 520px){
          .npM-two{ grid-template-columns: 1fr 1fr; }
        }

        .npM-kpis{
          display:grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        @media (min-width: 620px){
          .npM-kpis{ grid-template-columns: 1fr 1fr 1fr; }
        }

        .npM-delBtn{
          height: 40px;
          border-radius: 12px;
          font-weight: 600;
          width: 100%;
        }

        /* Product Cards Grid - Mobile Friendly */
        .npM-productsGrid{
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
          margin-top: 16px;
        }

        @media (min-width: 768px){
          .npM-productsGrid{
            grid-template-columns: repeat(2, 1fr);
            gap: 18px;
          }
        }

        @media (min-width: 1200px){
          .npM-productsGrid{
            grid-template-columns: repeat(2, 1fr);
            gap: 20px;
          }
        }

        /* =========================================================
           VISUAL: "Fresh / Coolest shimmer" title + aura
           ========================================================= */
        .npEarth{
          position: relative;
          isolation: isolate;
          padding-bottom: 22px;
        }
        .npEarth > *{ position: relative; z-index: 2; }

        /* haunted mist + ember aura behind */
        .npEarth::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events:none;
          background:
            radial-gradient(1200px 680px at 18% 0%, rgba(255,152,84,0.20), transparent 62%),
            radial-gradient(980px 620px at 86% 18%, rgba(255,94,34,0.16), transparent 64%),
            radial-gradient(1100px 760px at 55% 115%, rgba(132,72,255,0.12), transparent 62%),
            radial-gradient(820px 520px at 52% 42%, rgba(255,255,255,0.06), transparent 60%),
            linear-gradient(180deg, rgba(0,0,0,0.32), rgba(0,0,0,0.90));
          filter: blur(10px) saturate(1.15);
          opacity: 1;
          transform: translateZ(0);
          animation: npAura 7.2s ease-in-out infinite;
        }
        @keyframes npAura{
          0%{ transform: translate3d(0,0,0) scale(1); opacity: .92; }
          45%{ transform: translate3d(10px,-6px,0) scale(1.02); opacity: 1; }
          100%{ transform: translate3d(0,0,0) scale(1); opacity: .92; }
        }

        /* subtle sparkles + scanlines */
        .npEarth::after{
          content:"";
          position: fixed;
          inset:-40px;
          z-index: 1;
          pointer-events:none;
          opacity: .70;
          mix-blend-mode: screen;
          background:
            radial-gradient(circle, rgba(255,255,255,0.22) 0 1px, transparent 2px),
            radial-gradient(circle, rgba(180,255,210,0.14) 0 1px, transparent 2px),
            radial-gradient(circle, rgba(255,182,128,0.10) 0 1px, transparent 2px),
            linear-gradient(180deg, rgba(255,255,255,0.05), transparent 55%, rgba(0,0,0,0.20));
          background-size: 190px 190px, 260px 260px, 320px 320px, 100% 100%;
          background-position: 20% 10%, 70% 35%, 40% 80%, 0 0;
          filter: blur(.18px);
          animation: npSpark 3.4s ease-in-out infinite;
        }
        @keyframes npSpark{
          0%,100%{ opacity: .55; transform: translate3d(0,0,0); }
          50%{ opacity: .85; transform: translate3d(6px,-3px,0); }
        }

        @media (prefers-reduced-motion: reduce){
          .npEarth::before, .npEarth::after{ animation:none; }
          .npTitle .sweep{ animation:none; }
          .npCardGlow::before{ animation:none; }
          .npEarth .btn.primary::after{ animation:none; }
        }

        /* Big, bold, fresh title — mobile-friendly */
        .npTitle{
          position: relative;
          display: inline-block;
          margin: 0;
          font-weight: 1000;
          letter-spacing: .25px;
          font-size: clamp(28px, 6.2vw, 40px);
          line-height: 1.05;
          text-shadow:
            0 0 18px rgba(255,152,84,0.20),
            0 0 26px rgba(255,94,34,0.14),
            0 18px 60px rgba(0,0,0,0.70);
        }
        .npTitle .sweep{
          position:absolute;
          inset:-6px -18px;
          border-radius: 16px;
          pointer-events:none;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 34%,
            rgba(210,255,235,0.28) 46%,
            rgba(255,255,255,0.10) 56%,
            transparent 70%
          );
          transform: translateX(-70%) skewX(-10deg);
          mix-blend-mode: screen;
          opacity: 0.75;
          animation: npSweep 2.35s linear infinite;
        }
        @keyframes npSweep{
          0%{ transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          40%{ opacity: 0.95; }
          100%{ transform: translateX(70%) skewX(-10deg); opacity: 0.58; }
        }

        /* Cards: glass + lively glow */
        .npEarth .card{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,0.12);
          background: rgba(0,0,0,0.34);
          backdrop-filter: blur(12px);
          box-shadow: 0 18px 55px rgba(0,0,0,0.32);
          overflow: hidden;
          position: relative;
        }
        .npCardGlow::before{
          content:"";
          position:absolute;
          inset:-2px;
          pointer-events:none;
          background:
            radial-gradient(620px 260px at 18% 0%, rgba(255,152,84,0.16), transparent 60%),
            radial-gradient(640px 280px at 86% 18%, rgba(255,94,34,0.12), transparent 62%),
            radial-gradient(520px 240px at 55% 120%, rgba(160,90,255,0.10), transparent 62%),
            linear-gradient(180deg, rgba(255,255,255,0.05), transparent);
          opacity: 0.75;
          filter: blur(12px);
          animation: npCardBreath 6.6s ease-in-out infinite;
        }
        @keyframes npCardBreath{
          0%{ opacity: .55; transform: translate3d(0,0,0) scale(1); }
          50%{ opacity: .95; transform: translate3d(7px,-4px,0) scale(1.01); }
          100%{ opacity: .55; transform: translate3d(0,0,0) scale(1); }
        }
        .npEarth .card > *{ position: relative; z-index: 1; }

        /* Headings slightly glowing */
        .npEarth h2{
          text-shadow: 0 0 16px rgba(255,152,84,0.12);
        }

        /* Inputs: pop a bit */
        .npEarth .input{
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          transition: box-shadow .15s ease, border-color .15s ease, filter .15s ease;
        }
        .npEarth .input:focus{
          border-color: rgba(255,152,84,0.30) !important;
          box-shadow: 0 0 0 4px rgba(255,152,84,0.12) !important;
          filter: brightness(1.06);
        }

        /* Primary button: glow + shimmer */
        .npEarth .btn.primary{
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 0 2px rgba(255,152,84,0.05), 0 0 26px rgba(255,152,84,0.14);
          transition: transform .05s ease, box-shadow .15s ease, filter .15s ease;
        }
        .npEarth .btn.primary:hover{
          box-shadow: 0 0 0 3px rgba(255,152,84,0.10), 0 0 34px rgba(255,152,84,0.20);
          filter: brightness(1.08);
        }
        .npEarth .btn.primary:active{ transform: translateY(1px); }
        .npEarth .btn.primary::after{
          content:"";
          position:absolute;
          inset:-6px -60px;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255,255,255,0.00) 35%,
            rgba(210,255,235,0.24) 45%,
            rgba(255,255,255,0.08) 55%,
            transparent 70%
          );
          transform: translateX(-70%) skewX(-10deg);
          opacity: 0.75;
          animation: npBtnSweep 2.55s linear infinite;
          pointer-events:none;
        }
        @keyframes npBtnSweep{
          0%{ transform: translateX(-70%) skewX(-10deg); opacity: 0.55; }
          35%{ opacity: 0.90; }
          100%{ transform: translateX(70%) skewX(-10deg); opacity: 0.58; }
        }
      `}</style>

      <div className="row">
        <h1 className="npTitle">
          Resell Products
          <span className="sweep" aria-hidden="true" />
        </h1>
      </div>

      <div className="npM-wrap">
        {/* FORM (LEFT SIDEBAR ON DESKTOP, TOP ON MOBILE) */}
        <div className="card npM-form npCardGlow" style={{ padding: 20, height: "fit-content" }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Add Product</h2>

          <label className="label" style={{ fontSize: 13, fontWeight: 600 }}>Product name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SM7B Replica"
            style={{ marginBottom: 14 }}
          />

          <label className="label" style={{ fontSize: 13, fontWeight: 600 }}>Price Paid ($)</label>
          <input
            className="input"
            value={wholesale}
            onChange={(e) => setWholesale(e.target.value)}
            placeholder="180"
            style={{ marginBottom: 14 }}
          />

          <label className="label" style={{ fontSize: 13, fontWeight: 600 }}>Resell ($)</label>
          <input
            className="input"
            value={resell}
            onChange={(e) => setResell(e.target.value)}
            placeholder="260"
            style={{ marginBottom: 14 }}
          />

          <label className="label" style={{ fontSize: 13, fontWeight: 600 }}>Add Notes</label>
          <textarea
            className="input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g., In good condition, minor scratches on case..."
            style={{ minHeight: 90, fontFamily: "inherit", padding: 10, resize: "vertical", marginBottom: 14 }}
          />

          <button className="btn primary" onClick={addProduct} style={{ width: "100%", marginBottom: 12 }}>
            Add Product
          </button>

          <p className="muted" style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>
            Saved locally for now. Later we'll sync to Supabase so your phone sees it too.
          </p>
        </div>

        {/* STATS + PRODUCTS LIST (RIGHT CONTENT ON DESKTOP, BELOW FORM ON MOBILE) */}
        <div className="card npCardGlow" style={{ padding: 20 }}>
          <div className="npM-kpis">
            <div className="card npCardGlow" style={{ margin: 0 }}>
              <div className="kpiLabel">Products</div>
              <div className="kpiValue">{stats.count}</div>
            </div>
            <div className="card npCardGlow" style={{ margin: 0 }}>
              <div className="kpiLabel">Avg Margin</div>
              <div className="kpiValue">
                ${stats.avgMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="card npCardGlow" style={{ margin: 0 }}>
              <div className="kpiLabel">Total Products</div>
              <div className="kpiValue" style={{ fontSize: 22 }}>
                {products.length}
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 24, marginBottom: 16 }}>Your Resell Products</h2>

          {products.length === 0 ? (
            <p className="muted" style={{ marginTop: 20, textAlign: "center", padding: "40px 20px", fontSize: 15 }}>
              No products added yet. Add your first resell product using the form on the left.
            </p>
          ) : (
            <div className="npM-productsGrid">
              {products.map((p) => (
                <div key={p.id} className="card npCardGlow" style={{ padding: 16, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                  {/* Product Name */}
                  <div style={{ marginBottom: 14 }}>
                    <h3 style={{ margin: 0, fontSize: "clamp(16px, 4vw, 20px)", fontWeight: 700, wordBreak: "break-word", lineHeight: 1.3, color: "rgba(255,255,255,0.95)" }}>
                      {p.name}
                    </h3>
                  </div>

                  {/* Prices */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
                    <div style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 10 }}>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Price Paid</div>
                      <div style={{ fontSize: "clamp(16px, 3vw, 18px)", fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                        ${p.wholesale.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                    <div style={{ backgroundColor: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 10 }}>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Resell</div>
                      <div style={{ fontSize: "clamp(16px, 3vw, 18px)", fontWeight: 700, color: "rgba(255,170,106,0.95)" }}>
                        ${p.resell.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                    </div>
                  </div>

                  {/* Margin Highlight */}
                  <div style={{ backgroundColor: "rgba(255,152,84,0.12)", borderRadius: 10, padding: 12, marginBottom: 14, borderLeft: "4px solid rgba(255,152,84,0.40)" }}>
                    <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Your Margin</div>
                    <div style={{ fontSize: "clamp(18px, 4vw, 22px)", fontWeight: 800, color: "rgba(255,184,132,1)" }}>
                      ${(p.resell - p.wholesale).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                  </div>

                  {/* Notes */}
                  {p.notes && (
                    <div style={{ backgroundColor: "rgba(255,94,34,0.10)", borderRadius: 10, padding: 12, marginBottom: 14, borderLeft: "4px solid rgba(255,94,34,0.35)" }}>
                      <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>📝 Notes</div>
                      <div style={{ fontSize: 13, lineHeight: 1.6, color: "rgba(255,255,255,0.88)", wordBreak: "break-word" }}>
                        {p.notes}
                      </div>
                    </div>
                  )}

                  {/* Delete Button */}
                  <button 
                    className="btn npM-delBtn" 
                    onClick={() => removeProduct(p.id)}
                    style={{ backgroundColor: "rgba(220,80,80,0.15)", color: "rgba(255,100,100,0.92)", marginTop: "auto", border: "1px solid rgba(220,80,80,0.25)" }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
