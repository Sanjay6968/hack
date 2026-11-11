import { useState, useEffect } from "react";
import { getRuns, getRunDetail } from "../api/client";

export default function History() {
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRuns()
      .then((r) => setRuns(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(runId) {
    setSelected(runId);
    setDetail(null);
    getRunDetail(runId).then((r) => setDetail(r.data)).catch(console.error);
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ display: "flex", gap: 24 }}>
      <div style={{ flex: 1 }}>
        <h1>Run History</h1>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              {["Run ID", "Status", "Input", "Accepted", "Exact Dups", "Rejected", "Started"].map((h) => (
                <th key={h} style={{ border: "1px solid #ccc", padding: "6px 10px", textAlign: "left", fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr
                key={r.run_id}
                onClick={() => handleSelect(r.run_id)}
                style={{ cursor: "pointer", background: selected === r.run_id ? "#f0f7ff" : "white" }}
              >
                <td style={{ border: "1px solid #ccc", padding: "6px 10px", fontSize: 12, fontFamily: "monospace" }}>{r.run_id}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px", color: r.status === "done" ? "green" : "red" }}>{r.status}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px" }}>{r.total_input_rows}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px" }}>{r.accepted_rows}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px" }}>{r.exact_duplicate_rows || 0}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px" }}>{r.rejected_rows}</td>
                <td style={{ border: "1px solid #ccc", padding: "6px 10px", fontSize: 11 }}>{r.started_at?.slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected && (
        <div style={{ flex: 1 }}>
          <h2>Detail: {selected}</h2>
          {!detail && <p>Loading...</p>}
          {detail && (
            <>
              {detail.run && (
                <div style={{ padding: "8px 12px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 4, marginBottom: 12, fontSize: 13 }}>
                  <b>Reconciliation:</b> {detail.run.total_input_rows} input = {detail.run.accepted_rows} accepted + {detail.run.exact_duplicate_rows || 0} exact dups + {detail.run.rejected_rows} rejected ({detail.run.total_input_rows === (detail.run.accepted_rows + (detail.run.exact_duplicate_rows || 0) + detail.run.rejected_rows) ? "Balanced ✓" : "Unbalanced ✗"})
                </div>
              )}
              <h3>Rejected Rows ({detail.rejected.length})</h3>
              {detail.rejected.length === 0
                ? <p>None</p>
                : (
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                    <thead>
                      <tr>
                        {["event_id", "reason"].map((h) => (
                          <th key={h} style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rejected.map((rj, i) => (
                        <tr key={i}>
                          <td style={{ border: "1px solid #ccc", padding: "4px 8px", fontFamily: "monospace" }}>{rj.event_id || "null"}</td>
                          <td style={{ border: "1px solid #ccc", padding: "4px 8px", color: "red" }}>{rj.reject_reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}

              <h3 style={{ marginTop: 16 }}>Files Written ({detail.files.length})</h3>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead>
                  <tr>
                    {["Strategy", "Partition", "Rows", "Bytes", "SHA256"].map((h) => (
                      <th key={h} style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.files.map((f) => (
                    <tr key={f.id}>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{f.strategy}</td>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{f.partition_key || "—"}</td>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{f.row_count}</td>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px" }}>{f.file_size_bytes?.toLocaleString()}</td>
                      <td style={{ border: "1px solid #ccc", padding: "4px 8px", fontFamily: "monospace", fontSize: 10 }}>{f.sha256?.slice(0, 16)}...</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
