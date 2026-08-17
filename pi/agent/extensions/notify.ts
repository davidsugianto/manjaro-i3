/**
 * Desktop Notification Extension
 *
 * Sends a native desktop notification when the agent finishes and is waiting for input.
 * Uses OSC 777 escape sequence - no external dependencies.
 *
 * Supported terminals: Ghostty, iTerm2, WezTerm, rxvt-unicode
 * WaveTerm: uses terminal-notifier (brew install terminal-notifier) so that clicking
 *   the notification focuses WaveTerm instead of opening Script Editor.
 *   Falls back to osascript if terminal-notifier is not installed.
 * Not supported natively: Kitty (uses OSC 99), Terminal.app, Windows Terminal, Alacritty
 *
 * WaveTerm bundle ID: dev.commandline.waveterm
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";

/**
 * Escape a string for safe interpolation into an AppleScript string literal.
 * Assistant output is untrusted: a stray backslash or quote could otherwise break
 * out of the `"..."` and inject AppleScript into the osascript call. Strip control
 * chars, then escape backslashes before quotes (order matters).
 */
const escapeAppleScript = (s: string): string =>
	s
		.replace(/\p{Cc}/gu, " ")
		.replace(/\\/g, "\\\\")
		.replace(/"/g, '\\"');

/** Log a spawn failure without taking down the agent. */
const onSpawnError = (label: string) => (err: Error | null): void => {
	if (err) process.stderr.write(`notify: ${label} failed: ${err.message}\n`);
};

/** WaveTerm bundle ID used to activate the correct app when notification is clicked. */
const WAVETERM_BUNDLE_ID = "dev.commandline.waveterm";

/**
 * Send a desktop notification via terminal-notifier.
 * Clicking the notification focuses WaveTerm instead of Script Editor.
 * Returns false if terminal-notifier is not installed.
 */
const TERMINAL_NOTIFIER_PATH = "/opt/homebrew/bin/terminal-notifier";

const notifyTerminalNotifier = (title: string, body: string): boolean => {
	if (!existsSync(TERMINAL_NOTIFIER_PATH)) return false;
	const args = [
		"-title", title,
		"-activate", WAVETERM_BUNDLE_ID,
	];
	if (body) args.push("-message", body);
	execFile(TERMINAL_NOTIFIER_PATH, args, onSpawnError("terminal-notifier"));
	return true;
};

/**
 * Send a desktop notification via macOS osascript (system notification center).
 * Fallback when terminal-notifier is not installed.
 * ⚠️  Clicking this notification opens Script Editor — install terminal-notifier to fix.
 */
const notifyMacOS = (title: string, body: string): void => {
	const safeTitle = escapeAppleScript(title);
	const safeBody = escapeAppleScript(body);
	const script = safeBody
		? `display notification "${safeBody}" with title "${safeTitle}"`
		: `display notification "" with title "${safeTitle}"`;
	execFile("osascript", ["-e", script], onSpawnError("osascript"));
};

/**
 * Send a desktop notification via OSC 777 escape sequence.
 */
const notifyOSC777 = (title: string, body: string): void => {
	// OSC 777 format: ESC ] 777 ; notify ; title ; body BEL
	process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
};

const notify = (title: string, body: string): void => {
	if (process.env.WAVETERM) {
		// Prefer terminal-notifier so clicking the notification focuses WaveTerm.
		// Falls back to osascript (which opens Script Editor on click) if not installed.
		if (!notifyTerminalNotifier(title, body)) {
			notifyMacOS(title, body);
		}
	} else {
		notifyOSC777(title, body);
	}
};

const isTextPart = (part: unknown): part is { type: "text"; text: string } =>
	Boolean(part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part);

const extractLastAssistantText = (messages: Array<{ role?: string; content?: unknown }>): string | null => {
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		if (message?.role !== "assistant") {
			continue;
		}

		const content = message.content;
		if (typeof content === "string") {
			return content.trim() || null;
		}

		if (Array.isArray(content)) {
			const text = content.filter(isTextPart).map((part) => part.text).join("\n").trim();
			return text || null;
		}

		return null;
	}

	return null;
};

const plainMarkdownTheme: MarkdownTheme = {
	heading: (text) => text,
	link: (text) => text,
	linkUrl: () => "",
	code: (text) => text,
	codeBlock: (text) => text,
	codeBlockBorder: () => "",
	quote: (text) => text,
	quoteBorder: () => "",
	hr: () => "",
	listBullet: () => "",
	bold: (text) => text,
	italic: (text) => text,
	strikethrough: (text) => text,
	underline: (text) => text,
};

const simpleMarkdown = (text: string, width = 80): string => {
	const markdown = new Markdown(text, 0, 0, plainMarkdownTheme);
	return markdown.render(width).join("\n");
};

const formatNotification = (text: string | null): { title: string; body: string } => {
	const simplified = text ? simpleMarkdown(text) : "";
	const normalized = simplified.replace(/\s+/g, " ").trim();
	if (!normalized) {
		return { title: "Ready for input", body: "" };
	}

	const maxBody = 200;
	const body = normalized.length > maxBody ? `${normalized.slice(0, maxBody - 1)}…` : normalized;
	return { title: "π", body };
};

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (event) => {
		const lastText = extractLastAssistantText(event.messages ?? []);
		const { title, body } = formatNotification(lastText);
		notify(title, body);
	});
}
