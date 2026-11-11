import { useState } from "react";
import { generateData, runPipeline, runBenchmark, runCompact, uploadFile } from "../api/client";
import { BRONZE } from "../theme";

export default function Execute() {
  const [rows, setRows] = useState(1000);
  const [seed, setSeed] = useState(42);
  const [runId, setRunId] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [summary, setSummary] = useState(null);

  function addLog(msg) {
    setLog((prev) => [...prev, { t: new Date().toLocaleTimeString(), msg }]);
  }

  async function handleFullRun() {
    setBusy(true);
    setLog([]);
    setSummary(null);
    try {
      addLog("Generating synthetic test dataset with deterministic defects...");
      const gen = await generateData(rows, seed);
      const filename = gen.data.filename;
      addLog(`Generated: ${filename} (${gen.data.rows} rows, seed=${seed})`);

      const rid = runId || `run-${Date.now()}`;
      addLog(`Executing pipeline ingestion (run_id=${rid})...`);
      const pipe = await runPipeline(filename, rid);
      const recon = pipe.data.reconciliation;
      setSummary({
        run_id: rid,
        source: filename,
        total_input: pipe.data.total_input_rows,
        accepted: recon.accepted_unique,
        exact_dups: recon.exact_duplicates,
        rejected: recon.rejected,
        check: recon.check,
        quarantine_file: pipe.data.quarantine_file,
      });
      addLog(`Validation complete: accepted=${recon.accepted_unique}, exact_dups=${recon.exact_duplicates}, rejected=${recon.rejected}, invariant_balanced=${recon.check}`);

      addLog("Running analytical benchmarks across partition layouts...");
      const bench = await runBenchmark(rid, "pre-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Pipeline execution complete! Partition lake updated.");
    } catch (err) {
      addLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
    setBusy(false);
  }

  async function handleUploadedRun() {
    if (!uploadedFile) return;
    setBusy(true);
    setLog([]);
    setSummary(null);
    try {
      const rid = runId || `run-${Date.now()}`;
      addLog(`Executing pipeline on uploaded file: ${uploadedFile} (run_id=${rid})...`);
      const pipe = await runPipeline(uploadedFile, rid);
      const recon = pipe.data.reconciliation;
      setSummary({
        run_id: rid,
        source: uploadedFile,
        total_input: pipe.data.total_input_rows,
        accepted: recon.accepted_unique,
        exact_dups: recon.exact_duplicates,
        rejected: recon.rejected,
        check: recon.check,
        quarantine_file: pipe.data.quarantine_file,
      });
      addLog(`Validation complete: accepted=${recon.accepted_unique}, exact_dups=${recon.exact_duplicates}, rejected=${recon.rejected}, invariant_balanced=${recon.check}`);

      addLog("Executing analytical benchmarks...");
      const bench = await runBenchmark(rid, "pre-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Uploaded dataset processed successfully!");
    } catch (err) {
      addLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
    setBusy(false);
  }

  async function handleCompact(strategy) {
    setBusy(true);
    try {
      addLog(`Triggering compaction for strategy: ${strategy}...`);
      const crid = `compact-${Date.now()}`;
      const r = await runCompact(strategy, crid);
      let merged = 0;
      let skipped = 0;
      Object.values(r.data || {}).forEach((items) => {
        if (Array.isArray(items)) {
          items.forEach((item) => {
            if (item.skipped) skipped++;
            else merged++;
          });
        }
      });
      addLog(`Compaction result for ${strategy}: ${merged} merged into single file per partition, ${skipped} already optimal`);
      addLog("Executing post-compaction benchmarks...");
      const bench = await runBenchmark(crid, "post-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Post-compaction benchmark recorded! Verify results on Partition Comparison page.");
    } catch (err) {
      addLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
    setBusy(false);
  }

  async function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const r = await uploadFile(file);
      setUploadedFile(r.data.filename);
      addLog(`Uploaded CSV to server staging area: ${r.data.filename} (${r.data.size} bytes)`);
    } catch (err) {
      addLog(`Upload error: ${err.message}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, paddingBottom: 48 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20 }}>
        <div
          style={{
            backgroundColor: BRONZE[900],
            border: `1px solid ${BRONZE[700]}`,
            borderRadius: 6,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
              1. Ingestion Dataset Source
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: BRONZE.peach }}>
              Configure synthetic dataset generation or select an uploaded raw CSV file
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, color: BRONZE.peach, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Rows Count
              </label>
              <input
                type="number"
                value={rows}
                onChange={(e) => setRows(+e.target.value)}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13 }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, color: BRONZE.peach, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Random Seed
              </label>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(+e.target.value)}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13 }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 11, color: BRONZE.peach, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Run ID Tag (Optional)
            </label>
            <input
              value={runId}
              placeholder="auto-generated timestamp (e.g. run-1794...)"
              onChange={(e) => setRunId(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", fontSize: 13 }}
            />
          </div>

          <div
            style={{
              border: `1px dashed ${BRONZE[700]}`,
              borderRadius: 6,
              padding: "14px 16px",
              backgroundColor: BRONZE[850],
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 13, color: BRONZE.cream, fontWeight: "600" }}>
                {uploadedFile ? `Uploaded: ${uploadedFile}` : "Custom CSV Ingestion"}
              </div>
              <div style={{ fontSize: 11, color: BRONZE.peach, marginTop: 2 }}>
                {uploadedFile ? "Ready for pipeline ingestion" : "Upload local dataset to data/raw/"}
              </div>
            </div>
            <label
              style={{
                cursor: "pointer",
                padding: "6px 14px",
                borderRadius: 6,
                backgroundColor: BRONZE[800],
                border: `1px solid ${BRONZE[700]}`,
                color: BRONZE.gold,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              Browse CSV
              <input type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} />
            </label>
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={handleFullRun}
              disabled={busy}
              style={{
                flex: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: "12px 18px",
                backgroundColor: BRONZE.ochre,
                color: BRONZE[950],
                border: "none",
                fontWeight: "700",
                fontSize: 14,
                borderRadius: 6,
                boxShadow: "0 2px 8px rgba(217,142,50,0.3)",
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? (
                <>
                  <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                    <path d="M12 2 a 10 10 0 0 1 10 10" />
                  </svg>
                  <span>Executing Pipeline...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Execute Pipeline Ingestion</span>
                </>
              )}
            </button>

            {uploadedFile && (
              <button
                onClick={handleUploadedRun}
                disabled={busy}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 16px",
                  backgroundColor: BRONZE[800],
                  color: BRONZE.gold,
                  border: `1px solid ${BRONZE.ochre}`,
                  fontWeight: "600",
                  fontSize: 13,
                  borderRadius: 6,
                  opacity: busy ? 0.6 : 1,
                }}
              >
                <span>Run Upload</span>
              </button>
            )}
          </div>
        </div>

        <div
          style={{
            backgroundColor: BRONZE[900],
            border: `1px solid ${BRONZE[700]}`,
            borderRadius: 6,
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
              2. Validation & Reconciliation Summary
            </h2>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: BRONZE.peach }}>
              Real-time audit of schema consistency, duplicate pruning, and defect quarantine
            </p>

            {summary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ backgroundColor: BRONZE[850], border: `1px solid ${BRONZE[700]}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: BRONZE.peach, textTransform: "uppercase" }}>Total Input Rows</div>
                    <div style={{ fontSize: 18, fontWeight: "700", color: BRONZE.cream, fontFamily: "monospace", marginTop: 2 }}>
                      {summary.total_input?.toLocaleString()}
                    </div>
                  </div>
                  <div style={{ backgroundColor: BRONZE[850], border: `1px solid ${BRONZE[700]}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: BRONZE.peach, textTransform: "uppercase" }}>Accepted Rows</div>
                    <div style={{ fontSize: 18, fontWeight: "700", color: BRONZE.gold, fontFamily: "monospace", marginTop: 2 }}>
                      {summary.accepted?.toLocaleString()}
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div style={{ backgroundColor: BRONZE[850], border: `1px solid ${BRONZE[700]}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: BRONZE.peach, textTransform: "uppercase" }}>Exact Duplicates Dropped</div>
                    <div style={{ fontSize: 18, fontWeight: "700", color: BRONZE.cream, fontFamily: "monospace", marginTop: 2 }}>
                      {summary.exact_dups ?? 0}
                    </div>
                  </div>
                  <div style={{ backgroundColor: BRONZE[850], border: `1px solid ${BRONZE[700]}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontSize: 11, color: BRONZE.peach, textTransform: "uppercase" }}>Quarantined Records</div>
                    <div style={{ fontSize: 18, fontWeight: "700", color: "#f87171", fontFamily: "monospace", marginTop: 2 }}>
                      {summary.rejected}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: summary.check ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                    border: `1px solid ${summary.check ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                    borderRadius: 6,
                    padding: "10px 14px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span style={{ fontSize: 12, color: summary.check ? "#4ade80" : "#f87171", fontWeight: "600", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {summary.check ? (
                        <polyline points="20 6 9 17 4 12" />
                      ) : (
                        <>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </>
                      )}
                    </svg>
                    Reconciliation Invariant: {summary.check ? "BALANCED (100% Accounted)" : "UNBALANCED"}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: "monospace", color: BRONZE.cream }}>
                    check: {String(summary.check)}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: BRONZE.peach }}>
                  Quarantine CSV: <code style={{ color: BRONZE.cream }}>{summary.quarantine_file}</code>
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 20,
                  padding: "24px 16px",
                  textAlign: "center",
                  backgroundColor: BRONZE[850],
                  borderRadius: 6,
                  border: `1px solid ${BRONZE[700]}`,
                  color: BRONZE.peach,
                  fontSize: 13,
                }}
              >
                No active execution. Execute a pipeline run to inspect live validation and reconciliation metrics.
              </div>
            )}
          </div>

          <div style={{ borderTop: `1px solid ${BRONZE[700]}`, paddingTop: 14, marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: "600", color: BRONZE.cream, marginBottom: 8 }}>
              Lake Compaction Maintenance:
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                onClick={() => handleCompact("daily")}
                disabled={busy}
                style={{
                  padding: "6px 12px",
                  backgroundColor: BRONZE[850],
                  border: `1px solid ${BRONZE[700]}`,
                  color: BRONZE.cream,
                  fontSize: 12,
                  borderRadius: 6,
                }}
              >
                Compact Daily
              </button>
              <button
                onClick={() => handleCompact("monthly")}
                disabled={busy}
                style={{
                  padding: "6px 12px",
                  backgroundColor: BRONZE[850],
                  border: `1px solid ${BRONZE[700]}`,
                  color: BRONZE.cream,
                  fontSize: 12,
                  borderRadius: 6,
                }}
              >
                Compact Monthly
              </button>
              <button
                onClick={() => handleCompact("all")}
                disabled={busy}
                style={{
                  padding: "6px 12px",
                  backgroundColor: BRONZE[800],
                  border: `1px solid ${BRONZE.ochre}`,
                  color: BRONZE.gold,
                  fontSize: 12,
                  borderRadius: 6,
                }}
              >
                Compact All Strategies
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          backgroundColor: BRONZE[900],
          border: `1px solid ${BRONZE[700]}`,
          borderRadius: 6,
          padding: "20px 24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: "700", color: BRONZE.cream }}>
            3. Execution Progress Console
          </h2>
          <span style={{ fontSize: 11, color: BRONZE.peach, fontFamily: "monospace" }}>
            {busy ? "Status: Active Task Running..." : "Status: Idle"}
          </span>
        </div>

        <div
          style={{
            backgroundColor: BRONZE[950],
            border: `1px solid ${BRONZE[700]}`,
            borderRadius: 6,
            padding: "16px 20px",
            fontFamily: "monospace",
            minHeight: 220,
            maxHeight: 380,
            overflowY: "auto",
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          {log.length === 0 ? (
            <span style={{ color: BRONZE.peach }}>Terminal ready. Ingestion output and DuckDB execution logs will appear here.</span>
          ) : (
            log.map((entry, idx) => (
              <div key={idx} style={{ color: entry.msg.startsWith("ERROR") ? "#f87171" : BRONZE.cream }}>
                <span style={{ color: BRONZE.peach }}>[{entry.t}]</span>{" "}
                <span style={{ color: entry.msg.includes("complete") || entry.msg.includes("Recorded") ? BRONZE.gold : "inherit" }}>
                  {entry.msg}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
