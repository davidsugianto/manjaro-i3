/**
 * CDP-compatible wrapper around the browser daemon HTTP API.
 * Kept for backward compat — delegates to the daemon's HTTP endpoints.
 */

import { readBrowserState } from "./browser.js";

export { readBrowserState };

/**
 * Connect to the running browser daemon via HTTP.
 * Returns an object that mimics the old CDP client API.
 * Used by scripts that haven't been rewritten yet.
 */
export async function connect(timeout = 5000) {
  const state = readBrowserState();
  if (!state?.daemonPort) {
    throw new Error(
      `No browser daemon running — start one with: ./start.js`,
    );
  }
  return new HTTPCompat(state.daemonPort);
}

class HTTPCompat {
  constructor(port) {
    this.port = port;
    this._base = `http://127.0.0.1:${port}`;
  }

  async _post(path, body = {}) {
    const res = await fetch(`${this._base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Unknown error");
    return json.data;
  }

  async getPages() {
    // Return a single page entry — the daemon keeps one active page
    const data = await this._post("/url");
    return [{
      targetId: "active-page",
      type: "page",
      url: data.url,
      title: "",
    }];
  }

  async attachToPage(_targetId) {
    return "session-1";
  }

  async evaluate(sessionId, expression, _timeout = 30000) {
    // eval.js wraps code in (async () => { return (...); })()
    // Strip that wrapper for the HTTP endpoint
    let code = expression;
    const match = code.match(/\(async \(\) => \{ return \((.+)\); \}\)\(\)/s);
    if (match) code = match[1];
    const data = await this._post("/evaluate", { expression: code });
    return data.result;
  }

  async navigate(_sessionId, url, _timeout = 30000) {
    await this._post("/navigate", { url });
  }

  async send(method, params = {}, _sessionId = null, _timeout = 10000) {
    switch (method) {
      case "Runtime.evaluate":
        const data = await this._post("/evaluate", { expression: params.expression || "" });
        return { result: { value: data.result } };

      case "Page.navigate":
        await this._post("/navigate", { url: params.url });
        return {};

      case "Page.captureScreenshot": {
        const fullPage = params.captureBeyondViewport || (params.clip && params.clip.width > 0);
        const sdata = await this._post("/screenshot", { fullPage, format: params.format || "png" });
        return { data: sdata.data };
      }

      case "Target.getTargets": {
        const pageData = await this._post("/url");
        const titleData = await this._post("/title");
        return {
          targetInfos: [{
            targetId: "active-page",
            type: "page",
            url: pageData.url,
            title: titleData.title,
          }],
        };
      }

      case "Target.createTarget": {
        const result = await this._post("/new-tab", { url: params.url || "about:blank" });
        return { targetId: "new-active-page" };
      }

      case "Target.attachToTarget":
        return { sessionId: "session-1" };

      case "Page.getLayoutMetrics": {
        // Estimate — Playwright's capture handles it
        return {
          contentSize: { width: 1280, height: 900 },
          cssContentSize: { width: 1280, height: 900 },
        };
      }

      case "Page.getFrameTree":
        return { frameTree: { frame: { id: "main", url: "" }, childFrames: [] } };

      case "Page.createIsolatedWorld":
        return { executionContextId: 1 };

      case "Network.enable":
      case "Network.disable":
      case "Page.enable":
      case "Runtime.enable":
      case "Runtime.runIfWaitingForDebugger":
      case "Log.enable":
      case "Emulation.setDeviceMetricsOverride":
      case "Emulation.clearDeviceMetricsOverride":
        return {};

      default:
        return {};
    }
  }

  async getFrameTree(_sessionId) {
    return {
      frameTree: { frame: { id: "main", url: "" }, childFrames: [] },
    };
  }

  async evaluateInFrame(_sessionId, _frameId, expression, _timeout = 30000) {
    const data = await this._post("/evaluate", { expression });
    return data;
  }

  close() {
    // Nothing to close — daemon manages its own connection
  }
}