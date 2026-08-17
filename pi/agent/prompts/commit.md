---
description: Stage and commit current changes with a conventional commit message
argument-hint: "[message-hint]"
---
Stage and commit the current working tree.

Hint from user (optional): $@

Steps:
1. `git status` — show what's about to be staged.
2. `git diff` — read the actual changes (do not commit blind).
3. Group related files; if changes span unrelated topics, stop and tell me which split you would prefer.
4. Stage with `git add` (no `-A` unless every change belongs in this commit).
5. Write a Conventional Commits message:
   - `type(scope): subject` — imperative mood, ≤ 72 chars.
   - Body: what changed and *why*, wrapped at 72.
6. Show the message and run `git commit`. Do not push.

Refuse to commit if the diff is empty.
