import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import { supabase } from "./supabaseClient";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Tracking from "./pages/Tracking";
import CalendarPage from "./pages/CalendarPage";
import NewProduct from "./pages/NewProduct";
import ImportExport from "./pages/ImportExport";
import CloudSync from "./pages/CloudSync";

function isLocalModeEnabled() {
  return localStorage.getItem("ad_local_mode") === "1";
}

function RequireAuth({
  isAuthed,
  children,
}: {
  isAuthed: boolean;
  children: React.ReactNode;
}) {
  if (!isAuthed) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [localMode, setLocalMode] = useState(isLocalModeEnabled());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      setSession(newSession);
    });

    // update local mode if Login page sets it
    const onStorage = () => setLocalMode(isLocalModeEnabled());
    window.addEventListener("storage", onStorage);
    window.addEventListener("ad-local-mode", onStorage as any);

    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("ad-local-mode", onStorage as any);
    };
  }, []);

  const isAuthed = !!session || localMode;

  if (loading) return <div className="center">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={isAuthed ? <Navigate to="/" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <RequireAuth isAuthed={isAuthed}>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="sales" element={<Sales />} />
        <Route path="tracking" element={<Tracking />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="new-product" element={<NewProduct />} />
        <Route path="import-export" element={<ImportExport />} />
        <Route path="cloud-sync" element={<CloudSync />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
