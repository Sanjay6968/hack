const { spawn } = require("child_process");
const path = require("path");

const PYTHON = process.env.PYTHON_BIN || "python";
const ENGINE_DIR = path.resolve(__dirname, "..", "engine");

function runPython(scriptName, args = [], timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ENGINE_DIR, scriptName);
    const proc = spawn(PYTHON, [scriptPath, ...args], {
      cwd: path.resolve(__dirname, ".."),
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error(`Python script ${scriptName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        return reject(new Error(`${scriptName} exited ${code}: ${stderr.slice(-500)}`));
      }
      const trimmed = stdout.trim();
      try {
        return resolve(JSON.parse(trimmed));
      } catch {}
      const lines = trimmed.split("\n");
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          return resolve(JSON.parse(lines[i]));
        } catch {}
      }
      resolve({ raw: stdout, stderr });
    });
  });
}

module.exports = { runPython };
