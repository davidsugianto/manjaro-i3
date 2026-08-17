import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import * as store from "./store";
import * as docs from "./docs";
import type { DocId, Todo } from "./types";

const READ_DOCS = ["charter", "backlog", "journal", "lessons", "decisions", "glossary", "conventions"] as const;
const APPEND_DOCS = ["journal", "lessons", "decisions", "glossary", "conventions"] as const;
const TODO_ACTIONS = ["add", "complete", "reopen", "list", "remove"] as const;
const SET_FIELDS = ["goal", "status", "owner", "successCriteria"] as const;

const ProjectReadParams = Type.Object({
  doc: Type.Optional(StringEnum([...READ_DOCS] as unknown as readonly [string, ...string[]])),
});

const ProjectAppendParams = Type.Object({
  doc: StringEnum([...APPEND_DOCS] as unknown as readonly [string, ...string[]]),
  content: Type.String(),
  title: Type.Optional(Type.String()),
});

const ProjectTodoParams = Type.Object({
  action: StringEnum([...TODO_ACTIONS] as unknown as readonly [string, ...string[]]),
  text: Type.Optional(Type.String()),
  id: Type.Optional(Type.Number()),
});

const ProjectSetParams = Type.Object({
  field: StringEnum([...SET_FIELDS] as unknown as readonly [string, ...string[]]),
  value: Type.String(),
});

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)) + "…";
}

function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null) continue;
    let val: string;
    if (typeof v === "string") {
      val = v.length > 24 ? `"${v.slice(0, 23)}…"` : `"${v}"`;
    } else {
      val = String(v);
    }
    parts.push(`${k}=${val}`);
  }
  return truncate(parts.join(" "), 60);
}

function notBoundResult() {
  return {
    content: [{ type: "text" as const, text: "No project bound. Run /project use <name>." }],
    details: { error: "no project bound" },
    isError: true,
  };
}

function firstLines(text: string, n: number): string {
  const lines = text.split("\n");
  if (lines.length <= n) return text;
  return lines.slice(0, n).join("\n");
}

export function registerProjectTools(pi: ExtensionAPI, getBound: () => string | null): void {
  // ---------- project_read ----------
  pi.registerTool({
    name: "project_read",
    label: "Project Read",
    description: "Read project memory docs (charter, backlog, journal, lessons, decisions, glossary, conventions).",
    promptSnippet:
      "Read project memory docs (charter, backlog, journal, lessons, decisions, glossary, conventions)",
    promptGuidelines: [
      "Use project_read() at the START of every task — before planning or writing any code — to load the charter, backlog, and recent history.",
      "If the user mentions a project name or domain you don't recognise, call project_read() immediately to orient yourself.",
    ],
    parameters: ProjectReadParams,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const name = getBound();
      if (!name) return notBoundResult();
      try {
        if (params.doc) {
          const content = await store.readDoc(name, params.doc as DocId);
          return {
            content: [{ type: "text", text: content }],
            details: { doc: params.doc, full: true },
          };
        }
        const parts: string[] = [];
        for (const d of READ_DOCS) {
          let body = "";
          try {
            body = await store.readDoc(name, d);
          } catch {
            body = "";
          }
          parts.push(`\n=== ${d}.md ===\n` + firstLines(body, 40));
        }
        return {
          content: [{ type: "text", text: parts.join("\n") }],
          details: { doc: null, full: false },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
    renderCall(args, theme, _ctx) {
      return new Text(
        theme.fg("toolTitle", theme.bold("project_read ")) +
          theme.fg("muted", summarizeArgs(args ?? {})),
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme, _ctx) {
      if (result.isError) {
        const t = result.content[0];
        const msg = t?.type === "text" ? t.text : "error";
        return new Text(theme.fg("error", msg), 0, 0);
      }
      const t = result.content[0];
      const text = t?.type === "text" ? t.text : "";
      if (expanded) return new Text(text, 0, 0);
      const head = firstLines(text, 5);
      const total = text.split("\n").length;
      const more = total > 5 ? `\n${theme.fg("dim", `… ${total - 5} more lines`)}` : "";
      return new Text(head + more, 0, 0);
    },
  });

  // ---------- project_append ----------
  pi.registerTool({
    name: "project_append",
    label: "Project Append",
    description:
      "Append a timestamped entry to a project memory doc (journal, lessons, decisions, glossary, conventions).",
    promptGuidelines: [
      "Use project_append('journal', ...) after EVERY meaningful step — summarise what changed and why, not just that it happened.",
      "Use project_append('lessons', ...) whenever you hit an unexpected error, workaround, or gotcha that future agents should know.",
      "Use project_append('decisions', ...) for any non-obvious choice (library, architecture, naming) — include the alternatives you rejected.",
    ],
    parameters: ProjectAppendParams,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const name = getBound();
      if (!name) return notBoundResult();
      const ts = new Date().toISOString();
      const header = `\n\n### ${ts}${params.title ? " — " + params.title : ""}\n`;
      const block = header + params.content + "\n";
      try {
        await store.appendDoc(name, params.doc as DocId, block);
        return {
          content: [
            { type: "text", text: `Appended to ${params.doc}.md at ${ts}` },
          ],
          details: { doc: params.doc, ts, title: params.title },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          details: { doc: params.doc, ts, title: params.title, error: msg },
          isError: true,
        };
      }
    },
    renderCall(args, theme, _ctx) {
      return new Text(
        theme.fg("toolTitle", theme.bold("project_append ")) +
          theme.fg("muted", summarizeArgs(args ?? {})),
        0,
        0,
      );
    },
    renderResult(result, _opts, theme, _ctx) {
      if (result.isError) {
        const t = result.content[0];
        const msg = t?.type === "text" ? t.text : "error";
        return new Text(theme.fg("error", msg), 0, 0);
      }
      const d = (result.details ?? {}) as { doc?: string };
      return new Text(
        theme.fg("success", "✓ ") + theme.fg("muted", String(d.doc ?? "")),
        0,
        0,
      );
    },
  });

  // ---------- project_update_todo ----------
  pi.registerTool({
    name: "project_update_todo",
    label: "Project Todo",
    description:
      "Manage the project's persistent backlog (add, complete, reopen, list, remove).",
    promptGuidelines: [
      "Use project_update_todo ONLY for persistent project backlog items that should survive across sessions (architecture tasks, feature work, bugs). When the user says 'project todo', 'add to backlog', or 'track this for the project', use project_update_todo.",
      "For quick personal todos ('remind me', 'add a todo', 'todo: check X') use the regular todo tool instead — it is the default.",
      "Use project_update_todo(action='complete') when you finish a project backlog item.",
    ],
    parameters: ProjectTodoParams,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const name = getBound();
      if (!name) return notBoundResult();

      try {
        const outcome = await store.withMutex(name, "backlog", async () => {
          const raw = await store.readDoc(name, "backlog").catch(() => "");
          const todos: Todo[] = docs.parseBacklog(raw);
          let message = "";
          let error: string | undefined;

          switch (params.action) {
            case "add": {
              if (!params.text) {
                error = "text required for add";
                break;
              }
              const nextId =
                todos.reduce((m, t) => (t.id > m ? t.id : m), 0) + 1;
              const now = Date.now();
              todos.push({
                id: nextId,
                text: params.text,
                status: "open",
                createdAt: now,
              });
              message = `Added #${nextId}: ${params.text}`;
              break;
            }
            case "complete": {
              if (params.id === undefined) {
                error = "id required for complete";
                break;
              }
              const t = todos.find((x) => x.id === params.id);
              if (!t) {
                error = `#${params.id} not found`;
                break;
              }
              t.status = "done";
              t.completedAt = Date.now();
              message = `Completed #${t.id}`;
              break;
            }
            case "reopen": {
              if (params.id === undefined) {
                error = "id required for reopen";
                break;
              }
              const t = todos.find((x) => x.id === params.id);
              if (!t) {
                error = `#${params.id} not found`;
                break;
              }
              t.status = "open";
              t.completedAt = undefined;
              message = `Reopened #${t.id}`;
              break;
            }
            case "remove": {
              if (params.id === undefined) {
                error = "id required for remove";
                break;
              }
              const before = todos.length;
              const filtered = todos.filter((x) => x.id !== params.id);
              if (filtered.length === before) {
                error = `#${params.id} not found`;
                break;
              }
              todos.length = 0;
              for (const t of filtered) todos.push(t);
              message = `Removed #${params.id}`;
              break;
            }
            case "list": {
              message =
                todos.length === 0
                  ? "No todos"
                  : `${todos.length} todo(s)`;
              // read-only: do not write
              return { todos, message, error, mutated: false };
            }
            default:
              error = `unknown action: ${String(params.action)}`;
          }

          if (error) {
            return { todos, message, error, mutated: false };
          }
          if (params.action !== "list") {
            const serialized = docs.serializeBacklog(raw, todos);
            await store.writeDoc(name, "backlog", serialized);
          }
          return { todos, message, error, mutated: true };
        });

        const text =
          (outcome.error ? `Error: ${outcome.error}` : outcome.message) ||
          "ok";
        return {
          content: [{ type: "text", text }],
          details: {
            action: params.action,
            todos: outcome.todos,
            error: outcome.error,
          },
          isError: !!outcome.error,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          details: { action: params.action, todos: [], error: msg },
          isError: true,
        };
      }
    },
    renderCall(args, theme, _ctx) {
      return new Text(
        theme.fg("toolTitle", theme.bold("project_update_todo ")) +
          theme.fg("muted", summarizeArgs(args ?? {})),
        0,
        0,
      );
    },
    renderResult(result, { expanded }, theme, _ctx) {
      const details = (result.details ?? {}) as {
        action?: string;
        todos?: Todo[];
        error?: string;
      };
      if (result.isError || details.error) {
        const msg = details.error ?? "error";
        return new Text(theme.fg("error", `Error: ${msg}`), 0, 0);
      }
      const todos = details.todos ?? [];
      if (todos.length === 0) {
        return new Text(theme.fg("dim", "No todos"), 0, 0);
      }
      const display = expanded ? todos : todos.slice(0, 5);
      let out = theme.fg("muted", `${todos.length} todo(s):`);
      for (const t of display) {
        let mark: string;
        if (t.status === "done") mark = theme.fg("success", "✓");
        else if (t.status === "blocked") mark = theme.fg("error", "!");
        else mark = theme.fg("dim", "○");
        const id = theme.fg("accent", `#${t.id}`);
        const txt =
          t.status === "done"
            ? theme.fg("dim", t.text)
            : theme.fg("muted", t.text);
        out += `\n${mark} ${id} ${txt}`;
      }
      if (!expanded && todos.length > 5) {
        out += `\n${theme.fg("dim", `… ${todos.length - 5} more`)}`;
      }
      return new Text(out, 0, 0);
    },
  });

  // ---------- project_set ----------
  pi.registerTool({
    name: "project_set",
    label: "Project Set",
    description:
      "Update a charter field (goal, status, owner, successCriteria) for the bound project.",
    promptGuidelines: [
      "Use project_set('status', ...) whenever the project phase changes (e.g. 'planning' → 'in progress' → 'done').",
      "Use project_set('goal', ...) only if the fundamental objective has shifted — not for minor scope tweaks.",
    ],
    parameters: ProjectSetParams,
    async execute(_id, params, _signal, _onUpdate, _ctx) {
      const name = getBound();
      if (!name) return notBoundResult();
      try {
        const current = await store.readDoc(name, "charter").catch(() => "");
        const updated = docs.setCharterField(
          current,
          params.field as "goal" | "status" | "owner" | "successCriteria",
          params.value,
        );
        await store.writeDoc(name, "charter", updated);
        return {
          content: [
            {
              type: "text",
              text: `Set ${params.field} = ${truncate(params.value, 80)}`,
            },
          ],
          details: { field: params.field, value: params.value },
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text", text: `Error: ${msg}` }],
          details: {
            field: params.field,
            value: params.value,
            error: msg,
          },
          isError: true,
        };
      }
    },
    renderCall(args, theme, _ctx) {
      return new Text(
        theme.fg("toolTitle", theme.bold("project_set ")) +
          theme.fg("muted", summarizeArgs(args ?? {})),
        0,
        0,
      );
    },
    renderResult(result, _opts, theme, _ctx) {
      if (result.isError) {
        const t = result.content[0];
        const msg = t?.type === "text" ? t.text : "error";
        return new Text(theme.fg("error", msg), 0, 0);
      }
      const d = (result.details ?? {}) as { field?: string; value?: string };
      const field = String(d.field ?? "");
      const value = truncate(String(d.value ?? ""), 40);
      return new Text(
        theme.fg("success", "✓ ") +
          theme.fg("accent", field) +
          theme.fg("muted", `=${value}`),
        0,
        0,
      );
    },
  });
}
