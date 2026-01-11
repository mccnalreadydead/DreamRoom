import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import Layout from "./components/Layout";
import { supabase, supabaseConfigured } from "./supabaseClient";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Inventory from "./pages/Inventory";
import Sales from "./pages/Sales";
import Tracking from "./pages/Tracking";
import CalendarPage from "./pages/CalendarPage";
import NewProduct from "./pages/NewProduct";
import ImportExport from "./pages/ImportExport";

export default function App() {
  // If Supabase isn't configured, allow local mode (still shows app & tabs)
  const localMode = !supabaseConfigured;

  const [loading, setLoading] = useState(!localMode);
  const [session, setSession] = useState<any>(localMode ? { local: true } : null);

  useEffect(() => {
    if (localMode) return;

    supabase.auth.getSession().then(({ data }: any) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: any, newSession: any) => {
      setSession(newSession);
    });

    return () => sub.subscription.unsubscribe();
  }, [localMode]);

  if (loading) return <div className="center">Loading…</div>;

  const allowed = Boolean(session);

  return (
    <Routes>
      <Route path="/login" element={allowed ? <Navigate to="/" /> : <Login />} />

      <Route
        path="/*"
        element={
          allowed ? (
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inventory" element={<Inventory />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/tracking" element={<Tracking />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/new-product" element={<NewProduct />} />

                {/* ✅ IMPORT/EXPORT ROUTE */}
                <Route path="/import" element={<ImportExport />} />

                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            </Layout>
          ) : (
            <Navigate to="/login" />
          )
        }
      />
    </Routes>
  );
}
