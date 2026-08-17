---
description: Refactor code for clarity and structure without changing behaviour — pin behaviour with tests first, then improve in small verified steps
argument-hint: "<file, symbol, or area to refactor>"
---
Refactor: $@

Behaviour must not change. Follow this order:

1. **Pin behaviour first.** Identify (or add) tests that cover the current behaviour of the target. If coverage is thin, write characterization tests before touching anything, and run them green.
2. **Name the smells.** Long functions (>50 lines), large files (>800 lines), deep nesting (>4 levels), duplication, mutation, magic numbers, unclear names.
3. **Refactor in small steps.** One transformation at a time (extract function, introduce constant, replace mutation with immutable update, split file by responsibility). Re-run tests after each step.
4. **Prefer immutable patterns** — return new values rather than mutating in place.
5. **Verify.** Tests stay green; behaviour is identical; the diff is reviewable.

Do not mix refactoring with feature changes or bug fixes in the same pass. If you find a bug, note it separately — do not silently fix it.
