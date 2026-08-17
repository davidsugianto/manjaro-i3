/**
 * aurora — a futuristic "AI command deck" chrome for pi.
 *
 * One cohesive extension that owns the whole visual first-impression and the
 * persistent HUD, coordinated across the session lifecycle:
 *
 *   1. Boot entrance (startup only) — an animated aurora wave, a gradient
 *      block "PI" wordmark, a live telemetry panel, and a command grid.
 *      Rendered via setHeader() so the real editor stays live underneath
 *      (/ autocomplete, tab, ^l all work natively).
 *   2. HUD header — a filled title-bar (brand · model · thinking) capped by a
 *      cyan→violet gradient rule. Installs after the first turn, once the
 *      entrance has cleared.
 *   3. Telemetry footer — cwd · @branch  ‖  model · context-gauge · tokens · cost,
 *      with extension statuses inlined.
 *   4. Working indicator — an aurora "scanner": a bright head sweeping a track
 *      with a gradient trail.
 *
 * Design constraints honored (see docs/tui.md):
 *   - every render() line is width-clamped and wrapped in try/catch so a render
 *     exception degrades to a blank/fallback line instead of crashing the loop;
 *   - setWorkingIndicator is NEVER called on reason:"reload" (documented hang);
 *   - the entrance animation timer is owned by the component's dispose(), which
 *     pi calls when setHeader() is replaced — so it never leaks;
 *   - all pi.on()/registerCommand() run once at top level — /reload never stacks.
 *
 * Toggle with `/aurora on|off` (alias `/chrome`). Replay the boot with `/entrance`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as os from "node:os";
import * as path from "node:path";

// ── Palette ramp (cyan → violet). Every key is a real theme fg token, so it
//    resolves in any theme; in `aurora` they form a smooth aurora sweep. ──────
const RAMP = ["toolTitle", "accent", "mdLink", "syntaxType", "mdCode", "customMessageLabel"] as const;

// "PI" in an ANSI-shadow block font — all rows are 11 cells wide.
const WORDMARK = [
  "██████╗ ██╗",
  "██╔══██╗██║",
  "██████╔╝██║",
  "██╔═══╝ ██║",
  "██║     ██║",
  "╚═╝     ╚═╝",
];

const WAVE_CH = "▁▂▃▄▅▆▇█";
const SCAN = { head: "█", mid: "▓", low: "▒", off: "░" };

const SUGGESTIONS: Array<{ cmd: string; desc: string }> = [
  { cmd: "/plan", desc: "plan before coding" },
  { cmd: "/review", desc: "review changes" },
  { cmd: "/explain", desc: "understand a file" },
  { cmd: "/test", desc: "write tests" },
  { cmd: "/commit", desc: "stage + commit" },
  { cmd: "/wat", desc: "diagnose a failure" },
];

// ── Formatters ───────────────────────────────────────────────────────────────
function shortenCwd(cwd: string): string {
  const home = os.homedir();
  let p = cwd;
  if (p === home) return "~";
  if (p.startsWith(home + path.sep)) p = "~" + p.slice(home.length);
  const parts = p.split(path.sep);
  if (parts.length <= 4) return p;
  return [parts[0], "…", parts[parts.length - 2], parts[parts.length - 1]].filter(Boolean).join(path.sep);
}

function fmtTokens(n: number): string {
  if (n < 1000) return `${n}`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function fmtCost(c: number): string {
  if (c <= 0) return "";
  if (c < 0.01) return "<$0.01";
  return `$${c.toFixed(2)}`;
}

function shortModel(id: string): string {
  return id
    .replace(/^anthropic\//, "")
    .replace(/^openai\//, "")
    .replace(/^litellm\//, "")
    .replace(/^claude-/, "claude·")
    .replace(/^gpt-/, "gpt·");
}

// ── Style helpers — all guarded so a bad token never breaks a render loop. ────
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

/** Color a string left→right across the ramp, proportional to length. */
function gradient(theme: any, s: string, offset = 0): string {
  const chars = [...s];
  const n = chars.length || 1;
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch === " ") {
      out += " ";
      continue;
    }
    const idx = (Math.floor((i / n) * RAMP.length) + offset) % RAMP.length;
    out += safeFg(theme, RAMP[idx]!, ch);
  }
  return out;
}

/** A full-width gradient rule built from segments of the ramp. */
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

/** A cyan→violet capacity gauge: filled cells shift along the ramp. */
function gauge(theme: any, pct: number, cells = 10): string {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * cells);
  let out = "";
  for (let i = 0; i < cells; i++) {
    if (i < filled) {
      const idx = Math.min(RAMP.length - 1, Math.floor((i / cells) * RAMP.length));
      out += safeFg(theme, RAMP[idx]!, "▰");
    } else {
      out += safeFg(theme, "borderMuted", "▱");
    }
  }
  return out;
}

function centerPad(width: number, vw: number): string {
  return " ".repeat(Math.max(0, Math.floor((width - vw) / 2)));
}

// ── Live session stats pulled from the branch (tokens + cost). ────────────────
function readUsage(ctx: any): { input: number; output: number; cost: number } {
  let input = 0,
    output = 0,
    cost = 0;
  try {
    for (const e of ctx.sessionManager.getBranch()) {
      if (e.type === "message" && e.message.role === "assistant") {
        const m = e.message as AssistantMessage;
        input += m.usage.input;
        output += m.usage.output;
        cost += m.usage.cost.total;
      }
    }
  } catch {
    /* ignore */
  }
  return { input, output, cost };
}

export default function (pi: ExtensionAPI) {
  let enabled = true;
  let entranceActive = false;
  let headerInstalled = false;

  type Ctx = any;

  // ── Shared: rounded, bg-filled telemetry panel ────────────────────────────────
  // Layout: [margin][│][ inner (innerW+2) ][│]  →  outer width = innerW+4 = panelW.
  const telemetryPanel = (ctx: Ctx, theme: any, width: number): string[] => {
    const panelW = Math.min(Math.max(34, width - 6), 56);
    const innerW = panelW - 4;
    const span = innerW + 2; // fillable columns between the two side borders
    const left = centerPad(width, panelW);
    const edge = (c: string) => safeFg(theme, "borderAccent", c);

    const model = ctx.model?.id ? shortModel(ctx.model.id) : "—";
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
    const cwd = shortenCwd(ctx.cwd ?? process.cwd());

    const topBorder = (title: string): string => {
      const t = " " + title + " ";
      const rest = Math.max(0, innerW + 1 - visibleWidth(t));
      return left + edge("╭─") + safeFg(theme, "muted", t) + safeFg(theme, "border", "─".repeat(rest)) + edge("╮");
    };
    const botBorder = (): string => left + edge("╰") + safeFg(theme, "border", "─".repeat(span)) + edge("╯");
    const row = (label: string, value: string): string => {
      const inner = " " + safeFg(theme, "dim", label.padEnd(9)) + value;
      const pad = Math.max(0, span - visibleWidth(inner));
      return left + edge("│") + safeBg(theme, "customMessageBg", inner + " ".repeat(pad)) + edge("│");
    };

    return [
      topBorder("session"),
      row("model", safeFg(theme, "text", model) + safeFg(theme, "dim", "   think ") + safeFg(theme, "accent", thinking)),
      row("context", gauge(theme, pct, 12) + safeFg(theme, "dim", `  ${pct}% of ${win}`)),
      row("path", safeFg(theme, "text", cwd)),
      botBorder(),
    ];
  };

  // ── 1. Boot entrance ────────────────────────────────────────────────────────
  const installEntrance = (ctx: Ctx) => {
    if (!ctx.hasUI || !enabled) return;
    entranceActive = true;
    let frame = 0;

    ctx.ui.setHeader((tui: any, theme: any) => {
      const timer = setInterval(() => {
        frame = (frame + 1) % 100000;
        tui.requestRender();
      }, 90);

      return {
        dispose() {
          clearInterval(timer);
          entranceActive = false;
        },
        invalidate() {},
        render(width: number): string[] {
          try {
            if (width < 4) return [""];
            const lines: string[] = [];
            const pad = (s: string) => centerPad(width, visibleWidth(s)) + s;

            // aurora wave — a flowing sine bar, gradient-colored, drifting.
            const waveW = Math.min(Math.max(0, width - 8), 54);
            if (waveW > 0) {
              let wave = "";
              for (let x = 0; x < waveW; x++) {
                const h = Math.floor((Math.sin(x / 3.4 + frame / 3.2) * 0.5 + 0.5) * (WAVE_CH.length - 1));
                wave += safeFg(theme, RAMP[(x + frame) % RAMP.length]!, WAVE_CH[h]!);
              }
              lines.push(pad(wave));
            }
            lines.push("");

            // gradient wordmark — sweep drifts a little each frame.
            const drift = Math.floor(frame / 4) % RAMP.length;
            for (const rowStr of WORDMARK) lines.push(pad(theme.bold(gradient(theme, rowStr, drift))));
            lines.push("");

            // letterspaced tagline
            lines.push(
              pad(
                safeFg(theme, "muted", "A U R O R A") +
                  safeFg(theme, "dim", "   ·   ") +
                  safeFg(theme, "muted", "agentic command deck"),
              ),
            );
            lines.push("");

            // telemetry panel
            for (const l of telemetryPanel(ctx, theme, width)) lines.push(l);
            lines.push("");

            // command grid — highlight the row matching current editor text
            const editorText = (ctx.ui.getEditorText?.() ?? "").trimStart();
            const colW = 24;
            const cols = width >= 74 ? 3 : width >= 50 ? 2 : 1;
            const rows = Math.ceil(SUGGESTIONS.length / cols);
            for (let r = 0; r < rows; r++) {
              let row = "";
              for (let c = 0; c < cols; c++) {
                const s = SUGGESTIONS[r * cols + c];
                if (!s) continue;
                const on = editorText.length > 0 && s.cmd.startsWith(editorText);
                const cmd = on ? theme.bold(safeFg(theme, "accent", s.cmd)) : safeFg(theme, "accent", s.cmd);
                const gap = Math.max(2, colW - visibleWidth(s.cmd) - 1 - visibleWidth(s.desc));
                row += cmd + " " + safeFg(theme, "dim", s.desc) + " ".repeat(gap);
              }
              lines.push(pad(row.trimEnd()));
            }
            lines.push("");

            // session shortcuts + input hints
            const keys = (k: string, l: string) => safeFg(theme, "borderAccent", k) + " " + safeFg(theme, "muted", l);
            lines.push(
              pad([keys("^⇧n", "new"), keys("^⇧t", "tree"), keys("^⇧f", "fork"), keys("^⇧r", "resume")].join(safeFg(theme, "dim", "   "))),
            );
            lines.push(pad(safeFg(theme, "dim", "↵ send   / templates   ⇧⇥ thinking   ^l model")));
            lines.push("");

            return lines.map((l) => truncateToWidth(l, width));
          } catch {
            return [""];
          }
        },
      };
    });
  };

  // ── 2. HUD header ──────────────────────────────────────────────────────────
  const installHeader = (ctx: Ctx) => {
    if (!ctx.hasUI || !enabled) return;
    ctx.ui.setHeader((_tui: any, theme: any) => ({
      invalidate() {},
      render(width: number): string[] {
        try {
          if (width < 4) return ["", "", ""];
          const brand = theme.bold(gradient(theme, "pi"));
          const dot = safeFg(theme, "borderAccent", "◆");
          const model = ctx.model?.id ? safeFg(theme, "muted", shortModel(ctx.model.id)) : "";
          const leftSide = ` ${dot} ${brand} ${safeFg(theme, "dim", "aurora")}`;
          const rightSide = model ? `${safeFg(theme, "success", "●")} ${model} ` : " ";
          const room = width - visibleWidth(leftSide) - visibleWidth(rightSide);
          const bar = leftSide + (room > 0 ? " ".repeat(room) : "") + rightSide;
          const filled = safeBg(theme, "customMessageBg", truncateToWidth(bar, width));
          return [filled, gradientRule(theme, width), ""];
        } catch {
          return ["", "", ""];
        }
      },
    }));
  };

  // ── 3. Telemetry footer ──────────────────────────────────────────────────────
  const installFooter = (ctx: Ctx) => {
    if (!ctx.hasUI || !enabled) return;
    ctx.ui.setFooter((tui: any, theme: any, footerData: any) => {
      const unsub = footerData.onBranchChange?.(() => tui.requestRender());
      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          try {
            const sep = safeFg(theme, "dim", "  ·  ");
            const { input, output, cost } = readUsage(ctx);
            const branch = footerData.getGitBranch?.();
            const usage = ctx.getContextUsage?.();
            const pct = usage?.percent != null ? Math.round(usage.percent) : null;

            const leftParts = [safeFg(theme, "muted", shortenCwd(ctx.cwd ?? process.cwd()))];
            if (branch) leftParts.push(safeFg(theme, "accent", `@${branch}`));
            const left = leftParts.join(sep);

            const right: string[] = [];
            if (ctx.model?.id) right.push(safeFg(theme, "text", shortModel(ctx.model.id)));
            if (pct != null) right.push(gauge(theme, pct, 6) + safeFg(theme, "dim", ` ${pct}%`));
            try {
              for (const [, s] of footerData.getExtensionStatuses?.() ?? []) if (s) right.push(s);
            } catch {
              /* ignore */
            }
            if (input + output > 0) right.push(safeFg(theme, "dim", `↑${fmtTokens(input)} ↓${fmtTokens(output)}`));
            const costStr = fmtCost(cost);
            if (costStr) right.push(safeFg(theme, "success", costStr));

            const r = right.join(sep);
            const room = width - visibleWidth(left) - visibleWidth(r) - 2;
            const gap = room > 0 ? " ".repeat(room) : " ";
            return [truncateToWidth(` ${left}${gap}${r} `, width)];
          } catch {
            return [""];
          }
        },
      };
    });
  };

  // ── 4. Working indicator — aurora scanner ─────────────────────────────────────
  const installIndicator = (ctx: Ctx) => {
    if (!ctx.hasUI || !enabled) return;
    const theme = ctx.ui.theme;
    const CELLS = 6;
    const track = (head: number): string => {
      let s = "";
      for (let i = 0; i < CELLS; i++) {
        const d = Math.abs(i - head);
        if (d === 0) s += safeFg(theme, "toolTitle", SCAN.head);
        else if (d === 1) s += safeFg(theme, "accent", SCAN.mid);
        else if (d === 2) s += safeFg(theme, "mdLink", SCAN.low);
        else s += safeFg(theme, "borderMuted", SCAN.off);
      }
      return s;
    };
    const heads = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1];
    ctx.ui.setWorkingIndicator({ frames: heads.map(track), intervalMs: 90 });
  };

  const installChrome = (ctx: Ctx, withIndicator: boolean) => {
    headerInstalled = true;
    installHeader(ctx);
    installFooter(ctx);
    if (withIndicator) installIndicator(ctx);
  };

  // ── Lifecycle (registered once) ───────────────────────────────────────────────
  pi.on("session_start", (event: any, ctx: Ctx) => {
    if (!enabled || !ctx.hasUI) return;
    const reason = event.reason as string;
    const isReload = reason === "reload";

    headerInstalled = false;
    // resetExtensionUI() clears the footer before every session_start → reinstall.
    installFooter(ctx);
    // Safe on every reason EXCEPT reload (documented spinner hang).
    if (!isReload) installIndicator(ctx);

    if (reason === "startup") {
      installEntrance(ctx); // header owned by entrance until first agent_end
    }
    // header for reload/new/resume/fork installs on the next agent_end.
  });

  pi.on("agent_end", (_event: any, ctx: Ctx) => {
    if (!enabled || !ctx.hasUI) return;
    if (entranceActive) {
      ctx.ui.setHeader(undefined); // triggers entrance dispose() → clears timer
      entranceActive = false;
    }
    if (headerInstalled) return;
    headerInstalled = true;
    installHeader(ctx);
  });

  // ── Commands ─────────────────────────────────────────────────────────────────
  const toggle = async (args: string, ctx: Ctx) => {
    const arg = (args ?? "").trim().toLowerCase();
    if (arg === "off" || (arg === "" && enabled)) {
      enabled = false;
      ctx.ui.setHeader(undefined);
      ctx.ui.setFooter(undefined);
      ctx.ui.setWorkingIndicator();
      ctx.ui.notify("aurora: off", "info");
      return;
    }
    if (arg === "on" || (arg === "" && !enabled)) {
      enabled = true;
      installChrome(ctx, true);
      ctx.ui.notify("aurora: on", "info");
      return;
    }
    ctx.ui.notify("Usage: /aurora on|off", "warning");
  };

  pi.registerCommand("aurora", { description: "Toggle the aurora chrome (header / footer / indicator)", handler: toggle });
  pi.registerCommand("chrome", { description: "Alias for /aurora", handler: toggle });
  pi.registerCommand("entrance", {
    description: "Replay the aurora boot entrance",
    handler: async (_args: string, ctx: Ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/entrance: interactive mode only", "warning");
        return;
      }
      installEntrance(ctx);
    },
  });
}
