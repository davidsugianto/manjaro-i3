---
name: tui-revamp
description: Guides the agent to build, install, or customize the Pi terminal user interface (TUI). Use this skill when the user wants a new skin, better status footers, custom spinner animations, boxed input frames, or Catppuccin/Shiki themed code blocks.
license: MIT
compatibility: pi-mono >= 1.0.0
---

# Pi TUI Revamp & Styling Skill

This skill provides blueprints, templates, and procedures to transform the Pi TUI into an information-rich, visually polished command center. It covers both custom extension boilerplate and installation of premium community themes.

## 🔒 Backup Protocol (ALWAYS run first)

Before ANY visual change, snapshot the current UI so the user can switch back:

```bash
BK=~/.pi/agent/ui-backup-$(date +%Y-%m-%d)
mkdir -p "$BK"
cp -R ~/.pi/agent/extensions "$BK/extensions"
cp -R ~/.pi/agent/themes "$BK/themes"
cp ~/.pi/agent/settings.json ~/.pi/agent/keybindings.json "$BK/"
```

A ready restore script for the pre-revamp aurora UI lives at
`~/.pi/agent/ui-backup-2026-07-04/restore.sh` — running it swaps the old UI
back (and snapshots the current one first, so restore is itself reversible).

**Switching chrome: use `/ui`.** The `ui-manager` extension
(`extensions/ui-manager/index.ts`, always on) is the single owner that enables
exactly one chrome at a time. `/ui` opens a picker (● marks the active one);
`/ui <name>` switches directly to `original | halcyon | aurora | vulcan`. It
toggles each chrome's entry file between its enabled and `.disabled` name, sets
the paired theme, and calls `ctx.reload()` to apply live — no manual `/reload`.
"original" parks every chrome for pi's stock UI. Only ever enable chrome files
through this manager (or by hand, one at a time) — two active chromes fight
over the header/footer/editor.

Current state (2026-07-04): the active chrome is **vulcan**
(`extensions/vulcan/` + `themes/vulcan.json`, settings `theme: "vulcan"`) —
a from-source rebuild of pi-ui-hephaestus with a forge visual language.
Tune it with `/vulcan`. The previous aurora chrome is parked at
`extensions/aurora.ts.disabled` with its `aurora-green` theme still installed;
swap the renames and set `theme` back to restore it by hand, or run the
backup's `restore.sh` for a full reset.

## 🛠️ Custom TUI Blueprint (TypeScript Extension)

Ground truth for the extension API is the working local chrome at
`~/.pi/agent/extensions/aurora.ts` and `halcyon-chrome.ts.disabled` — read
them before writing new chrome. Key rules (from pi's docs/tui.md):

- Import `ExtensionAPI` from `@earendil-works/pi-coding-agent` and width
  helpers (`truncateToWidth`, `visibleWidth`) from `@earendil-works/pi-tui`.
- NEVER write raw ANSI to `process.stdout` — it fights pi's renderer. Use
  `setWorkingIndicator`, `setHeader`, `setFooter`, and theme `fg`/`bg` tokens.
- Every `render()` line must be width-clamped and wrapped in try/catch so a
  render exception degrades to a blank line instead of crashing the loop.
- NEVER call `setWorkingIndicator` on `reason: "reload"` (documented hang).
- Own animation timers via the component's `dispose()` so they never leak.
- Register `pi.on()` / `registerCommand()` once at top level so `/reload`
  never stacks handlers.

### Custom Animated Working Indicator (sketch)

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  const frames = ["󰪞", "󰪟", "󰪠", "󰪡", "󰪢", "󰪣", "󰪤", "󰪥"];
  // Drive frames from the working-indicator component's own timer and
  // clean it up in dispose(); style via theme.fg("accent", frame).
}
```

### Unicode Boxed Editor Template

For structured input frames, use box-drawing characters inside pi's editor
chrome (see `editorPaddingX` in settings.json):

```text
╭──────────────────────────────────────────╮
│ Your message content goes here...        │
╰──────────────────────────────────────────╯
```

## 📦 Instant Ecosystem Boosters

Production-ready overhauls, verified on npm:

| Package | Highlighted Features | Setup Command |
| --- | --- | --- |
| **`pi-ui-hephaestus`** | Framed input editor pane with double-press quit guards; muted thinking/reasoning blocks; Shiki-powered side-by-side diff views; inline clipboard image pasting. | `pi install npm:pi-ui-hephaestus` |
| **`@rokiy/pi-ui`** | Pre-mapped 24-color Catppuccin Mocha palette; responsive 2-line footer tracking model, tokens, and cost; 3-tone stall-detecting spinner. | `pi install npm:@rokiy/pi-ui` |
| **`pi-cyber-ui`** | Cyber-inspired theme, custom editor, footer, lightweight working indicator. | `pi install npm:pi-cyber-ui` |
| **`amp-themes`** | Amp-inspired suite: theme, editor chrome, compact tool display. | `pi install npm:amp-themes` |

⚠️ Package chrome and the local `aurora.ts` chrome will both draw headers/
footers if active together. When installing a package, disable the local
chrome first (`mv aurora.ts aurora.ts.disabled`, same for `aurora-deck.ts`),
and re-enable it to switch back.

## 📋 Agent Action Protocol

1. **Backup first**: run the Backup Protocol above before any change.
2. **Discover intent**: bespoke TypeScript extension vs. pre-packaged theme.
3. **Deconflict**: disable overlapping local chrome extensions before
   activating package chrome (and vice versa).
4. **Execute**: install/write, then `/reload` to activate.
5. **Enforce responsiveness**: compute available width from pi's render
   context and gracefully strip blocks below 100 columns.
6. **Offer rollback**: after every change, remind the user of the restore
   script and the rename-to-`.disabled` toggle.
