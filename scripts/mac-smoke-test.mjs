// 在 CI 里对打包好的 macOS app 做交互式冒烟测试：真实模拟点击、检查状态、截图，
// 而不只是看进程有没有崩溃。复用了本地开发时验证 Windows 版用的同一套 CDP 手法。
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const binPath = process.argv[2];
if (!binPath) {
  console.error("usage: node mac-smoke-test.mjs <path-to-app-binary>");
  process.exit(1);
}

const DEBUG_PORT = 9333;
const child = spawn(binPath, [`--remote-debugging-port=${DEBUG_PORT}`, "--disable-gpu", "--no-sandbox"], {
  stdio: ["ignore", "pipe", "pipe"],
});
let stdout = "";
let stderr = "";
child.stdout.on("data", (d) => (stdout += d.toString()));
child.stderr.on("data", (d) => (stderr += d.toString()));

function fail(msg) {
  console.error("FAIL:", msg);
  console.error("--- child stdout ---\n" + stdout);
  console.error("--- child stderr ---\n" + stderr);
  child.kill();
  process.exit(1);
}

async function waitForTarget(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const targets = await res.json();
      const page = targets.find((t) => t.type === "page");
      if (page) return page;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return null;
}

function connectCdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (e) => reject(e));
  });
}

function makeClient(ws) {
  let id = 1;
  const pending = new Map();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  return {
    send(method, params) {
      const msgId = id++;
      return new Promise((resolve) => {
        pending.set(msgId, resolve);
        ws.send(JSON.stringify({ id: msgId, method, params: params || {} }));
      });
    },
    async evalJs(expr) {
      const res = await this.send("Runtime.evaluate", {
        expression: expr,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.result && res.result.exceptionDetails) {
        throw new Error(JSON.stringify(res.result.exceptionDetails));
      }
      return res.result && res.result.result ? res.result.result.value : undefined;
    },
  };
}

const results = {};

const target = await waitForTarget(15000);
if (!target) fail("no CDP target appeared within 15s (renderer never started or crashed)");

const ws = await connectCdp(target.webSocketDebuggerUrl);
const client = makeClient(ws);
await client.send("Runtime.enable");
await client.send("Page.enable");

// 基本健全性：preload 是否正常工作、marked 是否加载
results.windowApiExists = await client.evalJs("typeof window.api");
results.markedExists = await client.evalJs("typeof marked");
results.fontFamilyResolved = await client.evalJs(
  "getComputedStyle(document.body).fontFamily"
);
results.appRegionDrag = await client.evalJs(
  'getComputedStyle(document.getElementById("titlebar")).getPropertyValue("-webkit-app-region")'
);

// 真实点击播放按钮，检查状态是否真的切换（跟本地测 Windows 版用的是同一手法）
const rect = JSON.parse(await client.evalJs('JSON.stringify(document.getElementById("btn-play").getBoundingClientRect())'));
const cx = rect.x + rect.width / 2;
const cy = rect.y + rect.height / 2;
await client.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: cy });
await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 });
await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 });
await new Promise((r) => setTimeout(r, 300));
results.playingAfterRealClick = await client.evalJs("playing");

// 截图存下来，直接看渲染效果（透明背景合成、字体、布局在 macOS 上到底长什么样）
const shot = await client.send("Page.captureScreenshot", { format: "png" });
if (shot.result && shot.result.data) {
  writeFileSync("mac-screenshot.png", Buffer.from(shot.result.data, "base64"));
  results.screenshotSaved = true;
} else {
  results.screenshotSaved = false;
}

console.log("RESULTS:", JSON.stringify(results, null, 2));

child.kill();

const problems = [];
if (results.windowApiExists !== "object") problems.push("window.api missing — preload failed");
if (results.markedExists !== "object" && results.markedExists !== "function") problems.push("marked not loaded");
if (results.appRegionDrag !== "drag") problems.push("titlebar drag region not applied");
if (results.playingAfterRealClick !== true) problems.push("play button click did not toggle playing state");
if (!results.screenshotSaved) problems.push("screenshot capture failed");

if (problems.length) {
  console.error("PROBLEMS FOUND:", problems.join("; "));
  process.exit(1);
}
console.log("All checks passed.");
