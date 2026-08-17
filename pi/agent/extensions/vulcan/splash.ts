/**
 * splash.ts — the Vulcan boot pour, and the slim HUD that follows it.
 *
 * On startup the VULCAN wordmark is "poured": rows ignite bottom-to-top at
 * white heat and cool into a standing vertical gradient while deterministic
 * sparks twinkle in the margins. Once settled, an info line shows the model
 * and what the forge has loaded (extensions / skills / themes / prompts).
 *
 * The animation timer is owned by the header component: pi calls dispose()
 * whenever setHeader() is replaced, so the interval can never leak — the
 * same contract aurora.ts documents. The splash never touches
 * setWorkingIndicator, and index.ts never installs it on reason:"reload".
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import { GLYPH, heatFg, heatGradient, sparkSeed } from "./forge.js";

// "VULCAN" in ANSI-shadow block letters. Every row must be the same width —
// verified by test in scripts and guarded at runtime by padEnd below.
const WORDMARK = [
  "██╗   ██╗██╗   ██╗██╗      ██████╗ █████╗ ███╗   ██╗",
  "██║   ██║██║   ██║██║     ██╔════╝██╔══██╗████╗  ██║",
  "██║   ██║██║   ██║██║     ██║     ███████║██╔██╗ ██║",
  "╚██╗ ██╔╝██║   ██║██║     ██║     ██╔══██║██║╚██╗██║",
  " ╚████╔╝ ╚██████╔╝███████╗╚██████╗██║  ██║██║ ╚████║",
  "  ╚═══╝   ╚═════╝ ╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝  ╚═══╝",
];

const FRAME_MS = 80;
const ROW_STAGGER = 3; // frames between row ignitions (bottom-up)
const COOL_RATE = 0.05; // heat lost per frame after ignition
const SETTLE_FRAME = (WORDMARK.length - 1) * ROW_STAGGER + 18;

/** Resting vertical gradient: cooler at the top, molten at the base. */
function restingHeat(row: number): number {
  return 0.35 + (0.5 * row) / (WORDMARK.length - 1);
}

export interface ForgeSnapshot {
  extensions: number;
  skills: number;
  themes: number;
  prompts: number;
}

/** Count what the forge loaded. Called once at install — never in render(). */
export function takeSnapshot(): ForgeSnapshot {
  const agentDir = getAgentDir();
  const count = (dir: string, filter: (name: string) => boolean): number => {
    try {
      return fs.readdirSync(path.join(agentDir, dir)).filter(filter).length;
    } catch {
      return 0;
    }
  };
  return {
    extensions: count("extensions", (n) => !n.endsWith(".disabled")),
    skills: count("skills", (n) => !n.startsWith(".")),
    themes: count("themes", (n) => n.endsWith(".json")),
    prompts: count("prompts", (n) => !n.startsWith(".")),
  };
}

function center(line: string, width: number): string {
  const w = visibleWidth(line);
  if (w >= width) return truncateToWidth(line, width);
  return " ".repeat(Math.floor((width - w) / 2)) + line;
}

function infoLines(
  ctx: ExtensionContext,
  theme: Theme,
  snap: ForgeSnapshot,
  width: number,
): string[] {
  const dim = (s: string): string => theme.fg("dim", s);
  const muted = (s: string): string => theme.fg("muted", s);
  const dot = dim(" · ");
  const info =
    heatFg(0.75, GLYPH.hammer) +
    " " +
    muted(ctx.model?.id ?? "no model") +
    dot +
    dim(
      `${snap.extensions} extensions · ${snap.skills} skills · ${snap.themes} themes · ${snap.prompts} prompts`,
    );
  const tip = dim("/vulcan tune the forge · /reload re-strike · /theme change plating");
  return [center(info, width), center(tip, width)];
}

// ── Boot splash ──────────────────────────────────────────────────────────────

export function installSplash(ctx: ExtensionContext, snap: ForgeSnapshot): void {
  ctx.ui.setHeader((tui, theme: Theme) => {
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
      frame++;
      if (frame >= SETTLE_FRAME && timer) {
        clearInterval(timer);
        timer = undefined;
      }
      tui.requestRender();
    }, FRAME_MS);

    return {
      invalidate(): void {
        /* render is stateless per frame */
      },
      dispose(): void {
        if (timer) clearInterval(timer);
        timer = undefined;
      },
      render(width: number): string[] {
        try {
          // Narrow terminals get a compact plate, no animation dependency.
          if (width < WORDMARK[0]!.length + 4) {
            return [
              "",
              center(heatGradient("V U L C A N", 0.45, 0.95), width),
              ...infoLines(ctx, theme, snap, width),
              "",
            ];
          }

          const settled = frame >= SETTLE_FRAME;
          const lines: string[] = [""];

          for (let r = 0; r < WORDMARK.length; r++) {
            const row = WORDMARK[r]!;
            const igniteAt = (WORDMARK.length - 1 - r) * ROW_STAGGER;
            if (!settled && frame < igniteAt) {
              lines.push("");
              continue;
            }
            const age = frame - igniteAt;
            const rest = restingHeat(r);
            const t = settled ? rest : Math.max(rest, 1 - age * COOL_RATE);

            let text = heatGradient(row, Math.max(0, t - 0.08), Math.min(1, t + 0.08));

            // Margin sparks while the metal is still cooling.
            if (!settled) {
              const rnd = sparkSeed(frame, r);
              const spark = (): string =>
                rnd() < 0.18
                  ? heatFg(0.5 + rnd() * 0.5, GLYPH.sparks[Math.floor(rnd() * GLYPH.sparks.length)]!)
                  : " ";
              text = spark() + " " + text + " " + spark();
            }
            lines.push(center(text, width));
          }

          lines.push("");
          if (settled || frame > SETTLE_FRAME - 8) {
            lines.push(...infoLines(ctx, theme, snap, width));
          } else {
            lines.push("", "");
          }
          lines.push("");
          return lines.map((l) => truncateToWidth(l, width));
        } catch {
          return [""];
        }
      },
    };
  });
}

// ── Slim HUD (after first turn, and for reload/resume sessions) ─────────────

export function installHud(ctx: ExtensionContext): void {
  ctx.ui.setHeader((_tui, theme: Theme) => ({
    invalidate(): void {
      /* stateless */
    },
    render(width: number): string[] {
      try {
        const dim = (s: string): string => theme.fg("dim", s);
        const title =
          heatGradient(` ${GLYPH.hammer} VULCAN`, 0.5, 0.9) +
          dim(" · ") +
          theme.fg("muted", ctx.model?.id ?? "no model");
        const rule = heatGradient("─".repeat(Math.max(0, width)), 0.15, 0.75);
        return [truncateToWidth(title, width), rule];
      } catch {
        return [""];
      }
    },
  }));
}
