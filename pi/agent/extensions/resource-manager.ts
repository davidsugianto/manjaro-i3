/**
 * Resource Manager Extension
 *
 * /manage-extensions      — list, enable, disable, or toggle extensions
 * /manage-skills          — list, enable, disable, or toggle skills
 * /manage-prompt-templates— list, enable, disable, or toggle prompt templates
 *
 * Enable/disable works by renaming:
 *   Extensions:          name.ts  <->  name.ts.disabled
 *   Skills:              name/    <->  name.disabled/
 *   Prompt Templates:    name.md  <->  name.md.disabled
 *
 * After any change, run /reload to apply.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import * as path from "node:path";

const EXTENSIONS_DIR = path.join(process.env.HOME ?? "~", ".pi", "agent", "extensions");
const SKILLS_DIR = path.join(process.env.HOME ?? "~", ".pi", "agent", "skills");
// Prompt templates live in ~/.pi/agent/prompts (matches info.ts and the README),
// not "prompt-templates" — the old path never existed, so the command was a no-op.
const PROMPT_TEMPLATES_DIR = path.join(process.env.HOME ?? "~", ".pi", "agent", "prompts");
const DISABLED_SUFFIX = ".disabled";
const SELF_NAME = "resource-manager";

// ---------------------------------------------------------------------------
// Extensions
// ---------------------------------------------------------------------------

interface ExtensionEntry {
  name: string;
  fullPath: string;
  enabled: boolean;
}

function getExtensions(): ExtensionEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(EXTENSIONS_DIR);
  } catch {
    return [];
  }

  const entries: ExtensionEntry[] = [];

  for (const filename of files) {
    const fullPath = path.join(EXTENSIONS_DIR, filename);
    try {
      if (fs.statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    if (filename.endsWith(".ts" + DISABLED_SUFFIX)) {
      entries.push({ name: filename.slice(0, -(".ts" + DISABLED_SUFFIX).length), fullPath, enabled: false });
    } else if (filename.endsWith(".ts")) {
      entries.push({ name: filename.slice(0, -".ts".length), fullPath, enabled: true });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function enableExtension(e: ExtensionEntry) {
  fs.renameSync(e.fullPath, path.join(EXTENSIONS_DIR, e.name + ".ts"));
}

function disableExtension(e: ExtensionEntry) {
  fs.renameSync(e.fullPath, path.join(EXTENSIONS_DIR, e.name + ".ts" + DISABLED_SUFFIX));
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

interface SkillEntry {
  name: string;
  fullPath: string;
  enabled: boolean;
}

function getSkills(): SkillEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(SKILLS_DIR);
  } catch {
    return [];
  }

  const entries: SkillEntry[] = [];

  for (const filename of files) {
    const fullPath = path.join(SKILLS_DIR, filename);
    try {
      if (!fs.statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    // enabled:  skill-name/SKILL.md exists
    // disabled: skill-name/.disabled/SKILL.md exists (moved out of Pi's scan path)
    const enabledMd = path.join(fullPath, "SKILL.md");
    const hiddenMd = path.join(fullPath, ".disabled", "SKILL.md");
    if (fs.existsSync(enabledMd)) {
      entries.push({ name: filename, fullPath, enabled: true });
    } else if (fs.existsSync(hiddenMd)) {
      entries.push({ name: filename, fullPath, enabled: false });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

const SKILL_HIDDEN_DIR = ".disabled"; // subdirectory to stash the SKILL.md into

function enableSkill(e: SkillEntry) {
  const hiddenMd = path.join(e.fullPath, SKILL_HIDDEN_DIR, "SKILL.md");
  const enabledMd = path.join(e.fullPath, "SKILL.md");
  fs.renameSync(hiddenMd, enabledMd);
}

function disableSkill(e: SkillEntry) {
  const enabledMd = path.join(e.fullPath, "SKILL.md");
  const hiddenDir = path.join(e.fullPath, SKILL_HIDDEN_DIR);
  const hiddenMd = path.join(hiddenDir, "SKILL.md");
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.renameSync(enabledMd, hiddenMd);
}

// ---------------------------------------------------------------------------
// Prompt Templates
// ---------------------------------------------------------------------------

interface PromptTemplateEntry {
  name: string;
  fullPath: string;
  enabled: boolean;
}

function getPromptTemplates(): PromptTemplateEntry[] {
  let files: string[];
  try {
    files = fs.readdirSync(PROMPT_TEMPLATES_DIR);
  } catch {
    return [];
  }

  const entries: PromptTemplateEntry[] = [];

  for (const filename of files) {
    const fullPath = path.join(PROMPT_TEMPLATES_DIR, filename);
    try {
      if (fs.statSync(fullPath).isDirectory()) continue;
    } catch {
      continue;
    }

    if (filename.endsWith(".md" + DISABLED_SUFFIX)) {
      entries.push({ name: filename.slice(0, -(".md" + DISABLED_SUFFIX).length), fullPath, enabled: false });
    } else if (filename.endsWith(".md")) {
      entries.push({ name: filename.slice(0, -".md".length), fullPath, enabled: true });
    }
  }

  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function enablePromptTemplate(e: PromptTemplateEntry) {
  fs.renameSync(e.fullPath, path.join(PROMPT_TEMPLATES_DIR, e.name + ".md"));
}

function disablePromptTemplate(e: PromptTemplateEntry) {
  fs.renameSync(e.fullPath, path.join(PROMPT_TEMPLATES_DIR, e.name + ".md" + DISABLED_SUFFIX));
}

// ---------------------------------------------------------------------------
// Shared UI: interactive manager for any resource type
// ---------------------------------------------------------------------------

type ResourceEntry = ExtensionEntry | SkillEntry | PromptTemplateEntry;

async function runManager(
  ctx: any,
  label: string,
  entries: ResourceEntry[],
  selfName: string | null,
  enableFn: (e: any) => void,
  disableFn: (e: any) => void,
) {
  if (entries.length === 0) {
    ctx.ui.notify(`No ${label.toLowerCase()} found.`, "info");
    return;
  }

  // Filter self from the list
  const manageable = selfName ? entries.filter(e => e.name !== selfName) : entries;

  while (true) {
    const enabledCount = manageable.filter(e => e.enabled).length;
    const disabledCount = manageable.length - enabledCount;

    const items = manageable.map(e => `${e.enabled ? "✓" : "✗"} ${e.name}${e.enabled ? "" : "  (disabled)"}`);

    const choice = await ctx.ui.select(
      `${label} — ${enabledCount} enabled, ${disabledCount} disabled  (select to toggle)`,
      items,
    );

    if (!choice) return;

    // Extract the name from the display string (strip the leading status prefix)
    const chosenName = choice.replace(/^[✓✗] /, "").replace(/  \(disabled\)$/, "").trim();
    const target = manageable.find(e => e.name === chosenName);
    if (!target) return;

    try {
      if (target.enabled) {
        const confirmed = await ctx.ui.confirm("Disable", `Disable "${target.name}"?`);
        if (!confirmed) continue;
        disableFn(target);
        target.enabled = false;
        ctx.ui.notify(`✓ Disabled: ${target.name} — run /reload to apply`, "info");
      } else {
        enableFn(target);
        target.enabled = true;
        ctx.ui.notify(`✓ Enabled: ${target.name} — run /reload to apply`, "info");
      }
    } catch (err: any) {
      ctx.ui.notify(`Failed: ${err.message}`, "error");
    }
  }
}

// ---------------------------------------------------------------------------
// Extension entry point
// ---------------------------------------------------------------------------

export default function resourceManager(pi: ExtensionAPI) {

  pi.registerCommand("manage-extensions", {
    description: "List, enable, and disable extensions",
    handler: async (_args, ctx) => {
      const entries = getExtensions();
      await runManager(ctx, "Extensions", entries, SELF_NAME, enableExtension, disableExtension);
    },
  });

  pi.registerCommand("manage-skills", {
    description: "List, enable, and disable skills",
    handler: async (_args, ctx) => {
      const entries = getSkills();
      await runManager(ctx, "Skills", entries, null, enableSkill, disableSkill);
    },
  });

  pi.registerCommand("manage-prompt-templates", {
    description: "List, enable, and disable prompt templates",
    handler: async (_args, ctx) => {
      const entries = getPromptTemplates();
      await runManager(ctx, "Prompt Templates", entries, null, enablePromptTemplate, disablePromptTemplate);
    },
  });
}
