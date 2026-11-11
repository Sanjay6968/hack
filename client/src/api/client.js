import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const api = axios.create({ baseURL });

export const getHealth = () => api.get("/api/health");
export const generateData = (rows, seed) => api.post("/api/generate", { rows, seed });
export const runPipeline = (filename, run_id) => api.post("/api/pipeline", { filename, run_id });
export const runBenchmark = (run_id, compaction_status) => api.post("/api/benchmark", { run_id, compaction_status });
export const runCompact = (strategy, run_id) => api.post("/api/compact", { strategy, run_id });
export const getRuns = () => api.get("/api/runs");
export const getRunDetail = (id) => api.get(`/api/runs/${id}`);
export const getBenchmarks = () => api.get("/api/benchmarks");
export const clearBenchmarks = () => api.post("/api/benchmarks/clear");
export const getDataQuality = (runId) => api.get(runId ? `/api/data-quality?run_id=${runId}` : "/api/data-quality");
export const getFileHealth = () => api.get("/api/file-health");
export const uploadFile = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/api/upload", fd);
};
