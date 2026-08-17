#!/usr/bin/env node

/**
 * Background daemon that runs a persistent Playwright Firefox browser
 * and exposes an HTTP API for other scripts to control it.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { firefox } from "playwright";

const HOME = process.env["HOME"] || homedir();
const CACHE_ROOT = join(HOME, ".cache", "agent-web");
const BROWSER_ROOT = join(CACHE_ROOT, "browser");
const STATE_FILE = join(BROWSER_ROOT, "state.json");
const DAEMON_PORT = Number(process.env.DAEMON_PORT || 0); // 0 = auto

mkDir(BROWSER_ROOT);

const headless = process.env.BROWSER_HEADLESS !== "0";

async function main() {
  const launchOpts = {
    headless,
    args: ["--headless"],
  };

  const server = await firefox.launchServer(launchOpts);
  const proc = server.process();
  const wsEndpoint = server.wsEndpoint();

  // Detach so the daemon can exit without killing the browser
  if (proc && typeof proc.unref === "function") proc.unref();

  // Create initial browser context + page
  const connectBrowser = await firefox.connect(wsEndpoint);
  const defaultContext = await connectBrowser.newContext();
  let activePage = await defaultContext.newPage();
  await activePage.goto("about:blank");

  writeBrowserState({
    pid: proc?.pid || 0,
    wsEndpoint,
    browser: "firefox",
    mode: "fresh",
    headless,
    timestamp: Date.now(),
  });
  writeFileSync(join(BROWSER_ROOT, "daemon.pid"), String(process.pid));

  // HTTP server for script commands
  const httpServer = createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      try {
        const result = await handleRequest(req.method, req.url, body, activePage, connectBrowser);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, data: result }));
      } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
  });

  const daemonPort = await new Promise((resolve) => {
    httpServer.listen(DAEMON_PORT, "127.0.0.1", () => {
      resolve(httpServer.address().port);
    });
  });

  console.log(`PID:${process.pid} Browser:${proc?.pid} WS:${wsEndpoint} HTTP:${daemonPort}`);

  // Write daemon port to state too
  const state = JSON.parse(readFileSync(STATE_FILE, "utf8"));
  state.daemonPort = daemonPort;
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");

  // Keep alive
  setInterval(() => {}, 1 << 30);

  process.on("SIGINT", () => {
    try { connectBrowser.close(); } catch {}
    try { server.close(); } catch {}
    httpServer.close();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    try { connectBrowser.close(); } catch {}
    try { server.close(); } catch {}
    httpServer.close();
    process.exit(0);
  });
}

async function handleRequest(method, url, body, activePage, browser) {
  const [path, qs] = url.split("?");
  const params = qs ? Object.fromEntries(new URLSearchParams(qs)) : {};

  switch (path) {
    case "/ping":
      return { status: "ok" };

    case "/navigate": {
      const { url: targetUrl } = JSON.parse(body || "{}");
      if (!targetUrl) throw new Error("Missing url");
      await activePage.goto(targetUrl, { waitUntil: "load", timeout: 30000 });
      return { url: activePage.url(), title: await activePage.title() };
    }

    case "/evaluate": {
      const { expression } = JSON.parse(body || "{}");
      if (!expression) throw new Error("Missing expression");
      // Handle async wrapper from eval.js
      let code = expression;
      const match = code.match(/\(async \(\) => \{ return \((.+)\); \}\)\(\)/s);
      if (match) code = match[1];
      const result = await activePage.evaluate(code);
      return { result };
    }

    case "/screenshot": {
      const { fullPage, format } = JSON.parse(body || "{}");
      const opts = { type: format || "png" };
      if (fullPage) opts.fullPage = true;
      const buffer = await activePage.screenshot(opts);
      return { data: buffer.toString("base64") };
    }

    case "/title":
      return { title: await activePage.title() };

    case "/url":
      return { url: activePage.url() };

    case "/new-tab": {
      const { url: targetUrl } = JSON.parse(body || "{}");
      const page = await browser.newPage();
      if (targetUrl) await page.goto(targetUrl, { waitUntil: "load", timeout: 30000 });
      activePage = page;
      return { url: activePage.url(), title: await activePage.title() };
    }

    case "/dismiss-cookies": {
      const { reject: doReject } = JSON.parse(body || "{}");
      const script = buildCookieDismissScript(doReject);
      const result = await activePage.evaluate(script);
      return { dismissed: result };
    }

    case "/close":
      process.exit(0);

    default:
      throw new Error(`Unknown endpoint: ${path}`);
  }
}

function buildCookieDismissScript(reject) {
  return `(() => {
    const acceptCookies = ${!reject};
    const clicked = [];
    const isVisible = (el) => { if (!el) return false; const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' && (el.offsetParent !== null || s.position === 'fixed' || s.position === 'sticky'); };
    const tryClick = (sel, desc) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (isVisible(el)) { el.click(); clicked.push(desc || sel); return true; } return false; };
    const findBtn = (patterns, container) => { const btns = Array.from(container.querySelectorAll('button, [role="button"]')); const sorted = [...patterns].sort((a,b) => b.length - a.length); for (const p of sorted) { for (const b of btns) { const t = (b.textContent || b.value || '').trim().toLowerCase(); if (t.length > 100) continue; if (!isVisible(b)) continue; if (typeof p === 'string' ? t.includes(p) : p.test(t)) return b; } } return null; };
    const patterns = acceptCookies ? ['accept all','accept cookies','allow all','allow cookies','i agree','i accept','yes, i agree','agree and continue','alle akzeptieren','akzeptieren','alle zulassen','zustimmen','accepter tout','tout accepter','accept'] : ['reject all','decline all','deny all','refuse all','i do not agree','i disagree','no thanks','alle ablehnen','ablehnen','refuser tout','refuser','only necessary','necessary only'];
    // OneTrust
    if (document.querySelector('#onetrust-banner-sdk')) { tryClick(acceptCookies ? '#onetrust-accept-btn-handler' : '#onetrust-reject-all-handler', 'OneTrust'); return clicked; }
    // Google
    if (document.querySelector('#CXQnmb')) { tryClick(acceptCookies ? '#L2AGLb' : '#W0wltc', 'Google Consent'); return clicked; }
    // Cookiebot
    if (document.querySelector('#CybotCookiebotDialog')) { tryClick(acceptCookies ? '#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll' : '#CybotCookiebotDialogBodyButtonDecline', 'Cookiebot'); return clicked; }
    // Didomi
    if (window.Didomi) { tryClick(acceptCookies ? '#didomi-notice-agree-button' : '#didomi-notice-disagree-button', 'Didomi'); return clicked; }
    // Generic
    const containers = document.querySelectorAll('[class*="cookie-banner"],[class*="cookie-consent"],[class*="cookie-notice"],[class*="gdpr"],[role="dialog"][aria-label*="cookie" i]');
    for (const c of containers) { if (!isVisible(c) || c.tagName === 'HTML' || c.tagName === 'BODY') continue; const btn = findBtn(patterns, c); if (btn) { btn.click(); clicked.push('Generic'); return clicked; } }
    // Text-based fallback
    const allDivs = document.querySelectorAll('div,section,aside');
    for (const c of allDivs) { if (!isVisible(c)) continue; const t = c.textContent?.toLowerCase() || ''; if (t.includes('cookie') && t.length > 100 && t.length < 3000) { const btn = findBtn(patterns, c); if (btn) { btn.click(); clicked.push('Text fallback'); return clicked; } } }
    return clicked;
  })()`;
}

function writeBrowserState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n");
}

function mkDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

main().catch((e) => {
  console.error("daemon error:", e.message);
  process.exit(1);
});