import { NavLink, Outlet } from "react-router-dom";

function Tab({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      style={({ isActive }) => ({
        textDecoration: "none",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.14)",
        background: isActive ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
        color: "inherit",
        fontWeight: 700,
        textAlign: "center",
        userSelect: "none",
      })}
    >
      {label}
    </NavLink>
  );
}

export default function Layout() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <style>{`
        .topbar {
          position: sticky;
          top: 0;
          z-index: 50;
          backdrop-filter: blur(10px);
          background: rgba(10,10,10,0.75);
          border-bottom: 1px solid rgba(255,255,255,0.10);
        }
        .tabs {
          display: flex;
          gap: 10px;
          padding: 12px;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
        }
        /* Mobile: 2 columns so tabs become 2 rows (or more) automatically */
        @media (max-width: 700px) {
          .tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
          }
        }
        .content {
          max-width: 1100px;
          margin: 0 auto;
        }
      `}</style>

      <div className="topbar">
        <div className="content">
          <div className="tabs">
            <Tab to="/" label="Dashboard" />
            <Tab to="/inventory" label="Inventory" />
            <Tab to="/sales" label="Sales" />
            <Tab to="/tracking" label="Tracking" />
            <Tab to="/calendar" label="Calendar" />
            <Tab to="/new-product" label="New Item" />
          </div>
        </div>
      </div>

      <div className="content">
        <Outlet />
      </div>
    </div>
  );
}
