import type { TUI, Theme } from "@earendil-works/pi-tui";
import { matchesKey, Key, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { discoverSessions, killSession, type SessionEntry, type AgentStatus } from "./session-list";
import { spawnSync } from "node:child_process";

const REFRESH_INTERVAL_MS = 1000;
const LOG_VISIBLE_LINES = 12;
const PREVIEW_LINES = 2;

const SOCKET = `${process.env.TMPDIR ?? "/tmp"}/claude-tmux-sockets/claude.sock`;

function statusBadge(status: AgentStatus, theme: Theme): string {
  switch (status) {
    case "running":   return theme.fg("accent",  "●");
    case "done":      return theme.fg("success", "✓");
    case "failed":    return theme.fg("error",   "✗");
    case "launching": return theme.fg("muted",   "…");
    case "dead":      return theme.fg("dim",     "○");
  }
}

function elapsedStr(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60}s`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

export class ParallelSessionsPanel {
  private tui: TUI;
  private theme: Theme;
  private done: () => void;

  private sessions: SessionEntry[] = [];
  private selectedIdx: number = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private logScrollOffset: number = 0;

  private cachedWidth?: number;
  private cachedLines?: string[];

  private cwd: string;

  constructor(tui: TUI, theme: Theme, done: () => void, cwd: string) {
    this.tui = tui;
    this.theme = theme;
    this.done = done;
    this.cwd = cwd;

    this.refresh();

    this.timer = setInterval(() => {
      this.refresh();
      this.invalidate();
      this.tui.requestRender();
    }, REFRESH_INTERVAL_MS);
  }

  private refresh(): void {
    this.sessions = discoverSessions(this.cwd);
    if (this.sessions.length > 0) {
      this.selectedIdx = Math.min(this.selectedIdx, this.sessions.length - 1);
    }
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.escape)) {
      this.close();
      return;
    }

    if (matchesKey(data, Key.up)) {
      this.selectedIdx = Math.max(0, this.selectedIdx - 1);
      this.logScrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.down)) {
      this.selectedIdx = Math.min(this.sessions.length - 1, this.selectedIdx + 1);
      this.logScrollOffset = 0;
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.shift("up"))) {
      this.logScrollOffset = Math.max(0, this.logScrollOffset - 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.shift("down"))) {
      const sel = this.sessions[this.selectedIdx];
      const maxScroll = sel ? Math.max(0, sel.lastLines.length - LOG_VISIBLE_LINES) : 0;
      this.logScrollOffset = Math.min(maxScroll, this.logScrollOffset + 1);
      this.invalidate();
      this.tui.requestRender();
      return;
    }

    if (matchesKey(data, Key.enter)) {
      const sel = this.sessions[this.selectedIdx];
      if (sel) {
        this.attachToSession(sel.name);
      }
      return;
    }

    if (data === "d") {
      const sel = this.sessions[this.selectedIdx];
      if (sel) {
        killSession(sel.name);
        this.refresh();
        this.invalidate();
        this.tui.requestRender();
      }
      return;
    }

    if (data === "r") {
      this.refresh();
      this.invalidate();
      this.tui.requestRender();
      return;
    }
  }

  private attachToSession(sessionName: string): void {
    this.tui.stop();
    process.stdout.write("\x1b[2J\x1b[H");

    spawnSync("tmux", ["-S", SOCKET, "attach", "-t", sessionName], {
      stdio: "inherit",
      env: process.env,
    });

    this.tui.start();
    this.tui.requestRender(true);
  }

  private close(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.done();
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width) return this.cachedLines;
    this.cachedWidth = width;
    this.cachedLines = this.buildLines(width);
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedLines = undefined;
  }

  private buildLines(width: number): string[] {
    const th = this.theme;
    const inner = width - 2;
    const lines: string[] = [];

    const hr = th.fg("border", "─".repeat(inner));
    const border = (content: string) =>
      th.fg("border", "│") + content + th.fg("border", "│");

    const pad = (content: string): string => {
      const vw = visibleWidth(content);
      return content + " ".repeat(Math.max(0, inner - vw));
    };

    // ── Header ──────────────────────────────────────────────────────────────
    const running = this.sessions.filter((s) => s.status === "running" || s.status === "launching").length;
    const done = this.sessions.filter((s) => s.status === "done" || s.status === "failed").length;
    const total = this.sessions.length;

    const boldFn = (th as any).bold as ((s: string) => string) | undefined;
    const boldText = (s: string) => boldFn ? boldFn(s) : s;

    const title = th.fg("accent", boldText(" ⚡ Agents "));
    const badge = th.fg("dim", ` ${running} running · ${done}/${total} done `);
    const headerContent = truncateToWidth(title + badge, inner);
    lines.push(th.fg("border", "╭" + "─".repeat(inner) + "╮"));
    lines.push(border(pad(headerContent)));
    lines.push(th.fg("border", "├" + hr + "┤"));

    // ── Session list ────────────────────────────────────────────────────────
    if (this.sessions.length === 0) {
      lines.push(border(pad(th.fg("dim", "  No delegate sessions found"))));
      lines.push(border(pad(th.fg("dim", "  Run /delegate to spawn agents"))));
    } else {
      for (let i = 0; i < this.sessions.length; i++) {
        const s = this.sessions[i]!;
        const isSelected = i === this.selectedIdx;
        const badge = statusBadge(s.status, th);
        const elapsed = th.fg("dim", elapsedStr(s.elapsedMs));
        const nameText = isSelected
          ? th.fg("accent", s.name)
          : th.fg("text", s.name);
        const prefix = isSelected ? th.fg("accent", " ▶ ") : "   ";
        const row1 = truncateToWidth(
          `${prefix}${badge} ${nameText}  ${elapsed}`,
          inner
        );
        lines.push(border(pad(row1)));

        for (let p = 0; p < PREVIEW_LINES; p++) {
          const logLine = s.lastLines[s.lastLines.length - PREVIEW_LINES + p] ?? "";
          const preview = th.fg("dim", "    " + logLine);
          lines.push(border(pad(truncateToWidth(preview, inner))));
        }
      }
    }

    // ── Log pane ─────────────────────────────────────────────────────────────
    lines.push(th.fg("border", "├" + hr + "┤"));
    const sel = this.sessions[this.selectedIdx];
    const logTitle = sel
      ? th.fg("muted", ` ${sel.name} · log tail `)
      : th.fg("muted", " no session selected ");
    lines.push(border(pad(truncateToWidth(logTitle, inner))));

    if (sel && sel.lastLines.length > 0) {
      const visLines = sel.lastLines.slice(
        this.logScrollOffset,
        this.logScrollOffset + LOG_VISIBLE_LINES
      );
      for (const l of visLines) {
        const colored =
          l.startsWith("AGENT_DONE:0")
            ? th.fg("success", l)
            : l.startsWith("AGENT_DONE:")
            ? th.fg("error", l)
            : th.fg("dim", l);
        lines.push(border(pad(truncateToWidth(colored, inner))));
      }
      for (let p = visLines.length; p < LOG_VISIBLE_LINES; p++) {
        lines.push(border(" ".repeat(inner)));
      }
    } else {
      for (let p = 0; p < LOG_VISIBLE_LINES; p++) {
        const msg = p === 2 && sel
          ? th.fg("dim", "  (no log output yet)")
          : p === 2 && !sel
          ? th.fg("dim", "  (select a session above)")
          : "";
        lines.push(border(pad(msg)));
      }
    }

    // ── Footer ───────────────────────────────────────────────────────────────
    lines.push(th.fg("border", "├" + hr + "┤"));
    const footerText = th.fg("dim",
      " ↑↓ select  enter attach  d kill  ⇧↑↓ scroll log  r refresh  esc close "
    );
    lines.push(border(pad(truncateToWidth(footerText, inner))));
    lines.push(th.fg("border", "╰" + "─".repeat(inner) + "╯"));

    return lines;
  }
}
