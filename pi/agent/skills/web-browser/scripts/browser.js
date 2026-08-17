/**
 * Persistent browser manager (Playwright + Firefox).
 * Replaces raw CDP with Playwright's protocol.
 * Manages a long-running Firefox instance via launchServer().
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { firefox } from "playwright";

const DEBUG = process.env.DEBUG === "1";
const log = DEBUG ? (...args) => console.error("[browser]", ...args) : () => {};

const HOME = process.env["HOME"] || homedir();
const CACHE_ROOT = join(HOME, ".cache", "agent-web");
const BROWSER_ROOT = join(CACHE_ROOT, "browser");
const STATE_FILE = join(BROWSER_ROOT, "state.json");

export function readBrowserState() {
  if (!existsSync(STATE_FILE)) return null;
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeBrowserState(state) {
  mkdirSync(BROWSER_ROOT, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function clearBrowserState() {
  try { rmSync(STATE_FILE, { force: true }); } catch {}
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== "number") return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Start a persistent Firefox browser server.
 * Returns the wsEndpoint URL for other scripts to connect.
 */
export async function startBrowser({ headless = true, userDataDir, browserBin } = {}) {
  // Kill any existing state
  const existing = readBrowserState();
  if (existing?.pid && isProcessAlive(existing.pid)) {
    try { process.kill(existing.pid, "SIGTERM"); } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  clearBrowserState();

  const launchOpts = {
    headless,
    args: ["--headless"],
    firefoxUserPrefs: {
      "dom.webdriver.enabled": false,
      "useAutomationExtension": false,
    },
  };

  if (userDataDir) {
    mkdirSync(userDataDir, { recursive: true });
    // Playwright manages its own profile dirs, but we can set a persistent one
  }

  if (browserBin) {
    launchOpts.executablePath = browserBin;
  }

  const server = await firefox.launchServer(launchOpts);
  const wsEndpoint = server.wsEndpoint();
  const pid = server.process().pid;

  writeBrowserState({
    pid,
    wsEndpoint,
    browser: "firefox",
    mode: userDataDir ? "persistent" : "fresh",
    headless,
    timestamp: Date.now(),
  });

  log("started pid=%d wsEndpoint=%s", pid, wsEndpoint);
  return { wsEndpoint, pid };
}

/**
 * Connect to the running browser.
 * Returns a Playwright Browser + helper to get active page.
 */
export async function connectToBrowser(timeout = 5000) {
  const state = readBrowserState();
  if (!state) {
    throw new Error("No browser state found - run start.js first");
  }
  if (!state.wsEndpoint) {
    throw new Error("Browser state has no wsEndpoint - run start.js");
  }

  const browser = await firefox.connect(state.wsEndpoint);
  return { browser };
}

/**
 * Get the active page from a browser (most recently created page).
 */
export async function getActivePage(browser) {
  const contexts = browser.contexts();
  let page = null;
  for (const ctx of contexts) {
    const pages = ctx.pages();
    const realPages = pages.filter(
      p => !p.url().startsWith("about:") && !p.url().startsWith("chrome://") && p.url() !== ""
    );
    if (realPages.length > 0) {
      page = realPages[realPages.length - 1];
    } else if (pages.length > 0) {
      page = pages[pages.length - 1];
    }
  }
  // If no page found, create one
  if (!page) {
    const ctx = browser.contexts()[0] || await browser.newContext();
    page = await ctx.newPage();
  }
  return page;
}