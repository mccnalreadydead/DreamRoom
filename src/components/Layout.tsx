import { NavLink, Outlet } from "react-router-dom";
import "./layout.css";

const tabs = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/tracking", label: "Tracking" },
  { to: "/calendar", label: "Sales Calendar" },
  { to: "/new-product", label: "New Product" },
];

export default function Layout() {
  return (
    <div className="ad-shell">
      {/* ✅ Sticky topbar so it stays at the top on mobile while scrolling */}
      <header
        className="ad-topbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 999,
          background: "rgba(10,10,10,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div className="ad-brand">
          <div className="ad-brandTitle">Already Dead</div>
          <div className="ad-brandSub">Inventory & Sales</div>
        </div>

        <nav className="ad-tabs" aria-label="Primary navigation">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={(t as any).end}
              className={({ isActive }) => (isActive ? "ad-tab active" : "ad-tab")}
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="ad-main">
        <Outlet />
      </main>
    </div>
  );
}
