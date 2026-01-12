import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import "./layout.css";

export default function Layout() {
  const navigate = useNavigate();

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } finally {
      navigate("/login");
    }
  }

  const links = [
    { to: "/", label: "Dashboard", end: true },
    { to: "/inventory", label: "Inventory" },
    { to: "/sales", label: "Sales" },
    { to: "/tracking", label: "Tracking" },
    { to: "/calendar", label: "Sales Calendar" },
    { to: "/new-product", label: "New Product" },
    { to: "/cloud-sync", label: "Cloud Sync" },
    { to: "/import-export", label: "Import / Export" },
  ];

  return (
    <div className="appShell">
      <header className="topbar">
        <div className="topbarInner">
          <div className="brand">Already Dead</div>

          <nav className="tabs" aria-label="Primary navigation">
            {links.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={(l as any).end}
                className={({ isActive }) =>
                  "tab" + (isActive ? " tabActive" : "")
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="topbarRight">
            <button className="btn" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* IMPORTANT: this main wrapper prevents pages from "sticking" under the header */}
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
