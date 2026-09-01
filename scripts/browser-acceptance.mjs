import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:4173';
const outputDirectory = path.resolve(process.argv[3] ?? 'artifacts/browser');
const edgePath = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = Number(process.env.EDGE_DEBUG_PORT ?? (10_000 + process.pid % 20_000));
const requestedGpuMode = process.env.BROWSER_GPU_MODE === 'hardware' ? 'hardware' : 'swiftshader';
const negativeFixture = process.env.BROWSER_NEGATIVE_FIXTURE === '1';

await mkdir(outputDirectory, { recursive: true });
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'inline4-edge-'));
const gpuArguments = requestedGpuMode === 'swiftshader'
  ? ['--use-angle=swiftshader', '--use-gl=angle', '--enable-unsafe-swiftshader']
  : [];
const browser = spawn(edgePath, [
  '--headless=new',
  '--no-sandbox',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDirectory}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-gpu-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu-shader-disk-cache',
  '--disable-features=SkiaGraphite',
  ...gpuArguments,
  '--hide-scrollbars',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

const browserStderr = [];
browser.stderr.on('data', (chunk) => browserStderr.push(chunk.toString()));
browser.on('exit', (code, signal) => {
  process.stderr.write(`[browser-exit] code=${String(code)} signal=${String(signal)}\n`);
});

class CdpSession {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.closedByUs = false;
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
    });
    this.socket.addEventListener('close', () => {
      if (!this.closedByUs) {
        const detail = browserStderr.join('').slice(-4_000);
        for (const { reject } of this.pending.values()) reject(new Error(`CDP WebSocket closed unexpectedly. ${detail}`));
      }
      this.pending.clear();
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timeout);
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
    this.closedByUs = true;
    this.socket.close();
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForAnimationFrames(cdp, count = 2) {
  await evaluate(cdp, `new Promise((resolve) => {
    let remaining = ${count};
    const step = () => { remaining -= 1; if (remaining <= 0) resolve(true); else requestAnimationFrame(step); };
    requestAnimationFrame(step);
  })`, true);
}

async function waitForDebugger() {
  const endpoint = `http://127.0.0.1:${debugPort}/json/list`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(endpoint)).json();
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Browser is still starting.
    }
    await sleep(150);
  }
  throw new Error('Edge remote-debugging endpoint did not become ready.');
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  await sleep(2500);
}

async function capture(cdp, fileName) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDirectory, fileName), Buffer.from(data, 'base64'));
}

async function inspectPage(cdp, viewportName) {
  return evaluate(cdp, `(() => {
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height,
        right: box.right, bottom: box.bottom,
        clipped: box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight };
    };
    const visibleWidth = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      const box = node.getBoundingClientRect();
      return Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left));
    };
    const canvas = document.querySelector('canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const controls = [...document.querySelectorAll('button, input')];
    return {
      viewport: '${viewportName}',
      url: location.href,
      title: document.title,
      bodyTextLength: document.body.innerText.length,
      canvas: canvas ? { width: canvas.width, height: canvas.height,
        clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
      webgl: gl ? {
        version: gl.getParameter(gl.VERSION),
        renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      } : null,
      controls: { total: controls.length, buttons: document.querySelectorAll('button').length,
        ranges: document.querySelectorAll('input[type=range]').length,
        checkboxes: document.querySelectorAll('input[type=checkbox]').length },
      layout: {
        topbar: rect('.topbar'), leftPanel: rect('.panel-left'), rightPanel: rect('.panel-right'),
        dock: rect('.bottom-dock'), dashboard: rect('.dashboard'),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        visiblePanelWidth: visibleWidth('.panel-left') + visibleWidth('.panel-right'),
      },
      responsive: {
        mobileToggles: [...document.querySelectorAll('.mobile-panel-toggle')].map((node) => ({
          text: node.textContent, displayed: getComputedStyle(node).display !== 'none',
          expanded: node.getAttribute('aria-expanded'),
        })),
        visiblePresetCount: [...document.querySelectorAll('.preset-row button[data-value]')]
          .filter((node) => getComputedStyle(node).display !== 'none').length,
      },
      values: [...document.querySelectorAll('.gauge strong')].map((node) => node.textContent),
      strokes: [...document.querySelectorAll('.cylinder-card .stroke-copy strong')].map((node) => node.textContent),
      runningLabel: document.querySelector('.run-copy strong')?.textContent ?? null,
    };
  })()`);
}

async function measureAnimation(cdp) {
  return evaluate(cdp, `new Promise((resolve) => {
    const samples = [];
    const drawsBefore = { ...(globalThis.__inline4DrawStats ?? {}) };
    let previous = performance.now();
    const started = previous;
    const step = (now) => {
      samples.push(now - previous);
      previous = now;
      if (samples.length < 121) return requestAnimationFrame(step);
      const sorted = samples.slice(1).sort((a, b) => a - b);
      const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
      const drawsAfter = globalThis.__inline4DrawStats ?? {};
      const drawCalls = Object.fromEntries(Object.keys(drawsAfter).map((key) => [key, (drawsAfter[key] ?? 0) - (drawsBefore[key] ?? 0)]));
      resolve({ durationMs: now - started, frames: 120, averageFps: 1000 / mean,
        p95FrameMs: sorted[Math.floor(sorted.length * 0.95)], maxFrameMs: Math.max(...sorted),
        drawCalls, drawCallsPerFrame: Object.values(drawCalls).reduce((sum, value) => sum + value, 0) / 120 });
    };
    requestAnimationFrame(step);
  })`, true);
}

async function exerciseControls(cdp) {
  const beforePause = await evaluate(cdp, `document.querySelector('.gauge strong')?.textContent`);
  await evaluate(cdp, `document.querySelector('.play-button')?.click()`);
  await sleep(450);
  const paused = await evaluate(cdp, `({
    crank: document.querySelector('.gauge strong')?.textContent,
    label: document.querySelector('.run-copy strong')?.textContent,
    title: document.querySelector('.play-button')?.title
  })`);
  await sleep(450);
  const pausedAgain = await evaluate(cdp, `document.querySelector('.gauge strong')?.textContent`);
  await evaluate(cdp, `document.querySelector('.play-button')?.click()`);

  const sliders = await evaluate(cdp, `(() => {
    const ranges = [...document.querySelectorAll('input[type=range]')];
    ranges[0].value = '1800'; ranges[0].dispatchEvent(new Event('input', { bubbles: true }));
    ranges[1].value = '75'; ranges[1].dispatchEvent(new Event('input', { bubbles: true }));
    return [...document.querySelectorAll('.control-label strong')].map((node) => node.textContent);
  })()`);

  const modes = {};
  for (const mode of ['solid', 'xray', 'section']) {
    modes[mode] = await evaluate(cdp, `(() => {
      const button = document.querySelector('.mode-control button[data-value="${mode}"]');
      button?.click();
      return { found: Boolean(button), active: button?.classList.contains('is-active') ?? false };
    })()`);
    await sleep(250);
  }

  const cameras = await evaluate(cdp, `(() => {
    const values = [];
    for (const button of document.querySelectorAll('.preset-row button[data-value]')) {
      button.click(); values.push({ value: button.dataset.value, active: button.classList.contains('is-active') });
    }
    document.querySelector('.preset-row button:last-child')?.click();
    return values;
  })()`);

  const semanticCameraStates = await evaluate(cdp, `(() => {
    const read = () => ({
      presets: [...document.querySelectorAll('.preset-row button[data-value].is-active')].map((node) => node.dataset.value),
      modes: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
    });
    const fireKey = (target, key, code) => {
      target.focus();
      target.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true }));
    };
    const result = {};
    document.querySelector('.preset-row button[data-value="front"]')?.click();
    document.querySelector('.reset-camera')?.click();
    result.resetButton = read();
    const targets = [
      document.querySelector('.slider-group input'),
      document.querySelector('#semantic-part-select'),
      document.querySelector('.mode-control button[data-value="solid"]'),
      document.querySelector('#toggle-labels'),
      document.querySelector('.preset-row button[data-value="front"]'),
      document.querySelector('.reset-camera'),
    ];
    for (let index = 0; index < targets.length; index += 1) {
      document.querySelector('.mode-control button[data-value="solid"]')?.click();
      const digit = String(index + 1);
      fireKey(targets[index], digit, 'Digit' + digit);
      result['key' + digit + 'WithFocusedControl'] = read();
    }
    fireKey(document.querySelector('#semantic-part-select'), 'r', 'KeyR');
    result.keyRWithFocusedControl = read();
    return result;
  })()`);

  const toggles = await evaluate(cdp, `(() => {
    const result = [];
    for (const input of document.querySelectorAll('.toggle-row input')) {
      const before = input.checked; input.click(); result.push({ id: input.id, before, after: input.checked }); input.click();
    }
    return result;
  })()`);

  return {
    pause: { beforePause, ...paused, pausedAgain, held: paused.crank === pausedAgain },
    sliders,
    modes,
    cameras,
    semanticCameraStates,
    toggles,
  };
}

async function exerciseNarrowControls(cdp) {
  const inspect = () => evaluate(cdp, `(() => {
    const visibleWidth = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return 0;
      const box = node.getBoundingClientRect();
      return Math.max(0, Math.min(innerWidth, box.right) - Math.max(0, box.left));
    };
    const details = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const box = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return { x: box.x, right: box.right, width: box.width, visibleWidth: visibleWidth(selector),
        transform: style.transform, visibility: style.visibility, opacity: style.opacity };
    };
    return {
      visiblePanelWidth: visibleWidth('.panel-left') + visibleWidth('.panel-right'),
      visiblePresetCount: [...document.querySelectorAll('.preset-row button[data-value]')]
        .filter((node) => getComputedStyle(node).display !== 'none').length,
      left: details('.panel-left'), right: details('.panel-right'),
      rootClass: document.querySelector('.dashboard')?.className ?? '',
      expanded: [...document.querySelectorAll('.mobile-panel-toggle')].map((node) => node.getAttribute('aria-expanded')),
    };
  })()`);
  const initial = await inspect();
  await evaluate(cdp, `document.querySelectorAll('.mobile-panel-toggle')[0]?.click()`);
  await sleep(1800);
  const leftOpen = await inspect();
  await capture(cdp, 'narrow-left-open.png');
  await evaluate(cdp, `document.querySelectorAll('.mobile-panel-toggle')[0]?.click()`);
  await sleep(1000);
  await evaluate(cdp, `document.querySelectorAll('.mobile-panel-toggle')[1]?.click()`);
  await sleep(1800);
  const rightOpen = await inspect();
  await capture(cdp, 'narrow-right-open.png');
  await evaluate(cdp, `document.querySelectorAll('.mobile-panel-toggle')[1]?.click()`);
  await sleep(1000);
  const final = await inspect();
  return { initial, leftOpen, rightOpen, final };
}

function validateReport(report) {
  const failures = [];
  const check = (condition, message) => { if (!condition) failures.push(message); };
  check(Boolean(report.desktop.canvas), 'desktop canvas missing');
  check(Boolean(report.desktop.webgl), 'WebGL context missing');
  check(!report.desktop.layout.horizontalOverflow && !report.desktop.layout.verticalOverflow, 'desktop layout overflows viewport');
  check(!report.narrow.layout.horizontalOverflow && !report.narrow.layout.verticalOverflow, 'narrow layout overflows viewport');
  check(report.interactions.pause.held, 'pause did not hold crank telemetry');
  check(report.interactions.pause.label === 'ENGINE PAUSED', 'pause state label did not update');
  check(report.interactions.sliders.some((value) => value.includes('1800')), 'RPM slider did not update');
  check(report.interactions.sliders.some((value) => value.includes('75')), 'load slider did not update');
  check(Object.values(report.interactions.modes).every((mode) => mode.found && mode.active), 'one or more view modes did not activate');
  check(report.interactions.cameras.length === 6 && report.interactions.cameras.every((camera) => camera.active), 'one or more camera presets did not activate');
  const semantic = report.interactions.semanticCameraStates;
  check(JSON.stringify(semantic.resetButton) === JSON.stringify({ presets: ['isometric'], modes: ['solid'] }), 'reset button camera/mode state diverged');
  const focusedShortcutExpectations = {
    key1WithFocusedControl: { presets: ['isometric'], modes: ['solid'] },
    key2WithFocusedControl: { presets: ['front'], modes: ['solid'] },
    key3WithFocusedControl: { presets: ['side'], modes: ['solid'] },
    key4WithFocusedControl: { presets: ['top'], modes: ['solid'] },
    key5WithFocusedControl: { presets: ['crank'], modes: ['section'] },
    key6WithFocusedControl: { presets: ['combustion'], modes: ['xray'] },
    keyRWithFocusedControl: { presets: ['isometric'], modes: ['solid'] },
  };
  for (const [name, expected] of Object.entries(focusedShortcutExpectations)) {
    check(JSON.stringify(semantic[name]) === JSON.stringify(expected), `${name} camera/mode state diverged`);
  }
  check(report.interactions.toggles.length === 3 && report.interactions.toggles.every((toggle) => toggle.before !== toggle.after), 'one or more visibility toggles did not change');
  check(report.narrow.layout.visiblePanelWidth <= report.narrow.canvas.clientWidth * 0.4, 'narrow initial panels obscure more than 40% of canvas width');
  check(report.narrow.responsive.visiblePresetCount === 6, 'not all six camera presets are available at narrow width');
  check(report.narrowInteractions.initial.visiblePresetCount === 6, 'narrow preset rail lost a camera control');
  check(report.narrowInteractions.leftOpen.rootClass.includes('is-left-open') && report.narrowInteractions.leftOpen.left.visibleWidth >= 240 && report.narrowInteractions.leftOpen.expanded[0] === 'true', 'narrow control drawer did not open accessibly');
  check(report.narrowInteractions.rightOpen.rootClass.includes('is-right-open') && report.narrowInteractions.rightOpen.right.visibleWidth >= 240 && report.narrowInteractions.rightOpen.expanded[1] === 'true', 'narrow telemetry drawer did not open accessibly');
  check(report.pointerInteractions.rotateChanged, 'orbit interaction produced no projected change');
  check(report.pointerInteractions.zoomChanged, 'zoom interaction produced no projected change');
  check(report.pointerInteractions.panChanged, 'pan interaction produced no projected change');
  check((report.pointerInteractions.selection?.fields ?? 0) >= 5, 'part selection/inspector did not expose full metadata');
  check(report.frameTiming.frames === 120 && report.frameTiming.drawCallsPerFrame > 0, 'animation/draw measurement incomplete');
  check(report.diagnostics.pageExceptions.length === 0, 'page exception captured');
  check(!report.diagnostics.consoleMessages.some((entry) => entry.type === 'error'), 'console error captured');
  check(!report.diagnostics.logEntries.some((entry) => entry.level === 'error'), 'browser log error captured');
  return failures;
}

async function canvasInteractions(cdp) {
  const labelTransforms = () => evaluate(cdp, `[...document.querySelectorAll('.engine-part-label')].map((node) => node.style.transform)`);
  const before = await labelTransforms();

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 625, y: 355, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 720, y: 385, button: 'left', buttons: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 720, y: 385, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(600);
  const afterRotate = await labelTransforms();

  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 650, y: 360, deltaX: 0, deltaY: -420 });
  await sleep(600);
  const afterZoom = await labelTransforms();

  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 625, y: 355, button: 'right', buttons: 2, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 670, y: 325, button: 'right', buttons: 2 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 670, y: 325, button: 'right', buttons: 0, clickCount: 1 });
  await sleep(600);
  const afterPan = await labelTransforms();

  let selection = null;
  for (const [x, y] of [[640, 310], [720, 280], [570, 400], [780, 430], [500, 270]]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(180);
    selection = await evaluate(cdp, `(() => {
      const inspector = document.querySelector('.inspector');
      return inspector?.classList.contains('has-part') ? {
        title: inspector.querySelector('.part-title strong')?.textContent,
        english: inspector.querySelector('.part-title small')?.textContent,
        fields: inspector.querySelectorAll('dd').length,
      } : null;
    })()`);
    if (selection) break;
  }
  if (selection) await capture(cdp, 'desktop-selected.png');

  // Preserve the selection assertion, then clear the cyan inspector box so
  // visual-regression captures compare the engine rather than test residue.
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 950, y: 650, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 950, y: 650, button: 'left', buttons: 0, clickCount: 1 });

  await evaluate(cdp, `document.querySelector('.preset-row button[data-value="isometric"]')?.click()`);
  await sleep(900);
  return {
    rotateChanged: JSON.stringify(before) !== JSON.stringify(afterRotate),
    zoomChanged: JSON.stringify(afterRotate) !== JSON.stringify(afterZoom),
    panChanged: JSON.stringify(afterZoom) !== JSON.stringify(afterPan),
    selection,
  };
}

let cdp;
try {
  process.stderr.write('[acceptance] waiting for Edge debugger\n');
  cdp = new CdpSession(await waitForDebugger());
  await cdp.connect();

  const consoleMessages = [];
  const pageExceptions = [];
  const logEntries = [];
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => {
    consoleMessages.push({ type, text: args.map((arg) => arg.value ?? arg.description ?? '').join(' ') });
  });
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    pageExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  cdp.on('Log.entryAdded', ({ entry }) => logEntries.push({ level: entry.level, source: entry.source, text: entry.text }));

  await Promise.all([
    cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Performance.enable'),
  ]);
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    globalThis.__inline4DrawStats = { drawArrays: 0, drawElements: 0, drawArraysInstanced: 0, drawElementsInstanced: 0 };
    for (const constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
      if (!constructor) continue;
      for (const name of Object.keys(globalThis.__inline4DrawStats)) {
        const original = constructor.prototype[name];
        if (typeof original !== 'function' || original.__inline4Wrapped) continue;
        const wrapped = function (...args) { globalThis.__inline4DrawStats[name] += 1; return original.apply(this, args); };
        wrapped.__inline4Wrapped = true;
        constructor.prototype[name] = wrapped;
      }
    }
  })();` });

  process.stderr.write('[acceptance] loading desktop viewport\n');
  await navigate(cdp, { width: 1280, height: 720 });
  const desktop = await inspectPage(cdp, '1280x720');
  process.stderr.write('[acceptance] measuring animation frames\n');
  const frameTiming = await measureAnimation(cdp);
  process.stderr.write('[acceptance] exercising controls\n');
  const interactions = await exerciseControls(cdp);
  const pointerInteractions = await canvasInteractions(cdp);
  await evaluate(cdp, `document.querySelector('.mode-control button[data-value="solid"]')?.click()`);
  await waitForAnimationFrames(cdp);
  await capture(cdp, 'desktop-solid.png');
  await evaluate(cdp, `document.querySelector('.mode-control button[data-value="xray"]')?.click()`);
  await waitForAnimationFrames(cdp);
  await capture(cdp, 'desktop-xray.png');
  await evaluate(cdp, `document.querySelector('.mode-control button[data-value="section"]')?.click()`);
  await waitForAnimationFrames(cdp);
  await capture(cdp, 'desktop-section.png');
  await evaluate(cdp, `document.querySelector('.mode-control button[data-value="solid"]')?.click(); document.querySelector('.preset-row button[data-value="crank"]')?.click()`);
  await sleep(900);
  await capture(cdp, 'desktop-crank.png');
  await evaluate(cdp, `document.querySelector('.preset-row button[data-value="combustion"]')?.click()`);
  await sleep(900);
  await capture(cdp, 'desktop-valvetrain.png');

  for (const value of ['isometric', 'front', 'side', 'top', 'crank', 'combustion']) {
    await evaluate(cdp, `document.querySelector('.mode-control button[data-value="solid"]')?.click(); document.querySelector('.preset-row button[data-value="${value}"]')?.click()`);
    await sleep(900);
    await capture(cdp, `camera-${value}-1280x720.png`);
  }

  await evaluate(cdp, `document.querySelector('.mode-control button[data-value="xray"]')?.click(); document.querySelector('.preset-row button[data-value="isometric"]')?.click()`);
  await sleep(500);
  await capture(cdp, 'flows-on-xray.png');
  await evaluate(cdp, `document.querySelector('#toggle-flows')?.click()`);
  await waitForAnimationFrames(cdp);
  await capture(cdp, 'flows-off-xray.png');
  await evaluate(cdp, `document.querySelector('#toggle-flows')?.click(); document.querySelector('.mode-control button[data-value="solid"]')?.click(); document.querySelector('.preset-row button[data-value="isometric"]')?.click(); document.querySelector('#toggle-explode')?.click()`);
  await sleep(500);
  await capture(cdp, 'desktop-exploded.png');
  await evaluate(cdp, `document.querySelector('#toggle-explode')?.click()`);

  process.stderr.write('[acceptance] loading narrow viewport\n');
  await navigate(cdp, { width: 390, height: 844 });
  const narrow = await inspectPage(cdp, '390x844');
  const narrowInteractions = await exerciseNarrowControls(cdp);
  await capture(cdp, 'narrow-390x844.png');

  const { metrics } = await cdp.send('Performance.getMetrics');
  const performanceMetrics = Object.fromEntries(
    metrics.filter(({ name }) => ['JSHeapUsedSize', 'Nodes', 'Documents', 'LayoutCount', 'RecalcStyleCount'].includes(name))
      .map(({ name, value }) => [name, value]),
  );

  const report = {
    testedAt: new Date().toISOString(),
    baseUrl,
    requestedGpuMode,
    desktop,
    narrow,
    frameTiming,
    interactions,
    narrowInteractions,
    pointerInteractions,
    diagnostics: {
      consoleMessages,
      pageExceptions,
      logEntries,
      browserStderr: browserStderr.filter((line) => /error|warning|fatal/i.test(line)).slice(0, 20),
    },
    performanceMetrics,
  };
  if (negativeFixture) {
    report.desktop.canvas = null;
    report.narrow.layout.horizontalOverflow = true;
    report.interactions.pause.held = false;
    report.interactions.semanticCameraStates.key5 = { presets: ['front'], modes: ['solid'] };
    report.pointerInteractions.rotateChanged = false;
    report.diagnostics.pageExceptions.push('NEGATIVE_FIXTURE_PAGE_EXCEPTION');
  }
  const failures = validateReport(report);
  report.acceptance = { passed: failures.length === 0, failures };
  await writeFile(path.join(outputDirectory, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures.length) throw new Error(`Browser acceptance failed:\n- ${failures.join('\n- ')}`);
} finally {
  cdp?.close();
  if (browser.exitCode === null) {
    const exited = new Promise((resolve) => browser.once('exit', resolve));
    browser.kill();
    await Promise.race([exited, sleep(3000)]);
  }
  try {
    await rm(profileDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    process.stderr.write(`[acceptance] temporary Edge profile cleanup deferred: ${String(error)}\n`);
  }
}
