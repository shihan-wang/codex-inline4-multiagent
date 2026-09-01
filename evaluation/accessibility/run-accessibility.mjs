import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axe from 'axe-core';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');
const baseUrl = process.env.ACCESSIBILITY_BASE_URL ?? 'http://127.0.0.1:16320';
const debugPort = Number(process.env.ACCESSIBILITY_DEBUG_PORT ?? 16321);
const edgePath = process.env.EDGE_PATH
  ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const artifactRoot = path.join(projectRoot, 'artifacts', 'external-eval');
const axeRoot = path.join(artifactRoot, 'accessibility', 'axe');
const manualRoot = path.join(artifactRoot, 'accessibility', 'manual');
const environmentRoot = path.join(artifactRoot, 'environment');
const logRoot = path.join(artifactRoot, 'logs');

await Promise.all([axeRoot, manualRoot, environmentRoot, logRoot].map((directory) => mkdir(directory, { recursive: true })));

async function nextRunId() {
  const sentinel = path.join(axeRoot, 'desktop-solid');
  await mkdir(sentinel, { recursive: true });
  const names = await readdir(sentinel);
  const numbers = names
    .map((name) => /^run-(\d+)$/.exec(name)?.[1])
    .filter(Boolean)
    .map(Number);
  return `run-${String((numbers.length ? Math.max(...numbers) : 0) + 1).padStart(2, '0')}`;
}

const runId = await nextRunId();
const manualRunRoot = path.join(manualRoot, runId);
await mkdir(manualRunRoot, { recursive: true });
const logPath = path.join(logRoot, `accessibility-${runId}.log`);
const environmentPath = path.join(environmentRoot, `accessibility-${runId}.json`);
const logLines = [];

async function log(message) {
  const line = `${new Date().toISOString()} ${message}`;
  logLines.push(line);
  process.stderr.write(`${line}\n`);
  await writeFile(logPath, `${logLines.join('\n')}\n`);
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
  return {
    command: [command, ...args],
    exitCode: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
}

const gitHead = commandOutput('git', ['rev-parse', 'HEAD']);
const fixedTag = commandOutput('git', ['rev-parse', 'v3-model-final^{}']);
const srcDiffStart = commandOutput('git', ['diff', '--exit-code', 'v3-model-final', '--', 'src']);
const edgeVersion = commandOutput(edgePath, ['--version']);
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'inline4-accessibility-edge-'));
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
  '--hide-scrollbars',
  'about:blank',
], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
const browserStderr = [];
browser.stderr.on('data', (chunk) => browserStderr.push(chunk.toString()));

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
        for (const { reject } of this.pending.values()) reject(new Error('CDP socket closed unexpectedly'));
      }
      this.pending.clear();
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
  }

  once(method, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (params) => {
        clearTimeout(timeout);
        const listeners = this.listeners.get(method) ?? [];
        this.listeners.set(method, listeners.filter((candidate) => candidate !== listener));
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

async function waitForDebugger() {
  const endpoint = `http://127.0.0.1:${debugPort}/json/list`;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(endpoint)).json();
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Edge is still starting.
    }
    await sleep(150);
  }
  throw new Error('Edge remote-debugging endpoint did not become ready.');
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result.value;
}

async function navigate(cdp, viewport) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    mobile: false,
  });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  const ready = await evaluate(cdp, `new Promise((resolve) => {
    const deadline = performance.now() + 12000;
    const check = () => {
      const canvas = document.querySelector('canvas');
      const okay = canvas?.width > 0 && canvas?.height > 0
        && document.querySelectorAll('.mode-control button').length === 3
        && document.querySelectorAll('.preset-row button').length === 7;
      if (okay) resolve(true);
      else if (performance.now() > deadline) resolve(false);
      else requestAnimationFrame(check);
    };
    check();
  })`, true);
  if (!ready) throw new Error('Page did not reach accessibility-ready state.');
  await sleep(600);
}

async function capture(cdp, filePath) {
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(filePath, Buffer.from(data, 'base64'));
}

async function clickSelector(cdp, selector) {
  return evaluate(cdp, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return false;
    node.click();
    return true;
  })()`);
}

async function selectPart(cdp) {
  for (const [x, y] of [[640, 310], [720, 280], [570, 400], [780, 430], [500, 270]]) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(180);
    const selected = await evaluate(cdp, `document.querySelector('.inspector')?.classList.contains('has-part') ?? false`);
    if (selected) return true;
  }
  return false;
}

const stateDefinitions = [
  { id: 'desktop-solid', viewport: { width: 1280, height: 720 }, setup: async () => {} },
  { id: 'desktop-xray', viewport: { width: 1280, height: 720 }, setup: async (cdp) => clickSelector(cdp, '.mode-control button[data-value="xray"]') },
  { id: 'desktop-section', viewport: { width: 1280, height: 720 }, setup: async (cdp) => clickSelector(cdp, '.mode-control button[data-value="section"]') },
  { id: 'desktop-selected', viewport: { width: 1280, height: 720 }, setup: async (cdp) => selectPart(cdp) },
  { id: 'desktop-paused', viewport: { width: 1280, height: 720 }, setup: async (cdp) => clickSelector(cdp, '.play-button') },
  { id: 'desktop-exploded', viewport: { width: 1280, height: 720 }, setup: async (cdp) => clickSelector(cdp, '#toggle-explode') },
  { id: 'narrow-initial', viewport: { width: 390, height: 844 }, setup: async () => {} },
  { id: 'narrow-left-drawer', viewport: { width: 390, height: 844 }, setup: async (cdp) => clickSelector(cdp, '.mobile-panel-toggle:nth-child(1)') },
  { id: 'narrow-right-drawer', viewport: { width: 390, height: 844 }, setup: async (cdp) => clickSelector(cdp, '.mobile-panel-toggle:nth-child(2)') },
];

const interactiveSnapshotExpression = `(() => {
  const visible = (node) => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  };
  const name = (node) => {
    const labelledBy = node.getAttribute('aria-labelledby');
    if (labelledBy) {
      const text = labelledBy.split(/\\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
      if (text) return text;
    }
    const explicit = node.getAttribute('aria-label');
    if (explicit?.trim()) return explicit.trim();
    if (node.id) {
      const label = document.querySelector('label[for="' + CSS.escape(node.id) + '"]');
      if (label?.textContent?.trim()) return label.textContent.trim();
    }
    const closestLabel = node.closest('label');
    if (closestLabel?.textContent?.trim()) return closestLabel.textContent.trim();
    return (node.getAttribute('alt') || node.getAttribute('title') || node.textContent || '').trim();
  };
  const role = (node) => node.getAttribute('role') || ({BUTTON:'button',A:'link',INPUT:({range:'slider',checkbox:'checkbox'}[node.type] || 'textbox'),SELECT:'combobox',TEXTAREA:'textbox'}[node.tagName] || null);
  const nodes = [...document.querySelectorAll('button, a[href], input, select, textarea, [role], [tabindex]')]
    .filter(visible)
    .map((node) => ({
      tag: node.tagName.toLowerCase(),
      id: node.id || null,
      classes: node.className || null,
      role: role(node),
      name: name(node),
      type: node.getAttribute('type'),
      tabindex: node.getAttribute('tabindex'),
      disabled: node.disabled || node.getAttribute('aria-disabled') === 'true',
      checked: typeof node.checked === 'boolean' ? node.checked : null,
      pressed: node.getAttribute('aria-pressed'),
      expanded: node.getAttribute('aria-expanded'),
      valueNow: node.getAttribute('aria-valuenow') || (node.type === 'range' ? node.value : null),
      active: node.classList.contains('is-active'),
    }));
  const canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl?.getParameter(gl.RENDERER),
    documentOverflow: {
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    },
    selectedPart: document.querySelector('.inspector.has-part .part-title strong')?.textContent?.trim() ?? null,
    runningText: document.querySelector('.play-copy strong')?.textContent?.trim() ?? document.querySelector('.play-button')?.getAttribute('aria-label') ?? null,
    activeModes: [...document.querySelectorAll('.mode-control button.is-active')].map((node) => node.dataset.value),
    activePresets: [...document.querySelectorAll('.preset-row button.is-active')].map((node) => node.dataset.value),
    interactive: nodes,
  };
})()`;

async function runState(cdp, definition) {
  const directory = path.join(axeRoot, definition.id, runId);
  await mkdir(directory, { recursive: true });
  await log(`state ${definition.id}: navigate ${definition.viewport.width}x${definition.viewport.height}`);
  try {
    await navigate(cdp, definition.viewport);
    const setupResult = await definition.setup(cdp);
    await sleep(400);
    await capture(cdp, path.join(directory, 'screenshot.png'));
    const metadata = await evaluate(cdp, interactiveSnapshotExpression);
    metadata.state = definition.id;
    metadata.setupResult = setupResult ?? null;
    metadata.capturedAt = new Date().toISOString();
    await writeFile(path.join(directory, 'state-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    const axTree = await cdp.send('Accessibility.getFullAXTree');
    await writeFile(path.join(directory, 'ax-tree.json'), `${JSON.stringify(axTree, null, 2)}\n`);
    await evaluate(cdp, `${axe.source}\n; true;`);
    const axeResult = await evaluate(cdp, `axe.run(document, { reporter: 'v2' })`, true);
    await writeFile(path.join(directory, 'axe-result.json'), `${JSON.stringify(axeResult, null, 2)}\n`);
    await log(`state ${definition.id}: ${axeResult.violations.length} rules, ${axeResult.violations.reduce((sum, rule) => sum + rule.nodes.length, 0)} nodes`);
    return { state: definition.id, valid: true, directory, metadata, axeResult };
  } catch (error) {
    const failure = { state: definition.id, valid: false, error: String(error?.stack ?? error), capturedAt: new Date().toISOString() };
    await writeFile(path.join(directory, 'execution-error.json'), `${JSON.stringify(failure, null, 2)}\n`);
    await log(`state ${definition.id}: execution error ${failure.error}`);
    return { state: definition.id, valid: false, directory, error: failure.error };
  }
}

async function press(cdp, key, code = key) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code });
  await sleep(100);
}

async function focusSelector(cdp, selector) {
  return evaluate(cdp, `(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) return false; node.focus(); return document.activeElement === node; })()`);
}

async function activeElementSnapshot(cdp) {
  return evaluate(cdp, `(() => {
    const node = document.activeElement;
    const style = getComputedStyle(node);
    return {
      tag: node?.tagName?.toLowerCase() ?? null,
      id: node?.id || null,
      classes: node?.className || null,
      text: node?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 120) || null,
      dataValue: node?.dataset?.value || null,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      outlineColor: style.outlineColor,
      boxShadow: style.boxShadow,
      borderColor: style.borderColor,
      rect: node ? (() => { const r = node.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })() : null,
    };
  })()`);
}

async function keyboardAndFocus(cdp) {
  await navigate(cdp, { width: 1280, height: 720 });
  await evaluate(cdp, `document.body.focus()`);
  const tabOrder = [];
  for (let index = 0; index < 30; index += 1) {
    await press(cdp, 'Tab', 'Tab');
    tabOrder.push(await activeElementSnapshot(cdp));
  }

  const tests = [];
  const runActivation = async (name, selector, key, verifyExpression, restoreExpression = null) => {
    const focused = await focusSelector(cdp, selector);
    const before = await evaluate(cdp, verifyExpression);
    await press(cdp, key, key === ' ' ? 'Space' : key);
    const after = await evaluate(cdp, verifyExpression);
    tests.push({ name, selector, key, focused, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) });
    if (restoreExpression) await evaluate(cdp, restoreExpression);
  };

  await runActivation('pause', '.play-button', ' ', `({ label: document.querySelector('.play-button')?.getAttribute('aria-label'), pressed: document.querySelector('.play-button')?.getAttribute('aria-pressed') })`, `document.querySelector('.play-button')?.click()`);
  for (const mode of ['solid', 'xray', 'section']) {
    await runActivation(`mode-${mode}`, `.mode-control button[data-value="${mode}"]`, 'Enter', `({ active: document.querySelector('.mode-control button[data-value="${mode}"]')?.classList.contains('is-active'), pressed: document.querySelector('.mode-control button[data-value="${mode}"]')?.getAttribute('aria-pressed') })`);
  }
  for (const preset of ['isometric', 'front', 'side', 'top', 'crank', 'combustion']) {
    await runActivation(`preset-${preset}`, `.preset-row button[data-value="${preset}"]`, 'Enter', `({ active: document.querySelector('.preset-row button[data-value="${preset}"]')?.classList.contains('is-active'), pressed: document.querySelector('.preset-row button[data-value="${preset}"]')?.getAttribute('aria-pressed') })`);
  }
  await runActivation('reset', '.reset-camera', 'Enter', `({ modes: [...document.querySelectorAll('.mode-control button.is-active')].map(n => n.dataset.value), presets: [...document.querySelectorAll('.preset-row button.is-active')].map(n => n.dataset.value) })`);
  for (const toggle of ['toggle-labels', 'toggle-flows', 'toggle-explode']) {
    await runActivation(toggle, `#${toggle}`, ' ', `({ checked: document.querySelector('#${toggle}')?.checked })`, `document.querySelector('#${toggle}')?.click()`);
  }

  const canvasKeyboard = await evaluate(cdp, `(() => {
    const canvas = document.querySelector('canvas');
    const focusableParts = [...document.querySelectorAll('[data-part-id], [data-part]')].filter((node) => node.tabIndex >= 0);
    return { canvasTabIndex: canvas?.getAttribute('tabindex'), canvasTabIndexProperty: canvas?.tabIndex, focusablePartCount: focusableParts.length, inspectorInitiallyHasPart: document.querySelector('.inspector')?.classList.contains('has-part') ?? false };
  })()`);
  if ((canvasKeyboard.canvasTabIndexProperty ?? -1) >= 0) {
    await focusSelector(cdp, 'canvas');
    await press(cdp, 'Enter', 'Enter');
  }
  canvasKeyboard.inspectorAfterCanvasEnter = await evaluate(cdp, `document.querySelector('.inspector')?.classList.contains('has-part') ?? false`);
  canvasKeyboard.partInspectorKeyboardReachable = canvasKeyboard.focusablePartCount > 0 || canvasKeyboard.inspectorAfterCanvasEnter;

  await focusSelector(cdp, '.mode-control button[data-value="xray"]');
  const focusSample = await activeElementSnapshot(cdp);
  await capture(cdp, path.join(manualRunRoot, 'keyboard-focus.png'));

  await navigate(cdp, { width: 390, height: 844 });
  const drawerTests = [];
  for (const [name, selector] of [['left-drawer', '.mobile-panel-toggle:nth-child(1)'], ['right-drawer', '.mobile-panel-toggle:nth-child(2)']]) {
    const focused = await focusSelector(cdp, selector);
    const before = await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')`);
    await press(cdp, 'Enter', 'Enter');
    const after = await evaluate(cdp, `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')`);
    drawerTests.push({ name, selector, focused, before, after, changed: before !== after });
    await press(cdp, 'Enter', 'Enter');
  }

  const result = { capturedAt: new Date().toISOString(), tabOrder, tests, focusSample, canvasKeyboard, drawerTests };
  await writeFile(path.join(manualRunRoot, 'keyboard-focus.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const contrastExpression = `(() => {
  const parse = (value) => {
    const match = value?.match(/rgba?\\(([^)]+)\\)/);
    if (!match) return null;
    const values = match[1].split(/[, ]+/).filter(Boolean).map(Number);
    return { r: values[0], g: values[1], b: values[2], a: values.length > 3 ? values[3] : 1 };
  };
  const composite = (front, back) => front ? ({
    r: front.r * front.a + back.r * (1 - front.a),
    g: front.g * front.a + back.g * (1 - front.a),
    b: front.b * front.a + back.b * (1 - front.a),
    a: 1,
  }) : null;
  const background = (node) => {
    let current = node;
    let result = { r: 8, g: 15, b: 19, a: 1 };
    const layers = [];
    while (current) {
      const parsed = parse(getComputedStyle(current).backgroundColor);
      if (parsed && parsed.a > 0) layers.push(parsed);
      current = current.parentElement;
    }
    for (const layer of layers.reverse()) result = composite(layer, result);
    return result;
  };
  const luminance = (color) => {
    const channel = (value) => { const n = value / 255; return n <= .03928 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; };
    return .2126 * channel(color.r) + .7152 * channel(color.g) + .0722 * channel(color.b);
  };
  const ratio = (a, b) => { const l1 = luminance(a), l2 = luminance(b); return (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); };
  const selectors = [
    '.brand', '.panel-title strong', '.top-metric strong', '.mode-control button.is-active',
    '.preset-row button.is-active', '.part-label', '.engine-label', '.mobile-panel-toggle',
    '.cylinder-card strong', '.interaction-hint', '.inspector dd'
  ];
  return selectors.map((selector) => {
    const node = document.querySelector(selector);
    if (!node) return { selector, found: false };
    const style = getComputedStyle(node);
    const foregroundRaw = parse(style.color);
    const back = background(node);
    const foreground = foregroundRaw ? composite(foregroundRaw, back) : null;
    return {
      selector, found: true, text: node.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 120),
      color: style.color, backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
      fontSize: style.fontSize, fontWeight: style.fontWeight,
      contrastRatioApprox: foreground ? ratio(foreground, back) : null,
      note: style.backgroundImage !== 'none' ? 'Approximation composites solid background colors and does not sample gradient/backdrop pixels.' : null,
    };
  });
})()`;

async function contrastSamples(cdp) {
  await navigate(cdp, { width: 1280, height: 720 });
  const desktop = await evaluate(cdp, contrastExpression);
  await focusSelector(cdp, '.mode-control button[data-value="xray"]');
  const focus = await activeElementSnapshot(cdp);
  await navigate(cdp, { width: 390, height: 844 });
  await clickSelector(cdp, '.mobile-panel-toggle:nth-child(1)');
  const narrow = await evaluate(cdp, contrastExpression);
  const result = {
    capturedAt: new Date().toISOString(),
    methodology: 'Computed-color approximation for representative DOM text; axe color-contrast remains authoritative for automated scoring. Gradients and WebGL pixels require human visual inspection.',
    desktop,
    narrow,
    focus,
  };
  await writeFile(path.join(manualRunRoot, 'contrast-samples.json'), `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const layoutExpression = `(() => {
  const visible = (node) => {
    const style = getComputedStyle(node), r = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const core = {
    play: '.play-button', modes: '.mode-control button', presets: '.preset-row button',
    toggles: '.toggle-row input', reset: '.reset-camera', mobileDrawers: '.mobile-panel-toggle'
  };
  const reachable = Object.fromEntries(Object.entries(core).map(([key, selector]) => [key, [...document.querySelectorAll(selector)].filter(visible).length]));
  const clippedText = [...document.querySelectorAll('button,label,p,span,strong,small,dt,dd,h1,h2,h3,output')]
    .filter((node) => visible(node) && node.textContent?.trim())
    .filter((node) => {
      const style = getComputedStyle(node);
      const horizontal = node.scrollWidth > node.clientWidth + 1 && !['auto','scroll'].includes(style.overflowX);
      const vertical = node.scrollHeight > node.clientHeight + 1 && !['auto','scroll'].includes(style.overflowY);
      return horizontal || vertical;
    })
    .slice(0, 80)
    .map((node) => ({ tag: node.tagName.toLowerCase(), classes: node.className || null, text: node.textContent.trim().replace(/\\s+/g,' ').slice(0,100), client:[node.clientWidth,node.clientHeight], scroll:[node.scrollWidth,node.scrollHeight] }));
  return {
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    document: { clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientHeight: document.documentElement.clientHeight, scrollHeight: document.documentElement.scrollHeight },
    horizontalDocumentOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    verticalDocumentOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    reachable,
    clippedText,
    activeDrawers: [...document.querySelectorAll('.mobile-panel-toggle')].map((node) => node.getAttribute('aria-expanded')),
  };
})()`;

async function reflowAndResize(cdp) {
  const results = {};

  await navigate(cdp, { width: 1280, height: 720 });
  await evaluate(cdp, `(() => {
    const selectors = 'button,label,p,span,strong,small,dt,dd,h1,h2,h3,output';
    [...document.querySelectorAll(selectors)].forEach((node) => {
      const size = parseFloat(getComputedStyle(node).fontSize);
      if (Number.isFinite(size) && size > 0) node.style.fontSize = (size * 2) + 'px';
    });
    return true;
  })()`);
  await sleep(300);
  results.textResize200 = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'text-resize-200.png'));

  await navigate(cdp, { width: 640, height: 720 });
  results.zoomEquivalent200Initial = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'zoom-equivalent-200-initial.png'));
  await clickSelector(cdp, '.mobile-panel-toggle:nth-child(1)');
  results.zoomEquivalent200Left = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'zoom-equivalent-200-left.png'));

  await navigate(cdp, { width: 320, height: 720 });
  results.reflow320Initial = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'reflow-320-initial.png'));
  await clickSelector(cdp, '.mobile-panel-toggle:nth-child(1)');
  results.reflow320Left = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'reflow-320-left.png'));
  await clickSelector(cdp, '.mobile-panel-toggle:nth-child(1)');
  await clickSelector(cdp, '.mobile-panel-toggle:nth-child(2)');
  results.reflow320Right = await evaluate(cdp, layoutExpression);
  await capture(cdp, path.join(manualRunRoot, 'reflow-320-right.png'));

  results.methodology = {
    textResize200: 'Runtime-only doubling of computed font sizes on semantic text elements; product source is unchanged.',
    zoomEquivalent200: '640 CSS px viewport, equivalent to a 1280 px viewport at 200% browser zoom for responsive-layout evaluation.',
    reflow400: '320 CSS px viewport used for the protocol 400%/320 CSS px reflow condition.',
  };
  results.capturedAt = new Date().toISOString();
  await writeFile(path.join(manualRunRoot, 'resize-reflow.json'), `${JSON.stringify(results, null, 2)}\n`);
  return results;
}

async function buildManifest(directory) {
  const entries = [];
  async function visit(current) {
    for (const name of await readdir(current)) {
      const fullPath = path.join(current, name);
      const info = await stat(fullPath);
      if (info.isDirectory()) await visit(fullPath);
      else {
        const data = await readFile(fullPath);
        entries.push({
          path: path.relative(projectRoot, fullPath).replaceAll('\\\\', '/'),
          bytes: info.size,
          sha256: createHash('sha256').update(data).digest('hex'),
        });
      }
    }
  }
  await visit(directory);
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

let cdp;
let exitCode = 0;
const runStartedAt = new Date().toISOString();
const stateResults = [];
let keyboardResult = null;
let contrastResult = null;
let reflowResult = null;
try {
  await log(`start ${runId}; base=${baseUrl}; HEAD=${gitHead.stdout}; fixed=${fixedTag.stdout}`);
  cdp = new CdpSession(await waitForDebugger());
  await cdp.connect();
  await Promise.all([
    cdp.send('Page.enable'),
    cdp.send('Runtime.enable'),
    cdp.send('Accessibility.enable'),
    cdp.send('Log.enable'),
  ]);

  for (const definition of stateDefinitions) stateResults.push(await runState(cdp, definition));
  keyboardResult = await keyboardAndFocus(cdp);
  contrastResult = await contrastSamples(cdp);
  reflowResult = await reflowAndResize(cdp);
  if (stateResults.some((result) => !result.valid)) exitCode = 1;
} catch (error) {
  exitCode = 1;
  await log(`fatal execution error: ${String(error?.stack ?? error)}`);
} finally {
  cdp?.close();
  browser.kill();
  await Promise.race([
    new Promise((resolve) => browser.once('exit', resolve)),
    sleep(3_000),
  ]);
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedProfile = path.resolve(profileDirectory);
  if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`) && path.basename(resolvedProfile).startsWith('inline4-accessibility-edge-')) {
    try {
      await rm(resolvedProfile, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
    } catch (error) {
      await log(`non-fatal temporary profile cleanup warning: ${String(error?.message ?? error)}`);
    }
  }
}

const srcDiffEnd = commandOutput('git', ['diff', '--exit-code', 'v3-model-final', '--', 'src']);
const aggregate = {
  validStates: stateResults.filter((result) => result.valid).length,
  invalidStates: stateResults.filter((result) => !result.valid).length,
  violationRuleIds: [...new Set(stateResults.flatMap((result) => result.axeResult?.violations.map((rule) => rule.id) ?? []))].sort(),
  criticalRuleIds: [...new Set(stateResults.flatMap((result) => result.axeResult?.violations.filter((rule) => rule.impact === 'critical').map((rule) => rule.id) ?? []))].sort(),
  seriousRuleIds: [...new Set(stateResults.flatMap((result) => result.axeResult?.violations.filter((rule) => rule.impact === 'serious').map((rule) => rule.id) ?? []))].sort(),
  colorContrast: stateResults.map((result) => ({
    state: result.state,
    nodes: result.axeResult?.violations.find((rule) => rule.id === 'color-contrast')?.nodes.length ?? 0,
  })),
};
const summary = {
  runId,
  runStartedAt,
  runFinishedAt: new Date().toISOString(),
  exitCode,
  baseUrl,
  aggregate,
  keyboard: keyboardResult,
  contrast: contrastResult,
  reflow: reflowResult,
  nvda: { status: 'pending', reason: 'No real NVDA operator participated; no result or score was fabricated.' },
};
await writeFile(path.join(artifactRoot, 'accessibility', `accessibility-${runId}-summary.json`), `${JSON.stringify(summary, null, 2)}\n`);

const environment = {
  runId,
  utcStartedAt: runStartedAt,
  utcFinishedAt: summary.runFinishedAt,
  localTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  command: `node evaluation/accessibility/run-accessibility.mjs`,
  exitCode,
  projectRoot,
  baseUrl,
  gitHead,
  fixedTag,
  srcDiffStart,
  srcDiffEnd,
  os: { platform: os.platform(), release: os.release(), arch: os.arch(), version: os.version() },
  cpu: os.cpus()[0]?.model ?? 'unknown',
  node: process.version,
  axeCore: axe.version,
  edgeVersion,
  browserStderrSummary: browserStderr.join('').slice(-8000),
  stateViewports: Object.fromEntries(stateDefinitions.map((definition) => [definition.id, definition.viewport])),
  renderer: stateResults.find((result) => result.valid)?.metadata.renderer ?? null,
};
await writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`);

const manifest = await buildManifest(path.join(artifactRoot, 'accessibility'));
await writeFile(path.join(artifactRoot, 'accessibility', `manifest-${runId}.json`), `${JSON.stringify({ runId, generatedAt: new Date().toISOString(), files: manifest }, null, 2)}\n`);
await log(`finished ${runId}; exit=${exitCode}; valid=${aggregate.validStates}; invalid=${aggregate.invalidStates}; critical=${aggregate.criticalRuleIds.length}; serious=${aggregate.seriousRuleIds.length}`);
process.exitCode = exitCode;
