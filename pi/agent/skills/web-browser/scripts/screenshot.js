#!/usr/bin/env node

/**
 * Take a screenshot of the active browser tab.
 * Connects to the browser daemon's HTTP API.
 */

import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBrowserState } from "./browser.js";

function printUsage() {
  console.log("Usage: screenshot.js [--full-page] [--device <preset>]");
  console.log("\nExamples:");
  console.log("  screenshot.js");
  console.log("  screenshot.js --full-page");
}

const args = process.argv.slice(2);
let fullPage = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "--full-page") {
    fullPage = true;
    continue;
  }
  if (arg === "--help") {
    printUsage();
    process.exit(0);
  }
  if (arg === "--device") { i++; continue; }
  console.error(`✗ Unknown argument: ${arg}`);
  printUsage();
  process.exit(1);
}

const state = readBrowserState();
if (!state?.daemonPort) {
  console.error("✗ No browser daemon running — run start.js first");
  process.exit(1);
}

try {
  const res = await fetch(`http://127.0.0.1:${state.daemonPort}/screenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fullPage, format: "png" }),
  });
  const json = await res.json();
  if (!json.ok) {
    console.error("✗", json.error);
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `screenshot-${timestamp}.png`;
  const filepath = join(tmpdir(), filename);

  writeFileSync(filepath, Buffer.from(json.data.data, "base64"));
  console.log(filepath);
} catch (e) {
  console.error("✗", e.message);
  process.exit(1);
}