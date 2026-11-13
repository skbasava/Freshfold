#!/usr/bin/env node

/**
 * FreshFold Frontend Deployment Script for Vercel
 *
 * Deploys the frontend to Vercel using the Vercel CLI and an access token passed
 * from the CLI or environment.
 *
 * Usage:
 *   pnpm deploy:vercel [preview|production] [options]
 *   node scripts/deploy-vercel.mjs [preview|production] [options]
 *   ./scripts/deploy-vercel.sh [preview|production] [options]
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const frontendDir = path.join(rootDir, "frontend");
const distDir = path.join(frontendDir, "dist");

function printHelp() {
  console.log(`
FreshFold Frontend Deployment Script for Vercel

Usage:
  pnpm deploy:vercel [preview|production] [options]
  node scripts/deploy-vercel.mjs [preview|production] [options]
  scripts/deploy-vercel.sh [preview|production] [options]

Authentication (required):
  --token <token>, -t <token>   Vercel access token passed directly from CLI.
                                Or set the VERCEL_TOKEN environment variable.
                                Generate one at: https://vercel.com/account/tokens

Environment & Target:
  --prod, --production          Deploy to production (default: preview).
  production                    Positional shortcut for --prod.
  preview, staging              Positional shortcut for preview deployment.
  --scope <team-slug>           Vercel team or organization slug.
  --api-url <url>               Gateway Worker API URL (sets VITE_API_URL).

Workflow Options:
  --prebuilt                    Deploy using Vercel Build Output API (default: true).
  --no-prebuilt                 Upload static directory directly without --prebuilt flag.
  --skip-checks                 Skip typecheck before building.
  --skip-build                  Skip local build (use existing frontend/dist).
  --dry-run                     Validate arguments and build without uploading.
  -y, --yes                     Skip interactive prompts (default: true).
  -h, --help                    Show this help message.

Examples:
  # Deploy preview using token from CLI:
  pnpm deploy:vercel --token VERCEL_TOKEN_HERE

  # Deploy to production:
  pnpm deploy:vercel --prod --token VERCEL_TOKEN_HERE

  # Deploy to production with specific Gateway API URL:
  pnpm deploy:vercel --prod --token VERCEL_TOKEN_HERE --api-url https://api.freshfold.com

  # Dry run to verify build and parameters without deploying:
  pnpm deploy:vercel --prod --token VERCEL_TOKEN_HERE --dry-run
`);
}

const args = process.argv.slice(2);
let token = process.env.VERCEL_TOKEN || "";
let isProd = false;
let scope = process.env.VERCEL_ORG_ID || "";
let apiUrl = process.env.VITE_API_URL || "";
let skipChecks = false;
let skipBuild = false;
let dryRun = false;
let autoConfirm = true;
let prebuilt = true;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    printHelp();
    process.exit(0);
  } else if (arg === "--token" || arg === "-t") {
    token = args[++i] || "";
  } else if (arg.startsWith("--token=")) {
    token = arg.slice("--token=".length);
  } else if (arg === "--prod" || arg === "--production" || arg === "production") {
    isProd = true;
  } else if (arg === "preview" || arg === "staging") {
    isProd = false;
  } else if (arg === "--scope") {
    scope = args[++i] || "";
  } else if (arg.startsWith("--scope=")) {
    scope = arg.slice("--scope=".length);
  } else if (arg === "--api-url") {
    apiUrl = args[++i] || "";
  } else if (arg.startsWith("--api-url=")) {
    apiUrl = arg.slice("--api-url=".length);
  } else if (arg === "--skip-checks") {
    skipChecks = true;
  } else if (arg === "--skip-build") {
    skipBuild = true;
  } else if (arg === "--dry-run") {
    dryRun = true;
  } else if (arg === "-y" || arg === "--yes") {
    autoConfirm = true;
  } else if (arg === "--no-prebuilt") {
    prebuilt = false;
  } else if (arg === "--prebuilt") {
    prebuilt = true;
  } else if (!token && !arg.startsWith("-")) {
    if (arg.startsWith("vercel_") || arg.length >= 24) {
      token = arg;
    }
  }
}

if (!token) {
  console.error("\x1b[31mError: Vercel access token is required.\x1b[0m");
  console.error("Pass the token using --token <token> (or -t <token>), or set VERCEL_TOKEN in your environment.");
  console.error("Generate a personal access token at: https://vercel.com/account/tokens\n");
  console.error("Run 'pnpm deploy:vercel --help' for all options.");
  process.exit(1);
}

const isWin = process.platform === "win32";

function run(command, cmdArgs, options = {}) {
  const cmd = isWin ? "cmd.exe" : command;
  const fullArgs = isWin ? ["/c", command, ...cmdArgs] : cmdArgs;
  console.log(`\x1b[36m> ${command} ${cmdArgs.join(" ")}\x1b[0m`);
  const result = spawnSync(cmd, fullArgs, {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ...options.env },
  });
  if (result.error) {
    console.error(`Failed to execute ${command}:`, result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`Command failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log("\x1b[35m=== FreshFold Frontend Vercel Deployment ===\x1b[0m");
console.log(`Target Environment: ${isProd ? "\x1b[32mProduction\x1b[0m" : "\x1b[33mPreview\x1b[0m"}`);
if (scope) {
  console.log(`Scope: ${scope}`);
}
if (apiUrl) {
  console.log(`API URL (VITE_API_URL): ${apiUrl}`);
}

// Backup .vercel folder if it exists in frontend or dist so Vite wipe doesn't lose it
const frontendVercelDir = path.join(frontendDir, ".vercel");
const distVercelDir = path.join(distDir, ".vercel");
let savedProjectJson = null;

if (fs.existsSync(path.join(frontendVercelDir, "project.json"))) {
  savedProjectJson = fs.readFileSync(path.join(frontendVercelDir, "project.json"), "utf8");
} else if (fs.existsSync(path.join(distVercelDir, "project.json"))) {
  savedProjectJson = fs.readFileSync(path.join(distVercelDir, "project.json"), "utf8");
}

if (!skipBuild) {
  if (!skipChecks) {
    console.log("\n\x1b[34m[1/3] Running frontend typecheck...\x1b[0m");
    run("pnpm", ["typecheck:web"]);
  } else {
    console.log("\n\x1b[33m[1/3] Skipping frontend typecheck (--skip-checks)\x1b[0m");
  }

  console.log("\n\x1b[34m[2/3] Building frontend for production...\x1b[0m");
  const buildEnv = {};
  if (apiUrl) {
    buildEnv.VITE_API_URL = apiUrl;
  }
  run("pnpm", ["build:web"], { env: buildEnv });

  // 1. Explicitly write static vercel.json into dist (disable remote build steps on Vercel)
  const staticVercelConfig = {
    $schema: "https://openapi.vercel.sh/vercel.json",
    framework: null,
    buildCommand: null,
    outputDirectory: null,
    cleanUrls: true,
    rewrites: [
      {
        source: "/(.*)",
        destination: "/index.html",
      },
    ],
  };
  fs.writeFileSync(
    path.join(distDir, "vercel.json"),
    `${JSON.stringify(staticVercelConfig, null, 2)}\n`,
  );

  // 2. Restore .vercel project link into both frontend/.vercel and frontend/dist/.vercel
  if (savedProjectJson) {
    fs.mkdirSync(frontendVercelDir, { recursive: true });
    fs.writeFileSync(path.join(frontendVercelDir, "project.json"), savedProjectJson);

    fs.mkdirSync(distVercelDir, { recursive: true });
    fs.writeFileSync(path.join(distVercelDir, "project.json"), savedProjectJson);
  }

  // 3. Set up Vercel Build Output API v3 structure inside frontend/dist/.vercel/output
  // This guarantees Vercel cloud bypasses the remote build step entirely
  const outputDir = path.join(distVercelDir, "output");
  const staticDir = path.join(outputDir, "static");
  fs.mkdirSync(staticDir, { recursive: true });

  const buildOutputConfig = {
    version: 3,
    routes: [
      { handle: "filesystem" },
      { src: "/(.*)", dest: "/index.html" },
    ],
  };
  fs.writeFileSync(
    path.join(outputDir, "config.json"),
    `${JSON.stringify(buildOutputConfig, null, 2)}\n`,
  );

  // Copy compiled static files into .vercel/output/static
  for (const item of fs.readdirSync(distDir)) {
    if (item === ".vercel") continue;
    const src = path.join(distDir, item);
    const dest = path.join(staticDir, item);
    fs.cpSync(src, dest, { recursive: true });
  }
} else {
  console.log("\n\x1b[33m[1/2] Skipping build step (--skip-build)\x1b[0m");
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.error("\x1b[31mError: frontend/dist/index.html not found. Run a build first or remove --skip-build.\x1b[0m");
    process.exit(1);
  }
}

console.log(`\n\x1b[34m[3/3] Deploying to Vercel (${isProd ? "production" : "preview"})...\x1b[0m`);

// Target path: frontend/dist
const targetPath = path.relative(rootDir, distDir);

const vercelArgs = ["deploy", targetPath, "--token", token];

// Check if prebuilt output exists
const hasPrebuilt = fs.existsSync(path.join(distVercelDir, "output", "config.json"));
if (prebuilt && hasPrebuilt) {
  vercelArgs.push("--prebuilt");
}

if (isProd) {
  vercelArgs.push("--prod");
}
if (autoConfirm) {
  vercelArgs.push("--yes");
}
if (scope) {
  vercelArgs.push("--scope", scope);
}
if (apiUrl) {
  vercelArgs.push("--build-env", `VITE_API_URL=${apiUrl}`);
  vercelArgs.push("--env", `VITE_API_URL=${apiUrl}`);
}

// Redact token from terminal log output for safety
const safeArgs = vercelArgs.map((a) => (a === token ? "[REDACTED_TOKEN]" : a));
console.log(`Target: ${targetPath}`);
console.log(`CLI Command: vercel ${safeArgs.join(" ")}`);

if (dryRun) {
  console.log("\n\x1b[33m[DRY RUN] Build verified successfully. Skipped actual upload to Vercel.\x1b[0m");
  process.exit(0);
}

run("npx", ["--yes", "vercel@latest", ...vercelArgs]);

console.log("\n\x1b[32m✔ Frontend deployment to Vercel completed successfully!\x1b[0m");
