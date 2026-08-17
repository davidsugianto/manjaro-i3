/**
 * pi-profile extension
 *
 * Registers two commands for managing pi profiles:
 *   /create-pi-profile <name>  — create a new profile from the current one
 *   /switch-pi-profile [name]  — switch to a different pi profile
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { AutocompleteItem } from "@earendil-works/pi-tui";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { execFileSync } from "node:child_process";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HOME = os.homedir();
const PI_DIR = path.join(HOME, ".pi");
const CONFIG_FILE = path.join(HOME, ".pi-config");
const SHARED_DIR = path.join(HOME, ".pi-shared");
const PROFILE_PREFIX = ".pi.";
const PROFILE_SUFFIX = ".profile";
const SHARED_AGENT_ITEMS = [
	"sessions",
	"npm",
	"bin",
	"auth.json",
	"pi-crash.log",
];
const VALID_NAME = /^[a-zA-Z0-9_-]+$/;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Config {
	active: string;
	profiles: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readConfig(): Config | null {
	if (!fs.existsSync(CONFIG_FILE)) return null;
	try {
		const raw = fs.readFileSync(CONFIG_FILE, "utf8");
		return JSON.parse(raw) as Config;
	} catch {
		return null;
	}
}

function writeConfig(cfg: Config): void {
	const tmp = CONFIG_FILE + ".tmp." + process.pid;
	fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + "\n", "utf8");
	fs.renameSync(tmp, CONFIG_FILE);
}

function profilePath(name: string): string {
	return path.join(HOME, PROFILE_PREFIX + name + PROFILE_SUFFIX);
}

function isMigrated(): boolean {
	if (!fs.existsSync(CONFIG_FILE)) return false;
	try {
		const stat = fs.lstatSync(PI_DIR);
		return stat.isSymbolicLink();
	} catch {
		return false;
	}
}

function countOtherPiInstances(): number {
	try {
		const out = execFileSync("pgrep", ["-f", "pi-coding-agent"], {
			encoding: "utf8",
		});
		const pids = out
			.split("\n")
			.map((s) => s.trim())
			.filter(Boolean)
			.map(Number)
			.filter((n) => !isNaN(n));
		const others = pids.filter((pid) => pid !== process.pid);
		return others.length;
	} catch {
		return 0;
	}
}

function rsyncProfile(srcDir: string, dstDir: string): void {
	const excludeArgs: string[] = [];
	for (const item of SHARED_AGENT_ITEMS) {
		excludeArgs.push("--exclude", `agent/${item}`);
	}
	excludeArgs.push("--exclude", "agent/*.log");

	execFileSync("rsync", [
		"-a",
		...excludeArgs,
		srcDir + "/",
		dstDir,
	]);
}

function attachSharedSymlinks(profileDir: string): void {
	const agentDir = path.join(profileDir, "agent");
	fs.mkdirSync(agentDir, { recursive: true });

	for (const item of SHARED_AGENT_ITEMS) {
		const linkPath = path.join(agentDir, item);
		const target = path.join(SHARED_DIR, item);

		// Remove existing target (file, dir, or symlink)
		try {
			const stat = fs.lstatSync(linkPath);
			if (stat.isDirectory() && !stat.isSymbolicLink()) {
				fs.rmSync(linkPath, { recursive: true, force: true });
			} else {
				fs.unlinkSync(linkPath);
			}
		} catch {
			// does not exist — that's fine
		}

		fs.symlinkSync(target, linkPath);
	}
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

async function runMigration(ctx: {
	ui: { notify(msg: string, level: string): void };
}): Promise<void> {
	// Idempotent guard
	if (isMigrated()) return;

	// 1. mkdir -p SHARED_DIR
	fs.mkdirSync(SHARED_DIR, { recursive: true });

	// 2. Move non-symlink agent items to SHARED_DIR
	let crashLogExists = false;
	for (const item of SHARED_AGENT_ITEMS) {
		const src = path.join(PI_DIR, "agent", item);
		const dst = path.join(SHARED_DIR, item);
		try {
			const stat = fs.lstatSync(src);
			if (!stat.isSymbolicLink()) {
				fs.renameSync(src, dst);
			}
		} catch {
			// src does not exist — skip
		}
		if (item === "pi-crash.log") {
			crashLogExists =
				fs.existsSync(path.join(SHARED_DIR, "pi-crash.log")) ||
				fs.existsSync(path.join(PI_DIR, "agent", "pi-crash.log"));
		}
	}

	// Touch pi-crash.log if it doesn't exist anywhere
	if (!crashLogExists) {
		fs.writeFileSync(path.join(SHARED_DIR, "pi-crash.log"), "", "utf8");
	}

	// 3. Move remaining *.log files in ~/.pi/agent/
	const agentDir = path.join(PI_DIR, "agent");
	try {
		const entries = fs.readdirSync(agentDir);
		for (const entry of entries) {
			if (entry.endsWith(".log")) {
				const src = path.join(agentDir, entry);
				const dst = path.join(SHARED_DIR, entry);
				try {
					const stat = fs.lstatSync(src);
					if (!stat.isSymbolicLink()) {
						fs.renameSync(src, dst);
					}
				} catch {
					// skip
				}
			}
		}
	} catch {
		// agentDir may not exist — skip
	}

	// 4. Rename ~/.pi → ~/.pi.default.profile
	const defaultProfile = profilePath("default");
	fs.renameSync(PI_DIR, defaultProfile);

	// 5. Symlink shared items into the default profile
	for (const item of SHARED_AGENT_ITEMS) {
		const parentDir = path.join(defaultProfile, "agent");
		fs.mkdirSync(parentDir, { recursive: true });

		const linkPath = path.join(parentDir, item);
		const target = path.join(SHARED_DIR, item);

		try {
			const stat = fs.lstatSync(linkPath);
			if (stat.isDirectory() && !stat.isSymbolicLink()) {
				fs.rmSync(linkPath, { recursive: true, force: true });
			} else {
				fs.unlinkSync(linkPath);
			}
		} catch {
			// does not exist
		}

		fs.symlinkSync(target, linkPath);
	}

	// 6. Symlink ~/.pi → ~/.pi.default.profile
	fs.symlinkSync(defaultProfile, PI_DIR);

	// 7. Write config
	writeConfig({ active: "default", profiles: ["default"] });

	ctx.ui.notify("Migration complete: ~/.pi → ~/.pi.default.profile", "info");
}

// ---------------------------------------------------------------------------
// Extension factory
// ---------------------------------------------------------------------------

export default function (pi: ExtensionAPI) {
	// ------------------------------------------------------------------
	// /create-pi-profile
	// ------------------------------------------------------------------
	pi.registerCommand("create-pi-profile", {
		description: "Create a new pi profile from the current one",
		handler: async (args, ctx) => {
			const name = args.trim();

			if (!VALID_NAME.test(name)) {
				ctx.ui.notify(
					`Invalid profile name "${name}". Use only letters, digits, _ or -.`,
					"error",
				);
				return;
			}

			// First-run migration if needed
			if (!isMigrated()) {
				const ok = await ctx.ui.confirm(
					"First-run migration",
					"Migrate ~/.pi/ to profile layout? Sessions/npm/bin/logs stay shared.",
				);
				if (!ok) return;
				await runMigration(ctx);
			}

			// Soft-block: other pi instances running
			const others = countOtherPiInstances();
			if (others > 0) {
				const ok = await ctx.ui.confirm(
					`${others} other pi instance(s) running`,
					"Other pi instances are running. Creating a profile now may cause inconsistencies. Continue anyway?",
				);
				if (!ok) return;
			}

			const cfg = readConfig()!;

			if (cfg.profiles.includes(name)) {
				ctx.ui.notify(`Profile "${name}" already exists.`, "error");
				return;
			}

			const dst = profilePath(name);
			if (fs.existsSync(dst)) {
				ctx.ui.notify(
					`Profile directory already exists at ${dst}.`,
					"error",
				);
				return;
			}

			ctx.ui.setStatus("pi-profile", `Creating ${name}...`);

			rsyncProfile(PI_DIR, dst);
			attachSharedSymlinks(dst);

			cfg.profiles.push(name);
			writeConfig(cfg);

			ctx.ui.setStatus("pi-profile", "");
			ctx.ui.notify(
				`Created profile "${name}". Run /switch-pi-profile ${name} to activate.`,
				"info",
			);
		},
	});

	// ------------------------------------------------------------------
	// /switch-pi-profile
	// ------------------------------------------------------------------
	pi.registerCommand("switch-pi-profile", {
		description: "Switch to a different pi profile",
		getArgumentCompletions: (prefix: string): AutocompleteItem[] | null => {
			const cfg = readConfig();
			if (!cfg) return null;
			const items = cfg.profiles
				.filter((p) => p !== cfg.active && p.startsWith(prefix))
				.map((p) => ({ value: p, label: p }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			// First-run migration if needed
			if (!isMigrated()) {
				const ok = await ctx.ui.confirm(
					"First-run migration",
					"Save current ~/.pi/ as profile default and continue?",
				);
				if (!ok) return;
				await runMigration(ctx);
			}

			// Hard-block: other pi instances running
			const others = countOtherPiInstances();
			if (others > 0) {
				ctx.ui.notify(
					`${others} other pi instance(s) running. Close them before switching profiles. Aborting.`,
					"error",
				);
				return;
			}

			const cfg = readConfig()!;
			const candidates = cfg.profiles.filter((p) => p !== cfg.active);

			if (candidates.length === 0) {
				ctx.ui.notify(
					"No other profiles available. Use /create-pi-profile <name> first.",
					"warning",
				);
				return;
			}

			let target = args.trim();

			if (target && !cfg.profiles.includes(target)) {
				ctx.ui.notify(`Profile "${target}" not found.`, "error");
				return;
			}

			if (target && target === cfg.active) {
				ctx.ui.notify(`Profile "${target}" is already active.`, "info");
				return;
			}

			if (!target) {
				const picked = await ctx.ui.select(
					"Switch to profile:",
					candidates,
				);
				if (!picked) return;
				target = picked;
			}

			const dst = profilePath(target);
			if (!fs.existsSync(dst)) {
				ctx.ui.notify(
					`Profile directory missing: ${dst}`,
					"error",
				);
				return;
			}

			execFileSync("ln", ["-sfn", dst, PI_DIR]);

			cfg.active = target;
			writeConfig(cfg);

			ctx.ui.notify(
				`Switched to "${target}". Restart pi or /reload to pick up new extensions/prompts/skills.`,
				"info",
			);
		},
	});
}
