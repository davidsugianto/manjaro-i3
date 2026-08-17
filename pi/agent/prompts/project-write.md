---
description: "Populate all project memory docs for the bound pi-project from current codebase context"
argument-hint: "[project-name]"
---

# Write Project Documentation

Populate the pi-projects memory docs (`~/.pi-projects/<name>/`) for the current or specified project so future sessions have full context.

## Prerequisites

- If `$1` is provided, run `/project use $1` first (or `/project new $1` if it doesn't exist).
- If no argument, use the currently bound project.
- If no project is bound and no argument given, ask which project to use.

## Steps

1. **Gather context** — scan the codebase to understand what this project is:
   - `README.md`, `package.json`, config files
   - Directory structure and key source files
   - Recent git log (`git log --oneline -20`)
   - Any existing docs, ADRs, or architecture files

2. **Set charter fields** — use `project_set` for each:
   - `goal` — one sentence: what this project exists to do
   - `status` — current phase (e.g. "in progress", "planning", "maintenance")
   - `owner` — who owns it
   - `successCriteria` — how you know it's done/working

3. **Write conventions** — use `project_append('conventions', ...)`:
   - Language, framework, runtime versions
   - Naming patterns (files, variables, components)
   - Code style rules (formatting, imports, exports)
   - Testing patterns and expectations
   - Git/branching conventions

4. **Write glossary** — use `project_append('glossary', ...)`:
   - Domain-specific terms and their meanings
   - Abbreviations used in the codebase

5. **Write decisions** — use `project_append('decisions', ...)`:
   - Key architectural choices visible in the code (framework, DB, API style, deployment)
   - Include rationale where inferable

6. **Seed backlog** — use `project_update_todo(action='add', ...)`:
   - Any TODOs, FIXMEs, or obvious next steps found in the code
   - Only add items that are clearly actionable

7. **Journal entry** — use `project_append('journal', ...)`:
   - Record that project docs were initialized/refreshed and summarise what was captured

## Rules

- Only document what is **observable** — do not invent or assume.
- Keep all entries concise: one or two sentences per item.
- If a section has nothing to document, skip it (don't add empty filler).
- Use the pi-projects tools (`project_set`, `project_append`, `project_update_todo`) — do NOT write raw markdown files directly.
- Confirm at the end with a summary of what was documented.
