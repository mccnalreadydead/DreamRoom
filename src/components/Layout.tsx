// src/components/Layout.tsx
import { NavLink, Outlet } from "react-router-dom";
import "./layout.css";

const tabs = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/sales-metrics", label: "Sales Metrics" }, // ✅ NEW TAB
  { to: "/tracking", label: "Tracking" },
  { to: "/calendar", label: "Event Calendar" },
  { to: "/clients", label: "Clients" },
  { to: "/new-product", label: "Product List" }, // ✅ renamed from "Product List & Price"
];

export default function Layout() {
  return (
    <div className="ad-shell dreamy">
      {/* Dreamy background layers */}
      <div className="dream-bg" aria-hidden="true" />
      <div className="dream-shimmer" aria-hidden="true" />
      <div className="dream-fog" aria-hidden="true" />
      <div className="dream-particles" aria-hidden="true" />

      {/* ✅ Sticky topbar (stays on top while you scroll) */}
      <header className="ad-topbar dreamy-topbar">
        <div className="ad-brand">
          <div className="ad-brandTitle">☁️ Welcome To The Dream ☁️</div>
          <div className="ad-brandSub">✨✨✨✨✨✨✨✨</div>
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

      <main className="ad-main dreamy-main">
        <Outlet />
      </main>
    </div>
  );
}
