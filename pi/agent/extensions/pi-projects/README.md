# pi-projects

> Persistent per-project memory for pi AI agents.

## What it does

`pi-projects` gives pi a durable, structured memory that survives across sessions and agents. When you bind a session to a project, the extension creates `~/.pi-projects/<name>/` populated with a small set of structured markdown documents (charter, backlog, journal, lessons, decisions, glossary, conventions). On every turn it auto-injects a compact "Project Memory" digest into the system prompt, and it exposes a handful of LLM-callable tools so any agent in any pi session can read and append to the same docs — enabling continuous, cross-session collaboration without manually copy-pasting context between runs.

## Install

- **Location:** `~/.pi/agent/extensions/pi-projects/` — auto-discovered as a directory extension via its `index.ts` entrypoint.
- **Dependencies:** none to install. Uses only Node built-ins, `typebox`, `@earendil-works/pi-ai`, and `@earendil-works/pi-tui` (all already provided by pi).
- **Activate:** copy the files into the directory above and run `/reload` inside pi.

## Project layout

When you run `/project new <name>`, the extension seeds the following tree under `~/.pi-projects/<name>/`:

```
~/.pi-projects/<name>/
├── charter.md       # Goal, status, owner, success criteria.
│                    # Editable. Structured fields live between
│                    # HTML-comment fences (e.g. <!-- goal:start -->).
├── backlog.md       # Structured todo list. Items live between
│                    # <!-- todos:start --> and <!-- todos:end -->.
├── journal.md       # Append-only, timestamped activity log
│                    # ("what was done", milestones, hand-offs).
├── lessons.md       # Append-only lessons learned
│                    # (surprises, gotchas, "next time…" notes).
├── decisions.md     # Append-only ADR-lite entries
│                    # (decision + context + rationale + consequences).
├── glossary.md      # Domain terms, acronyms, and named entities.
├── conventions.md   # Coding style, process rules, naming conventions.
└── .meta.json       # { name, createdAt, updatedAt, schemaVersion }
```

All files are plain Markdown — safe to read, diff, edit by hand, or commit to git.

## Commands

| Command                | Description                                  |
| ---------------------- | -------------------------------------------- |
| `/project new <name>`  | Create a new project and bind this session. |
| `/project use <name>`  | Bind this session to an existing project.    |
| `/project list`        | List all known projects.                     |
| `/project status`      | Show the bound project plus item counts.     |
| `/project unbind`      | Remove the project binding from this session.|
| `/project path`        | Print the absolute path of the bound project.|

## Tools (LLM-callable)

The extension registers four tools that any agent in a bound session can call:

- **`project_read(doc?)`** — read one document (`charter`, `backlog`, `journal`, `lessons`, `decisions`, `glossary`, `conventions`) or, with no argument, return all of them.
- **`project_append(doc, content, title?)`** — append a timestamped entry to one of the append-only docs: `journal`, `lessons`, `decisions`, `glossary`, or `conventions`. Optional `title` becomes the entry heading.
- **`project_update_todo(action, text?, id?)`** — manage the backlog. `action` is one of `add`, `complete`, `reopen`, `list`, `remove`.
- **`project_set(field, value)`** — set a charter field. `field` is one of `goal`, `status`, `owner`, `successCriteria`.

## How agents should use this

Treat the project store as the **canonical** record of the work; treat your own context window as scratch space.

- **At the start of any task:** call `project_read('charter')` and `project_read('backlog')` to ground yourself in the current goal and outstanding work.
- **After completing a meaningful step:** call `project_append('journal', ...)` so the next agent (or the next session) can pick up where you left off.
- **When something surprising happens:** call `project_append('lessons', ...)` — failures, footguns, and "the docs lied" moments are exactly the things future-you will want to know.
- **For non-obvious choices:** call `project_append('decisions', ...)` with rationale, alternatives considered, and consequences.
- **As the project moves:** keep `charter.status` honest with `project_set('status', ...)`.

## Configuration

- **`PI_PROJECTS_ROOT`** — override the root directory where projects are stored. Defaults to `~/.pi-projects`.

## Limitations

- The injected **Project Memory** digest is capped at roughly **1,500 characters per turn** to protect the context budget. Long backlogs and journals are truncated in the digest — agents should call `project_read` explicitly when they need full content.
- Backlog round-tripping depends on the stable HTML-comment fences (`<!-- todos:start -->` / `<!-- todos:end -->`). **Do not delete them** when hand-editing.
- This is a **single-user local store**. There is no remote sync. If you want history, run `git init` inside the project directory — every doc is plain Markdown and diffs cleanly.

## Files in this extension

- `index.ts` — entrypoint; manages binding state, injects the system prompt, and renders the status footer.
- `types.ts` — shared types.
- `store.ts` — atomic filesystem layer (read/write/append with safe rename semantics).
- `docs.ts` — document templates, parsers, and `seedProject`.
- `prompt.ts` — builder for the Project Memory digest.
- `tools.ts` — the four LLM-callable tools.
- `commands.ts` — `/project` command implementation and `ProjectListComponent`.
- `__test__/manual.md` — manual smoke-test checklist.
