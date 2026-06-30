import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
];

const DEFAULT_PAGES = [
  "/studio",
  "/runs",
  "/market?tab=agents",
  "/mypage?tab=approval",
  "/guide"
];

const DEFAULT_VIEWPORTS = [
  [1280, 720],
  [663, 912],
  [627, 699]
];

function parseArgs(argv) {
  const args = {
    baseUrl: "http://127.0.0.1:3103",
    pages: DEFAULT_PAGES,
    viewports: DEFAULT_VIEWPORTS
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--session-file") {
      args.sessionFile = next;
      index += 1;
    } else if (arg === "--base-url") {
      args.baseUrl = next;
      index += 1;
    } else if (arg === "--edge-path") {
      args.edgePath = next;
      index += 1;
    } else if (arg === "--pages") {
      args.pages = next.split(",").map((row) => row.trim()).filter(Boolean);
      index += 1;
    } else if (arg === "--viewports") {
      args.viewports = next.split(",").map((row) => {
        const [width, height] = row.split("x").map((value) => Number.parseInt(value, 10));
        if (!Number.isFinite(width) || !Number.isFinite(height)) {
          throw new Error(`Invalid viewport: ${row}`);
        }
        return [width, height];
      });
      index += 1;
    }
  }
  if (!args.sessionFile) {
    throw new Error("--session-file is required");
  }
  return args;
}

function findBrowserPath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;
  return DEFAULT_EDGE_PATHS.find((candidate) => existsSync(candidate));
}

async function waitForJson(url, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function rmWithRetry(targetPath, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    }
  }
}

async function createTarget(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Failed to create CDP target: HTTP ${response.status}`);
  }
  return await response.json();
}

class CdpSession {
  constructor(webSocketUrl) {
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
    this.ws = new WebSocket(webSocketUrl);
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
        else resolve(message.result);
        return;
      }
      if (message.method) this.events.push(message);
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
    });
  }

  close() {
    this.ws.close();
  }

  readEvents(methods) {
    const selected = [];
    const remaining = [];
    for (const event of this.events) {
      if (methods.includes(event.method)) selected.push(event);
      else remaining.push(event);
    }
    this.events = remaining;
    return selected;
  }
}

async function waitForLoad(cdp, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await cdp.send("Runtime.evaluate", {
      expression: "document.readyState",
      returnByValue: true
    });
    const value = state?.result?.value;
    if (value === "interactive" || value === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for document load");
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime evaluation failed");
  }
  return result.result.value;
}

function bootstrapUrl(baseUrl, session) {
  const account = session.accounts.a;
  const url = new URL("/qa/bootstrap", baseUrl);
  url.hash = new URLSearchParams({
    user_id: account.user_id,
    role: account.role,
    jwt: account.access_token,
    expires_at: String(account.expires_at || ""),
    next: "/studio"
  }).toString();
  return url.toString();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const browserPath = findBrowserPath(args.edgePath);
  if (!browserPath) {
    throw new Error("Microsoft Edge or Chrome executable was not found");
  }
  if (typeof WebSocket === "undefined") {
    throw new Error("This Node.js runtime does not provide a global WebSocket implementation");
  }

  const session = JSON.parse(await readFile(args.sessionFile, "utf8"));
  const port = 9237 + Math.floor(Math.random() * 500);
  const userDataDir = await mkdtemp(path.join(tmpdir(), "bremen-e2e-browser-"));
  const browser = spawn(
    browserPath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDir}`,
      "about:blank"
    ],
    { stdio: "ignore" }
  );

  let cdp;
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const target = await createTarget(port);
    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    await cdp.send("Page.enable");

    await cdp.send("Page.navigate", { url: bootstrapUrl(args.baseUrl, session) });
    await waitForLoad(cdp);
    await cdp.send("Runtime.evaluate", {
      expression: "new Promise((resolve) => setTimeout(resolve, 500))",
      awaitPromise: true
    });

    const results = [];
    for (const [width, height] of args.viewports) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 700
      });
      for (const pagePath of args.pages) {
        const url = new URL(pagePath, args.baseUrl).toString();
        await cdp.send("Page.navigate", { url });
        await waitForLoad(cdp);
        await cdp.send("Runtime.evaluate", {
          expression: "new Promise((resolve) => setTimeout(resolve, 700))",
          awaitPromise: true
        });
        const metrics = await evaluate(
          cdp,
          `(() => {
            const root = document.documentElement;
            const body = document.body;
            const controls = Array.from(document.querySelectorAll('a,button')).slice(0, 160)
              .map((el) => {
                const rect = el.getBoundingClientRect();
                const label = (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 80);
                return { label, width: Math.round(rect.width), height: Math.round(rect.height), visible: rect.width > 0 && rect.height > 0 };
              })
              .filter((row) => row.visible && row.height < 32 && row.width < 80)
              .slice(0, 8);
            return {
              path: location.pathname + location.search,
              title: document.title,
              heading: (document.querySelector('h1,h2')?.textContent || '').trim(),
              clientWidth: root.clientWidth,
              scrollWidth: root.scrollWidth,
              overflowX: root.scrollWidth > root.clientWidth + 1,
              bodyText: (body?.innerText || '').slice(0, 240),
              tinyTargets: controls
            };
          })()`
        );
        results.push({ viewport: `${width}x${height}`, ...metrics });
      }
    }

    const logEvents = cdp.readEvents(["Runtime.exceptionThrown", "Log.entryAdded", "Network.responseReceived"]);
    const importantLogs = logEvents
      .map((event) => {
        if (event.method === "Runtime.exceptionThrown") {
          return { level: "error", text: event.params?.exceptionDetails?.text || "runtime_exception" };
        }
        if (event.method === "Network.responseReceived") {
          const response = event.params?.response || {};
          const status = Number(response.status || 0);
          if (status < 400) return null;
          return { level: "error", text: `HTTP ${status}: ${response.url || "unknown"}` };
        }
        return {
          level: event.params?.entry?.level || "log",
          text: String(event.params?.entry?.text || "").slice(0, 240)
        };
      })
      .filter(Boolean)
      .filter((row) => ["error", "warning"].includes(row.level));

    const failed = results.filter((row) => row.overflowX);
    const output = {
      browser: path.basename(browserPath),
      results,
      logs: importantLogs,
      pass: failed.length === 0 && importantLogs.length === 0
    };
    console.log(JSON.stringify(output, null, 2));
    if (!output.pass) {
      process.exitCode = 1;
    }
  } finally {
    if (cdp) cdp.close();
    browser.kill();
    await rmWithRetry(userDataDir);
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
