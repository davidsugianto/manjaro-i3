/**
 * ui-manager — one picker to switch pi's TUI chrome.
 *
 * Four chromes live side by side in ~/.pi/agent/extensions as auto-discovered
 * extensions. Only one may be active at a time (they each install a header /
 * footer / editor and would otherwise fight). This manager is the single
 * always-on extension that enables exactly one of them — or none ("original",
 * pi's stock chrome) — by toggling each chrome's entry file between its
 * enabled and `.disabled` name, then calling ctx.reload() to apply live.
 *
 * The filesystem is the source of truth: the active design is whichever
 * chrome's entry file is currently enabled, so the picker is always in sync
 * even if you rename files by hand.
 *
 *   /ui         open the picker
 *   /ui <name>  switch directly (original | halcyon | aurora | vulcan)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

interface FilePair {
  /** Path (relative to extensions/) that pi auto-discovers when enabled. */
  on: string;
  /** Parked name pi ignores. */
  off: string;
}

interface Design {
  id: string;
  label: string;
  blurb: string;
  files: FilePair[];
  /** Paired theme applied on switch; null leaves the theme untouched. */
  theme: string | null;
}

const DESIGNS: readonly Design[] = [
  {
    id: "original",
    label: "Original",
    blurb: "pi's stock chrome — no extension UI",
    files: [],
    theme: null,
  },
  {
    id: "halcyon",
    label: "Halcyon",
    blurb: "calm typographic header + dense footer, braille spinner",
    files: [{ on: "halcyon-chrome.ts", off: "halcyon-chrome.ts.disabled" }],
    theme: "halcyon",
  },
  {
    id: "aurora",
    label: "Aurora",
    blurb: "animated AI command-deck, cyan→violet gradient HUD",
    files: [{ on: "aurora.ts", off: "aurora.ts.disabled" }],
    theme: "aurora-green",
  },
  {
    id: "vulcan",
    label: "Vulcan",
    blurb: "forge chrome: heat-reactive editor frame + gauge-rail footer",
    files: [{ on: "vulcan/index.ts", off: "vulcan/index.ts.disabled" }],
    theme: "vulcan",
  },
];

function extDir(): string {
  return path.join(getAgentDir(), "extensions");
}

function abs(rel: string): string {
  return path.join(extDir(), rel);
}

function exists(rel: string): boolean {
  try {
    return fs.existsSync(abs(rel));
  } catch {
    return false;
  }
}

/** A design is active when every one of its entry files is enabled on disk. */
function activeDesignId(): string {
  for (const d of DESIGNS) {
    if (d.files.length === 0) continue;
    if (d.files.every((f) => exists(f.on))) return d.id;
  }
  return "original";
}

function setTheme(theme: string): void {
  const settingsPath = path.join(getAgentDir(), "settings.json");
  try {
    const full = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
    full.theme = theme;
    fs.writeFileSync(settingsPath, JSON.stringify(full, null, 2), "utf-8");
  } catch {
    /* leave theme as-is if settings.json is unreadable */
  }
}

/**
 * Enable exactly the target design's files and park every other chrome.
 * Returns a list of human-readable problems (missing files, etc.).
 */
function applyDesign(target: Design): string[] {
  const problems: string[] = [];

  for (const d of DESIGNS) {
    const activate = d.id === target.id;
    for (const pair of d.files) {
      const want = activate ? pair.on : pair.off;
      const stale = activate ? pair.off : pair.on;
      if (exists(want)) continue; // already in the desired state
      if (exists(stale)) {
        try {
          fs.renameSync(abs(stale), abs(want));
        } catch (e) {
          problems.push(`could not rename ${stale} → ${want}: ${(e as Error).message}`);
        }
      } else if (activate) {
        problems.push(`missing chrome file for ${d.label}: ${pair.on} (nor ${pair.off})`);
      }
    }
  }

  if (target.theme) setTheme(target.theme);
  return problems;
}

function findDesign(id: string): Design | undefined {
  return DESIGNS.find((d) => d.id === id.trim().toLowerCase());
}

export default function (pi: ExtensionAPI): void {
  pi.registerCommand("ui", {
    description: "Switch pi TUI chrome (original · halcyon · aurora · vulcan)",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      const current = activeDesignId();

      // Direct form: /ui vulcan
      let target = args.trim() ? findDesign(args) : undefined;

      if (args.trim() && !target) {
        ctx.ui.notify(
          `Unknown UI "${args.trim()}". Options: ${DESIGNS.map((d) => d.id).join(", ")}`,
          "error",
        );
        return;
      }

      // Picker form: /ui
      if (!target) {
        const options = DESIGNS.map((d) => {
          const mark = d.id === current ? "● " : "  ";
          return `${mark}${d.label} — ${d.blurb}`;
        });
        const chosen = await ctx.ui.select("Switch TUI chrome", options);
        if (chosen === undefined) return; // cancelled
        const idx = options.indexOf(chosen);
        target = DESIGNS[idx];
        if (!target) return;
      }

      if (target.id === current) {
        ctx.ui.notify(`Already using ${target.label}.`, "info");
        return;
      }

      const problems = applyDesign(target);
      if (problems.length > 0) {
        ctx.ui.notify(`UI switch had issues: ${problems.join("; ")}`, "warning");
      }

      // Re-verify the switch actually landed before claiming success.
      if (activeDesignId() !== target.id) {
        ctx.ui.notify(
          `Failed to activate ${target.label}. Left the previous chrome in place.`,
          "error",
        );
        return;
      }

      const themeNote = target.theme ? ` · theme → ${target.theme}` : "";
      ctx.ui.notify(`Switched to ${target.label}${themeNote}. Reloading…`, "info");

      try {
        await ctx.reload();
      } catch {
        ctx.ui.notify("Applied on disk — run /reload to see it.", "warning");
      }
    },
  });
}
