import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";

import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Tracking from "./pages/Tracking";
import CalendarPage from "./pages/CalendarPage";
import NewProduct from "./pages/NewProduct";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="sales" element={<Sales />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="new-product" element={<NewProduct />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
