---
description: Generate or extend tests for a module, with realistic cases
argument-hint: "<path-or-symbol>"
---
Write or extend tests for $1.

Detect the test framework already in use (pytest, jest, vitest, testng, junit, go test, …) and match its conventions. Do not introduce a new framework.

Cover, in order of value:
1. The happy path with one realistic input.
2. Boundary cases (empty, max, off-by-one, unicode if relevant).
3. Failure paths and error types.
4. Any branch the existing implementation has but tests do not.

Run the test suite when done and report the result.
