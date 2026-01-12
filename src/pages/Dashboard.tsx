import { useEffect, useMemo, useState } from "react";
import ImportExport from "./ImportExport";

type Row = Record<string, any>;

function load(key: string): Row[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toNumber(v: any) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).trim().replace(/[^0-9.-]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export default function Dashboard() {
  const [inventory, setInventory] = useState<Row[]>([]);
  const [sales, setSales] = useState<Row[]>([]);

  function reload() {
    setInventory(load("inventory"));
    setSales(load("sales"));
  }

  useEffect(() => {
    reload();
    const onUpdate = () => reload();
    window.addEventListener("ad-storage-updated", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("ad-storage-updated", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, []);

  const metrics = useMemo(() => {
    const qtyInStock = inventory.reduce((s, r) => s + toNumber(r.qty), 0);

    const inventoryCost = inventory.reduce(
      (s, r) => s + toNumber(r.qty) * toNumber(r.unitCost),
      0
    );

    const inventoryProfitPotential = inventory.reduce(
      (s, r) => s + toNumber(r.profit),
      0
    );

    const estimatedEarnings = inventoryCost + inventoryProfitPotential;

    const totalUnitsSold = sales.reduce(
      (s, r) => s + toNumber(r.unitsSold),
      0
    );

    const totalProfit = sales.reduce(
      (s, r) => s + toNumber(r.profit),
      0
    );

    return {
      qtyInStock,
      inventoryCost,
      inventoryProfitPotential,
      estimatedEarnings,
      totalUnitsSold,
      totalProfit,
    };
  }, [inventory, sales]);

  return (
    <div className="page">
      <div style={{ padding: 12, border: "2px solid red", marginBottom: 12 }}>
  ✅ DASHBOARD FILE UPDATED (TEST)
</div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: 2 }}>
            ALREADY DEAD
          </div>
          <div className="muted" style={{ marginTop: 4 }}>
            Dashboard overview
          </div>
        </div>

        <button className="btn" onClick={reload}>
          Refresh
        </button>
      </div>

      {/* KPIs */}
      <div className="grid3" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="kpiLabel">Qty in Stock</div>
          <div className="kpiValue">
            {metrics.qtyInStock.toLocaleString()}
          </div>
          <div className="muted">
            Inventory rows:{" "}
            <span className="pill">{inventory.length}</span>
          </div>
        </div>

        <div className="card">
          <div className="kpiLabel">Inventory Cost Value</div>
          <div className="kpiValue">
            $
            {metrics.inventoryCost.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="muted">qty × unitCost</div>
        </div>

        <div className="card">
          <div className="kpiLabel">
            Total Profit (from Transaction Log)
          </div>
          <div className="kpiValue">
            $
            {metrics.totalProfit.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="muted">
            Sales rows: <span className="pill">{sales.length}</span>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="kpiLabel">
            Estimated Earnings (if all inventory sells)
          </div>
          <div className="kpiValue">
            $
            {metrics.estimatedEarnings.toLocaleString(undefined, {
              maximumFractionDigits: 2,
            })}
          </div>
          <div className="muted">
            Inventory Cost Value + Inventory Profit Potential
          </div>

          <div style={{ marginTop: 10 }}>
            <span className="pill">
              Profit potential: $
              {metrics.inventoryProfitPotential.toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        </div>

        <div className="card">
          <div className="kpiLabel">Units Sold</div>
          <div className="kpiValue">
            {metrics.totalUnitsSold.toLocaleString()}
          </div>
          <div className="muted">
            Uses “unitsSold” from imported sales
          </div>
        </div>
      </div>

      {/* IMPORT / EXPORT — THIS WAS MISSING */}
      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ marginTop: 0 }}>Import / Export</h2>
        <p className="muted">
          Upload your Excel file to update Inventory and Sales.
        </p>
        <ImportExport />
      </div>

      {/* Debug */}
      <div className="card" style={{ marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>Debug</h2>
        <p className="muted" style={{ margin: 0 }}>
          If numbers look wrong, re-import using{" "}
          <b>Import / Export → Import Excel</b>.
          <br />
          Keys used: <span className="pill">inventory</span> and{" "}
          <span className="pill">sales</span>
        </p>
      </div>
    </div>
  );
}
