import { useState, useEffect } from "react";
import { getRuns, getRunDetail } from "../api/client";
import { BRONZE } from "../theme";

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function History() {
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getRuns()
      .then((r) => {
        const list = r.data || [];
        setRuns(list);
        if (list.length > 0) {
          handleSelect(list[0].run_id);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function handleSelect(runId) {
    setSelected(runId);
    setDetail(null);
    getRunDetail(runId)
      .then((r) => setDetail(r.data))
      .catch(console.error);
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: BRONZE.peach, fontSize: 15 }}>
        Loading execution history ledger...
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", paddingBottom: 48 }}>
      <div
        style={{
          flex: "1 1 540px",
          backgroundColor: BRONZE[900],
          border: `1px solid ${BRONZE[700]}`,
          borderRadius: 6,
          padding: "20px 24px",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
              Pipeline Ingestion Ledger
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: BRONZE.peach }}>
              Select a run below to inspect row-level quarantine reasons and lake artifacts
            </p>
          </div>
          <span style={{ fontSize: 12, color: BRONZE.gold, fontFamily: "monospace" }}>
            {runs.length} runs recorded
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr style={{ backgroundColor: BRONZE[850], borderBottom: `1px solid ${BRONZE[700]}` }}>
                {["Run ID", "Source", "Status", "Input", "Accepted", "Dups", "Rej", "Started"].map((h) => (
                  <th key={h} style={{ padding: "8px 10px", textAlign: "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => {
                const isSelected = selected === r.run_id;
                return (
                  <tr
                    key={r.run_id}
                    onClick={() => handleSelect(r.run_id)}
                    style={{
                      cursor: "pointer",
                      backgroundColor: isSelected ? BRONZE[800] : "transparent",
                      borderBottom: `1px solid ${BRONZE[800]}`,
                      borderLeft: isSelected ? `3px solid ${BRONZE.ochre}` : "3px solid transparent",
                      transition: "background-color 0.1s ease",
                    }}
                  >
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", fontSize: 12, color: isSelected ? BRONZE.gold : BRONZE.cream }}>
                      {r.run_id}
                    </td>
                    <td style={{ padding: "8px 10px", fontSize: 12, color: BRONZE.peach, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.source_file || "sample_1000.csv"}
                    </td>
                    <td style={{ padding: "8px 10px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontWeight: "700",
                          textTransform: "uppercase",
                          backgroundColor: r.status === "done" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                          color: r.status === "done" ? "#4ade80" : "#f87171",
                          border: `1px solid ${r.status === "done" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                        }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace" }}>{r.total_input_rows?.toLocaleString()}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", color: BRONZE.cream }}>{r.accepted_rows?.toLocaleString()}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", color: BRONZE.peach }}>{r.exact_duplicate_rows || 0}</td>
                    <td style={{ padding: "8px 10px", fontFamily: "monospace", color: r.rejected_rows > 0 ? "#f87171" : BRONZE.cream }}>{r.rejected_rows}</td>
                    <td style={{ padding: "8px 10px", fontSize: 11, color: BRONZE.peach, whiteSpace: "nowrap" }}>
                      {r.started_at?.slice(5, 16).replace("T", " ") || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div
        style={{
          flex: "1 1 420px",
          backgroundColor: BRONZE[900],
          border: `1px solid ${BRONZE[700]}`,
          borderRadius: 6,
          padding: "20px 24px",
          minWidth: 0,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
            Inspection: <code style={{ color: BRONZE.gold }}>{selected || "None"}</code>
          </h2>
          {detail?.run && (
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 4,
                backgroundColor: "rgba(34,197,94,0.15)",
                color: "#4ade80",
                border: "1px solid rgba(34,197,94,0.3)",
                fontWeight: "600",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Reconciled</span>
            </span>
          )}
        </div>

        {!detail ? (
          <div style={{ padding: 32, textAlign: "center", color: BRONZE.peach, fontSize: 13 }}>
            Loading run details and artifact manifests...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {detail.run && (
              <div
                style={{
                  backgroundColor: BRONZE[850],
                  border: `1px solid ${BRONZE[700]}`,
                  borderRadius: 6,
                  padding: "12px 14px",
                  fontSize: 12,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: BRONZE.peach }}>Input Stream:</span>
                  <strong style={{ color: BRONZE.cream, fontFamily: "monospace" }}>{detail.run.total_input_rows?.toLocaleString()} rows</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: BRONZE.peach }}>Accepted Unique:</span>
                  <strong style={{ color: BRONZE.gold, fontFamily: "monospace" }}>{detail.run.accepted_rows?.toLocaleString()} rows</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: BRONZE.peach }}>Exact Dups Dropped:</span>
                  <strong style={{ color: BRONZE.cream, fontFamily: "monospace" }}>{detail.run.exact_duplicate_rows || 0} rows</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: BRONZE.peach }}>Quarantined Records:</span>
                  <strong style={{ color: "#f87171", fontFamily: "monospace" }}>{detail.run.rejected_rows} rows</strong>
                </div>
              </div>
            )}

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: "700", color: BRONZE.cream }}>
                  Quarantined Defect Rows ({detail.rejected?.length || 0})
                </h3>
                <span style={{ fontSize: 11, color: BRONZE.peach }}>Audit trail</span>
              </div>

              {!detail.rejected || detail.rejected.length === 0 ? (
                <div style={{ fontSize: 12, color: BRONZE.peach, backgroundColor: BRONZE[850], padding: "10px 14px", borderRadius: 6 }}>
                  No rejected rows quarantined for this run.
                </div>
              ) : (
                <div style={{ maxHeight: 200, overflowY: "auto", border: `1px solid ${BRONZE[700]}`, borderRadius: 6 }}>
                  <table>
                    <thead>
                      <tr style={{ backgroundColor: BRONZE[850], borderBottom: `1px solid ${BRONZE[700]}` }}>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Event ID</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Quarantine Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.rejected.map((rj, i) => (
                        <tr key={i} style={{ borderBottom: `1px solid ${BRONZE[800]}` }}>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: BRONZE.cream }}>
                            {rj.event_id || "null"}
                          </td>
                          <td style={{ padding: "6px 10px", color: "#f87171", fontSize: 12 }}>
                            {rj.reject_reason}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 13, fontWeight: "700", color: BRONZE.cream }}>
                  Parquet Artifacts Written ({detail.files?.length || 0})
                </h3>
                <span style={{ fontSize: 11, color: BRONZE.peach }}>Lake manifest</span>
              </div>

              {!detail.files || detail.files.length === 0 ? (
                <div style={{ fontSize: 12, color: BRONZE.peach, backgroundColor: BRONZE[850], padding: "10px 14px", borderRadius: 6 }}>
                  No lake files registered for this run.
                </div>
              ) : (
                <div style={{ maxHeight: 220, overflowY: "auto", border: `1px solid ${BRONZE[700]}`, borderRadius: 6 }}>
                  <table>
                    <thead>
                      <tr style={{ backgroundColor: BRONZE[850], borderBottom: `1px solid ${BRONZE[700]}` }}>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Strategy</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Partition</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Rows</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>Size</th>
                        <th style={{ padding: "6px 10px", textAlign: "left" }}>SHA256</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.files.map((f) => (
                        <tr key={f.id} style={{ borderBottom: `1px solid ${BRONZE[800]}` }}>
                          <td style={{ padding: "6px 10px", color: BRONZE.cream, fontSize: 12 }}>{f.strategy}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11, color: BRONZE.gold }}>{f.partition_key || "root"}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11 }}>{f.row_count}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 11 }}>{formatBytes(f.file_size_bytes)}</td>
                          <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: BRONZE.peach }}>
                            {f.sha256?.slice(0, 10)}...
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
