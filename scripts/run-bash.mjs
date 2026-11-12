import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const scriptArg = process.argv[2];
if (!scriptArg) {
  console.error("Usage: node scripts/run-bash.mjs <script-path> [...args]");
  process.exit(2);
}

const scriptPath = path.resolve(scriptArg);
const raw = fs.readFileSync(scriptPath);
if (raw.includes(13)) {
  const normalized = Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  fs.writeFileSync(scriptPath, normalized);
}

const candidates =
  process.platform === "win32"
    ? [
        "C:\\Program Files\\Git\\bin\\bash.exe",
        "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
        "bash",
      ]
    : ["bash"];

const bashBin =
  candidates.find((candidate) => candidate === "bash" || fs.existsSync(candidate)) ??
  "bash";

const result = spawnSync(bashBin, [scriptArg, ...process.argv.slice(3)], {
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);

