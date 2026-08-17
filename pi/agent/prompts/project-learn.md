---
description: "Distill the current session into project memory — lessons, conventions, glossary, decisions, and a journal entry"
---

# Project Learn

Reflect on everything that happened in this session and write it into the bound project's memory docs so future sessions start smarter.

## Prerequisites

- A project must be bound. If none is bound, ask which project to use (or run `/project use <name>`).
- Do NOT invent — only document what was **actually observed, decided, or learned** in this session.

## Steps

Work through each doc below. If a category has nothing new, skip it entirely — never write filler.

### 1. Lessons (`lessons`)
Use `project_append('lessons', ...)` for each lesson learned:
- Unexpected errors, gotchas, or traps hit during this session
- Workarounds discovered (and why the straightforward path failed)
- Tool/library quirks that cost time
- Things that would have saved time if known upfront

### 2. Conventions (`conventions`)
Use `project_append('conventions', ...)` for any **new or refined** patterns established:
- Coding patterns or idioms adopted during this session
- File/naming conventions that were clarified or introduced
- Test patterns, build steps, or workflow rules followed
- Only add if genuinely new — don't re-document what's already there

### 3. Glossary (`glossary`)
Use `project_append('glossary', ...)` for new terms coined or clarified:
- Domain terms or abbreviations introduced in this session
- Any concept whose meaning was ambiguous and got resolved

### 4. Decisions (`decisions`)
Use `project_append('decisions', ...)` for non-obvious choices made:
- Architecture, library, or design choices made in this session
- Include: what was chosen, what was rejected, and why

### 5. Backlog (`project_update_todo`)
Use `project_update_todo(action='add', ...)` for actionable follow-ups:
- Bugs found but not fixed
- Improvements deferred intentionally
- TODOs that surfaced during this session
- Mark completed items with `project_update_todo(action='complete', id=...)`

### 6. Journal (`journal`)
Use `project_append('journal', ...)` — one entry summarising the session:
- What was built, fixed, or explored
- What changed and why (not just *that* it happened)
- Current state of the work at end of session

## Rules

- Be **specific** — vague entries like "fixed a bug" are useless; name the bug.
- Keep entries **concise**: 1–3 sentences per item.
- One `project_append` call per distinct item — don't batch unrelated things into one entry.
- Prioritise **lessons** and **decisions** — these have the highest future value.
- End with a short confirmation listing what was written to which docs.
