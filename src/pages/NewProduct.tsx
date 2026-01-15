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
    const avgMargin =
      count === 0 ? 0 : products.reduce((s, p) => s + (p.resell - p.wholesale), 0) / count;
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
    <div className="page npM">
      <style>{`
        /* MOBILE-FIRST */
        .npM-wrap{
          display:grid;
          grid-template-columns: 1fr;
          gap: 14px;
          margin-top: 14px;
          align-items:start;
        }

        /* Desktop can become 2 columns */
        @media (min-width: 980px){
          .npM-wrap{
            grid-template-columns: 420px 1fr;
          }
        }

        /* Make the form feel vertical + clean */
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

        /* KPI cards stack nicely on mobile */
        .npM-kpis{
          display:grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }
        @media (min-width: 620px){
          .npM-kpis{ grid-template-columns: 1fr 1fr 1fr; }
        }

        /* Table should scroll horizontally if needed */
        .npM-tableWrap{
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          border-radius: 16px;
        }

        /* Make delete button smaller on mobile */
        .npM-delBtn{
          height: 38px;
          border-radius: 14px;
        }
      `}</style>

      <div className="row">
        <h1 style={{ margin: 0 }}>Product List</h1>
      </div>

      <div className="npM-wrap">
        {/* FORM (TOP ON MOBILE) */}
        <div className="card npM-form" style={{ padding: 16 }}>
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
        <div className="card" style={{ padding: 14 }}>
          <div className="npM-kpis">
            <div className="card" style={{ margin: 0 }}>
              <div className="kpiLabel">Products</div>
              <div className="kpiValue">{stats.count}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="kpiLabel">Avg Margin</div>
              <div className="kpiValue">
                ${stats.avgMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="kpiLabel">Storage Key</div>
              <div className="kpiValue" style={{ fontSize: 18 }}>
                products
              </div>
            </div>
          </div>

          <h2 style={{ marginTop: 14 }}>Product List</h2>

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
