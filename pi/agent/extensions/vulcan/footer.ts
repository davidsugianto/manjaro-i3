/**
 * footer.ts — the Vulcan gauge rail.
 *
 *   wide:    ▍dir @branch +2~1?3 ◆ model ◐ medium │ ↑12k ↓3.4k R120k W8k $0.42 ◔8.2s ━━━━╌╌╌ 34%
 *   narrow:  line 1 = place (dir · branch · model · thinking)
 *            line 2 = gauges (tokens · cost · last-turn time · context heat bar)
 *
 * The context bar is a heat gauge: filled cells sweep the forge gradient from
 * iron to white-hot, so "how full is my context" reads at a glance as "how hot
 * is the forge". Git status is cached with a short TTL instead of shelling out
 * on every render (a deliberate improvement over pi-ui-hephaestus).
 */

import { execSync } from "node:child_process";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

import type { VulcanConfig } from "./config.js";
import {
  GLYPH,
  RESET,
  fmtCost,
  fmtDuration,
  fmtTokens,
  heatAt,
  heatFg,
  heatGradient,
  shortenCwd,
} from "./forge.js";

export interface TurnState {
  turnStartedAt: number;
  lastTurnMs: number;
}

// ── Git status (TTL-cached) ──────────────────────────────────────────────────

interface GitStatus {
  staged: number;
  unstaged: number;
  untracked: number;
  ahead: number;
  behind: number;
}

const GIT_TTL_MS = 3000;
let gitCacheAt = 0;
let gitCache: GitStatus = { staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0 };

/** Force the next render to re-query git (e.g. after a branch change). */
export function invalidateGitCache(): void {
  gitCacheAt = 0;
}

function getGitStatus(): GitStatus {
  const now = Date.now();
  if (now - gitCacheAt < GIT_TTL_MS) return gitCache;
  gitCacheAt = now;

  const status: GitStatus = { staged: 0, unstaged: 0, untracked: 0, ahead: 0, behind: 0 };
  try {
    const out = execSync("git status --porcelain=v2 --branch -uall", {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 1500,
    });
    for (const line of out.split("\n")) {
      if (line.startsWith("# branch.ab ")) {
        const m = line.match(/\+(\d+) -(\d+)/);
        if (m) {
          status.ahead = Number(m[1]);
          status.behind = Number(m[2]);
        }
        continue;
      }
      if (line.startsWith("1 ") || line.startsWith("2 ")) {
        const xy = line.slice(2, 4);
        if (xy[0] !== ".") status.staged++;
        if (xy[1] !== ".") status.unstaged++;
      } else if (line.startsWith("? ")) {
        status.untracked++;
      }
    }
  } catch {
    /* not a git repo, or git timed out — show nothing */
  }
  gitCache = status;
  return status;
}

// ── Session stats ────────────────────────────────────────────────────────────

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

function getUsage(ctx: ExtensionContext): Usage {
  const u: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  try {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type === "message" && entry.message.role === "assistant") {
        const usage = (
          entry.message as unknown as {
            usage?: {
              input?: number;
              output?: number;
              cacheRead?: number;
              cacheWrite?: number;
              cost?: { total?: number };
            };
          }
        ).usage;
        if (!usage) continue;
        u.input += usage.input ?? 0;
        u.output += usage.output ?? 0;
        u.cacheRead += usage.cacheRead ?? 0;
        u.cacheWrite += usage.cacheWrite ?? 0;
        u.cost += usage.cost?.total ?? 0;
      }
    }
  } catch {
    /* stats stay zero */
  }
  return u;
}

function getContextPercent(ctx: ExtensionContext): number {
  try {
    const usage = ctx.getContextUsage();
    if (usage?.percent != null) return usage.percent;
  } catch {
    /* fall through */
  }
  return 0;
}

// ── Heat gauge ───────────────────────────────────────────────────────────────

function heatGauge(pct: number, cells: number): string {
  if (cells < 3) return "";
  const filled = pct > 0 ? Math.max(1, Math.round((Math.min(100, pct) / 100) * cells)) : 0;
  let bar = "";
  for (let i = 0; i < filled; i++) {
    const [r, g, b] = heatAt(cells > 1 ? i / (cells - 1) : 0);
    bar += `\x1b[38;2;${r};${g};${b}m${GLYPH.gaugeOn}`;
  }
  bar += RESET;
  if (filled < cells) {
    bar += heatFg(0, GLYPH.gaugeOff.repeat(cells - filled));
  }
  return bar;
}

// ── Footer install ───────────────────────────────────────────────────────────

export function installFooter(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: TurnState,
  cfg: VulcanConfig,
): void {
  ctx.ui.setFooter((tui, theme: Theme, footerData) => {
    const unsubscribe = footerData.onBranchChange(() => {
      invalidateGitCache();
      tui.requestRender();
    });

    return {
      dispose: unsubscribe,
      invalidate(): void {
        /* stateless render — nothing cached across themes */
      },
      render(width: number): string[] {
        try {
          const dim = (s: string): string => theme.fg("dim", s);
          const muted = (s: string): string => theme.fg("muted", s);
          const sep = dim(" │ ");

          // ── Place: dir · branch(+status) · model · thinking ──────────────
          const dir = shortenCwd(process.cwd(), os.homedir(), path.sep);
          const branch = footerData.getGitBranch();

          const placeParts: string[] = [];
          placeParts.push(heatGradient("▍", 0.6, 0.6) + muted(dir));

          if (branch) {
            const g = getGitStatus();
            const marks: string[] = [];
            if (g.staged > 0) marks.push(theme.fg("success", `+${g.staged}`));
            if (g.unstaged > 0) marks.push(theme.fg("warning", `~${g.unstaged}`));
            if (g.untracked > 0) marks.push(dim(`?${g.untracked}`));
            if (g.ahead > 0) marks.push(theme.fg("accent", `↑${g.ahead}`));
            if (g.behind > 0) marks.push(theme.fg("error", `↓${g.behind}`));
            placeParts.push(
              theme.fg("accent", `${GLYPH.branch}${branch}`) +
                (marks.length ? " " + marks.join(" ") : ""),
            );
          }

          placeParts.push(muted(`${GLYPH.model} ${ctx.model?.id ?? "no model"}`));

          const thinking = pi.getThinkingLevel();
          if (thinking && thinking !== "off") {
            placeParts.push(heatFg(0.55, `${GLYPH.thinking} ${thinking}`));
          }

          const place = placeParts.join(sep);

          // ── Gauges: tokens · cost · last turn · context heat ─────────────
          const u = getUsage(ctx);
          const gaugeParts: string[] = [];
          if (u.input) gaugeParts.push(dim(`↑${fmtTokens(u.input)}`));
          if (u.output) gaugeParts.push(dim(`↓${fmtTokens(u.output)}`));
          if (u.cacheRead) gaugeParts.push(dim(`R${fmtTokens(u.cacheRead)}`));
          if (u.cacheWrite) gaugeParts.push(dim(`W${fmtTokens(u.cacheWrite)}`));
          if (u.cost) gaugeParts.push(muted(fmtCost(u.cost)));
          if (state.lastTurnMs > 0) {
            gaugeParts.push(muted(`${GLYPH.clock}${fmtDuration(state.lastTurnMs)}`));
          }
          const gauges = gaugeParts.join(" ");

          const pct = getContextPercent(ctx);
          const pctLabel = heatFg(Math.min(1, pct / 100), `${Math.round(pct)}%`);

          const split = width < cfg.footerSplitWidth;

          if (split) {
            const barCells = Math.max(
              0,
              width - visibleWidth(gauges) - visibleWidth(pctLabel) - 4,
            );
            const line2 =
              gauges +
              (barCells >= 3 ? " " + heatGauge(pct, Math.min(barCells, 28)) : "") +
              " " +
              pctLabel;
            return [
              truncateToWidth(place, width),
              truncateToWidth(" " + line2, width),
            ];
          }

          const fixed = visibleWidth(place) + visibleWidth(sep) + visibleWidth(gauges) + visibleWidth(pctLabel) + 4;
          const barCells = Math.min(28, Math.max(0, width - fixed));
          const line =
            place +
            sep +
            gauges +
            (barCells >= 3 ? " " + heatGauge(pct, barCells) : "") +
            " " +
            pctLabel;
          return [truncateToWidth(line, width)];
        } catch {
          return [];
        }
      },
    };
  });
}
