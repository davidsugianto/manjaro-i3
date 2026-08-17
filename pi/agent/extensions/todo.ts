/**
 * Todo Extension
 *
 * - Registers a `todo` tool for the LLM to manage todos
 * - Registers a `/todos` command for interactive viewing/toggling
 *
 * State is stored in tool result details (not external files), which allows
 * proper branching — when you branch, the todo state is automatically
 * correct for that point in history.
 *
 * UI controls (session todos only):
 *   ↑ / k      move up
 *   ↓ / j      move down
 *   Space      toggle done/undone
 *   Enter      open detail view
 *   Esc        close (or back from detail)
 *
 * When the session is bound to a pi-project the project backlog is shown
 * below (read-only).
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, Text, truncateToWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Todo {
	id: number;
	text: string;
	done: boolean;
}

interface TodoDetails {
	action: "list" | "add" | "toggle" | "clear";
	todos: Todo[];
	nextId: number;
	error?: string;
}

/** Mirrors the Todo shape from pi-projects/types.ts */
interface ProjectTodo {
	id: number;
	text: string;
	status: "open" | "done" | "blocked";
	createdAt: number;
	completedAt?: number;
}

const TodoParams = Type.Object({
	action: StringEnum(["list", "add", "toggle", "clear"] as const),
	text: Type.Optional(Type.String({ description: "Todo text (for add)" })),
	id: Type.Optional(Type.Number({ description: "Todo ID (for toggle)" })),
});

// ---------------------------------------------------------------------------
// Project-binding helpers
// ---------------------------------------------------------------------------

function getBoundProjectName(ctx: ExtensionContext): string | null {
	const entries = ctx.sessionManager.getEntries();
	for (let i = entries.length - 1; i >= 0; i--) {
		const e = entries[i];
		if (e.type === "custom" && e.customType === "pi-projects:bind") {
			const name = (e as any).data?.projectName;
			if (typeof name === "string" && name.length > 0) return name;
			return null;
		}
	}
	return null;
}

async function loadProjectTodos(projectName: string): Promise<ProjectTodo[]> {
	try {
		const storePath = `${process.env.HOME}/.pi/agent/extensions/pi-projects/store`;
		const docsPath = `${process.env.HOME}/.pi/agent/extensions/pi-projects/docs`;
		const store = await import(storePath);
		const docs = await import(docsPath);
		const md: string = await store.readDoc(projectName, "backlog").catch(() => "");
		return docs.parseBacklog(md) as ProjectTodo[];
	} catch {
		return [];
	}
}

// ---------------------------------------------------------------------------
// Detail view component
// ---------------------------------------------------------------------------

class TodoDetailComponent {
	private todo: Todo;
	private theme: Theme;
	private tui: { requestRender: () => void };
	private onClose: () => void;
	private onToggle: (id: number) => void;

	constructor(
		todo: Todo,
		theme: Theme,
		tui: { requestRender: () => void },
		onClose: () => void,
		onToggle: (id: number) => void,
	) {
		this.todo = todo;
		this.theme = theme;
		this.tui = tui;
		this.onClose = onClose;
		this.onToggle = onToggle;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c") || data === "q") {
			this.onClose();
			return;
		}
		if (matchesKey(data, "space")) {
			this.onToggle(this.todo.id);
			this.tui.requestRender();
			return;
		}
	}

	render(width: number): string[] {
		const th = this.theme;
		const lines: string[] = [];

		lines.push("");
		const label = ` Todo #${this.todo.id} `;
		const dashes = "─".repeat(Math.max(0, width - label.length - 3));
		lines.push(truncateToWidth(
			th.fg("borderMuted", "─".repeat(3)) + th.fg("accent", label) + th.fg("borderMuted", dashes),
			width,
		));
		lines.push("");

		// Status badge
		const statusText = this.todo.done ? "✓ Done" : "○ Open";
		const statusColor = this.todo.done ? "success" : "dim";
		lines.push(truncateToWidth(`  Status:  ${th.fg(statusColor, statusText)}`, width));
		lines.push("");

		// Full text (word-wrapped manually)
		lines.push(truncateToWidth(`  ${th.fg("muted", "Text:")}`, width));
		const textLines = wrapText(this.todo.text, width - 4);
		for (const l of textLines) {
			const style = this.todo.done ? th.fg("dim", l) : th.fg("text", l);
			lines.push(truncateToWidth(`    ${style}`, width));
		}

		lines.push("");
		lines.push(truncateToWidth(
			`  ${th.fg("dim", "Space  toggle    Esc  back")}`,
			width,
		));
		lines.push("");

		return lines;
	}

	invalidate(): void {}
}

function wrapText(text: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return [text];
	const words = text.split(" ");
	const lines: string[] = [];
	let current = "";
	for (const word of words) {
		if (current.length === 0) {
			current = word;
		} else if (current.length + 1 + word.length <= maxWidth) {
			current += " " + word;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current.length > 0) lines.push(current);
	return lines.length > 0 ? lines : [""];
}

// ---------------------------------------------------------------------------
// List view component
// ---------------------------------------------------------------------------

class TodoListComponent {
	private todos: Todo[];
	private projectName: string | null;
	private projectTodos: ProjectTodo[];
	private theme: Theme;
	private tui: { requestRender: () => void };
	private onClose: () => void;
	private onToggle: (id: number) => void;
	private onDetail: (todo: Todo) => void;
	private selectedIndex: number;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		todos: Todo[],
		projectName: string | null,
		projectTodos: ProjectTodo[],
		theme: Theme,
		tui: { requestRender: () => void },
		onClose: () => void,
		onToggle: (id: number) => void,
		onDetail: (todo: Todo) => void,
	) {
		this.todos = todos;
		this.projectName = projectName;
		this.projectTodos = projectTodos;
		this.theme = theme;
		this.tui = tui;
		this.onClose = onClose;
		this.onToggle = onToggle;
		this.onDetail = onDetail;
		this.selectedIndex = todos.length > 0 ? 0 : -1;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
			return;
		}
		if (matchesKey(data, "up") || data === "k") {
			if (this.todos.length > 0) {
				this.selectedIndex = Math.max(0, this.selectedIndex - 1);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "down") || data === "j") {
			if (this.todos.length > 0) {
				this.selectedIndex = Math.min(this.todos.length - 1, this.selectedIndex + 1);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "space")) {
			const todo = this.todos[this.selectedIndex];
			if (todo) {
				this.onToggle(todo.id);
				this.invalidate();
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "enter")) {
			const todo = this.todos[this.selectedIndex];
			if (todo) {
				this.onDetail(todo);
			}
			return;
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const lines: string[] = [];
		const th = this.theme;

		// ── Session todos ──────────────────────────────────────────────────
		lines.push("");
		const sessionLabel = " Session Todos ";
		const sessionDashes = "─".repeat(Math.max(0, width - sessionLabel.length - 3));
		lines.push(truncateToWidth(
			th.fg("borderMuted", "─".repeat(3)) + th.fg("accent", sessionLabel) + th.fg("borderMuted", sessionDashes),
			width,
		));
		lines.push("");

		if (this.todos.length === 0) {
			lines.push(truncateToWidth(`  ${th.fg("dim", "No todos yet. Ask the agent to add some!")}`, width));
		} else {
			const doneCount = this.todos.filter((t) => t.done).length;
			lines.push(truncateToWidth(`  ${th.fg("muted", `${doneCount}/${this.todos.length} completed`)}`, width));
			lines.push("");

			for (let i = 0; i < this.todos.length; i++) {
				const todo = this.todos[i];
				const isSelected = i === this.selectedIndex;
				const cursor = isSelected ? th.fg("accent", "▶") : " ";
				const check = todo.done ? th.fg("success", "✓") : th.fg("dim", "○");
				const id = th.fg("accent", `#${todo.id}`);
				const text = todo.done
					? th.fg("dim", todo.text)
					: isSelected
					? th.bold(th.fg("text", todo.text))
					: th.fg("text", todo.text);
				lines.push(truncateToWidth(`  ${cursor} ${check} ${id}  ${text}`, width));
			}
		}

		// ── Project backlog (read-only) ────────────────────────────────────
		if (this.projectName !== null) {
			lines.push("");
			const projectLabel = ` Project: ${this.projectName} `;
			const projectDashes = "─".repeat(Math.max(0, width - projectLabel.length - 3));
			lines.push(truncateToWidth(
				th.fg("borderMuted", "─".repeat(3)) + th.fg("accent", projectLabel) + th.fg("borderMuted", projectDashes),
				width,
			));
			lines.push("");

			if (this.projectTodos.length === 0) {
				lines.push(truncateToWidth(`  ${th.fg("dim", "No backlog items.")}`, width));
			} else {
				const open = this.projectTodos.filter((t) => t.status === "open").length;
				const done = this.projectTodos.filter((t) => t.status === "done").length;
				const blocked = this.projectTodos.filter((t) => t.status === "blocked").length;
				const parts = [`${open} open`];
				if (done > 0) parts.push(`${done} done`);
				if (blocked > 0) parts.push(`${blocked} blocked`);
				lines.push(truncateToWidth(`  ${th.fg("muted", parts.join(", "))}`, width));
				lines.push("");

				for (const todo of this.projectTodos) {
					const check =
						todo.status === "done"
							? th.fg("success", "✓")
							: todo.status === "blocked"
							? th.fg("error", "!")
							: th.fg("dim", "○");
					const id = th.fg("accent", `#${todo.id}`);
					const text =
						todo.status === "done"
							? th.fg("dim", todo.text)
							: todo.status === "blocked"
							? th.fg("error", todo.text)
							: th.fg("text", todo.text);
					lines.push(truncateToWidth(`    ${check} ${id}  ${text}`, width));
				}
			}
		}

		// ── Hint ──────────────────────────────────────────────────────────
		lines.push("");
		const hint =
			this.todos.length > 0
				? th.fg("dim", "↑↓ / j k  navigate    Space  toggle    Enter  detail    Esc  close")
				: th.fg("dim", "Esc  close");
		lines.push(truncateToWidth(`  ${hint}`, width));
		lines.push("");

		this.cachedWidth = width;
		this.cachedLines = lines;
		return lines;
	}

	invalidate(): void {
		this.cachedWidth = undefined;
		this.cachedLines = undefined;
	}
}

// ---------------------------------------------------------------------------
// Extension
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	let todos: Todo[] = [];
	let nextId = 1;

	const reconstructState = (ctx: ExtensionContext) => {
		todos = [];
		nextId = 1;
		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type === "message") {
				const msg = entry.message;
				if (msg.role !== "toolResult" || msg.toolName !== "todo") continue;
				const details = msg.details as TodoDetails | undefined;
				if (details) {
					todos = details.todos;
					nextId = details.nextId;
				}
			} else if (entry.type === "custom" && entry.customType === "todo:snapshot") {
				const data = (entry as any).data as { todos?: Todo[]; nextId?: number } | undefined;
				if (data?.todos) {
					todos = data.todos;
					if (data.nextId !== undefined) nextId = data.nextId;
				}
			}
		}
	};

	const toggleSessionTodo = (id: number): void => {
		if (!todos.some((t) => t.id === id)) return;
		// Immutable: rebuild the array so the snapshot we append never aliases the
		// live state of an earlier branch entry (prevents cross-branch corruption).
		todos = todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
		pi.appendEntry("todo:snapshot", { todos: [...todos], nextId });
	};

	pi.on("session_start", async (_event, ctx) => reconstructState(ctx));
	pi.on("session_tree", async (_event, ctx) => reconstructState(ctx));

	// ---- todo tool ----
	pi.registerTool({
		name: "todo",
		label: "Todo",
		description: "Manage a todo list. Actions: list, add (text), toggle (id), clear",
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
			switch (params.action) {
				case "list":
					return {
						content: [{ type: "text", text: todos.length ? todos.map((t) => `[${t.done ? "x" : " "}] #${t.id}: ${t.text}`).join("\n") : "No todos" }],
						details: { action: "list", todos: [...todos], nextId } as TodoDetails,
					};
				case "add": {
					if (!params.text) {
						return {
							content: [{ type: "text", text: "Error: text required for add" }],
							details: { action: "add", todos: [...todos], nextId, error: "text required" } as TodoDetails,
						};
					}
					const newTodo: Todo = { id: nextId++, text: params.text, done: false };
					todos = [...todos, newTodo];
					return {
						content: [{ type: "text", text: `Added todo #${newTodo.id}: ${newTodo.text}` }],
						details: { action: "add", todos: [...todos], nextId } as TodoDetails,
					};
				}
				case "toggle": {
					if (params.id === undefined) {
						return {
							content: [{ type: "text", text: "Error: id required for toggle" }],
							details: { action: "toggle", todos: [...todos], nextId, error: "id required" } as TodoDetails,
						};
					}
					const existing = todos.find((t) => t.id === params.id);
					if (!existing) {
						return {
							content: [{ type: "text", text: `Todo #${params.id} not found` }],
							details: { action: "toggle", todos: [...todos], nextId, error: `#${params.id} not found` } as TodoDetails,
						};
					}
					const toggled: Todo = { ...existing, done: !existing.done };
					todos = todos.map((t) => (t.id === params.id ? toggled : t));
					return {
						content: [{ type: "text", text: `Todo #${toggled.id} ${toggled.done ? "completed" : "uncompleted"}` }],
						details: { action: "toggle", todos: [...todos], nextId } as TodoDetails,
					};
				}
				case "clear": {
					const count = todos.length;
					todos = [];
					nextId = 1;
					return {
						content: [{ type: "text", text: `Cleared ${count} todos` }],
						details: { action: "clear", todos: [], nextId: 1 } as TodoDetails,
					};
				}
				default:
					return {
						content: [{ type: "text", text: `Unknown action: ${params.action}` }],
						details: { action: "list", todos: [...todos], nextId, error: `unknown action: ${params.action}` } as TodoDetails,
					};
			}
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", args.action);
			if (args.text) text += ` ${theme.fg("dim", `"${args.text}"`)}`;
			if (args.id !== undefined) text += ` ${theme.fg("accent", `#${args.id}`)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme, _context) {
			const details = result.details as TodoDetails | undefined;
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}
			if (details.error) return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			const todoList = details.todos;
			switch (details.action) {
				case "list": {
					if (todoList.length === 0) return new Text(theme.fg("dim", "No todos"), 0, 0);
					let listText = theme.fg("muted", `${todoList.length} todo(s):`);
					const display = expanded ? todoList : todoList.slice(0, 5);
					for (const t of display) {
						const check = t.done ? theme.fg("success", "✓") : theme.fg("dim", "○");
						const itemText = t.done ? theme.fg("dim", t.text) : theme.fg("muted", t.text);
						listText += `\n${check} ${theme.fg("accent", `#${t.id}`)} ${itemText}`;
					}
					if (!expanded && todoList.length > 5) listText += `\n${theme.fg("dim", `... ${todoList.length - 5} more`)}`;
					return new Text(listText, 0, 0);
				}
				case "add": {
					const added = todoList[todoList.length - 1];
					return new Text(theme.fg("success", "✓ Added ") + theme.fg("accent", `#${added.id}`) + " " + theme.fg("muted", added.text), 0, 0);
				}
				case "toggle": {
					const text = result.content[0];
					const msg = text?.type === "text" ? text.text : "";
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", msg), 0, 0);
				}
				case "clear":
					return new Text(theme.fg("success", "✓ ") + theme.fg("muted", "Cleared all todos"), 0, 0);
			}
		},
	});

	// ---- /todos command ----
	pi.registerCommand("todos", {
		description: "Show todos (+ project backlog if bound). Navigate with ↑↓, Space to toggle, Enter for detail.",
		handler: async (_args, ctx) => {
			if (!ctx.hasUI) {
				ctx.ui.notify("/todos requires interactive mode", "error");
				return;
			}

			const projectName = getBoundProjectName(ctx);
			const projectTodos = projectName ? await loadProjectTodos(projectName) : [];

			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				// Track which component is active: "list" | "detail"
				let activeComponent: TodoListComponent | TodoDetailComponent;

				const openDetail = (todo: Todo) => {
					activeComponent = new TodoDetailComponent(
						todo,
						theme,
						tui,
						() => {
							// back to list
							activeComponent = listComponent;
							listComponent.invalidate();
							tui.requestRender();
						},
						(id) => {
							toggleSessionTodo(id);
							// refresh the todo reference in case it changed
							const updated = todos.find((t) => t.id === id);
							if (updated) {
								activeComponent = new TodoDetailComponent(
									updated,
									theme,
									tui,
									() => {
										activeComponent = listComponent;
										listComponent.invalidate();
										tui.requestRender();
									},
									(tid) => {
										toggleSessionTodo(tid);
										tui.requestRender();
									},
								);
							}
							tui.requestRender();
						},
					);
					tui.requestRender();
				};

				const listComponent = new TodoListComponent(
					todos,
					projectName,
					projectTodos,
					theme,
					tui,
					() => done(),
					(id) => {
						toggleSessionTodo(id);
						listComponent.invalidate();
					},
					openDetail,
				);

				activeComponent = listComponent;

				return {
					render: (w: number) => activeComponent.render(w),
					invalidate: () => activeComponent.invalidate(),
					handleInput: (data: string) => activeComponent.handleInput(data),
				};
			});
		},
	});
}
