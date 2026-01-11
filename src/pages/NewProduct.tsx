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
      count === 0
        ? 0
        : products.reduce((s, p) => s + (p.resell - p.wholesale), 0) / count;
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
    <div className="page">
      <div className="row">
        <h1 style={{ margin: 0 }}>New Product</h1>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "420px 1fr",
          gap: 14,
          marginTop: 14,
          alignItems: "start",
        }}
      >
        {/* LEFT: FORM */}
        <div className="card" style={{ padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Add Product</h2>

          <label className="label">Product name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="SM7B Replica" />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <label className="label">Wholesale ($)</label>
              <input className="input" value={wholesale} onChange={(e) => setWholesale(e.target.value)} placeholder="180" />
            </div>
            <div>
              <label className="label">Resell ($)</label>
              <input className="input" value={resell} onChange={(e) => setResell(e.target.value)} placeholder="260" />
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

        {/* RIGHT: LIST */}
        <div className="card">
          <div className="grid3">
            <div className="card" style={{ margin: 0 }}>
              <div className="kpiLabel">Products</div>
              <div className="kpiValue">{stats.count}</div>
            </div>
            <div className="card" style={{ margin: 0 }}>
              <div className="kpiLabel">Avg Margin</div>
              <div className="kpiValue">${stats.avgMargin.toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
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
            <div className="tableWrap">
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
                        <button className="btn" onClick={() => removeProduct(p.id)}>
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
