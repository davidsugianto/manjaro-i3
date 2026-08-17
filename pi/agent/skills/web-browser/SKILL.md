---
name: web-browser
description: "Allows to interact with web pages by performing actions such as clicking buttons, filling out forms, and navigating links. It works by remote controlling Firefox via Playwright."
license: Stolen from Mario
---

# Web Browser Skill (Playwright + Firefox)

Controls a persistent Firefox browser running in background via a daemon process. Uses **Playwright** (Firefox) instead of raw CDP — the skill's scripts contact an HTTP API exposed by the daemon.

## Start Browser

```bash
./scripts/start.js                              # Firefox, headless (default)
./scripts/start.js --headless                   # Firefox, headless (explicit)
```

**Options:**

| Flag | Default | Description |
|---|---|---|
| `--headless` | on | Run without a visible window |
| `--reset-profile` | off | Wipe browser state before launch |

**Environment variables:**

```bash
export BROWSER_TYPE=firefox        # default (only firefox supported)
export BROWSER_HEADLESS=1          # always headless
```

The daemon writes state + port to `~/.cache/agent-web/browser/state.json`.

## Navigate

```bash
./scripts/nav.js https://example.com
./scripts/nav.js https://example.com --new
```

Navigate current tab or open new tab. Pages persist between commands — the daemon keeps a single active page.

## Evaluate JavaScript

```bash
./scripts/eval.js 'document.title'
./scripts/eval.js 'document.querySelectorAll("a").length'
```

Evaluate JavaScript in the active browser tab.

## Screenshot

```bash
./scripts/screenshot.js
./scripts/screenshot.js --full-page
```

Takes a PNG screenshot and returns a temp file path.

- Default: current viewport
- `--full-page`: captures full document height

## Dismiss Cookie Dialogs

```bash
./scripts/dismiss-cookies.js          # Accept cookies
./scripts/dismiss-cookies.js --reject # Reject cookies (where possible)
```

Automatically dismisses cookie consent dialogs.

## Quick Flow

```bash
./scripts/start.js --headless
./scripts/nav.js https://example.com
./scripts/dismiss-cookies.js
./scripts/screenshot.js --full-page
```

## Architecture

`browser-daemon.js` is a long-running Node.js process (detached from parent shell) that:

- Creates a Playwright Firefox browser via `launchServer()`
- Creates a persistent default context + page
- Exposes a minimal HTTP API on a random loopback port
- Stores daemon port + wsEndpoint in `~/.cache/agent-web/browser/state.json`

Helper scripts (`nav.js`, `eval.js`, `screenshot.js`, `dismiss-cookies.js`) read the state file and make HTTP requests to the daemon — no CDP or WebSocket juggling needed per-command.

## Notes

- Only **Firefox** is supported (Playwright's CDP protocol).
- The daemon and browser survive even if the calling script exits (detached spawn).
- Stop the daemon by killing the PID in `~/.cache/agent-web/browser/daemon.pid`.