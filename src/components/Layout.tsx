import { NavLink, Outlet } from "react-router-dom";

const linkStyle = ({ isActive }: { isActive: boolean }) =>
  "tab" + (isActive ? " tabActive" : "");

export default function Layout() {
  return (
    <div className="appShell">
      <div className="topBar">
        <div className="brand">Already Dead</div>

        <nav className="tabs">
          <NavLink className={linkStyle} to="/">Dashboard</NavLink>
          <NavLink className={linkStyle} to="/inventory">Inventory</NavLink>
          <NavLink className={linkStyle} to="/sales">Sales</NavLink>
          <NavLink className={linkStyle} to="/tracking">Tracking</NavLink>
          <NavLink className={linkStyle} to="/calendar">Sales Calendar</NavLink>
          <NavLink className={linkStyle} to="/new-product">New Product</NavLink>
          <NavLink className={linkStyle} to="/cloud-sync">Cloud Sync</NavLink>
        </nav>
      </div>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
