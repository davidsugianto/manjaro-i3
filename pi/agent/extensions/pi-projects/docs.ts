import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { DocId, Todo } from "./types";
import * as store from "./store";

export const BACKLOG_FENCE_START = "<!-- todos:start -->";
export const BACKLOG_FENCE_END = "<!-- todos:end -->";

export const CHARTER_FIELDS = ["goal", "status", "owner", "successCriteria"] as const;

const charterTemplate = `# Charter
<!-- pi-projects:charter -->

## How to use
This document captures the immutable spine of the project: its goal, current status, owner, and success criteria. AI agents should read this first to ground every decision, and update fields via the \`setCharterField\` helper rather than rewriting the file freehand. Keep each field terse and declarative so the charter remains scannable.

## Goal
<!-- field:goal:start -->

<!-- field:goal:end -->

## Status
<!-- field:status:start -->

<!-- field:status:end -->

## Owner
<!-- field:owner:start -->

<!-- field:owner:end -->

## Success Criteria
<!-- field:successCriteria:start -->

<!-- field:successCriteria:end -->
`;

const backlogTemplate = `# Backlog
<!-- pi-projects:backlog -->

## How to use
This is the canonical todo list for the project. AI agents should read and write the items inside the fenced block using \`parseBacklog\` and \`serializeBacklog\`; never edit raw lines outside that contract. Each item has an id, a status (\`[ ]\` open, \`[x]\` done, \`[!]\` blocked), and a short imperative description.

${BACKLOG_FENCE_START}

${BACKLOG_FENCE_END}
`;

const journalTemplate = `# Journal
<!-- pi-projects:journal -->

## How to use
Append-only log of what happened, when, and why. AI agents should add a dated entry whenever meaningful progress, blockers, or context shifts occur, and never rewrite past entries. Keep entries short, factual, and oriented toward future readers who lack the current context.

`;

const lessonsTemplate = `# Lessons
<!-- pi-projects:lessons -->

## How to use
Durable lessons learned that should outlive any single task. AI agents should record patterns, pitfalls, and surprises here once they are confirmed, not speculation. Phrase each lesson so it is reusable in future projects.

`;

const decisionsTemplate = `# Decisions
<!-- pi-projects:decisions -->

## How to use
Lightweight ADR-style record of decisions made: context, choice, and consequences. AI agents should add a new decision whenever a non-trivial trade-off is locked in, and reference prior decisions before proposing changes. Do not retroactively edit a recorded decision; supersede it with a new entry instead.

`;

const glossaryTemplate = `# Glossary
<!-- pi-projects:glossary -->

## How to use
Project-specific vocabulary so humans and AI agents share the same meanings. Add a term the first time ambiguity appears, keep definitions one or two sentences, and prefer concrete examples over abstract prose. Update entries when the meaning genuinely shifts.

`;

const conventionsTemplate = `# Conventions
<!-- pi-projects:conventions -->

## How to use
Coding, naming, and process conventions that apply within this project. AI agents should consult this file before generating code or proposing structure, and add a new convention only when a pattern has been used at least twice. Keep rules prescriptive and easy to follow.

`;

export const TEMPLATES: Record<DocId, string> = {
  charter: charterTemplate,
  backlog: backlogTemplate,
  journal: journalTemplate,
  lessons: lessonsTemplate,
  decisions: decisionsTemplate,
  glossary: glossaryTemplate,
  conventions: conventionsTemplate,
};

const DOC_ORDER: DocId[] = [
  "charter",
  "backlog",
  "journal",
  "lessons",
  "decisions",
  "glossary",
  "conventions",
];

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function seedProject(name: string): Promise<void> {
  const dir = store.projectDir(name);

  const charterPath = path.join(dir, "charter.md");
  if (await pathExists(charterPath)) {
    throw new Error(`Project "${name}" already exists`);
  }

  await fs.mkdir(dir, { recursive: true });

  for (const doc of DOC_ORDER) {
    const filePath = path.join(dir, `${doc}.md`);
    if (!(await pathExists(filePath))) {
      await store.writeDoc(name, doc, TEMPLATES[doc]);
    }
  }

  const metaFilePath = path.join(dir, ".meta.json");
  if (!(await pathExists(metaFilePath))) {
    const now = Date.now();
    await store.writeMeta(name, {
      name,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    });
  }
}

export function parseBacklog(md: string): Todo[] {
  const startIdx = md.indexOf(BACKLOG_FENCE_START);
  const endIdx = md.indexOf(BACKLOG_FENCE_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return [];
  }

  const inner = md.slice(startIdx + BACKLOG_FENCE_START.length, endIdx);
  const lines = inner.split("\n");
  const todos: Todo[] = [];
  const now = Date.now();

  const re = /^\s*-\s*\[([ x!])\]\s*#(\d+)\s+(.*\S)\s*$/;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const mark = m[1];
    const id = Number(m[2]);
    const text = m[3];
    let status: Todo["status"];
    if (mark === "x") status = "done";
    else if (mark === "!") status = "blocked";
    else status = "open";
    todos.push({ id, text, status, createdAt: now });
  }

  return todos;
}

export function serializeBacklog(md: string, todos: Todo[]): string {
  const startIdx = md.indexOf(BACKLOG_FENCE_START);
  const endIdx = md.indexOf(BACKLOG_FENCE_END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return md;
  }

  const before = md.slice(0, startIdx + BACKLOG_FENCE_START.length);
  const after = md.slice(endIdx);

  const body = todos
    .map((t) => {
      const mark = t.status === "done" ? "x" : t.status === "blocked" ? "!" : " ";
      return `- [${mark}] #${t.id} ${t.text}`;
    })
    .join("\n");

  const middle = body.length > 0 ? `\n${body}\n` : "\n\n";
  return before + middle + after;
}

export function setCharterField(
  content: string,
  field: typeof CHARTER_FIELDS[number],
  value: string,
): string {
  const startMarker = `<!-- field:${field}:start -->`;
  const endMarker = `<!-- field:${field}:end -->`;
  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return content;
  }

  const before = content.slice(0, startIdx + startMarker.length);
  const after = content.slice(endIdx);

  return `${before}\n${value}\n${after}`;
}
