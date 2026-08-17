#!/usr/bin/env node

/**
 * Dismiss cookie consent dialogs in the active browser tab.
 * Connects to the browser daemon's HTTP API.
 */

import { readBrowserState } from "./browser.js";

const reject = process.argv.includes("--reject");
const mode = reject ? "reject" : "accept";

const state = readBrowserState();
if (!state?.daemonPort) {
  console.error("✗ No browser daemon running — run start.js first");
  process.exit(1);
}

try {
  const res = await fetch(`http://127.0.0.1:${state.daemonPort}/dismiss-cookies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reject }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error("✗", json.error);
    process.exit(1);
  }

  const clicked = json.data.dismissed;
  if (clicked.length > 0) {
    console.log(`✓ Dismissed cookie dialog (${mode}): ${clicked.join(", ")}`);
  } else {
    console.log(`○ No cookie dialog found to ${mode}`);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}