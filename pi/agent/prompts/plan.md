---
description: Plan a change before writing any code
argument-hint: "<task>"
---
Before any code: plan $@.

Output, as a numbered list:
1. The smallest set of files that need to change, with one line each on what changes.
2. Anything that must NOT change (public API, schema, behavior contracts).
3. Risks or unknowns that should be checked first (and how to check them).
4. Test surface: which tests will catch this, which need to be added.

Stop after the plan. Wait for me to say "go" before editing anything.
