---
description: Explain a file, function, or symbol in plain language
argument-hint: "<path-or-symbol> [question]"
---
Explain $1.

Additional question or angle: ${@:2}

Read the file or locate the symbol first. Then:
- One paragraph: what this code does and why it exists.
- Inputs / outputs / side effects, listed.
- Non-obvious behavior, edge cases, gotchas.
- Where it is called from (search the repo).

Skip restating the code line by line. Be specific.
