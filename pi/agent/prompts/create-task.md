---
description: Distil the current conversation into a task spec and write it to disk
argument-hint: "[request]"
---
# Create Task Spec

${1+Input: $@

Use the input above as the sole source for the task spec. Ignore the conversation history.}${1:-Read the conversation above and distil it into a task specification file.}

## Step 1 — Resolve target directory

- If a project is currently bound, write to: `~/.pi-projects/<project-name>/task-spec/`
- If no project is bound, write to: `~/.pi-projects/_shared/task-spec/`
- Create the directory if it does not exist: `mkdir -p <target-dir>`

## Step 2 — Generate the filename

- Produce a short kebab-case slug (max 6 words) summarising the task from the conversation.
- Prefix with today's date: `YYYY-MM-DD-<slug>.md`
- Example: `2026-06-22-add-pagination-to-user-list.md`

## Step 3 — Write the spec file

Populate every section using this exact template:

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

## Step 4 — Confirm to the user

After writing the file, print exactly:
```
✓ Task spec written to <full absolute path>
<filename>
```

No other output.
