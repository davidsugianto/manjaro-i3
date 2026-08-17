---
description: Diagnose what just went wrong in the last command, error, or test failure
argument-hint: "[paste-or-hint]"
---
Something broke. Help me understand it.

Context the user gave: $@

Procedure:
1. If a stack trace is in scope, read it top-to-bottom and locate the originating frame in the repo.
2. Open the file at that frame. Read 30 lines around it.
3. State the actual cause in one sentence. No hedging.
4. Propose a fix (smallest change that resolves the cause).
5. If the cause could affect other call sites, name them.

Don't propose a fix until step 3 is concrete.
