---
description: Open a pull request from the current branch — analyse full history, draft summary + test plan, push, then create the PR
argument-hint: "[base-branch]"
---
Open a pull request for the current branch. Base branch is `$1` if given, else the repo default (`main`/`master`).

Follow every step:

1. **Refuse on the base branch.** If `HEAD` is the base branch itself, print `✗ On <base> — create a feature branch first.` and stop.
2. **Analyse the full diff**, not just the latest commit:
   ```bash
   git fetch origin <base>
   git log --oneline <base>..HEAD
   git diff <base>...HEAD --stat
   ```
3. **Draft the PR body** from the whole commit range:
   - **Summary** — what changed and why (2-4 sentences)
   - **Changes** — bulleted, grouped by area
   - **Test plan** — concrete checklist of what was/should be verified
4. **Push** with `-u` if the branch has no upstream: `git push -u origin HEAD`.
5. **Create the PR** with `gh pr create --base <base> --title "<conventional-commit-style title>" --body "<body>"`.
6. Print the PR URL. Do **not** merge.

Title follows Conventional Commits (`feat:`, `fix:`, `refactor:`, …). Never include credentials or internal secrets in the body.
