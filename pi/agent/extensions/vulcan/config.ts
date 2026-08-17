/**
 * config.ts — Vulcan settings, persisted under the `vulcan` key of
 * ~/.pi/agent/settings.json so they survive restarts and live beside
 * pi's own settings. Reads merge over defaults; writes preserve every
 * other key in the file.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export interface VulcanConfig {
  /** Master switch for all Vulcan chrome. */
  enabled: boolean;
  /** Animated boot splash on startup. */
  splash: boolean;
  /** Editor frame heats up as the prompt grows. */
  heatFrame: boolean;
  /** Below this terminal width the footer splits into two lines. */
  footerSplitWidth: number;
}

export const DEFAULT_CONFIG: VulcanConfig = {
  enabled: true,
  splash: true,
  heatFrame: true,
  footerSplitWidth: 130,
};

function settingsPath(): string {
  return join(getAgentDir(), "settings.json");
}

export function loadConfig(): VulcanConfig {
  try {
    const path = settingsPath();
    if (existsSync(path)) {
      const full = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
      const section = (full.vulcan ?? {}) as Partial<VulcanConfig>;
      return { ...DEFAULT_CONFIG, ...section };
    }
  } catch {
    /* corrupt or unreadable settings — fall back to defaults */
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: VulcanConfig): void {
  const path = settingsPath();
  let full: Record<string, unknown> = {};
  try {
    if (existsSync(path)) {
      full = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    }
  } catch {
    /* keep empty object; we still persist the vulcan section */
  }
  full.vulcan = config;
  writeFileSync(path, JSON.stringify(full, null, 2), "utf-8");
}
