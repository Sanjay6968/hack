import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, useLocation } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Execute from "./pages/Execute";
import Comparison from "./pages/Comparison";
import History from "./pages/History";
import { getHealth } from "./api/client";
import { BRONZE } from "./theme";

const NAV_ITEMS = [
  {
    to: "/",
    label: "Overview",
    title: "System Overview",
    subtitle: "Real-time lake telemetry, partition performance, and invariant verification",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="9" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="12" width="7" height="9" rx="1" />
        <rect x="3" y="16" width="7" height="5" rx="1" />
      </svg>
    ),
  },
  {
    to: "/pipeline",
    aliases: ["/execute"],
    label: "Execute Pipeline",
    title: "Execute Pipeline",
    subtitle: "Ingest event streams, validate schemas, quarantine defects, and compact partitions",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    to: "/comparison",
    aliases: ["/optimizer"],
    label: "Partition Comparison",
    title: "Partition Comparison",
    subtitle: "Benchmark scan latency, verify Hive pruning efficiency, and evaluate compaction gains",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    to: "/history",
    label: "Run History",
    title: "Run History",
    subtitle: "Execution ledger, row-level quarantine audit trail, and artifact provenance",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
];

function AppLayout() {
  const location = useLocation();
  const [apiOnline, setApiOnline] = useState(null);

  useEffect(() => {
    let active = true;
    getHealth()
      .then(() => {
        if (active) setApiOnline(true);
      })
      .catch(() => {
        if (active) setApiOnline(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const activeNav = NAV_ITEMS.find(
    (n) => n.to === location.pathname || (n.aliases && n.aliases.includes(location.pathname))
  ) || NAV_ITEMS[0];

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: BRONZE[950] }}>
      <aside
        style={{
          width: 250,
          backgroundColor: BRONZE[900],
          borderRight: `1px solid ${BRONZE[700]}`,
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "24px 20px 20px", borderBottom: `1px solid ${BRONZE[700]}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                backgroundColor: BRONZE[850],
                border: `1px solid ${BRONZE.ochre}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: BRONZE.gold,
                fontWeight: "bold",
                fontSize: 16,
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
              }}
            >
              W
            </div>
            <div>
              <div style={{ fontWeight: "700", fontSize: 16, color: BRONZE.cream, letterSpacing: "0.02em" }}>
                WAPFO
              </div>
              <div style={{ fontSize: 11, color: BRONZE.peach, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Data Lake Engine
              </div>
            </div>
          </div>
        </div>

        <nav style={{ padding: "16px 10px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 13,
                fontWeight: isActive ? "600" : "500",
                color: isActive ? BRONZE.gold : BRONZE.peach,
                backgroundColor: isActive ? BRONZE[800] : "transparent",
                borderLeft: isActive ? `3px solid ${BRONZE.ochre}` : "3px solid transparent",
                transition: "all 0.15s ease",
              })}
            >
              <span style={{ display: "flex", alignItems: "center", color: "inherit" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div style={{ padding: "16px 20px", borderTop: `1px solid ${BRONZE[700]}`, fontSize: 11, color: BRONZE.peach }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span>Storage Format</span>
            <span style={{ color: BRONZE.cream, fontFamily: "monospace" }}>Parquet (Snappy)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Query Engine</span>
            <span style={{ color: BRONZE.cream, fontFamily: "monospace" }}>DuckDB</span>
          </div>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <header
          style={{
            height: 64,
            padding: "0 32px",
            backgroundColor: BRONZE[900],
            borderBottom: `1px solid ${BRONZE[700]}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
              {activeNav.title}
            </div>
            <div style={{ fontSize: 12, color: BRONZE.peach }}>
              {activeNav.subtitle}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
                borderRadius: 20,
                backgroundColor: BRONZE[850],
                border: `1px solid ${BRONZE[700]}`,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: apiOnline === true ? "#22c55e" : apiOnline === false ? "#ef4444" : BRONZE.gold,
                  boxShadow: apiOnline === true ? "0 0 6px rgba(34,197,94,0.6)" : "none",
                }}
              />
              <span style={{ color: BRONZE.cream, fontWeight: "500" }}>
                {apiOnline === true ? "API Online :3001" : apiOnline === false ? "API Disconnected" : "Checking API..."}
              </span>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: "28px 36px", overflowY: "auto" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto" }}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/pipeline" element={<Execute />} />
              <Route path="/execute" element={<Execute />} />
              <Route path="/comparison" element={<Comparison />} />
              <Route path="/optimizer" element={<Comparison />} />
              <Route path="/history" element={<History />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}
