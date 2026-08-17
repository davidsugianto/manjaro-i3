import type { Todo } from "./types";
import * as store from "./store";
import * as docs from "./docs";

export const MAX_BLOCK_CHARS = 2000;

const WORKFLOW_RULES_ALWAYS = `
### Project workflow rules (follow on every turn)
- START of task → call project_read() to load full context before planning anything.
- COMPLETING a step → call project_append('journal', ...) summarising what you did and why.
- SURPRISING finding / pitfall → call project_append('lessons', ...) with a reusable lesson.
- NON-OBVIOUS decision / trade-off → call project_append('decisions', ...) with context + rationale.
- PROJECT BACKLOG item discovered → call project_update_todo(action='add', text='...'). Only use this for persistent cross-session project work items, not quick personal todos.
- FINISHING a PROJECT BACKLOG item → call project_update_todo(action='complete', id=N).
- PROJECT GOAL or STATUS changes → call project_set(field, value).
- For quick personal todos ("remind me", "add a todo", "track this") → use the regular todo tool, not project_update_todo.
Never skip the project memory steps — they are how all agents share memory across sessions.
`.trim();

/** Used when the project was manually bound (no .pi-project file). Don't force project_read on every turn. */
const WORKFLOW_RULES_ON_DEMAND = `
### Project workflow rules (apply when working on project tasks)
- When the task is project-related → call project_read() to load full context before planning.
- COMPLETING a step → call project_append('journal', ...) summarising what you did and why.
- SURPRISING finding / pitfall → call project_append('lessons', ...) with a reusable lesson.
- NON-OBVIOUS decision / trade-off → call project_append('decisions', ...) with context + rationale.
- PROJECT BACKLOG item discovered → call project_update_todo(action='add', text='...'). Only use this for persistent cross-session project work items, not quick personal todos.
- FINISHING a PROJECT BACKLOG item → call project_update_todo(action='complete', id=N).
- PROJECT GOAL or STATUS changes → call project_set(field, value).
- For quick personal todos ("remind me", "add a todo", "track this") → use the regular todo tool, not project_update_todo.
`.trim();

const CHARTER_FIELDS = ["goal", "status", "owner", "successCriteria"] as const;
type CharterField = (typeof CHARTER_FIELDS)[number];

function extractField(content: string, field: string): string {
  const start = `<!-- field:${field}:start -->`;
  const end = `<!-- field:${field}:end -->`;
  const i = content.indexOf(start);
  if (i === -1) return "";
  const j = content.indexOf(end, i + start.length);
  if (j === -1) return "";
  return content.slice(i + start.length, j).trim();
}

function parseCharter(content: string): Record<CharterField, string> {
  const out = {} as Record<CharterField, string>;
  for (const f of CHARTER_FIELDS) {
    const v = extractField(content, f).trim();
    out[f] = v.length > 0 ? v : "(unset)";
  }
  return out;
}

function splitSections(content: string): string[] {
  const parts = content.split("### ");
  // First part is preface, ignore it.
  return parts.slice(1);
}

function summarizeSection(section: string): string {
  const lines = section.split("\n");
  const header = (lines[0] ?? "").trim();
  let preview = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length > 0) {
      preview = line;
      break;
    }
  }
  if (preview.length > 100) {
    preview = preview.slice(0, 100);
  }
  return `${header} — ${preview}`;
}

async function safeRead(name: string, doc: string): Promise<string | { error: true }> {
  try {
    return await store.readDoc(name, doc);
  } catch {
    return { error: true };
  }
}

export async function buildSystemPromptBlock(name: string, autobound = false): Promise<string> {
  const lines: string[] = [];
  lines.push(`## Project Memory: ${name}`);

  // Charter
  const charterRes = await safeRead(name, "charter");
  let goal = "(unset)";
  let status = "(unset)";
  if (typeof charterRes === "string") {
    const fields = parseCharter(charterRes);
    goal = fields.goal;
    status = fields.status;
    lines.push(`Goal: ${goal}`);
    lines.push(`Status: ${status}`);
  } else {
    lines.push(`Goal: ${goal}`);
    lines.push(`Status: ${status}`);
    lines.push("(error reading charter)");
  }

  // Backlog
  lines.push("");
  lines.push("Open todos (top 10):");
  const backlogRes = await safeRead(name, "backlog");
  if (typeof backlogRes === "string") {
    let items: Todo[] = [];
    try {
      items = docs.parseBacklog(backlogRes);
    } catch {
      lines.push("(error reading backlog)");
      items = [];
    }
    const open = items.filter((it) => it.status === "open").slice(0, 10);
    if (open.length === 0) {
      lines.push("  (none)");
    } else {
      for (const it of open) {
        lines.push(`- [ ] #${it.id} ${it.text}`);
      }
    }
  } else {
    lines.push("(error reading backlog)");
  }

  // Journal
  lines.push("");
  lines.push("Recent journal (last 5):");
  const journalRes = await safeRead(name, "journal");
  if (typeof journalRes === "string") {
    const sections = splitSections(journalRes);
    const recent = sections.slice(-5);
    if (recent.length === 0) {
      lines.push("  (none)");
    } else {
      for (const s of recent) {
        lines.push(`- ${summarizeSection(s)}`);
      }
    }
  } else {
    lines.push("(error reading journal)");
  }

  // Lessons
  lines.push("");
  lines.push("Recent lessons (last 5):");
  const lessonsRes = await safeRead(name, "lessons");
  if (typeof lessonsRes === "string") {
    const sections = splitSections(lessonsRes);
    const recent = sections.slice(-5);
    if (recent.length === 0) {
      lines.push("  (none)");
    } else {
      for (const s of recent) {
        lines.push(`- ${summarizeSection(s)}`);
      }
    }
  } else {
    lines.push("(error reading lessons)");
  }

  // Decisions
  lines.push("");
  lines.push("Recent decisions (last 3):");
  const decisionsRes = await safeRead(name, "decisions");
  if (typeof decisionsRes === "string") {
    const sections = splitSections(decisionsRes);
    const recent = sections.slice(-3);
    if (recent.length === 0) {
      lines.push("  (none)");
    } else {
      for (const s of recent) {
        lines.push(`- ${summarizeSection(s)}`);
      }
    }
  } else {
    lines.push("(error reading decisions)");
  }

  lines.push("");
  lines.push(autobound ? WORKFLOW_RULES_ALWAYS : WORKFLOW_RULES_ON_DEMAND);

  let output = lines.join("\n");
  if (output.length > MAX_BLOCK_CHARS) {
    output = output.slice(0, MAX_BLOCK_CHARS - 20) + "\n…(truncated)";
  }
  return output;
}
