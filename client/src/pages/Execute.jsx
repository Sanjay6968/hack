import { useState } from "react";
import { generateData, runPipeline, runBenchmark, runCompact, uploadFile } from "../api/client";

export default function Execute() {
  const [rows, setRows] = useState(1000);
  const [seed, setSeed] = useState(42);
  const [runId, setRunId] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);

  function addLog(msg) {
    setLog((prev) => [...prev, { t: new Date().toLocaleTimeString(), msg }]);
  }

  async function handleFullRun() {
    setBusy(true);
    setLog([]);
    try {
      addLog("Generating data...");
      const gen = await generateData(rows, seed);
      const filename = gen.data.filename;
      addLog(`Generated: ${filename} (${gen.data.rows} rows)`);

      const rid = runId || `run-${Date.now()}`;
      addLog(`Running pipeline (run_id=${rid})...`);
      const pipe = await runPipeline(filename, rid);
      const recon = pipe.data.reconciliation;
      addLog(`Pipeline done: accepted=${recon.accepted_unique} exact_dups=${recon.exact_duplicates} rejected=${recon.rejected} check=${recon.check}`);

      addLog("Running benchmarks...");
      const bench = await runBenchmark(rid, "pre-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (estimated_scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Done!");
    } catch (err) {
      addLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
    setBusy(false);
  }

  async function handleUploadedRun() {
    if (!uploadedFile) return;
    setBusy(true);
    setLog([]);
    try {
      const rid = runId || `run-${Date.now()}`;
      addLog(`Running pipeline on ${uploadedFile} (run_id=${rid})...`);
      const pipe = await runPipeline(uploadedFile, rid);
      const recon = pipe.data.reconciliation;
      addLog(`Pipeline done: accepted=${recon.accepted_unique} exact_dups=${recon.exact_duplicates} rejected=${recon.rejected} check=${recon.check}`);

      addLog("Running benchmarks...");
      const bench = await runBenchmark(rid, "pre-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (estimated_scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Done!");
    } catch (err) {
      addLog(`ERROR: ${err.response?.data?.error || err.message}`);
    }
    setBusy(false);
  }

  async function handleCompact(strategy) {
    setBusy(true);
    try {
      addLog(`Compacting ${strategy}...`);
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
      addLog(`Compacted ${strategy}: ${merged} merged, ${skipped} already optimal`);
      addLog(`Running post-compaction benchmarks...`);
      const bench = await runBenchmark(crid, "post-compaction");
      const strats = bench.data.strategies || {};
      for (const [strat, data] of Object.entries(strats)) {
        const qs = data.queries || {};
        for (const [q, qd] of Object.entries(qs)) {
          addLog(`  [${strat}] ${q}: ${qd.median_ms}ms (estimated_scanned=${qd.estimated_files_scanned || qd.files_scanned}/${qd.total_eligible_files || qd.total_files})`);
        }
      }
      addLog("Post-compaction benchmark complete!");
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
      addLog(`Uploaded: ${r.data.filename}`);
    } catch (err) {
      addLog(`Upload error: ${err.message}`);
    }
  }

  return (
    <div>
      <h1>Execute Pipeline</h1>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <label>Rows: <input type="number" value={rows} onChange={(e) => setRows(+e.target.value)} style={{ width: 80 }} /></label>
        <label>Seed: <input type="number" value={seed} onChange={(e) => setSeed(+e.target.value)} style={{ width: 80 }} /></label>
        <label>Run ID (optional): <input value={runId} onChange={(e) => setRunId(e.target.value)} style={{ width: 160 }} /></label>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={handleFullRun} disabled={busy}>▶ Generate + Pipeline + Benchmark</button>
        <button onClick={() => handleCompact("daily")} disabled={busy}>Compact Daily</button>
        <button onClick={() => handleCompact("monthly")} disabled={busy}>Compact Monthly</button>
        <button onClick={() => handleCompact("all")} disabled={busy}>Compact All</button>
        <label style={{ cursor: "pointer", padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4 }}>
          Upload CSV <input type="file" accept=".csv" onChange={handleUpload} style={{ display: "none" }} />
        </label>
        {uploadedFile && (
          <button onClick={handleUploadedRun} disabled={busy} style={{ background: "#22c55e", color: "white", border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", fontWeight: "bold" }}>
            ▶ Run on {uploadedFile}
          </button>
        )}
      </div>
      {uploadedFile && <p style={{ color: "green", margin: "4px 0" }}>Ready to run: <b>{uploadedFile}</b></p>}
      <div style={{ background: "#1e1e1e", color: "#d4d4d4", padding: 16, borderRadius: 8, fontFamily: "monospace", minHeight: 200, maxHeight: 400, overflowY: "auto" }}>
        {log.length === 0 && <span style={{ color: "#888" }}>Output will appear here...</span>}
        {log.map((l, i) => (
          <div key={i}><span style={{ color: "#888" }}>[{l.t}]</span> {l.msg}</div>
        ))}
      </div>
    </div>
  );
}
