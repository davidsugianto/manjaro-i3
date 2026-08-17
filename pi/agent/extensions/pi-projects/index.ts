import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { registerProjectTools } from "./tools";
import { registerProjectCommands } from "./commands";

let boundProject: string | null = null;
let autoBound = false; // true when bound from .pi-project file, false when manually bound

export default function (pi: ExtensionAPI) {
  function updateStatus(ctx: ExtensionContext): void {
    if (boundProject) ctx.ui.setStatus("pi-projects", `📁 ${boundProject}`);
    else ctx.ui.setStatus("pi-projects", "");
  }

  async function bind(name: string, ctx: ExtensionContext): Promise<void> {
    const exists = await (await import("./store")).projectExists(name);
    if (!exists) throw new Error(`Project "${name}" does not exist`);
    boundProject = name;
    autoBound = false;
    pi.appendEntry("pi-projects:bind", { projectName: name, ts: Date.now(), version: 1 });
    updateStatus(ctx);
  }

  function unbind(ctx: ExtensionContext): void {
    boundProject = null;
    autoBound = false;
    pi.appendEntry("pi-projects:bind", { projectName: "", ts: Date.now(), version: 1 });
    updateStatus(ctx);
  }

  async function rehydrate(ctx: ExtensionContext): Promise<void> {
    const entries = ctx.sessionManager.getEntries();
    let latest: string | null = null;
    for (let i = entries.length - 1; i >= 0; i--) {
      const e = entries[i];
      if (e.type === "custom" && e.customType === "pi-projects:bind") {
        const name = (e as any).data?.projectName;
        latest = typeof name === "string" && name.length > 0 ? name : null;
        break;
      }
    }
    boundProject = latest;
    autoBound = false; // rehydrated = manually bound context
    if (boundProject) {
      const store = await import("./store");
      const ok = await store.projectExists(boundProject);
      if (!ok) {
        ctx.ui.notify(`pi-projects: bound project "${boundProject}" no longer exists; binding cleared`, "warning");
        boundProject = null;
        pi.appendEntry("pi-projects:bind", { projectName: "", ts: Date.now(), version: 1 });
      }
    }
    updateStatus(ctx);
  }

  registerProjectTools(pi, () => boundProject);

  registerProjectCommands(pi, {
    get: () => boundProject,
    bind,
    unbind,
  });

  /**
   * Parse a .pi-project INI-like file and return the first section name.
   * Format:
   *   [project-name]
   *   key = value  (ignored for now)
   */
  async function readPiProjectFile(cwd: string): Promise<string | null> {
    const filePath = path.join(cwd, ".pi-project");
    let raw: string;
    try {
      raw = await fsp.readFile(filePath, "utf8");
    } catch {
      return null;
    }
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      const m = trimmed.match(/^\[([^\]]+)\]$/);
      if (m) return m[1].trim();
    }
    return null;
  }

  pi.on("session_start", async (event, ctx) => {
    await rehydrate(ctx);

    // Auto-bind from .pi-project only for fresh/new sessions (not resume/fork)
    // and only when no project is already bound from session history.
    if (boundProject) return;
    if (event.reason !== "startup" && event.reason !== "new") return;

    const projectName = await readPiProjectFile(ctx.cwd);
    if (!projectName) return;

    const store = await import("./store");
    const exists = await store.projectExists(projectName);
    if (!exists) {
      ctx.ui.notify(
        `pi-projects: .pi-project references "${projectName}" which does not exist yet. Run /project new ${projectName} to create it.`,
        "warning",
      );
      return;
    }

    boundProject = projectName;
    autoBound = true;
    pi.appendEntry("pi-projects:bind", { projectName, ts: Date.now(), version: 1 });
    updateStatus(ctx);
    ctx.ui.notify(`pi-projects: auto-bound to "${projectName}" from .pi-project`, "info");
  });

  pi.on("before_agent_start", async (event, _ctx) => {
    if (!boundProject) return;
    try {
      const { buildSystemPromptBlock } = await import("./prompt");
      const block = await buildSystemPromptBlock(boundProject, autoBound);
      return { systemPrompt: event.systemPrompt + "\n\n" + block };
    } catch {
      return;
    }
  });
}
