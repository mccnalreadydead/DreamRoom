import { NavLink } from "react-router-dom";

/** The three Growth sub-tabs, shown at the top of every Growth page. */
export default function GrowthSubNav() {
  return (
    <nav className="growthSubNav" aria-label="Growth sections">
      <NavLink to="/growth" end className={({ isActive }) => `growthSubNavTab${isActive ? " active" : ""}`}>
        Home
      </NavLink>
      <NavLink to="/growth/check-in" className={({ isActive }) => `growthSubNavTab${isActive ? " active" : ""}`}>
        Check In
      </NavLink>
      <NavLink to="/growth/pillars" className={({ isActive }) => `growthSubNavTab${isActive ? " active" : ""}`}>
        Pillars
      </NavLink>
    </nav>
  );
}
