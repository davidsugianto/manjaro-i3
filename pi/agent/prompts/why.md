---
description: Root-cause analysis — ask why something happened, find the cause, get the solution
argument-hint: "[what happened]"
---
The user observed: $@

## Procedure

1. **Gather context** — Read relevant files, logs, configs, and recent changes to understand the system and the symptom.
2. **Identify root cause** — Trace backwards from the symptom. Ask "why" at least 3 times. Don't stop at the first cause.
3. **State root cause** — One clear sentence. No hedging. Be precise about which component, line, or condition is responsible.
4. **Explain the chain** — Briefly show how the root cause led to the observed symptom.
5. **Solution** — Provide the smallest fix that resolves the root cause. Include exact steps or code changes.
6. **Prevention** (optional) — If a systemic issue, suggest how to prevent recurrence.

## Rules

- Don't guess — read actual source/config/logs.
- If you're unsure about any part of the chain, say so explicitly.
- Prefer minimal, targeted fixes over refactors unless the root cause demands it.