/**
 * forge.ts — Vulcan's visual vocabulary.
 *
 * A truecolor "heat" ramp (cold iron → white-hot gold), gradient helpers,
 * glyphs, and small formatters shared by the editor, footer, and splash.
 *
 * Everything here is pure string math — no pi imports, no I/O — so it is
 * trivially safe to call from render() loops.
 */

export const RESET = "\x1b[0m";

// ── Heat ramp ────────────────────────────────────────────────────────────────
// t=0 is untouched iron, t=1 is white-hot. Interpolated, so any t in [0,1]
// resolves to a smooth molten color.

type Rgb = readonly [number, number, number];

const HEAT_RAMP: readonly Rgb[] = [
  [87, 83, 78], // iron
  [120, 53, 15], // scorched
  [180, 83, 9], // heated
  [234, 88, 12], // ember
  [249, 115, 22], // molten
  [251, 146, 60], // pouring
  [251, 191, 36], // gold
  [253, 230, 138], // white-hot
];

function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

function lerp(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Interpolate the heat ramp at t ∈ [0,1]. */
export function heatAt(t: number): Rgb {
  const x = clamp01(t) * (HEAT_RAMP.length - 1);
  const i = Math.min(HEAT_RAMP.length - 2, Math.floor(x));
  const f = x - i;
  const [r1, g1, b1] = HEAT_RAMP[i]!;
  const [r2, g2, b2] = HEAT_RAMP[i + 1]!;
  return [lerp(r1, r2, f), lerp(g1, g2, f), lerp(b1, b2, f)];
}

export function fgRgb(rgb: Rgb, text: string): string {
  return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m${text}${RESET}`;
}

/** Color text at a single heat level. */
export function heatFg(t: number, text: string): string {
  return fgRgb(heatAt(t), text);
}

/**
 * Per-character heat gradient across plain (ANSI-free) text,
 * sweeping from t0 at the first char to t1 at the last.
 */
export function heatGradient(text: string, t0: number, t1: number): string {
  const chars = Array.from(text);
  if (chars.length === 0) return "";
  if (chars.length === 1) return heatFg(t0, text);
  let out = "";
  for (let i = 0; i < chars.length; i++) {
    const t = t0 + ((t1 - t0) * i) / (chars.length - 1);
    const [r, g, b] = heatAt(t);
    out += `\x1b[38;2;${r};${g};${b}m${chars[i]}`;
  }
  return out + RESET;
}

// ── Forge stages ─────────────────────────────────────────────────────────────
// The editor frame heats up as the prompt grows. Stage names show in the chip.

export interface ForgeStage {
  name: string;
  t: number;
}

const STAGES: readonly ForgeStage[] = [
  { name: "cold", t: 0.04 },
  { name: "warming", t: 0.28 },
  { name: "ember", t: 0.5 },
  { name: "molten", t: 0.72 },
  { name: "white-hot", t: 0.95 },
];

/** Map prompt length (chars) to a forge stage. Full heat around ~480 chars. */
export function stageFor(chars: number): ForgeStage {
  if (chars <= 0) return STAGES[0]!;
  const t = clamp01(chars / 480);
  const idx = Math.min(STAGES.length - 1, 1 + Math.floor(t * (STAGES.length - 1)));
  return STAGES[idx]!;
}

// ── Glyphs ───────────────────────────────────────────────────────────────────
// Single-cell, non-emoji glyphs only: width math must agree with visibleWidth.

export const GLYPH = {
  hammer: "⚒",
  sparks: ["·", "✦", "✧", "˖"] as readonly string[],
  prompt: "⚒ ",
  branch: "@",
  model: "◆",
  thinking: "◐",
  clock: "◔",
  gaugeOn: "━",
  gaugeOff: "╌",
  edgeTop: "▁",
  edgeBottom: "▔",
} as const;

// ── Deterministic sparks ─────────────────────────────────────────────────────
// A tiny LCG so the splash's spark field is stable per (frame, row) — no
// Math.random in render paths, no flicker disagreements between renders.

export function sparkSeed(frame: number, row: number): () => number {
  let s = (frame * 2654435761 + row * 40503 + 12345) >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

// ── Formatters ───────────────────────────────────────────────────────────────

export function fmtTokens(n: number): string {
  const K = 1024;
  const M = K * K;
  if (n < K) return `${n}`;
  if (n < K * 10) return `${(n / K).toFixed(1)}k`;
  if (n < M) return `${Math.round(n / K)}k`;
  if (n < M * 10) return `${(n / M).toFixed(1)}M`;
  return `${Math.round(n / M)}M`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export function fmtCost(cost: number): string {
  return `$${cost.toFixed(2)}`;
}

/** ~/dir/…/leaf form of a cwd, never longer than 4 segments. */
export function shortenCwd(cwd: string, home: string, sep: string): string {
  let p = cwd;
  if (p === home) return "~";
  if (p.startsWith(home + sep)) p = "~" + p.slice(home.length);
  const parts = p.split(sep);
  if (parts.length <= 4) return p;
  return [parts[0], "…", parts[parts.length - 2], parts[parts.length - 1]]
    .filter(Boolean)
    .join(sep);
}

/** Strip SGR color codes (for structural char checks, not width math). */
export function stripSgr(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}
