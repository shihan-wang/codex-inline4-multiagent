import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:15313';
const output = path.resolve('artifacts/v3/phase1/qa');
const debugPort = 15314;
const profile = await mkdtemp(path.join(os.tmpdir(), 'inline4-v3-deep-'));
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-gpu-sandbox', '--disable-features=SkiaGraphite', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let endpoint;
for (let attempt = 0; attempt < 100 && !endpoint; attempt += 1) {
  try {
    const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
    endpoint = pages.find((page) => page.type === 'page')?.webSocketDebuggerUrl;
  } catch { /* starting */ }
  if (!endpoint) await sleep(100);
}
if (!endpoint) throw new Error('Edge debugger unavailable');

const ws = new WebSocket(endpoint);
await new Promise((resolve, reject) => {
  ws.addEventListener('open', resolve, { once: true });
  ws.addEventListener('error', reject, { once: true });
});
let nextId = 1;
const pending = new Map();
const diagnostics = { console: [], exceptions: [], logs: [] };
ws.addEventListener('message', ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') diagnostics.console.push(message.params.type);
  if (message.method === 'Runtime.exceptionThrown') diagnostics.exceptions.push(message.params.exceptionDetails.text);
  if (message.method === 'Log.entryAdded') diagnostics.logs.push(message.params.entry);
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = nextId++;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};
const screenshot = async (name) => {
  const { data } = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const bytes = Buffer.from(data, 'base64');
  await writeFile(path.join(output, name), bytes);
  return createHash('sha256').update(bytes).digest('hex');
};

try {
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Log.enable')]);
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: baseUrl });
  await sleep(2500);

  const modeResults = {};
  for (const mode of ['solid', 'xray', 'section']) {
    await evaluate(`document.querySelector('.mode-control button[data-value="${mode}"]').click()`);
    await sleep(500);
    modeResults[mode] = await evaluate(`(() => ({
      active: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
      focused: document.activeElement?.dataset?.value ?? null,
      classes: Object.fromEntries([...document.querySelectorAll('.mode-control button')].map((node) => [node.dataset.value, node.className]))
    }))()`);
  }

  const cameraResults = {};
  for (const preset of ['isometric', 'front', 'side', 'top', 'crank', 'combustion']) {
    await evaluate(`document.querySelector('.preset-row button[data-value="${preset}"]').click()`);
    await sleep(1000);
    cameraResults[preset] = {
      dom: await evaluate(`(() => ({
        activePreset: [...document.querySelectorAll('.preset-row button.is-active')].map((node) => node.dataset.value ?? 'reset'),
        activeMode: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
        visibleLabels: [...document.querySelectorAll('.engine-part-label')].filter((node) => getComputedStyle(node).visibility !== 'hidden').map((node) => node.innerText.replace(/\\n/g, ' / '))
      }))()`),
      screenshotHash: await screenshot(`deep-camera-${preset}.png`),
    };
  }

  await evaluate(`document.querySelector('.preset-row button[data-value="front"]').click()`);
  await sleep(900);
  await evaluate(`document.querySelector('.preset-row button:last-child').click()`);
  await sleep(1200);
  const resetState = await evaluate(`(() => ({
    activePreset: [...document.querySelectorAll('.preset-row button.is-active')].map((node) => node.dataset.value ?? 'reset'),
    activeMode: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value)
  }))()`);
  const resetHash = await screenshot('deep-camera-reset.png');

  const keyboardResults = {};
  for (const key of ['1', '5', '6', 'r']) {
    await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${key}', code: '${key === 'r' ? 'KeyR' : `Digit${key}`}', bubbles: true }))`);
    await sleep(1100);
    keyboardResults[key] = await evaluate(`(() => ({
      activePreset: [...document.querySelectorAll('.preset-row button.is-active')].map((node) => node.dataset.value ?? 'reset'),
      activeMode: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
      visibleLabels: [...document.querySelectorAll('.engine-part-label')].filter((node) => getComputedStyle(node).visibility !== 'hidden').map((node) => node.innerText.replace(/\\n/g, ' / '))
    }))()`);
  }

  const pauseStart = await evaluate(`document.querySelector('.gauge strong').textContent`);
  await evaluate(`document.querySelector('.play-button').click()`);
  await sleep(700);
  const pauseA = await evaluate(`document.querySelector('.gauge strong').textContent`);
  await sleep(700);
  const pauseB = await evaluate(`document.querySelector('.gauge strong').textContent`);
  const pauseLabel = await evaluate(`document.querySelector('.run-copy strong').textContent`);
  await evaluate(`document.querySelector('.play-button').click()`);
  await sleep(700);
  const resumed = await evaluate(`document.querySelector('.gauge strong').textContent`);

  const operatingExtremes = [];
  for (const [rpm, load] of [[600, 0], [2600, 100]]) {
    operatingExtremes.push(await evaluate(`new Promise((resolve) => {
      const inputs = document.querySelectorAll('input[type=range]');
      inputs[0].value='${rpm}'; inputs[0].dispatchEvent(new Event('input',{bubbles:true}));
      inputs[1].value='${load}'; inputs[1].dispatchEvent(new Event('input',{bubbles:true}));
      setTimeout(() => resolve({ labels:[...document.querySelectorAll('.control-label strong')].map(n=>n.textContent), gauges:[...document.querySelectorAll('.gauge strong')].map(n=>n.textContent) }), 500);
    })`));
  }

  const labelToggle = await evaluate(`(() => {
    const input=document.querySelector('#toggle-labels'); const layer=document.querySelector('.engine-label-layer');
    const before={checked:input.checked,hidden:layer.hidden}; input.click();
    const after={checked:input.checked,hidden:layer.hidden}; input.click(); return {before,after,restored:{checked:input.checked,hidden:layer.hidden}};
  })()`);

  const report = {
    modeResults,
    cameraResults,
    resetState,
    resetHash,
    keyboardResults,
    pause: { pauseStart, pauseA, pauseB, pauseLabel, resumed, held: pauseA === pauseB, resumedChanged: resumed !== pauseB },
    operatingExtremes,
    labelToggle,
    diagnostics,
  };
  await writeFile(path.join(output, 'runtime-deep-audit.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  ws.close();
  edge.kill();
  await sleep(1000);
  await rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
}
