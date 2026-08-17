/**
 * editor.ts — the Vulcan crucible: a framed input editor.
 *
 * The default editor is wrapped in a rounded frame that sits on a filled
 * panel (userMessageBg), capped by ▁/▔ half-block edges. Two Vulcan twists:
 *
 *   · Heat-reactive frame — the border starts as cold iron and heats toward
 *     white-hot as the prompt grows. A chip in the bottom border names the
 *     forge stage and shows the char count.
 *   · Double-press quit guard — pressing the clear key on an empty, idle
 *     editor shows "strike <key> again to quit" instead of exiting at once.
 *
 * Frame-parsing approach (splitting super.render() into content/autocomplete
 * around the parent border lines) is adapted from pi-ui-hephaestus (MIT,
 * Daniel Cherubini) — rebuilt here without the npm dependency.
 */

import {
  CustomEditor,
  type KeybindingsManager,
  type Theme,
} from "@earendil-works/pi-coding-agent";
import {
  type EditorTheme,
  type TUI,
  isKeyRelease,
  truncateToWidth,
  visibleWidth,
} from "@earendil-works/pi-tui";

import { GLYPH, RESET, heatFg, stageFor, stripSgr } from "./forge.js";

const PAD_X = 1;
const PROMPT = GLYPH.prompt; // "⚒ "
const PROMPT_W = 2;
const DOUBLE_PRESS_WINDOW_MS = 550;
const HINT_MARGIN_RIGHT = 3;
const AUTOCOMPLETE_CURSOR = "›";

// Fallbacks when the theme lacks a usable panel bg (near-black + iron gray).
const FALLBACK_PANEL_BG = "\x1b[48;2;18;15;12m";
const COLD_FRAME_T = 0.02;

export interface VulcanEditorHooks {
  getTheme: () => Theme;
  isIdle: () => boolean;
  shutdown: () => void;
  heatFrameEnabled: () => boolean;
}

interface Palette {
  panelBg: string;
  panelEdge: string;
}

function resolvePanel(theme: Theme): Palette {
  let panelBg = FALLBACK_PANEL_BG;
  try {
    const bg = (theme as unknown as { getBgAnsi?: (k: string) => string }).getBgAnsi?.(
      "userMessageBg",
    );
    if (bg) panelBg = bg;
  } catch {
    /* keep fallback */
  }
  // Reuse the bg color as a fg color for the ▁/▔ edge rows.
  const panelEdge = panelBg.startsWith("\x1b[48;")
    ? panelBg.replace("\x1b[48;", "\x1b[38;")
    : "\x1b[38;2;18;15;12m";
  return { panelBg, panelEdge };
}

const isParentBorder = (s: string): boolean => {
  const clean = stripSgr(s);
  return clean.length > 0 && clean[0] === "─";
};

function formatKey(key: string | undefined): string {
  if (!key) return "that key";
  return key
    .split("+")
    .map((part) => (part.length === 1 ? part.toUpperCase() : part[0]!.toUpperCase() + part.slice(1)))
    .join("+");
}

export class VulcanEditor extends CustomEditor {
  private readonly piKeybindings: KeybindingsManager;
  private readonly hooks: VulcanEditorHooks;
  private hintTimer: ReturnType<typeof setTimeout> | undefined;
  private hintMessage: string | undefined;
  private pendingQuitUntil = 0;

  constructor(
    tui: TUI,
    editorTheme: EditorTheme,
    keybindings: KeybindingsManager,
    hooks: VulcanEditorHooks,
  ) {
    super(tui, editorTheme, keybindings);
    this.piKeybindings = keybindings;
    this.hooks = hooks;
  }

  // ── Quit guard ────────────────────────────────────────────────────────────

  private clearHint(resetWindow = true): void {
    clearTimeout(this.hintTimer);
    this.hintTimer = undefined;
    this.hintMessage = undefined;
    if (resetWindow) this.pendingQuitUntil = 0;
    this.tui.requestRender();
  }

  private showHint(message: string): void {
    this.clearHint(false);
    this.hintMessage = message;
    this.tui.requestRender();
    this.hintTimer = setTimeout(() => {
      this.hintMessage = undefined;
      this.hintTimer = undefined;
      this.pendingQuitUntil = 0;
      this.tui.requestRender();
    }, DOUBLE_PRESS_WINDOW_MS);
  }

  override handleInput(data: string): void {
    if (isKeyRelease(data)) {
      super.handleInput(data);
      return;
    }

    if (!this.piKeybindings.matches(data, "app.clear")) {
      this.clearHint();
      super.handleInput(data);
      return;
    }

    const now = Date.now();

    if (this.getText().length > 0) {
      // First press clears the draft and arms the quit window.
      this.clearHint();
      this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
      this.setText("");
      return;
    }

    if (!this.hooks.isIdle()) {
      // Agent is working: let pi's own clear/abort semantics apply.
      this.clearHint();
      super.handleInput(data);
      return;
    }

    if (this.pendingQuitUntil > 0 && now <= this.pendingQuitUntil) {
      this.clearHint();
      this.hooks.shutdown();
      return;
    }

    this.pendingQuitUntil = now + DOUBLE_PRESS_WINDOW_MS;
    this.showHint(
      `strike ${formatKey(this.piKeybindings.getKeys("app.clear")[0])} again to quit`,
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  override render(width: number): string[] {
    try {
      const theme = this.hooks.getTheme();
      const p = resolvePanel(theme);

      const chars = this.getText().length;
      const stage = stageFor(chars);
      const frameT = this.hooks.heatFrameEnabled() ? stage.t : COLD_FRAME_T;
      const frame = (s: string): string => heatFg(frameT, s);
      const dim = (s: string): string => heatFg(0, s);

      const cw = width - PAD_X * 2;
      const inner = cw - 2;
      if (inner < PROMPT_W + 4) return super.render(width);

      const superLines = super.render(cw - PROMPT_W - 1);

      // Locate the parent editor's bottom border: content above, autocomplete below.
      let bottomIdx = superLines.length - 1;
      for (let i = superLines.length - 1; i >= 1; i--) {
        if (isParentBorder(superLines[i]!)) bottomIdx = i;
      }
      const contentLines = superLines.slice(1, bottomIdx);
      const autoLines = superLines
        .slice(bottomIdx + 1)
        .map(
          (line) =>
            " ".repeat(PROMPT_W) +
            truncateToWidth(line.replace("→", AUTOCOMPLETE_CURSOR), cw - PROMPT_W, ""),
        );

      // Top border: ╭───╮
      const topLine = frame("╭" + "─".repeat(inner) + "╮");

      // Bottom border: ╰──── ⚒ stage · Nc ──╮ — chip only once the forge is lit.
      let botLine: string;
      if (chars > 0) {
        const chipPlain = ` ${GLYPH.hammer} ${stage.name} · ${chars}c `;
        const chipW = visibleWidth(chipPlain);
        if (chipW + 6 <= inner) {
          const chip =
            frame(` ${GLYPH.hammer} ${stage.name} `) + dim(`· ${chars}c `);
          botLine =
            frame("╰" + "─".repeat(inner - chipW - 2)) +
            chip +
            frame("─".repeat(2) + "╯");
        } else {
          botLine = frame("╰" + "─".repeat(inner) + "╯");
        }
      } else {
        botLine = frame("╰" + "─".repeat(inner) + "╯");
      }

      const prompt = frame(PROMPT);

      const midLines = contentLines.map((line, i) => {
        if (i !== 0) {
          return " ".repeat(PROMPT_W) + truncateToWidth(line, cw - PROMPT_W, "");
        }
        if (this.hintMessage) {
          const hint = dim(this.hintMessage) + " ".repeat(HINT_MARGIN_RIGHT);
          return (
            prompt +
            truncateToWidth(line, cw - PROMPT_W - visibleWidth(hint), "") +
            hint
          );
        }
        return prompt + truncateToWidth(line, cw - PROMPT_W, "");
      });

      const spacer = autoLines.length > 0 ? [" ".repeat(cw)] : [];
      const raw = [topLine, ...midLines, ...spacer, ...autoLines, botLine];

      // Paint every line onto the panel background, re-arming the bg after
      // any embedded RESET so foreground styling can't punch holes in it.
      const pad = " ".repeat(PAD_X);
      const wrap = (line: string): string => {
        const patched = line.replaceAll(RESET, RESET + p.panelBg);
        return p.panelBg + pad + patched + pad + RESET;
      };

      const topEdge = p.panelEdge + GLYPH.edgeTop.repeat(width) + RESET;
      const botEdge = p.panelEdge + GLYPH.edgeBottom.repeat(width) + RESET;

      return [topEdge, ...raw.map(wrap), botEdge];
    } catch {
      // Any surprise in frame math degrades to the stock editor, never a crash.
      return super.render(width);
    }
  }
}
