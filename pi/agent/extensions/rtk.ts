// RTK Pi extension — rewrites bash commands + injects RTK instructions via system prompt.
// Requires: rtk >= 0.23.0 in PATH.
//
// Two independent features:
//   1. Bash rewriting — always active (intercepts tool_call bash events)
//   2. RTK prompt injection — toggled via /rtk on|off, defaults to on

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { isToolCallEventType } from "@earendil-works/pi-coding-agent"

const REWRITE_TIMEOUT_MS = 2_000
const MIN_SUPPORTED_RTK_MINOR = 23

// ── Semver helpers ──────────────────────────────────────────────────────────

function parseSemver(raw: string): [number, number, number] | null {
  const m = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

// ── Rewrite (bash interception) ────────────────────────────────────────────

async function rewriteCommand(
  pi: ExtensionAPI,
  cmd: string,
  signal?: AbortSignal
): Promise<string | null> {
  const result = await pi.exec("rtk", ["rewrite", cmd], {
    timeout: REWRITE_TIMEOUT_MS,
    signal,
  })
  if (result.killed) return null
  if (result.code !== 0 && result.code !== 3) return null
  return result.stdout.trim() || null
}

// ── RTK system prompt instructions ─────────────────────────────────────────

const RTK_INSTRUCTIONS = `<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with \`rtk\`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with \`&&\`, use \`rtk\`:
\`\`\`bash
# Wrong
git add . && git commit -m "msg" && git push

# Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
\`\`\`

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
\`\`\`bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file
rtk tsc                 # TypeScript errors grouped by file/code
rtk lint                # ESLint/Biome violations grouped
rtk prettier --check    # Files needing format only
rtk next build          # Next.js build with route metrics
\`\`\`

### Test (60-99% savings)
\`\`\`bash
rtk cargo test          # Cargo test failures only
rtk go test             # Go test failures only
rtk jest                # Jest failures only
rtk vitest              # Vitest failures only
rtk playwright test     # Playwright failures only
rtk pytest              # Python test failures only
rtk test <cmd>          # Generic test wrapper - failures only
\`\`\`

### Git (59-80% savings)
\`\`\`bash
rtk git status          # Compact status
rtk git log             # Compact log
rtk git diff            # Compact diff
rtk git show            # Compact show
rtk git add             # Ultra-compact confirmations
rtk git commit          # Ultra-compact confirmations
rtk git push            # Ultra-compact confirmations
\`\`\`

### GitHub (26-87% savings)
\`\`\`bash
rtk gh pr view <num>    # Compact PR view
rtk gh pr checks        # Compact PR checks
rtk gh run list         # Compact workflow runs
rtk gh issue list       # Compact issue list
\`\`\`

### JavaScript/TypeScript Tooling (70-90% savings)
\`\`\`bash
rtk pnpm list           # Compact dependency tree
rtk pnpm outdated       # Compact outdated packages
rtk pnpm install        # Compact install output
rtk npm run <script>    # Compact npm script output
rtk prisma              # Prisma without ASCII art
\`\`\`

### Files & Search (60-75% savings)
\`\`\`bash
rtk ls <path>           # Tree format, compact
rtk read <file>         # Code reading with filtering
rtk grep <pattern>      # Search grouped by file
rtk find <pattern>      # Find grouped by directory
\`\`\`

### Infrastructure (85% savings)
\`\`\`bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
\`\`\`

### Meta Commands
\`\`\`bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
\`\`\`

## Token Savings Overview
Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->`

// ── Main extension ─────────────────────────────────────────────────────────

export default async function (pi: ExtensionAPI) {
  let promptEnabled = true  // default: RTK instructions injected
  let isAgentActive = false
  let lastCtx: any = null

  // ── Status bar ─────────────────────────────────────────────────────────

  function syncStatus(ctx?: any) {
    if (ctx) lastCtx = ctx
    const c = ctx || lastCtx
    if (!c?.ui?.setStatus || !c.ui.theme?.fg) return
    const theme = c.ui.theme

    if (!promptEnabled) {
      c.ui.setStatus("rtk", "")
      return
    }

    const indicator = isAgentActive ? theme.fg("accent", "●") : theme.fg("dim", "○")
    c.ui.setStatus("rtk", indicator + " " + theme.fg("muted", "rtk: ") + theme.fg("text", "⚡ ON"))
  }

  // ── /rtk command ──────────────────────────────────────────────────────

  pi.registerCommand("rtk", {
    description: "Toggle RTK prompt injection on/off, or show status",
    handler: async (args, ctx) => {
      const input = String(args || "").trim().toLowerCase()

      if (input === "" || input === "status") {
        const state = promptEnabled ? "on (prompt injected)" : "off (bash rewriting still active)"
        ctx?.ui?.notify?.(`RTK: ${state}`, "info")
        return
      }

      if (input === "on" || input === "enable") {
        if (promptEnabled) {
          ctx?.ui?.notify?.("RTK prompt is already on.", "info")
          return
        }
        promptEnabled = true
        pi.appendEntry("rtk-prompt", { enabled: true })
        syncStatus(ctx)
        ctx?.ui?.notify?.("RTK prompt enabled. Instructions will be injected next agent start.", "info")
        return
      }

      if (input === "off" || input === "disable") {
        if (!promptEnabled) {
          ctx?.ui?.notify?.("RTK prompt is already off.", "info")
          return
        }
        promptEnabled = false
        pi.appendEntry("rtk-prompt", { enabled: false })
        syncStatus(ctx)
        ctx?.ui?.notify?.("RTK prompt disabled. Bash rewriting still active.", "info")
        return
      }

      ctx?.ui?.notify?.("Usage: /rtk [on|off|status]", "warning")
    },
  })

  // ── Session persistence ───────────────────────────────────────────────

  pi.on("session_start", async (_event, ctx) => {
    // Restore state from session entries
    const entries = ctx?.sessionManager?.getBranch?.() || ctx?.sessionManager?.getEntries?.() || []
    if (Array.isArray(entries)) {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        const entry = entries[i]
        if (entry?.type === "custom" && entry?.customType === "rtk-prompt") {
          promptEnabled = entry?.data?.enabled !== false
          break
        }
      }
    }
    syncStatus(ctx)
  })

  pi.on("agent_start", async (_event, ctx) => {
    isAgentActive = true
    syncStatus(ctx)
  })

  pi.on("agent_end", async (_event, ctx) => {
    isAgentActive = false
    syncStatus(ctx)
  })

  // ── Prompt injection ─────────────────────────────────────────────────

  pi.on("before_agent_start", async (event) => {
    if (!promptEnabled) return
    return { systemPrompt: `${event.systemPrompt}\n\n${RTK_INSTRUCTIONS}` }
  })

  // ── Probe rtk binary ─────────────────────────────────────────────────

  const ver = await pi.exec("rtk", ["--version"], { timeout: REWRITE_TIMEOUT_MS })
  if (ver.code !== 0) {
    console.warn("[rtk] rtk binary not found in PATH — bash rewriting disabled")
    return
  }

  const parsed = parseSemver(ver.stdout.replace(/^rtk\s+/, ""))
  if (parsed) {
    const [major, minor] = parsed
    if (major === 0 && minor < MIN_SUPPORTED_RTK_MINOR) {
      console.warn(`[rtk] rtk ${ver.stdout.trim()} is too old (need >= 0.23.0) — bash rewriting disabled`)
      return
    }
  }

  // ── Bash rewriting (always on, independent of prompt toggle) ─────────

  pi.on("tool_call", async (event, ctx) => {
    try {
      if (!isToolCallEventType("bash", event)) return

      const cmd = event.input.command
      if (typeof cmd !== "string" || cmd.trim() === "") return

      if (cmd.startsWith("rtk ")) return
      if (process.env.RTK_DISABLED === "1") return

      const rewritten = await rewriteCommand(pi, cmd, ctx.signal)
      if (rewritten && rewritten !== cmd) {
        event.input.command = rewritten
      }
    } catch (err) {
      console.warn("[rtk] unexpected error in tool_call handler; passing through command", err)
      return
    }
  })
}