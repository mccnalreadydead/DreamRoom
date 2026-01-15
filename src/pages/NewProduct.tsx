import { useEffect, useMemo, useState } from "react";

type Product = {
  id: string;
  name: string;
  wholesale: number;
  resell: number;
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
    if (w <= 0) return alert("Wholesale price must be greater than 0.");
    if (r <= 0) return alert("Resell price must be greater than 0.");

    const p: Product = {
      id: makeId(),
      name: n,
      wholesale: w,
      resell: r,
      createdAt: new Date().toISOString(),
    };

    const next = [p, ...products];
    setProducts(next);
    saveProducts(next);

    setName("");
    setWholesale("");
    setResell("");
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
           MOBILE-FIRST layout (UNCHANGED)
           ========================================================= */
        .npM-wrap{
          display:grid;
          grid-template-columns: 1fr;
          gap: 14px;
          margin-top: 14px;
          align-items:start;
        }

        @media (min-width: 980px){
          .npM-wrap{ grid-template-columns: 420px 1fr; }
        }

        .npM-form .input{
          height: 46px;
          border-radius: 16px;
          font-weight: 900;
        }

        .npM-two{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
          margin-top: 10px;
        }
        @media (min-width: 520px){
          .npM-two{ grid-template-columns: 1fr 1fr; }
        }

        .npM-kpis{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 620px){
          .npM-kpis{ grid-template-columns: 1fr 1fr 1fr; }
        }

        .npM-tableWrap{
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 16px;
        }

        .npM-delBtn{
          height: 38px;
          border-radius: 14px;
        }

        /* =========================================================
           VISUAL ONLY: "Fresh / Coolest shimmer" title + aura
           ========================================================= */
        .npEarth{
          position: relative;
          isolation: isolate;
          padding-bottom: 22px;
        }
        .npEarth > *{ position: relative; z-index: 2; }

        /* deep space + neon mist behind */
        .npEarth::before{
          content:"";
          position: fixed;
          inset: 0;
          z-index: 0;
          pointer-events:none;
          background:
            radial-gradient(1200px 680px at 18% 0%, rgba(120,255,180,0.18), transparent 62%),
            radial-gradient(980px 620px at 86% 18%, rgba(90,200,255,0.14), transparent 64%),
            radial-gradient(1100px 760px at 55% 115%, rgba(160,90,255,0.12), transparent 62%),
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
            radial-gradient(circle, rgba(160,210,255,0.10) 0 1px, transparent 2px),
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
            0 0 18px rgba(120,255,180,0.18),
            0 0 26px rgba(90,200,255,0.12),
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
            radial-gradient(620px 260px at 18% 0%, rgba(120,255,180,0.16), transparent 60%),
            radial-gradient(640px 280px at 86% 18%, rgba(90,200,255,0.12), transparent 62%),
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
          text-shadow: 0 0 16px rgba(120,255,180,0.10);
        }

        /* Inputs: pop a bit */
        .npEarth .input{
          border-color: rgba(255,255,255,0.14);
          background: rgba(255,255,255,0.04);
          transition: box-shadow .15s ease, border-color .15s ease, filter .15s ease;
        }
        .npEarth .input:focus{
          border-color: rgba(120,255,180,0.26) !important;
          box-shadow: 0 0 0 4px rgba(120,255,180,0.12) !important;
          filter: brightness(1.06);
        }

        /* Primary button: glow + shimmer */
        .npEarth .btn.primary{
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 0 2px rgba(120,255,180,0.05), 0 0 26px rgba(120,255,180,0.12);
          transition: transform .05s ease, box-shadow .15s ease, filter .15s ease;
        }
        .npEarth .btn.primary:hover{
          box-shadow: 0 0 0 3px rgba(120,255,180,0.10), 0 0 34px rgba(120,255,180,0.18);
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

        /* Table: subtle glow */
        .npEarth .table{
          border-radius: 16px;
          overflow: hidden;
        }
        .npEarth .table thead th{
          color: rgba(255,255,255,0.72);
          text-shadow: 0 0 14px rgba(120,255,180,0.08);
        }
        .npEarth .table tbody tr{
          transition: background .15s ease, box-shadow .15s ease;
        }
        .npEarth .table tbody tr:hover{
          background: rgba(120,255,180,0.06);
          box-shadow: inset 0 0 0 1px rgba(120,255,180,0.10);
        }
      `}</style>

      <div className="row">
        <h1 className="npTitle">
          Product To Order
          <span className="sweep" aria-hidden="true" />
        </h1>
      </div>

      <div className="npM-wrap">
        {/* FORM (TOP ON MOBILE) */}
        <div className="card npM-form npCardGlow" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Add Product</h2>

          <label className="label">Product name</label>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="SM7B Replica"
          />

          <div className="npM-two">
            <div>
              <label className="label">Wholesale ($)</label>
              <input
                className="input"
                value={wholesale}
                onChange={(e) => setWholesale(e.target.value)}
                placeholder="180"
              />
            </div>
            <div>
              <label className="label">Resell ($)</label>
              <input
                className="input"
                value={resell}
                onChange={(e) => setResell(e.target.value)}
                placeholder="260"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <button className="btn primary" onClick={addProduct}>
              Add Product
            </button>
          </div>

          <p className="muted" style={{ marginTop: 10, marginBottom: 0 }}>
            Saved locally for now. Later we’ll sync to Supabase so your phone sees it too.
          </p>
        </div>

        {/* STATS + LIST (BELOW FORM ON MOBILE) */}
        <div className="card npCardGlow" style={{ padding: 14 }}>
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
              <div className="kpiLabel">Storage Key</div>
              <div className="kpiValue" style={{ fontSize: 18 }}>
                products
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 14 }}>Product To Order</h2>

          {products.length === 0 ? (
            <p className="muted">No products added yet.</p>
          ) : (
            <div className="npM-tableWrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th style={{ width: 140 }}>Wholesale</th>
                    <th style={{ width: 140 }}>Resell</th>
                    <th style={{ width: 140 }}>Margin</th>
                    <th style={{ width: 110 }}>Delete</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>${p.wholesale.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td>${p.resell.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td>${(p.resell - p.wholesale).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      <td>
                        <button className="btn npM-delBtn" onClick={() => removeProduct(p.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
