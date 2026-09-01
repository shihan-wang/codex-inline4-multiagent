import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = path.resolve('../..');
const artifactsRoot = path.join(projectRoot, 'artifacts/external-eval');
const lighthouseCli = path.resolve('node_modules/lighthouse/cli/index.js');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const url = 'http://127.0.0.1:16310/';
const head = '38c00417812fa87ca76b520c17c978a14cbd8ad2';
const target = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';
const order = ['D1', 'M1', 'M2', 'D2', 'D3', 'M3', 'M4', 'D4', 'D5', 'M5'];

const runProcess = (command, args, options = {}) => new Promise((resolve) => {
  const child = spawn(command, args, { ...options, windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout?.on('data', (chunk) => { stdout += chunk; });
  child.stderr?.on('data', (chunk) => { stderr += chunk; });
  child.on('exit', (code, signal) => resolve({ code, signal, stdout, stderr }));
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDebugger(port) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page');
      if (page) return page;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Edge debugger ${port} did not start`);
}

async function cdpRequest(webSocketDebuggerUrl, method, params = {}) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const response = new Promise((resolve, reject) => {
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) return;
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  });
  socket.send(JSON.stringify({ id: 1, method, params }));
  const result = await response;
  socket.close();
  return result;
}

for (const token of order) {
  const desktop = token.startsWith('D');
  const index = Number(token.slice(1));
  const kind = desktop ? 'desktop' : 'mobile';
  const runDirectory = path.join(artifactsRoot, `performance/lighthouse/${kind}/run-${String(index).padStart(2, '0')}`);
  const logPath = path.join(artifactsRoot, `logs/performance-lighthouse-${token}.log`);
  const environmentPath = path.join(artifactsRoot, `environment/performance-lighthouse-${token}.json`);
  await Promise.all([mkdir(runDirectory, { recursive: true }), mkdir(path.dirname(logPath), { recursive: true }), mkdir(path.dirname(environmentPath), { recursive: true })]);
  const profile = await mkdtemp(path.join(os.tmpdir(), `inline4-lh-${token}-`));
  const debugPort = 25_000 + order.indexOf(token);
  const browser = spawn(edgePath, [
    '--headless=new', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-gpu-shader-disk-cache',
    '--disable-features=SkiaGraphite', 'about:blank',
  ], { stdio: 'ignore', windowsHide: true });
  const page = await waitForDebugger(debugPort);
  const rendererResult = await cdpRequest(page.webSocketDebuggerUrl, 'Runtime.evaluate', {
    expression: `(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unavailable'; })()`,
    returnByValue: true,
  });
  const renderer = rendererResult.result?.value ?? 'unavailable';
  const outputPath = path.join(runDirectory, 'report');
  const args = [
    lighthouseCli, url, '--only-categories=performance', '--output=json', '--output=html',
    `--output-path=${outputPath}`, `--port=${debugPort}`, '--max-wait-for-load=45000',
  ];
  if (desktop) args.push('--preset=desktop');
  const startedAt = new Date();
  process.stdout.write(`[lighthouse] ${token} start ${startedAt.toISOString()}\n`);
  const result = await runProcess(process.execPath, args, { cwd: process.cwd(), env: { ...process.env, CHROME_PATH: edgePath } });
  const endedAt = new Date();
  const command = `${process.execPath} ${args.join(' ')}`;
  await writeFile(logPath, `COMMAND ${command}\nEXIT ${String(result.code)} SIGNAL ${String(result.signal)}\n--- STDOUT ---\n${result.stdout}\n--- STDERR ---\n${result.stderr}\n`);
  const metadata = {
    token,
    kind,
    sequencePosition: order.indexOf(token) + 1,
    startedAtUtc: startedAt.toISOString(),
    endedAtUtc: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    command,
    exitCode: result.code,
    signal: result.signal,
    gitHead: head,
    targetTagPeeled: target,
    url,
    viewport: desktop ? 'Lighthouse desktop preset' : 'Lighthouse default mobile preset',
    coldCache: true,
    freshProfile: true,
    renderer,
  };
  await writeFile(path.join(runDirectory, 'run-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  await writeFile(environmentPath, `${JSON.stringify(metadata, null, 2)}\n`);
  try {
    const version = await fetch(`http://127.0.0.1:${debugPort}/json/version`).then((response) => response.json());
    await cdpRequest(version.webSocketDebuggerUrl, 'Browser.close');
  } catch {
    browser.kill();
  }
  await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(3000)]);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(async (error) => {
    await writeFile(path.join(runDirectory, 'profile-cleanup-error.txt'), String(error));
  });
  process.stdout.write(`[lighthouse] ${token} exit=${String(result.code)} duration=${metadata.durationMs}ms\n`);
}
