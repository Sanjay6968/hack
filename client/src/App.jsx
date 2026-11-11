import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Execute from "./pages/Execute";
import Comparison from "./pages/Comparison";
import History from "./pages/History";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/execute", label: "Execute" },
  { to: "/comparison", label: "Comparison" },
  { to: "/history", label: "History" },
];

export default function App() {
  return (
    <BrowserRouter>
      <nav style={{ display: "flex", gap: 24, padding: "12px 24px", borderBottom: "1px solid #e5e7eb", background: "#f9fafb" }}>
        <span style={{ fontWeight: "bold", fontSize: 18, marginRight: 16 }}>WAPFO</span>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            style={({ isActive }) => ({
              textDecoration: "none",
              color: isActive ? "#6366f1" : "#374151",
              fontWeight: isActive ? "bold" : "normal",
            })}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <main style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/execute" element={<Execute />} />
          <Route path="/comparison" element={<Comparison />} />
          <Route path="/history" element={<History />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
