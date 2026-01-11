import React from "react";
import { NavLink } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Layout({ children }: { children: React.ReactNode }) {
  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="brand">Inventory Manager</div>

        <nav className="tabs">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Dashboard
          </NavLink>
          <NavLink to="/inventory" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Inventory
          </NavLink>
          <NavLink to="/sales" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Sales
          </NavLink>
          <NavLink to="/tracking" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Tracking
          </NavLink>
          <NavLink to="/calendar" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Sales Calendar
          </NavLink>
          <NavLink to="/new-product" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            New Product
          </NavLink>

          {/* ✅ NEW TAB */}
          <NavLink to="/import" className={({ isActive }) => (isActive ? "tab active" : "tab")}>
            Import/Export
          </NavLink>
        </nav>

        <button className="btn" onClick={signOut}>Sign out</button>
      </header>

      <main className="content">{children}</main>
    </div>
  );
}
