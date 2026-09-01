import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const operation = this.pending.get(message.id);
        if (!operation) return;
        this.pending.delete(message.id);
        if (message.error) operation.reject(new Error(message.error.message));
        else operation.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timer);
        const listeners = this.listeners.get(method) ?? [];
        this.listeners.set(method, listeners.filter((item) => item !== listener));
        resolve(params);
      };
      this.on(method, listener);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForDebugger(port) {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Edge debugger did not start on ${port}`);
}

export async function launchEdge({ port, profilePrefix, gpuMode = 'hardware' }) {
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), profilePrefix));
  const gpuArguments = gpuMode === 'swiftshader'
    ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader']
    : [];
  const browser = spawn(EDGE_PATH, [
    '--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDirectory}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-gpu-shader-disk-cache',
    '--disable-features=SkiaGraphite', ...gpuArguments, 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  browser.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const webSocketUrl = await waitForDebugger(port);
  const cdp = new CdpSession(webSocketUrl);
  await cdp.connect();
  return {
    browser,
    cdp,
    profileDirectory,
    stderr: () => stderr,
    async close() {
      cdp.close();
      browser.kill();
      await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(3000)]);
      await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
}

export async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

export async function clickCenter(cdp, selector) {
  const point = await evaluate(cdp, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  if (!point) throw new Error(`Missing click target ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
