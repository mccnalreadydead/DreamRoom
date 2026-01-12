import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        "tab" + (isActive ? " tabActive" : "")
      }
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const nav = useNavigate();

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      nav("/login", { replace: true });
    }
  }

  return (
    <div className="appShell">
      <div className="topBar">
        <div className="brandSmall">Already Dead</div>

        <div className="tabs">
          <Tab to="/" label="Dashboard" />
          <Tab to="/inventory" label="Inventory" />
          <Tab to="/sales" label="Sales" />
          <Tab to="/tracking" label="Tracking" />
          <Tab to="/calendar" label="Sales Calendar" />
          <Tab to="/new-product" label="New Product" />
          <Tab to="/cloud-sync" label="Cloud Sync" />
          <Tab to="/import-export" label="Import / Export" />
        </div>

        <button className="btn" onClick={signOut}>
          Sign out
        </button>
      </div>

      <div className="contentWrap">
        <Outlet />
      </div>
    </div>
  );
}
