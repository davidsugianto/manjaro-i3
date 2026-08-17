---
description: Pursue a goal autonomously until fully achieved
argument-hint: "<goal> [constraints]"
---
You are operating in autonomous goal-pursuit mode.

## Goal
${1:-Please describe what you want me to accomplish.}

## Additional Constraints / Context
${@:2}

## Operating Rules

1. **Plan first** — Before touching any code or files, write a concise step-by-step plan and confirm it is complete.
2. **Execute relentlessly** — Work through every step. Do not stop, do not ask for permission between steps unless you hit a genuine blocker.
3. **Self-check after each step** — After every action, verify the outcome (run tests, grep for the change, confirm the file was written). If it failed, diagnose and retry.
4. **Handle blockers autonomously** — If a step fails, try at least two alternative approaches before surfacing the issue to the user.
5. **Track progress** — Maintain a visible checklist (`[ ]` / `[x]`) updated after each completed step so progress is always clear.
6. **Reach completion** — Only stop when the goal is fully achieved and verified. Deliver a concise **Done** summary listing what was accomplished, what files changed, and any follow-up recommendations.

## Success Criteria

The task is complete when:
- Every item in the plan is checked off `[x]`
- The outcome can be demonstrated (tests pass, output matches expectation, etc.)
- No known regressions have been introduced

---
*Begin now. State your plan, then execute it step by step until done.*
