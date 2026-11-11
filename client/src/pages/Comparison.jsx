import { useState, useEffect } from "react";
import { getBenchmarks, clearBenchmarks } from "../api/client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const QUERIES = ["full_scan", "monthly_filter", "daily_filter"];
const STRATEGIES = ["unpartitioned", "monthly", "daily"];
const COLORS = { unpartitioned: "#6366f1", monthly: "#22c55e", daily: "#f59e0b" };

export default function Comparison() {
  const [benchmarks, setBenchmarks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState("all");

  useEffect(() => {
    getBenchmarks()
      .then((r) => setBenchmarks(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleClear() {
    if (!window.confirm("Clear all historical benchmark records from SQLite?")) return;
    try {
      await clearBenchmarks();
      setBenchmarks([]);
    } catch (err) {
      console.error(err);
    }
  }

  if (loading) return <p>Loading...</p>;
  if (!benchmarks.length) return <p>No benchmark data yet. Run a pipeline first.</p>;

  const runIds = [...new Set(benchmarks.map((b) => b.run_id))];
  const activeRunId = selectedRunId === "all" ? null : selectedRunId;
  const filteredBenchmarks = activeRunId
    ? benchmarks.filter((b) => b.run_id === activeRunId)
    : benchmarks;

  const latestByStrategyQuery = {};
  for (const b of filteredBenchmarks) {
    const key = `${b.strategy}__${b.query_name}`;
    if (!latestByStrategyQuery[key]) latestByStrategyQuery[key] = b;
  }

  const totalFilesByStrategy = {};
  for (const s of STRATEGIES) {
    const fullScan = latestByStrategyQuery[`${s}__full_scan`];
    totalFilesByStrategy[s] = fullScan ? fullScan.files_scanned : 0;
  }

  const chartData = QUERIES.map((q) => {
    const row = { query: q };
    for (const s of STRATEGIES) {
      const b = latestByStrategyQuery[`${s}__${q}`];
      row[s] = b ? b.median_ms : 0;
    }
    return row;
  });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1>Partition Strategy Comparison</h1>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <label style={{ fontSize: 14 }}>
            Filter by Run:{" "}
            <select value={selectedRunId} onChange={(e) => setSelectedRunId(e.target.value)} style={{ padding: "4px 8px" }}>
              <option value="all">Latest per strategy (All Runs)</option>
              {runIds.map((rid) => (
                <option key={rid} value={rid}>{rid}</option>
              ))}
            </select>
          </label>
          <button onClick={handleClear} style={{ background: "#ef4444", color: "white", border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontSize: 13 }}>
            Clear Benchmarks
          </button>
        </div>
      </div>

      <h2>Query Latency (median ms) — lower is better</h2>
      <ResponsiveContainer width="100%" height={320}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="query" />
          <YAxis unit="ms" />
          <Tooltip formatter={(v) => `${v} ms`} />
          <Legend />
          {STRATEGIES.map((s) => (
            <Bar key={s} dataKey={s} name={s} fill={COLORS[s]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <h2 style={{ marginTop: 32 }}>Files Scanned per Query</h2>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["Query", ...STRATEGIES.map((s) => `${s} (estimated scanned / eligible)`)].map((h) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "6px 12px", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {QUERIES.map((q) => (
            <tr key={q}>
              <td style={{ border: "1px solid #ccc", padding: "6px 12px", fontWeight: "bold" }}>{q}</td>
              {STRATEGIES.map((s) => {
                const b = latestByStrategyQuery[`${s}__${q}`];
                if (!b) return <td key={s} style={{ border: "1px solid #ccc", padding: "6px 12px" }}>—</td>;
                const scanned = b.estimated_files_scanned ?? b.files_scanned;
                const total = b.total_eligible_files ?? totalFilesByStrategy[s] ?? scanned;
                const pct = total > 0 ? ((1 - scanned / total) * 100).toFixed(1) : 0;
                return (
                  <td key={s} style={{ border: "1px solid #ccc", padding: "6px 12px" }}>
                    {scanned} / {total} ({pct}% pruned)
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <h2 style={{ marginTop: 32 }}>Storage Size by Strategy</h2>
      <table style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Strategy", "Storage (bytes)"].map((h) => (
              <th key={h} style={{ border: "1px solid #ccc", padding: "6px 12px", textAlign: "left" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {STRATEGIES.map((s) => {
            const b = Object.values(latestByStrategyQuery).find((x) => x.strategy === s);
            return (
              <tr key={s}>
                <td style={{ border: "1px solid #ccc", padding: "6px 12px" }}>{s}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 12px" }}>
                  {b ? b.storage_bytes.toLocaleString() : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
