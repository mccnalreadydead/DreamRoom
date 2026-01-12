import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "./Layout.css";

export default function Layout() {
  const navigate = useNavigate();

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return (
    <div className="app-shell">
      <header className="top-nav">
        <div className="brand">Already Dead</div>

        <nav className="nav-links">
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/inventory">Inventory</NavLink>
          <NavLink to="/sales">Sales</NavLink>
          <NavLink to="/tracking">Tracking</NavLink>
          <NavLink to="/calendar">Sales Calendar</NavLink>
          <NavLink to="/new-product">New Product</NavLink>

          {/* ✅ THIS WAS MISSING */}
          <NavLink to="/import-export">Import / Export</NavLink>

          <NavLink to="/cloud-sync">Cloud Sync</NavLink>
        </nav>

        <button className="logout-btn" onClick={logout}>
          Logout
        </button>
      </header>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
