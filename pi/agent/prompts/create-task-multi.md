---
description: Distil the current conversation into multiple task specs and write each to disk
argument-hint: "[request]"
---
# Create Multiple Task Specs

${1+Input: $@

Use the input above as the sole source for the task specs. Ignore the conversation history.}${1:-Read the conversation above and distil it into one or more task specification files — one file per distinct task.}

## Step 1 — Identify the tasks

Scan the conversation and identify all distinct, independently executable tasks.
- Each task must have a single clear goal and could be handed to a separate agent.
- If two concerns are tightly coupled (same files, same goal), merge them into one task.
- Minimum: 1 task. No artificial splitting.

## Step 2 — Resolve target directory

- If a project is currently bound, write to: `~/.pi-projects/<project-name>/task-spec/`
- If no project is bound, write to: `~/.pi-projects/_shared/task-spec/`
- Create the directory if it does not exist: `mkdir -p <target-dir>`

## Step 3 — Generate filenames

For each task:
- Produce a short kebab-case slug (max 6 words) summarising that specific task.
- Prefix with today's date: `YYYY-MM-DD-<slug>.md`
- Each file must have a unique slug — no duplicates.

## Step 4 — Write one spec file per task

For each identified task, populate every section using this exact template:

```markdown
---
id: <YYYY-MM-DD-slug>
created: <ISO 8601 timestamp>
project: <bound project name, or _shared>
status: open
---

## Goal
<One sentence — the single clear outcome of this task.>

## Context
<Why this task exists; what problem or conversation thread it came from.>

## Affected Files
- `<path/to/file>` — <what changes and why>
- If unknown: `(unknown — agent must determine)`

## Implementation Plan
1. <First ordered step — concrete and unambiguous>
2. <Second step>
...

## Acceptance Criteria
- [ ] <Concrete, testable condition defining "done">
- [ ] <At least two criteria required>

## Out of Scope
- <Anything explicitly ruled out in the conversation>
- If nothing stated: `(none stated)`
```

Rules for populating sections:
- **Goal** — one sentence, the single outcome
- **Context** — sourced directly from the conversation; do not invent
- **Affected Files** — best-effort from what was discussed; mark unknowns as `(unknown — agent must determine)`
- **Implementation Plan** — ordered, sequential, unambiguous steps
- **Acceptance Criteria** — minimum two testable conditions
- **Out of Scope** — explicit exclusions from the conversation, or `(none stated)`

Write all files before printing any output.

## Step 5 — Confirm to the user

After writing all files, print exactly one line per file:
```
✓ Task spec written to <full absolute path>
<filename>
```

Then print a summary line:
```
<N> task spec(s) created.
```

No other output.
