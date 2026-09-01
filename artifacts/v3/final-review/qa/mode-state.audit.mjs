import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:15413';
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 24113;
const profile = await mkdtemp(path.join(os.tmpdir(), 'inline4-mode-audit-'));
const browser = spawn(edgePath, [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--disable-background-networking',
  '--disable-gpu-sandbox', '--disable-features=SkiaGraphite', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let socket;
try {
  let page;
  for (let attempt = 0; attempt < 60 && !page; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
      page = pages.find((entry) => entry.type === 'page');
    } catch {}
    if (!page) await sleep(100);
  }
  if (!page) throw new Error('Edge debugger did not start');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    const operation = pending.get(message.id);
    if (!operation) return;
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(message.error.message));
    else operation.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    return result.result.value;
  };
  await Promise.all([send('Page.enable'), send('Runtime.enable')]);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await sleep(2000);
  const readState = () => evaluate(`(() => ({
    active: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
    classes: [...document.querySelectorAll('.mode-control button')].map((node) => ({ value: node.dataset.value, className: node.className })),
  }))()`);
  const states = {};
  for (const mode of ['solid', 'xray', 'section']) {
    await evaluate(`document.querySelector('.mode-control button[data-value="${mode}"]')?.click()`);
    await sleep(500);
    states[mode] = await readState();
  }
  await writeFile(
    'artifacts/v3/final-review/qa/mode-state.json',
    `${JSON.stringify({ testedAt: new Date().toISOString(), states }, null, 2)}\n`,
  );
} finally {
  socket?.close();
  browser.kill();
  await sleep(250);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
}
