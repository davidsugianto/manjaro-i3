---
description: Security review of a diff or area — secrets, injection, authz, data exposure, OWASP Top 10 — with severity-ranked findings
argument-hint: "[scope: staged | branch | path]"
---
Security-review the requested scope (`$1`, default = staged diff). Read the code before judging.

Check, in priority order:

1. **Secrets** — hardcoded API keys, tokens, passwords, connection strings, internal account IDs.
2. **Injection** — SQL/command/template injection, unescaped shell args, unsanitized `innerHTML`/`dangerouslySetInnerHTML`.
3. **AuthN / AuthZ** — missing or bypassable access control, role/credential checks, IDOR.
4. **Data exposure** — confidential internal data (financials, strategy, employee/customer/partner records, booking data) leaking into logs, errors, external calls, or unauthorized parties.
5. **Input validation** — untrusted input crossing a boundary without validation.
6. **Crypto / transport** — weak algorithms, missing TLS, predictable randomness.

For each finding: `severity (CRITICAL/HIGH/MEDIUM/LOW) · file:line · one-line problem · concrete fix`.

End with a verdict: **block** (any CRITICAL), **warn** (HIGH only), or **clear**. If a secret is already committed, flag it for rotation, not just removal.
