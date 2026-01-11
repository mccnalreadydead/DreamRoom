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
import CloudSync from "./pages/CloudSync";

type RequireAuthProps = {
  session: any;
  children: React.ReactNode;
};

function RequireAuth({ session, children }: RequireAuthProps) {
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const [loading, setLoading] = useState<boolean>(true);
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: any }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(
      (_event: any, newSession: any) => {
        setSession(newSession);
      }
    );

    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) return <div className="center">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />

      <Route
        path="/"
        element={
          <RequireAuth session={session}>
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
        <Route path="cloud-sync" element={<CloudSync />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
