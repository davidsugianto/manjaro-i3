#!/usr/bin/env node

/**
 * Navigate the persistent Firefox browser to a URL.
 * Connects to the browser daemon's HTTP API.
 */

import { readBrowserState } from "./browser.js";

const url = process.argv[2];
const newTab = process.argv[3] === "--new";

if (!url) {
  console.log("Usage: nav.js <url> [--new]");
  console.log("\nExamples:");
  console.log("  nav.js https://example.com       # Navigate current tab");
  console.log("  nav.js https://example.com --new # Open in new tab");
  process.exit(1);
}

const state = readBrowserState();
if (!state?.daemonPort) {
  console.error("✗ No browser daemon running — run start.js first");
  process.exit(1);
}

try {
  const endpoint = newTab ? "/new-tab" : "/navigate";
  const res = await fetch(`http://127.0.0.1:${state.daemonPort}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error("✗", json.error);
    process.exit(1);
  }
  console.log(newTab ? "✓ Opened:" : "✓ Navigated to:", json.data.url);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}