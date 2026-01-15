// src/components/Layout.tsx
import { Outlet, NavLink } from "react-router-dom";

const links = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/inventory", label: "Inventory" },
  { to: "/sales", label: "Sales" },
  { to: "/sales-metrics", label: "Sales Metrics" },
  { to: "/tracking", label: "Tracking" },
  { to: "/calendar", label: "Event Calendar" },
  { to: "/clients", label: "Clients" },
  { to: "/new-product", label: "Future Products" },
];

export default function Layout() {
  return (
    <div className="layout">
      {/* Inline CSS so it NEVER “disappears” due to other css changes */}
      <style>{`
        .layout {
          min-height: 100vh;
        }

        /* NAV WRAPPER (NOT sticky, NOT fixed) */
        .topNavWrap {
          padding: 14px 14px 10px;
        }

        .brandRow{
          display:flex;
          align-items:flex-end;
          gap: 10px;
          margin-bottom: 10px;
          color: rgba(255,255,255,0.92);
        }
        .brandTitle{
          font-weight: 950;
          letter-spacing: .2px;
          display:flex;
          align-items:center;
          gap: 8px;
        }
        .brandSub{
          font-size: 12px;
          font-weight: 850;
          color: rgba(255,255,255,0.60);
          margin-top: 2px;
        }

        /* Nebula/pills tab bar */
        .topNav {
          display: flex;
          flex-wrap: wrap;          /* ✅ wraps into 2 rows if needed */
          gap: 10px;
          align-items: center;
          padding: 10px;
          border-radius: 18px;
          border: 1px solid rgba(120,160,255,0.14);
          background: rgba(0,0,0,0.30);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          box-shadow: 0 18px 60px rgba(0,0,0,0.35);
        }

        .topNav a {
          display: inline-flex;     /* ✅ prevents “text run-on” */
          align-items: center;
          justify-content: center;
          height: 38px;
          padding: 0 14px;
          border-radius: 999px;
          text-decoration: none;
          white-space: nowrap;
          font-weight: 950;
          font-size: 13px;
          letter-spacing: .2px;

          color: rgba(255,255,255,0.90);
          border: 1px solid rgba(120,160,255,0.14);
          background: rgba(255,255,255,0.03);
        }

        .topNav a:hover{
          border-color: rgba(152,90,255,0.35);
          background: rgba(152,90,255,0.10);
        }

        .topNav a.active {
          border-color: rgba(152,90,255,0.55);
          background: linear-gradient(180deg, rgba(152,90,255,0.24), rgba(255,255,255,0.03));
          box-shadow: 0 18px 50px rgba(0,0,0,0.35);
        }

        /* Page container spacing */
        .pageWrap{
          padding: 0 14px 24px;
        }

        /* Mobile spacing / slightly tighter pills */
        @media (max-width: 520px){
          .topNavWrap{ padding: 12px 12px 8px; }
          .topNav{ gap: 8px; padding: 8px; }
          .topNav a{ height: 36px; padding: 0 12px; font-size: 12.5px; }
          .pageWrap{ padding: 0 12px 22px; }
        }
      `}</style>

      <div className="topNavWrap">
        <div className="brandRow">
          <div>
            <div className="brandTitle">☁️ Dream Room ☁️</div>
            <div className="brandSub">Soft, dreamy inventory & sales tracking ✨</div>
          </div>
        </div>

        <nav className="topNav" aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={(l as any).end}
              className={({ isActive }) => (isActive ? "active" : "")}
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <main className="pageWrap">
        <Outlet />
      </main>
    </div>
  );
}
