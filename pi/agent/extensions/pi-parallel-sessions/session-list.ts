import { execSync } from "node:child_process";
import * as fs from "node:fs";
import { readManifest, findSessionFile, type ManifestEntry } from "./manifest";

export type AgentStatus = "running" | "done" | "failed" | "launching" | "dead";

export interface SessionEntry {
  name: string;           // tmux session name
  sessionId: string;      // pi session UUID — hard link to the .jsonl file
  sessionFile: string | null; // resolved path, null if pi hasn't created it yet
  logFile: string;
  cwd: string;
  promptSummary: string;
  status: AgentStatus;
  exitCode: number | null;
  lastLines: string[];    // ANSI-stripped tail of log
  spawnedAt: number;
  elapsedMs: number;
}

const SOCKET = `${process.env.TMPDIR ?? "/tmp"}/claude-tmux-sockets/claude.sock`;
const TAIL_LINES = 14;
const ANSI_RE = /\x1b\[[0-9;]*[mGKHFABCDJsuhl]|\x1b[()][AB012]/g;

function stripAnsi(s: string): string { return s.replace(ANSI_RE, ""); }

function tmuxLiveSessions(): Set<string> {
  try {
    const raw = execSync(
      `tmux -S "${SOCKET}" list-sessions -F "#{session_name}" 2>/dev/null`,
      { encoding: "utf8", timeout: 2000 }
    );
    return new Set(raw.trim().split("\n").filter(Boolean));
  } catch {
    return new Set();
  }
}

function readLogTail(logFile: string): { lines: string[]; sentinelLine: string | null } {
  try {
    const allLines = fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
    // findLast polyfill for older Node versions
    let sentinelLine: string | null = null;
    for (let i = allLines.length - 1; i >= 0; i--) {
      if (allLines[i]!.startsWith("AGENT_DONE:")) {
        sentinelLine = allLines[i]!;
        break;
      }
    }
    return { lines: allLines.map(stripAnsi).slice(-TAIL_LINES), sentinelLine };
  } catch {
    return { lines: [], sentinelLine: null };
  }
}

function tmuxPaneCommand(sessionName: string): string {
  try {
    return execSync(
      `tmux -S "${SOCKET}" list-panes -t "${sessionName}":0 -F "#{pane_current_command}" 2>/dev/null`,
      { encoding: "utf8", timeout: 1000 }
    ).trim();
  } catch { return ""; }
}

export function discoverSessions(filterCwd?: string): SessionEntry[] {
  const manifest = readManifest();
  const liveTmux = tmuxLiveSessions();
  const now = Date.now();

  return Object.entries(manifest)
    .filter(([, entry]) => {
      if (!entry.cwd || !entry.sessionId) return false;
      // Only show agents spawned from the same working directory as this pi session
      if (filterCwd && entry.cwd !== filterCwd) return false;
      return true;
    })
    .map(([sessionName, entry]: [string, ManifestEntry]) => {
    const { lines, sentinelLine } = readLogTail(entry.logFile);
    const isLive = liveTmux.has(sessionName);
    const paneCmd = isLive ? tmuxPaneCommand(sessionName) : "";

    const sessionFile = findSessionFile(entry.sessionId, entry.cwd);

    let status: AgentStatus;
    let exitCode: number | null = null;

    if (sentinelLine) {
      const code = parseInt(sentinelLine.replace("AGENT_DONE:", ""), 10);
      exitCode = isNaN(code) ? 1 : code;
      status = exitCode === 0 ? "done" : "failed";
    } else if (!isLive) {
      status = "dead";
    } else if (paneCmd === "node") {
      status = "running";
    } else if (lines.length === 0) {
      status = "launching";
    } else {
      status = "failed";
    }

    return {
      name: sessionName,
      sessionId: entry.sessionId,
      sessionFile,
      logFile: entry.logFile,
      cwd: entry.cwd,
      promptSummary: entry.prompt,
      status,
      exitCode,
      lastLines: lines,
      spawnedAt: entry.spawnedAt,
      elapsedMs: now - entry.spawnedAt,
    };
  });
}

export function killSession(sessionName: string): void {
  try { execSync(`tmux -S "${SOCKET}" kill-session -t "${sessionName}" 2>/dev/null`); }
  catch {}
}
