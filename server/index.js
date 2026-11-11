const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { runPython } = require("./python_runner");

const app = express();
const PORT = process.env.PORT || 3001;

const RAW_DIR = path.resolve(__dirname, "..", "data", "raw");
fs.mkdirSync(RAW_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: RAW_DIR,
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

app.use(cors());
app.use(express.json());

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file" });
  res.json({ filename: req.file.filename, size: req.file.size, path: req.file.path });
});

app.post("/api/generate", async (req, res) => {
  const rows = parseInt(req.body.rows, 10) || 1000;
  const seed = parseInt(req.body.seed, 10) || 42;
  const filename = `generated_r${rows}_s${seed}.csv`;
  const outPath = path.join(RAW_DIR, filename);
  try {
    const result = await runPython("generator.py", [
      "--rows", String(rows),
      "--seed", String(seed),
      "--out", outPath,
    ]);
    res.json({ ...result, filename });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/pipeline", async (req, res) => {
  const { filename, run_id } = req.body;
  if (!filename) return res.status(400).json({ error: "filename required" });
  const csvPath = path.join(RAW_DIR, path.basename(filename));
  if (!fs.existsSync(csvPath)) return res.status(404).json({ error: "file not found" });
  const args = ["--csv", csvPath];
  if (run_id) args.push("--run-id", run_id);
  try {
    const result = await runPython("pipeline.py", args, 180000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/benchmark", async (req, res) => {
  const { run_id, compaction_status } = req.body;
  if (!run_id) return res.status(400).json({ error: "run_id required" });
  const args = ["--run-id", run_id, "--json"];
  if (compaction_status) args.push("--compaction-status", compaction_status);
  try {
    const result = await runPython("benchmark.py", args, 120000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/compact", async (req, res) => {
  const { strategy, run_id } = req.body;
  if (!strategy) return res.status(400).json({ error: "strategy required" });
  const args = ["--strategy", strategy];
  if (run_id) args.push("--run-id", run_id);
  try {
    const result = await runPython("compaction.py", args, 120000);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/runs", async (req, res) => {
  try {
    const result = await runPython("db_query.py", ["--query", "runs"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/runs/:id", async (req, res) => {
  try {
    const result = await runPython("db_query.py", ["--query", "run_detail", "--id", req.params.id]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/benchmarks", async (req, res) => {
  try {
    const result = await runPython("db_query.py", ["--query", "benchmarks"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/benchmarks/clear", async (req, res) => {
  try {
    const result = await runPython("db_query.py", ["--query", "truncate_benchmarks"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/data-quality", async (req, res) => {
  try {
    const args = ["--query", "data_quality"];
    if (req.query.run_id) args.push("--id", req.query.run_id);
    const result = await runPython("db_query.py", args);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/file-health", async (req, res) => {
  try {
    const result = await runPython("db_query.py", ["--query", "file_health"]);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => console.log(`WAPFO server running on http://localhost:${PORT}`));
