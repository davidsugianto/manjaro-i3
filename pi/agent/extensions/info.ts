/**
 * info — runtime session info panel.
 *
 * Shows live stats: model, thinking, context %, tokens, cost,
 * plus extensions, themes, and prompts discovered on disk.
 *
 * Usage: /info  — press any key to close.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as child_process from "node:child_process";

function shortenPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function readDir(dir: string, ext: string): string[] {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length));
  } catch {
    return [];
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("info", {
    description: "Show runtime session info (model, context, extensions, themes, prompts)",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/info: interactive mode only", "warning");
        return;
      }

      // Don't open during active streaming — render loop would thrash
      if (!ctx.isIdle()) {
        ctx.ui.notify("/info: wait for the current response to finish", "warning");
        return;
      }

      // ── Gather all data ONCE before creating component ─────────
      const modelId       = ctx.model?.id ?? "none";
      const modelProvider = ctx.model?.provider ?? "none";
      const thinking      = pi.getThinkingLevel();

      const usage     = ctx.getContextUsage();
      const ctxPct    = usage?.percent != null ? `${Math.round(usage.percent)}%` : "?";
      const ctxWindow = ctx.model?.contextWindow
        ? `${(ctx.model.contextWindow / 1000).toFixed(0)}k`
        : "?";

      let inputTok = 0, outputTok = 0, cost = 0;
      for (const e of ctx.sessionManager.getBranch()) {
        if (e.type === "message" && e.message.role === "assistant") {
          const m = e.message as AssistantMessage;
          inputTok += m.usage.input;
          outputTok += m.usage.output;
          cost     += m.usage.cost.total;
        }
      }

      const base     = path.join(os.homedir(), ".pi", "agent");
      const exts     = readDir(path.join(base, "extensions"), ".ts");
      const themes   = readDir(path.join(base, "themes"), ".json");
      const prompts  = readDir(path.join(base, "prompts"), ".md").map((p) => `/${p}`);
      const cwd      = shortenPath(ctx.cwd);

      // Skills
      const skillsDir = path.join(base, "skills");
      const skills: string[] = [];
      try {
        for (const entry of fs.readdirSync(skillsDir)) {
          const skillFile = path.join(skillsDir, entry, "SKILL.md");
          if (fs.existsSync(skillFile)) skills.push(entry);
        }
      } catch { /* ignore */ }

      // Session stats
      const branch = ctx.sessionManager.getBranch();
      const userTurns    = branch.filter((e) => e.type === "message" && e.message.role === "user").length;
      const assistTurns  = branch.filter((e) => e.type === "message" && e.message.role === "assistant").length;
      const totalEntries = branch.length;
      const sessionFile  = ctx.sessionManager.getSessionFile();
      const sessionLabel = sessionFile ? shortenPath(sessionFile) : "ephemeral";

      // Git branch of cwd
      let gitBranch = "";
      try {
        gitBranch = child_process
          .execSync("git rev-parse --abbrev-ref HEAD", { cwd: ctx.cwd, stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim();
      } catch { /* not a git repo */ }

      // ── Component — closed over the snapshot above ─────────────
      let closed = false;
      let cachedLines: string[] | null = null;
      let cachedWidth = 0;
      let invalidated = false;

      await ctx.ui.custom((_tui, theme, _kb, done) => {
        return {
          invalidate() {
            invalidated = true;
            cachedLines = null;
          },

          handleInput(data: string) {
            if (closed) return;
            // Ignore bare modifier keys that fire without visible chars
            if (data.length === 0) return;
            closed = true;
            done(undefined);
          },

          render(width: number): string[] {
            if (cachedLines && cachedWidth === width && !invalidated) return cachedLines;
            cachedWidth = width;
            invalidated = false;

            const lines: string[] = [];
            const W = width;

            const hr = () =>
              truncateToWidth(
                "  " + theme.fg("border", "─".repeat(Math.max(0, W - 4))),
                W,
              );

            const kv = (label: string, value: string) =>
              truncateToWidth(
                "  " + theme.fg("muted", label.padEnd(14)) + "  " + theme.fg("text", value),
                W,
              );

            const section = (title: string) =>
              truncateToWidth("  " + theme.fg("muted", title), W);

            const chipLines = (items: string[], color: "accent" | "text"): void => {
              let row = "    ";
              for (let i = 0; i < items.length; i++) {
                const chip = theme.fg(color, items[i]!);
                const sep  = i < items.length - 1 ? theme.fg("dim", "  ·  ") : "";
                const next = row + items[i]! + (i < items.length - 1 ? "  ·  " : "");
                if (visibleWidth(next) > W - 2 && row.trim() !== "") {
                  lines.push(truncateToWidth(row.trimEnd(), W));
                  row = "    " + chip + sep;
                } else {
                  row += chip + sep;
                }
              }
              if (row.trim()) lines.push(truncateToWidth(row.trimEnd(), W));
            };

            // Header
            lines.push("");
            lines.push(
              truncateToWidth(
                "  " +
                  theme.bold(theme.fg("accent", "pi")) +
                  theme.fg("dim", "  info") +
                  "  " +
                  theme.fg("borderMuted", "press any key to close"),
                W,
              ),
            );
            lines.push(hr());

            // Session stats
            lines.push("");
            lines.push(kv("model", modelId));
            lines.push(kv("provider", modelProvider));
            lines.push(kv("thinking", thinking));
            lines.push(kv("context", `${ctxPct} of ${ctxWindow}`));
            lines.push(kv("cwd", cwd));
            if (gitBranch) lines.push(kv("git branch", gitBranch));
            if (inputTok + outputTok > 0) {
              lines.push(kv("tokens", `↑${fmt(inputTok)} ↓${fmt(outputTok)}  $${cost.toFixed(3)}`));
            }
            lines.push(kv("session", sessionLabel));
            lines.push(kv("turns", `${userTurns} user  /  ${assistTurns} assistant  (${totalEntries} entries)`));

            lines.push("");
            lines.push(hr());

            // Extensions
            if (exts.length > 0) {
              lines.push("");
              lines.push(section("Extensions"));
              // Word-wrap if needed
              let row = "    ";
              for (let i = 0; i < exts.length; i++) {
                const chip = theme.fg("text", exts[i]!);
                const sep  = i < exts.length - 1 ? theme.fg("dim", "  ·  ") : "";
                const next = row + exts[i]! + (i < exts.length - 1 ? "  ·  " : "");
                if (visibleWidth(next) > W - 2 && row.trim() !== "") {
                  lines.push(truncateToWidth(row.trimEnd(), W));
                  row = "    " + chip + sep;
                } else {
                  row += chip + sep;
                }
              }
              if (row.trim()) lines.push(truncateToWidth(row.trimEnd(), W));
            }

            // Skills
            if (skills.length > 0) {
              lines.push("");
              lines.push(section("Skills"));
              chipLines(skills, "text");
            }

            // Themes
            if (themes.length > 0) {
              lines.push("");
              lines.push(section("Themes"));
              chipLines(themes, "text");
            }

            // Prompts
            if (prompts.length > 0) {
              lines.push("");
              lines.push(section("Prompts"));
              chipLines(prompts, "accent");
            }

            lines.push("");
            lines.push(hr());
            lines.push("");

            cachedLines = lines;
            return lines;
          },
        };
      });
    },
  });
}
