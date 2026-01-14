import { NavLink, Outlet } from "react-router-dom";
import "./layout.css";

const tabs = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/tracking", label: "Tracking" },
  { to: "/calendar", label: "Event Calendar" }, // ✅ renamed
  { to: "/clients", label: "Clients" },
  { to: "/new-product", label: "Product List & Price" },
];

export default function Layout() {
  return (
    <div className="ad-shell dreamy">
      {/* Dreamy background layers */}
      <div className="dream-bg" aria-hidden="true" />
      <div className="dream-shimmer" aria-hidden="true" />
      <div className="dream-fog" aria-hidden="true" />
      <div className="dream-particles" aria-hidden="true" />

      <header className="ad-topbar dreamy-topbar">
        <div className="ad-brand">
          <div className="ad-brandTitle">☁ Dream Room ☁️</div>
          <div className="ad-brandSub">Soft, dreamy inventory & sales tracking ✨</div>
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
