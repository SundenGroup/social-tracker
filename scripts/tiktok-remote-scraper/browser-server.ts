#!/usr/bin/env npx tsx
/**
 * Persistent Chrome Browser Server
 *
 * Launches your real Chrome with a persistent profile and remote debugging.
 * Chrome stays open. The scraper connects via CDP each time it runs.
 *
 * Start once:   npx tsx browser-server.ts
 * Stop:         Ctrl+C (or close the Chrome window)
 */

import { execSync, spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROFILE_DIR = path.join(SCRIPT_DIR, "browser-profile");
const CDP_PORT = 9222;
const CDP_FILE = path.join(SCRIPT_DIR, ".browser-cdp");

function findChrome(): string {
  // macOS Chrome paths
  const paths = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];

  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }

  // Try which
  try {
    return execSync("which google-chrome || which chromium", { encoding: "utf-8" }).trim();
  } catch {
    // Fall back to Playwright's bundled chromium
    try {
      const pw = execSync("npx playwright install --dry-run chromium 2>&1 || true", { encoding: "utf-8" });
      // Try to find it in the cache
      const homeDir = process.env.HOME || "";
      const cacheDir = path.join(homeDir, "Library", "Caches", "ms-playwright");
      if (fs.existsSync(cacheDir)) {
        const dirs = fs.readdirSync(cacheDir).filter(d => d.startsWith("chromium"));
        if (dirs.length > 0) {
          const chromiumApp = path.join(cacheDir, dirs[dirs.length - 1], "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium");
          if (fs.existsSync(chromiumApp)) return chromiumApp;
        }
      }
    } catch {}
  }

  throw new Error("Chrome not found. Install Google Chrome or run: npx playwright install chromium");
}

async function main() {
  const chromePath = findChrome();
  console.log("[Browser] Chrome:", chromePath);
  console.log("[Browser] Profile:", PROFILE_DIR);
  console.log("[Browser] CDP port:", CDP_PORT);

  // Ensure profile dir exists
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

  const args = [
    `--user-data-dir=${PROFILE_DIR}`,
    `--remote-debugging-port=${CDP_PORT}`,
    "--disable-blink-features=AutomationControlled",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    "https://www.tiktok.com",
  ];

  const child = spawn(chromePath, args, {
    detached: false,
    stdio: "ignore",
  });

  child.on("error", (err) => {
    console.error("[Browser] Failed to start Chrome:", err.message);
    process.exit(1);
  });

  // Wait a moment for Chrome to start
  await new Promise((r) => setTimeout(r, 2000));

  // Save CDP endpoint
  const cdpUrl = `http://localhost:${CDP_PORT}`;
  fs.writeFileSync(CDP_FILE, cdpUrl);

  console.log("[Browser] Chrome is running.");
  console.log("[Browser] CDP endpoint:", cdpUrl);
  console.log("[Browser] Keep this terminal open. Press Ctrl+C to stop.\n");

  const cleanup = () => {
    try { fs.unlinkSync(CDP_FILE); } catch {}
  };

  child.on("exit", (code) => {
    console.log("[Browser] Chrome exited with code:", code);
    cleanup();
    process.exit(0);
  });

  process.on("SIGINT", () => {
    console.log("\n[Browser] Shutting down Chrome...");
    cleanup();
    child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 2000);
  });

  process.on("SIGTERM", () => {
    cleanup();
    child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 2000);
  });

  // Keep the process alive
  setInterval(() => {}, 60000);
}

main().catch((err) => {
  console.error("[Browser] Fatal error:", err);
  process.exit(1);
});
