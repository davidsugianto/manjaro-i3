#!/usr/bin/env node

/**
 * Start a persistent Firefox browser via Playwright daemon.
 * Spawns a detached background process that keeps Firefox alive
 * and exposes an HTTP API for controlling it.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readBrowserState } from "./browser.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const rawArgs = process.argv.slice(2);
const argSet = new Set(rawArgs);

const headless = argSet.has("--headless") || process.env.BROWSER_HEADLESS === "1";
const resetProfile = argSet.has("--reset-profile");

const HOME = process.env["HOME"] || homedir();
const CACHE_ROOT = join(HOME, ".cache", "agent-web");
const BROWSER_ROOT = join(CACHE_ROOT, "browser");
const DAEMON_PID_FILE = join(BROWSER_ROOT, "daemon.pid");

if (resetProfile) {
  rmSync(BROWSER_ROOT, { recursive: true, force: true });
  console.log("✓ Cleared browser state");
  process.exit(0);
}

// Check if daemon already running
const state = readBrowserState();
if (state?.daemonPort) {
  try {
    const res = await fetch(`http://127.0.0.1:${state.daemonPort}/ping`);
    if (res.ok) {
      console.log(`✓ Firefox browser daemon already running (port ${state.daemonPort})`);
      process.exit(0);
    }
  } catch {}
}

// Kill stale daemon
try {
  const fs = await import("fs");
  const daemonPid = parseInt(fs.readFileSync(DAEMON_PID_FILE, "utf8").trim());
  try { process.kill(daemonPid, "SIGTERM"); } catch {}
} catch {}

mkDir(BROWSER_ROOT);

// Start the daemon process (detached, so it survives parent exit)
const daemonScript = join(__dirname, "browser-daemon.js");
const env = {
  ...process.env,
  BROWSER_HEADLESS: headless ? "1" : "0",
};

const child = spawn(process.execPath, [daemonScript], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});

child.unref();

// Wait for daemon to start up
let started = false;
let daemonPort = null;
const output = [];

child.stdout.on("data", (data) => {
  const text = data.toString();
  output.push(text);
  const m = text.match(/PID:\d+ Browser:\d+ WS:\S+ HTTP:(\d+)/);
  if (m) {
    started = true;
    daemonPort = parseInt(m[1]);
  }
});

child.stderr.on("data", (data) => {
  output.push(data.toString());
});

// Wait up to 15 seconds for startup
let timedOut = false;
await new Promise((resolve) => {
  const timeout = setTimeout(() => { timedOut = true; resolve(); }, 15000);
  const check = setInterval(() => {
    if (started) {
      clearInterval(check);
      clearTimeout(timeout);
      resolve();
    }
  }, 200);

  child.on("error", () => { clearInterval(check); clearTimeout(timeout); resolve(); });
  child.on("exit", () => { clearInterval(check); clearTimeout(timeout); resolve(); });
});

if (started && daemonPort) {
  console.log(`✓ Firefox browser daemon started (http://127.0.0.1:${daemonPort})`);
  if (headless) console.log("  mode: headless");
} else {
  // Retry reading state file
  await new Promise((r) => setTimeout(r, 1000));
  const st = readBrowserState();
  if (st?.daemonPort) {
    console.log(`✓ Firefox browser daemon started (http://127.0.0.1:${st.daemonPort})`);
    if (headless) console.log("  mode: headless");
  } else {
    console.error("✗ Failed to start Firefox daemon");
    console.error("  " + output.join("").trim());
    process.exit(1);
  }
}

function mkDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}