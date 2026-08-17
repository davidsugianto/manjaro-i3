/**
 * aurora-deck — a full-screen "command deck" for pi.
 *
 * `/deck` takes over the screen with a live mission-control overview built in
 * the aurora visual language: a gradient title strip, bg-filled bordered
 * panels, cyan→violet capacity gauges, and chip rows for skills / extensions /
 * prompts discovered on disk. Any key closes it.
 *
 * Standalone by design (pi extensions don't import one another), so the small
 * style helpers are duplicated here rather than shared with aurora.ts.
 *
 * Honors docs/tui.md: every render() line is width-clamped, the whole render is
 * wrapped in try/catch, and the snapshot is gathered once before the component
 * is created so the render loop never does I/O.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as child_process from "node:child_process";

const RAMP = ["toolTitle", "accent", "mdLink", "syntaxType", "mdCode", "customMessageLabel"] as const;

function safeFg(theme: any, key: string, text: string): string {
  try {
    return theme.fg(key, text);
  } catch {
    try {
      return theme.fg("accent", text);
    } catch {
      return text;
    }
  }
}
function safeBg(theme: any, key: string, text: string): string {
  try {
    return theme.bg(key, text);
  } catch {
    return text;
  }
}
function gradient(theme: any, s: string): string {
  const chars = [...s];
  const n = chars.length || 1;
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === " ") {
      out += " ";
      continue;
    }
    out += safeFg(theme, RAMP[Math.min(RAMP.length - 1, Math.floor((i / n) * RAMP.length))]!, ch);
  }
  return out;
}
function gradientRule(theme: any, width: number, ch = "━"): string {
  if (width < 1) return "";
  const seg = Math.max(1, Math.ceil(width / RAMP.length));
  let out = "";
  let placed = 0;
  for (let i = 0; i < RAMP.length && placed < width; i++) {
    const take = Math.min(seg, width - placed);
    out += safeFg(theme, RAMP[i]!, ch.repeat(take));
    placed += take;
  }
  return out;
}
function gauge(theme: any, pct: number, cells = 12): string {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * cells);
  let out = "";
  for (let i = 0; i < cells; i++) {
    if (i < filled) out += safeFg(theme, RAMP[Math.min(RAMP.length - 1, Math.floor((i / cells) * RAMP.length))]!, "▰");
    else out += safeFg(theme, "borderMuted", "▱");
  }
  return out;
}
function fmt(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
function shortModel(id: string): string {
  return id.replace(/^(anthropic|openai|litellm)\//, "").replace(/^claude-/, "claude·").replace(/^gpt-/, "gpt·");
}
function shortenPath(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? "~" + p.slice(home.length) : p;
}
function readDir(dir: string, ext: string): string[] {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(ext))
      .map((f) => f.slice(0, -ext.length))
      .sort();
  } catch {
    return [];
  }
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand("deck", {
    description: "Open the aurora command deck (full-screen session overview)",
    handler: async (_args: string, ctx: any) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/deck: interactive mode only", "warning");
        return;
      }
      if (!ctx.isIdle()) {
        ctx.ui.notify("/deck: wait for the current response to finish", "warning");
        return;
      }

      // ── snapshot (gathered once) ─────────────────────────────────────────────
      const modelId = ctx.model?.id ? shortModel(ctx.model.id) : "—";
      const provider = ctx.model?.provider ?? "—";
      const thinking = (() => {
        try {
          return pi.getThinkingLevel();
        } catch {
          return "medium";
        }
      })();
      const usage = ctx.getContextUsage?.();
      const pct = usage?.percent != null ? Math.round(usage.percent) : 0;
      const win = ctx.model?.contextWindow ? `${Math.round(ctx.model.contextWindow / 1000)}k` : "?";

      let inTok = 0,
        outTok = 0,
        cost = 0,
        userTurns = 0,
        asstTurns = 0;
      try {
        for (const e of ctx.sessionManager.getBranch()) {
          if (e.type === "message" && e.message.role === "assistant") {
            const m = e.message as AssistantMessage;
            inTok += m.usage.input;
            outTok += m.usage.output;
            cost += m.usage.cost.total;
            asstTurns++;
          } else if (e.type === "message" && e.message.role === "user") {
            userTurns++;
          }
        }
      } catch {
        /* ignore */
      }

      let branch = "";
      try {
        branch = child_process
          .execSync("git rev-parse --abbrev-ref HEAD", { cwd: ctx.cwd, stdio: ["ignore", "pipe", "ignore"] })
          .toString()
          .trim();
      } catch {
        /* not a repo */
      }

      const base = path.join(os.homedir(), ".pi", "agent");
      const prompts = readDir(path.join(base, "prompts"), ".md").map((p) => `/${p}`);
      const exts = readDir(path.join(base, "extensions"), ".ts");
      const skills: string[] = [];
      try {
        for (const entry of fs.readdirSync(path.join(base, "skills"))) {
          if (fs.existsSync(path.join(base, "skills", entry, "SKILL.md"))) skills.push(entry);
        }
      } catch {
        /* ignore */
      }
      const cwd = shortenPath(ctx.cwd ?? process.cwd());

      // ── component ────────────────────────────────────────────────────────────
      let closed = false;
      let cache: string[] | null = null;
      let cacheW = 0;

      await ctx.ui.custom((_tui: any, theme: any, _kb: any, done: any) => ({
        invalidate() {
          cache = null;
        },
        handleInput(data: string) {
          if (closed || data.length === 0) return;
          closed = true;
          done(undefined);
        },
        render(width: number): string[] {
          if (cache && cacheW === width) return cache;
          cacheW = width;
          try {
            const W = width;
            const panelW = Math.min(Math.max(40, W - 4), 72);
            const innerW = panelW - 4;
            const span = innerW + 2;
            const left = " ".repeat(Math.max(0, Math.floor((W - panelW) / 2)));
            const edge = (c: string) => safeFg(theme, "borderAccent", c);
            const lines: string[] = [];

            const top = (title: string) => {
              const t = " " + title + " ";
              const rest = Math.max(0, innerW + 1 - visibleWidth(t));
              lines.push(left + edge("╭─") + safeFg(theme, "muted", t) + safeFg(theme, "border", "─".repeat(rest)) + edge("╮"));
            };
            const bot = () => lines.push(left + edge("╰") + safeFg(theme, "border", "─".repeat(span)) + edge("╯"));
            const row = (s: string) => {
              const pad = Math.max(0, span - visibleWidth(s));
              lines.push(left + edge("│") + safeBg(theme, "customMessageBg", s + " ".repeat(pad)) + edge("│"));
            };
            const kv = (k: string, v: string) => row(" " + safeFg(theme, "dim", k.padEnd(9)) + v);
            const chips = (items: string[], color: string) => {
              if (items.length === 0) return;
              let cur = " ";
              const flush = () => {
                row(cur);
                cur = " ";
              };
              for (let i = 0; i < items.length; i++) {
                const piece = safeFg(theme, color, items[i]!) + (i < items.length - 1 ? safeFg(theme, "dim", " · ") : "");
                if (visibleWidth(cur) + visibleWidth(items[i]!) + 3 > span - 1 && cur.trim() !== "") flush();
                cur += piece;
              }
              if (cur.trim()) flush();
            };
            const center = (s: string) => " ".repeat(Math.max(0, Math.floor((W - visibleWidth(s)) / 2))) + s;

            // title strip
            lines.push("");
            const title =
              " " +
              safeFg(theme, "borderAccent", "◆") +
              " " +
              theme.bold(gradient(theme, "pi")) +
              " " +
              safeFg(theme, "dim", "aurora") +
              "   " +
              theme.bold(safeFg(theme, "accent", "COMMAND DECK"));
            const hint = safeFg(theme, "dim", "press any key to close ");
            const room = W - visibleWidth(title) - visibleWidth(hint);
            lines.push(safeBg(theme, "customMessageBg", truncateToWidth(title + (room > 0 ? " ".repeat(room) : "") + hint, W)));
            lines.push(gradientRule(theme, W));
            lines.push("");

            // session
            top("session");
            kv("model", safeFg(theme, "text", modelId) + safeFg(theme, "dim", "  via ") + safeFg(theme, "muted", provider));
            kv("thinking", safeFg(theme, "accent", thinking));
            kv("branch", branch ? safeFg(theme, "accent", "@" + branch) : safeFg(theme, "dim", "no git"));
            kv("path", safeFg(theme, "text", cwd));
            bot();
            lines.push("");

            // telemetry
            top("telemetry");
            kv("context", gauge(theme, pct, 14) + safeFg(theme, "dim", `  ${pct}% of ${win}`));
            kv(
              "tokens",
              safeFg(theme, "text", `↑ ${fmt(inTok)}   ↓ ${fmt(outTok)}`) +
                safeFg(theme, "dim", "   spend ") +
                safeFg(theme, "success", cost > 0 ? `$${cost.toFixed(3)}` : "—"),
            );
            kv(
              "turns",
              safeFg(theme, "text", `${userTurns}`) +
                safeFg(theme, "dim", " user · ") +
                safeFg(theme, "text", `${asstTurns}`) +
                safeFg(theme, "dim", " assistant"),
            );
            bot();
            lines.push("");

            // commands
            top("commands");
            chips(prompts, "accent");
            bot();
            lines.push("");

            // skills + extensions
            top("capabilities");
            row(" " + safeFg(theme, "dim", "skills"));
            chips(skills, "mdCode");
            row(" " + safeFg(theme, "dim", "extensions"));
            chips(exts, "text");
            bot();
            lines.push("");
            lines.push(center(safeFg(theme, "dim", "aurora command deck · pi")));
            lines.push("");

            cache = lines.map((l) => truncateToWidth(l, W));
            return cache;
          } catch {
            return [truncateToWidth(safeFg(theme, "error", "  deck render error — press any key"), width)];
          }
        },
      }));
    },
  });
}
