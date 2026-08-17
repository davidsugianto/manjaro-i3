# pi-projects — Manual Smoke Test

## Setup
- Install location: ~/.pi/agent/extensions/pi-projects/
- Optional: PI_PROJECTS_ROOT=/tmp/pi-projects-test pi   (use a throwaway projects root for testing)

## Test 1: Create + bind
1. Run: pi
2. /project new demo
3. Verify: ls ~/.pi-projects/demo/  (or PI_PROJECTS_ROOT) shows charter.md, backlog.md, journal.md, lessons.md, decisions.md, glossary.md, conventions.md, .meta.json
4. Verify footer shows "📁 demo".

## Test 2: System prompt injection
1. Bind a project (Test 1).
2. Send: "What project am I working on? Read project memory."
3. Expect: agent answers with project name without needing a tool call (Project Memory block is in the system prompt).
4. Optional: enable a `before_provider_request` debug extension to dump the payload, or grep the session jsonl for the system prompt.

## Test 3: Tools
1. Send: "Add a todo: write tests."
   - Expect project_update_todo(action=add) tool call.
   - Verify backlog.md contains "- [ ] #1 write tests" between the fenced markers.
2. Send: "Mark todo #1 done."
   - Verify backlog.md updated to "- [x] #1 write tests".
3. Send: "Append a journal entry: completed the todo."
   - Verify journal.md gained a "### <iso-ts> ..." section with the content.
4. Send: "Set the project goal to 'Build pi-projects extension'."
   - Verify charter.md goal field updated between fenced markers.
5. Send: "Read the charter."
   - Expect project_read(doc=charter) tool call.

## Test 4: Resume persistence
1. Exit pi.
2. Re-launch pi and /resume the same session.
3. Verify footer still shows "📁 demo" (binding rehydrated from session entries).

## Test 5: Missing-dir recovery
1. With a bound project, exit pi.
2. Manually rm -rf ~/.pi-projects/demo/
3. Re-launch and /resume that session.
4. Verify a notification appears that the project no longer exists, and footer is empty.

## Test 6: Concurrency
1. Bind a project.
2. Ask the agent: "Append three journal entries in parallel: A, B, C."
3. Verify all three "### " sections exist in journal.md, no truncation, no overlapping content.

## Test 7: Validation
1. /project new ../evil   -> must refuse with a name validation error.
2. /project new ""        -> must refuse.
3. /project use nonexistent -> must refuse.

## Test 8: List + status
1. Create a second project "demo2".
2. /project list -> shows both with open-todo counts and updated time.
3. /project status -> shows bound project + counts.

## Cleanup
- rm -rf ~/.pi-projects/demo ~/.pi-projects/demo2
