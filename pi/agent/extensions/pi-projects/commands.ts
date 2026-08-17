import type {
	ExtensionAPI,
	ExtensionContext,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import * as store from "./store";
import * as docs from "./docs";

const SUBCOMMANDS = ["new", "use", "list", "status", "unbind", "path"] as const;

const USAGE =
	"Usage: /project <new|use|list|status|unbind|path> [name]";

/** Format a millisecond timestamp as a coarse relative time. */
function relativeTime(ts: number): string {
	if (!ts || !Number.isFinite(ts) || ts <= 0) return "never";
	const diffMs = Date.now() - ts;
	if (diffMs < 0) return "just now";
	const sec = Math.floor(diffMs / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const day = Math.floor(hr / 24);
	return `${day}d ago`;
}

/**
 * Component shown by `/project list` in TUI mode.
 */
class ProjectListComponent {
	private projects: Array<{ name: string; updatedAt: number; openTodos: number }>;
	private theme: Theme;
	private onClose: () => void;
	private cachedWidth?: number;
	private cachedLines?: string[];

	constructor(
		projects: Array<{ name: string; updatedAt: number; openTodos: number }>,
		theme: Theme,
		onClose: () => void,
	) {
		this.projects = projects;
		this.theme = theme;
		this.onClose = onClose;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "ctrl+c")) {
			this.onClose();
		}
	}

	render(width: number): string[] {
		if (this.cachedLines && this.cachedWidth === width) {
			return this.cachedLines;
		}

		const th = this.theme;
		const lines: string[] = [];

		lines.push("");
		const title = th.fg("accent", " Projects ");
		const dashesLeft = th.fg("borderMuted", "──");
		const dashesRight = th.fg(
			"borderMuted",
			"─".repeat(Math.max(0, width - 2 - " Projects ".length - 2)),
		);
		lines.push(truncateToWidth(dashesLeft + title + dashesRight, width));
		lines.push("");

		if (this.projects.length === 0) {
			lines.push(
				truncateToWidth(
					`  ${th.fg("dim", "No projects yet. Try /project new <name>")}`,
					width,
				),
			);
		} else {
			for (const p of this.projects) {
				const icon = "📁";
				const name = th.fg("text", p.name);
				const todos = th.fg("muted", `${p.openTodos} open`);
				const when = th.fg("dim", relativeTime(p.updatedAt));
				lines.push(
					truncateToWidth(`  ${icon} ${name}  ${todos}  ${when}`, width),
				);
			}
		}

		lines.push("");
		lines.push(truncateToWidth(`  ${th.fg("dim", "Press Escape to close")}`, width));
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

/**
 * Register the `/project` slash command and its subcommands.
 *
 * The host module owns the bound-project state and exposes a small `api`
 * surface to read/mutate it. Keeping that here means commands.ts has no
 * direct dependency on the file layout used by index.ts.
 */
export function registerProjectCommands(
	pi: ExtensionAPI,
	api: {
		get: () => string | null;
		bind: (name: string, ctx: ExtensionContext) => Promise<void>;
		unbind: (ctx: ExtensionContext) => void;
	},
): void {
	pi.registerCommand("project", {
		description:
			"Manage pi projects (new, use, list, status, unbind, path)",

		getArgumentCompletions(prefix: string): AutocompleteItem[] | null {
			// First word: subcommand completion.
			if (!prefix.includes(" ")) {
				const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix)).map(
					(s) => ({ value: s, label: s }),
				);
				return items.length > 0 ? items : null;
			}

			// Project-name completion for subcommands that take a project name.
			const [sub, ...rest] = prefix.split(/\s+/);
			const remaining = rest.join(" ");
			if (sub === "use" || sub === "unbind" || sub === "path") {
				try {
					// listProjects is async; surface synchronously by returning null
					// when results aren't ready. The completion request will be
					// repeated as the user types, and we cache nothing here.
					// We perform a best-effort sync read by abusing the fact that
					// pi will await the returned promise if it is one — but the
					// AutocompleteItem return type is sync. Fall back to no
					// completions in that case.
				} catch {
					return null;
				}
				// We cannot await here; trigger a fire-and-forget warm-up but
				// return null for this call. In practice the host calls this
				// frequently enough that synchronous fs is acceptable for a
				// small projects directory.
				const names = listProjectsSync();
				const items = names
					.filter((n) => n.startsWith(remaining))
					.map((n) => ({ value: `${sub} ${n}`, label: n }));
				return items.length > 0 ? items : null;
			}

			return null;
		},

		handler: async (args, ctx) => {
			const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
			const sub = tokens[0];

			if (!sub) {
				ctx.ui.notify(USAGE, "info");
				return;
			}

			switch (sub) {
				case "new": {
					const name = tokens[1];
					if (!name) {
						ctx.ui.notify("Usage: /project new <name>", "error");
						return;
					}
					try {
						store.validateProjectName(name);
					} catch (err: any) {
						ctx.ui.notify(
							`Invalid project name: ${err?.message ?? String(err)}`,
							"error",
						);
						return;
					}
					if (await store.projectExists(name)) {
						ctx.ui.notify(`Project ${name} already exists`, "error");
						return;
					}
					await docs.seedProject(name);
					await api.bind(name, ctx);
					ctx.ui.notify(`Created and bound project ${name}`, "info");
					return;
				}

				case "use": {
					const name = tokens[1];
					if (!name) {
						ctx.ui.notify("Usage: /project use <name>", "error");
						return;
					}
					if (!(await store.projectExists(name))) {
						ctx.ui.notify(`Project ${name} does not exist`, "error");
						return;
					}
					await api.bind(name, ctx);
					ctx.ui.notify(`Bound to project ${name}`, "info");
					return;
				}

				case "list": {
					const projects = await store.listProjects();
					const enriched: Array<{
						name: string;
						updatedAt: number;
						openTodos: number;
					}> = [];
					for (const p of projects) {
						let openTodos = 0;
						try {
							const md = await store.readDoc(p.name, "backlog");
							openTodos = docs
								.parseBacklog(md)
								.filter((t) => t.status === "open").length;
						} catch {
							openTodos = 0;
						}
						enriched.push({
							name: p.name,
							updatedAt: p.updatedAt,
							openTodos,
						});
					}

					if (ctx.mode === "tui") {
						await ctx.ui.custom<void>((_tui, theme, _kb, done) => {
							return new ProjectListComponent(enriched, theme, () => done());
						});
					} else {
						if (enriched.length === 0) {
							ctx.ui.notify(
								"No projects yet. Try /project new <name>",
								"info",
							);
						} else {
							const summary = enriched
								.map(
									(p) =>
										`${p.name}  ${p.openTodos} open  ${relativeTime(p.updatedAt)}`,
								)
								.join("\n");
							ctx.ui.notify(`Projects:\n${summary}`, "info");
						}
					}
					return;
				}

				case "status": {
					const name = api.get();
					if (!name) {
						ctx.ui.notify("No project bound", "info");
						return;
					}
					let openTodos = 0;
					try {
						const md = await store.readDoc(name, "backlog");
						openTodos = docs
							.parseBacklog(md)
							.filter((t) => t.status === "open").length;
					} catch {
						openTodos = 0;
					}
					let journalEntries = 0;
					try {
						const journal = await store.readDoc(name, "journal");
						const matches = journal.match(/^### /gm);
						journalEntries = matches ? matches.length : 0;
					} catch {
						journalEntries = 0;
					}
					ctx.ui.notify(
						`Project ${name}: ${openTodos} open todos, ${journalEntries} journal entries`,
						"info",
					);
					return;
				}

				case "unbind": {
					api.unbind(ctx);
					ctx.ui.notify("Unbound", "info");
					return;
				}

				case "path": {
					const name = api.get();
					if (!name) {
						ctx.ui.notify("No project bound", "error");
						return;
					}
					ctx.ui.notify(store.projectDir(name), "info");
					return;
				}

				default:
					ctx.ui.notify(USAGE, "info");
					return;
			}
		},
	});
}

/**
 * Best-effort synchronous listing of project directory names, used solely
 * to power autocomplete (which has a sync signature). Mirrors the
 * directory-name validation in `store.listProjects()`.
 */
function listProjectsSync(): string[] {
	try {
		// Lazy-load node:fs to keep the import surface minimal.
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const fs = require("node:fs") as typeof import("node:fs");
		const root = store.projectsRoot();
		const entries = fs.readdirSync(root, { withFileTypes: true });
		const out: string[] = [];
		for (const ent of entries) {
			if (!ent.isDirectory()) continue;
			const n = ent.name;
			if (n === "." || n === "..") continue;
			if (!/^[a-zA-Z0-9._-]{1,64}$/.test(n)) continue;
			out.push(n);
		}
		return out.sort();
	} catch {
		return [];
	}
}
