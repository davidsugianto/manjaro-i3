---
description: Review staged or unstaged git changes
argument-hint: "[scope]"
---
Review my git changes. Default to `git diff --cached`; if it is empty, fall back to `git diff` against the current branch's tracking base.

Scope hint from user: $@

Surface, in this order:
1. Bugs and logic errors (with line refs)
2. Error-handling and nullability gaps
3. Public API or schema breakage
4. Security concerns (auth, injection, secrets, PII)
5. Test coverage gaps for the changed behavior

Skip cosmetic notes unless they hide a real issue. End with a short verdict: ship / revise / block.
