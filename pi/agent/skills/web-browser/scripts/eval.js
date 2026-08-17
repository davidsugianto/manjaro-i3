#!/usr/bin/env node

/**
 * Evaluate JavaScript in the active browser tab.
 * Connects to the browser daemon's HTTP API.
 */

import { readBrowserState } from "./browser.js";

const code = process.argv.slice(2).join(" ");
if (!code) {
  console.log("Usage: eval.js 'code'");
  console.log("\nExamples:");
  console.log('  eval.js "document.title"');
  console.log("  eval.js \"document.querySelectorAll('a').length\"");
  process.exit(1);
}

const state = readBrowserState();
if (!state?.daemonPort) {
  console.error("✗ No browser daemon running — run start.js first");
  process.exit(1);
}

try {
  const res = await fetch(`http://127.0.0.1:${state.daemonPort}/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expression: code }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error("✗", json.error);
    process.exit(1);
  }

  const result = json.data.result;

  // Format output like the original eval.js
  if (Array.isArray(result)) {
    for (let i = 0; i < result.length; i++) {
      if (i > 0) console.log("");
      for (const [key, value] of Object.entries(result[i])) {
        console.log(`${key}: ${value}`);
      }
    }
  } else if (typeof result === "object" && result !== null) {
    for (const [key, value] of Object.entries(result)) {
      console.log(`${key}: ${value}`);
    }
  } else {
    console.log(result);
  }
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}