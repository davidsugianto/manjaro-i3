import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";

export const MANIFEST_PATH = `${process.env.TMPDIR ?? "/tmp"}/pi-delegate-manifest.json`;

export interface ManifestEntry {
  sessionId: string;   // UUID assigned at spawn time, passed as pi --session-id
  logFile: string;     // /tmp/pi-delegate-N.log
  cwd: string;         // working directory pi was launched in
  spawnedAt: number;   // epoch ms
  prompt: string;      // first ~120 chars of the prompt (for display)
}

export type Manifest = Record<string, ManifestEntry>; // key = tmux session name

export function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Resolve the actual .jsonl session file for a given UUID + cwd.
 * pi stores sessions at:
 *   ~/.pi/agent/sessions/--<cwd-slug>--/<timestamp>_<uuid>.jsonl
 * where cwd-slug replaces every "/" with "-".
 */
export function findSessionFile(sessionId: string, cwd: string | undefined): string | null {
  if (!sessionId || !cwd) return null;
  const slug = cwd.replace(/\//g, "-");
  const sessionsDir = path.join(os.homedir(), ".pi", "agent", "sessions", `--${slug}--`);
  try {
    const files = fs.readdirSync(sessionsDir);
    const match = files.find((f) => f.endsWith(`${sessionId}.jsonl`));
    return match ? path.join(sessionsDir, match) : null;
  } catch {
    return null;
  }
}

/** Read just the session header (first JSONL line) for quick metadata. */
export function readSessionHeader(
  filePath: string
): { id: string; cwd: string; timestamp: string } | null {
  try {
    const firstLine = fs.readFileSync(filePath, "utf8").split("\n")[0];
    return firstLine ? JSON.parse(firstLine) : null;
  } catch {
    return null;
  }
}
