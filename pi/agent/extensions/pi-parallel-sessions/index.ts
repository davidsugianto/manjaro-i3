import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { ParallelSessionsPanel } from "./panel";
import { discoverSessions } from "./session-list";

export default function (pi: ExtensionAPI) {
  let panelOpen = false;

  const openPanel = async (ctx: any) => {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("Parallel sessions panel requires TUI mode", "warning");
      return;
    }
    if (panelOpen) return; // already open — let esc close it
    panelOpen = true;

    try {
      await ctx.ui.custom<void>(
        (tui: any, theme: any, _kb: any, done: any) => new ParallelSessionsPanel(tui, theme, done, ctx.cwd),
        {
          overlay: true,
          overlayOptions: {
            anchor: "right-center",
            width: "45%",
            minWidth: 60,
            maxHeight: "90%",
            margin: { top: 1, bottom: 1, right: 1, left: 0 },
          },
        }
      );
    } finally {
      panelOpen = false;
    }
  };

  // /agents command — handler receives (args, ctx)
  pi.registerCommand("agents", {
    description: "Show parallel delegate sessions panel",
    handler: (_args: any, ctx: any) => openPanel(ctx),
  });

  // F4 shortcut — handler receives (ctx) directly
  pi.registerShortcut("f4", {
    description: "Toggle parallel agents panel",
    handler: (ctx: any) => openPanel(ctx),
  });

  // Background poller — drives footer status badge + above-editor icon widget
  let statusTimer: ReturnType<typeof setInterval> | null = null;

  function updateAgentUI(ctx: any): void {
    const sessions = discoverSessions(ctx.cwd);
    const total = sessions.length;
    const running = sessions.filter(
      (s: any) => s.status === "running" || s.status === "launching"
    ).length;
    const failed = sessions.filter((s: any) => s.status === "failed").length;

    if (total === 0) {
      // Nothing running — clear both
      ctx.ui.setStatus("pi-agents", undefined);
      ctx.ui.setWidget("pi-agents", undefined);
      return;
    }

    const theme = ctx.ui.theme;

    // ── Footer status badge ──────────────────────────────────────────────
    if (running > 0) {
      ctx.ui.setStatus("pi-agents", theme.fg("accent", `⚡ ${running}/${total} agents`));
    } else if (failed > 0) {
      ctx.ui.setStatus("pi-agents", theme.fg("error", `✗ ${failed} failed`));
    } else {
      ctx.ui.setStatus("pi-agents", theme.fg("success", `✓ ${total} done`));
    }

    // ── Above-editor icon widget ─────────────────────────────────────────
    // One icon+name per agent, all on one line, colour-coded by status
    const iconFor = (status: string): string => {
      switch (status) {
        case "running":   return theme.fg("accent",  "●");
        case "launching": return theme.fg("muted",   "…");
        case "done":      return theme.fg("success", "✓");
        case "failed":    return theme.fg("error",   "✗");
        case "dead":      return theme.fg("dim",     "○");
        default:          return theme.fg("dim",     "?");
      }
    };
    const colorFor = (status: string): string => {
      switch (status) {
        case "running":   return "accent";
        case "launching": return "muted";
        case "done":      return "success";
        case "failed":    return "error";
        case "dead":      return "dim";
        default:          return "dim";
      }
    };

    const agentChips = sessions
      .map((s: any) => `${iconFor(s.status)} ${theme.fg(colorFor(s.status), s.name)}`)
      .join("  ");

    const label = theme.fg("dim", "⚡ Agents: ");
    const hint  = theme.fg("dim", "  (F4 to inspect)");
    ctx.ui.setWidget("pi-agents", [label + agentChips + hint]);
  }

  pi.on("session_start", (_event, ctx) => {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    // Run once immediately, then every 2s
    updateAgentUI(ctx);
    statusTimer = setInterval(() => updateAgentUI(ctx), 2000);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (statusTimer) {
      clearInterval(statusTimer);
      statusTimer = null;
    }
    // Clear both UI elements on shutdown
    ctx.ui.setStatus("pi-agents", undefined);
    ctx.ui.setWidget("pi-agents", undefined);
  });
}
