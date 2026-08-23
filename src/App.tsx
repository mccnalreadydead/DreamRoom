// src/App.tsx
import { Suspense, lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Sales = lazy(() => import("./pages/Sales"));
const Tracking = lazy(() => import("./pages/Tracking"));
const NewProduct = lazy(() => import("./pages/NewProduct"));
const SalesMetrics = lazy(() => import("./pages/SalesMetrics"));
const ItemSalesByMonth = lazy(() => import("./pages/ItemSalesByMonth"));

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 20, color: "white" }}>Loading…</div>}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="sales" element={<Sales />} />
          <Route path="sales-metrics" element={<SalesMetrics />} />
          <Route path="item-sales" element={<ItemSalesByMonth />} />
          <Route path="tracking" element={<Tracking />} />
          <Route path="new-product" element={<NewProduct />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
