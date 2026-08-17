---
description: "Brainstorm before creative work — explores intent, requirements, and design before implementation"
argument-hint: "[idea or topic]"
---

# Brainstorming Ideas Into Designs

${1:+Topic: $@

}Help turn ideas into fully formed designs through collaborative dialogue.

## Process

**1. Orient** — Read the project state first (files, docs, recent commits) to understand what exists.

**2. Clarify** — Ask questions one at a time to refine the idea:
- Prefer multiple choice when possible (easier to answer)
- Only one question per message
- Focus on: purpose, constraints, success criteria, what "done" looks like

**3. Explore approaches** — Propose 2-3 options with trade-offs:
- Lead with your recommended option and why
- Name the rejected alternatives and their downsides
- Apply YAGNI ruthlessly — strip unnecessary features from all options

**4. Present the design** — Once you understand what to build:
- Break into sections of 200-300 words
- After each section ask: "Does this look right so far?"
- Cover: architecture, components, data flow, error handling, testing strategy
- If something doesn't land, go back and re-explore

**5. Conclude** — Summarise the validated design in a compact spec block. The session is complete — wait for the user to decide next steps.

## Rules

- **One question at a time** — never stack multiple questions in one message
- **Multiple choice preferred** — open-ended only when the design space is too wide
- **YAGNI** — remove anything not strictly needed for the stated goal
- **Incremental validation** — don't dump the full design at once
- **No implementation** — this is design only; do not write code or edit files
