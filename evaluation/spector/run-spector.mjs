import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const BASE_URL = process.env.SPECTOR_BASE_URL ?? 'http://127.0.0.1:16330/';
const DEBUG_PORT = Number(process.env.SPECTOR_DEBUG_PORT ?? 16331);
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUTPUT_ROOT = path.join(ROOT, 'artifacts', 'external-eval', 'performance', 'spector');
const SPECTOR_BUNDLE = path.join(ROOT, 'evaluation', 'performance', 'node_modules', 'spectorjs', 'dist', 'spector.bundle.js');
const FIXED_TAG = 'v3-model-final';
const EXPECTED_TARGET = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';

const scenes = [
  { name: 'solid-isometric', mode: 'solid', preset: 'isometric' },
  { name: 'section-crank', mode: 'section', preset: 'crank' },
  { name: 'xray-valvetrain', mode: 'xray', preset: 'combustion' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isoNow = () => new Date().toISOString();

function command(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  return {
    command: [command, ...args],
    exitCode: result.status,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class CdpSession {
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

  on(method, callback) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(callback);
    this.listeners.set(method, listeners);
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
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((entry) => entry.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Edge debugger did not start on ${port}`);
}

async function launchEdge() {
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'inline4-spector-'));
  const browser = spawn(EDGE_PATH, [
    '--headless=new', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDirectory}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-gpu-shader-disk-cache',
    '--disable-features=SkiaGraphite', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  browser.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const webSocketUrl = await waitForDebugger(DEBUG_PORT);
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

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return true;
    await sleep(200);
  }
  return false;
}

async function click(cdp, selector) {
  const point = await evaluate(cdp, `(() => {
    const node = document.querySelector(${JSON.stringify(selector)});
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!point) throw new Error(`Missing click target: ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y, button: 'none', buttons: 0 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}

function captureSummary(capture) {
  const commands = Array.isArray(capture?.commands) ? capture.commands : [];
  const commandNames = commands.map((item) => item?.name ?? item?.commandName ?? item?.command?.name ?? 'unknown');
  const histogram = {};
  for (const name of commandNames) histogram[name] = (histogram[name] ?? 0) + 1;
  const drawCommands = commandNames.filter((name) => /^draw(?:Arrays|Elements)/i.test(String(name)));
  return {
    topLevelKeys: capture && typeof capture === 'object' ? Object.keys(capture) : [],
    commandCount: commands.length,
    drawCommandCount: drawCommands.length,
    commandHistogram: Object.fromEntries(Object.entries(histogram).sort((a, b) => b[1] - a[1])),
    canvas: capture?.canvas ?? null,
    context: capture?.context ?? null,
    frameMemory: capture?.frameMemory ?? null,
    analysesCount: Array.isArray(capture?.analyses) ? capture.analyses.length : null,
  };
}

async function nextAttemptDirectory(sceneName) {
  for (let index = 1; index < 100; index += 1) {
    const attempt = `attempt-${String(index).padStart(2, '0')}`;
    const directory = path.join(OUTPUT_ROOT, sceneName, attempt);
    try {
      await mkdir(directory, { recursive: false });
      return { attempt, directory };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`No free attempt directory for ${sceneName}`);
}

async function main() {
  const startedAt = isoNow();
  const gitHead = command('git', ['rev-parse', 'HEAD']);
  const fixedTag = command('git', ['rev-parse', `${FIXED_TAG}^{}`]);
  const srcDiffStart = command('git', ['diff', '--exit-code', FIXED_TAG, '--', 'src']);
  if (fixedTag.exitCode !== 0 || fixedTag.stdout !== EXPECTED_TARGET) {
    throw new Error(`Fixed target mismatch: ${fixedTag.stdout || fixedTag.stderr}`);
  }
  if (srcDiffStart.exitCode !== 0) throw new Error('src differs from v3-model-final at start');

  const spectorSource = await readFile(SPECTOR_BUNDLE, 'utf8');
  const injectedSource = `${spectorSource}\n;(() => {
    try {
      self.__SPECTOR_EVAL = { ready: false, status: 'initializing', error: null, captureString: null };
      const instance = new self.SPECTOR.Spector();
      instance.onCapture.add((capture) => {
        try {
          self.__SPECTOR_EVAL.captureString = JSON.stringify(capture);
          self.__SPECTOR_EVAL.status = 'captured';
        } catch (error) {
          self.__SPECTOR_EVAL.error = String(error && (error.stack || error.message) || error);
          self.__SPECTOR_EVAL.status = 'serialization-error';
        }
      });
      instance.onError.add((error) => {
        self.__SPECTOR_EVAL.error = String(error && (error.stack || error.message) || error);
        self.__SPECTOR_EVAL.status = 'capture-error';
      });
      instance.spyCanvases();
      self.__SPECTOR_INSTANCE = instance;
      self.__SPECTOR_EVAL.ready = true;
      self.__SPECTOR_EVAL.status = 'ready';
    } catch (error) {
      self.__SPECTOR_EVAL = {
        ready: false,
        status: 'initialization-error',
        error: String(error && (error.stack || error.message) || error),
        captureString: null,
      };
    }
  })();`;

  const edge = await launchEdge();
  const { cdp } = edge;
  const consoleEvents = [];
  cdp.on('Runtime.consoleAPICalled', (event) => {
    consoleEvents.push({ source: 'console', capturedAt: isoNow(), type: event.type, args: event.args?.map((arg) => arg.value ?? arg.description ?? arg.type) ?? [] });
  });
  cdp.on('Runtime.exceptionThrown', (event) => {
    consoleEvents.push({ source: 'exception', capturedAt: isoNow(), exceptionDetails: event.exceptionDetails });
  });
  cdp.on('Log.entryAdded', (event) => {
    consoleEvents.push({ source: 'log', capturedAt: isoNow(), entry: event.entry });
  });

  const sceneResults = [];
  let browserVersion = null;
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Page.setLifecycleEventsEnabled', { enabled: true });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    browserVersion = await cdp.send('Browser.getVersion');
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injectedSource });

    for (const scene of scenes) {
      const { attempt, directory } = await nextAttemptDirectory(scene.name);
      const sceneStartedAt = isoNow();
      const eventOffset = consoleEvents.length;
      const logLines = [
        `[${sceneStartedAt}] scene=${scene.name} attempt=${attempt}`,
        `[${sceneStartedAt}] target=${BASE_URL} mode=${scene.mode} preset=${scene.preset}`,
      ];
      let result;
      try {
        await cdp.send('Page.navigate', { url: BASE_URL });
        const loaded = await waitFor(cdp, `document.readyState === 'complete' && !!document.querySelector('.engine-canvas') && !!self.__SPECTOR_EVAL?.ready`, 30_000);
        if (!loaded) throw new Error('Timed out waiting for production canvas and Spector initialization');
        await sleep(2500);

        await click(cdp, `.mode-control button[data-value=${JSON.stringify(scene.mode)}]`);
        await click(cdp, `.preset-row button[data-value=${JSON.stringify(scene.preset)}]`);
        await sleep(1800);

        const state = await evaluate(cdp, `(() => {
          const canvas = document.querySelector('.engine-canvas');
          const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
          const ext = gl?.getExtension('WEBGL_debug_renderer_info');
          return {
            url: location.href,
            title: document.title,
            viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
            activeModes: [...document.querySelectorAll('.mode-control button.is-active')].map((n) => n.dataset.value),
            activePresets: [...document.querySelectorAll('.preset-row button.is-active')].map((n) => n.dataset.value),
            canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
            contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : gl ? 'webgl' : null,
            renderer: gl && ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null,
            vendor: gl && ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null,
            spector: self.__SPECTOR_EVAL ? { ready: self.__SPECTOR_EVAL.ready, status: self.__SPECTOR_EVAL.status, error: self.__SPECTOR_EVAL.error } : null,
          };
        })()`);
        await writeJson(path.join(directory, 'state.json'), state);
        if (state.activeModes.length !== 1 || state.activeModes[0] !== scene.mode) throw new Error(`Mode setup failed: ${JSON.stringify(state.activeModes)}`);
        if (state.activePresets.length !== 1 || state.activePresets[0] !== scene.preset) throw new Error(`Preset setup failed: ${JSON.stringify(state.activePresets)}`);
        logLines.push(`[${isoNow()}] scene state verified renderer=${state.renderer} context=${state.contextType}`);

        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await writeFile(path.join(directory, 'representative.png'), Buffer.from(screenshot.data, 'base64'));
        logLines.push(`[${isoNow()}] representative screenshot saved`);

        const captureStart = await evaluate(cdp, `(() => {
          const canvas = document.querySelector('.engine-canvas');
          self.__SPECTOR_EVAL.captureString = null;
          self.__SPECTOR_EVAL.error = null;
          self.__SPECTOR_EVAL.status = 'capturing';
          self.__SPECTOR_INSTANCE.captureCanvas(canvas);
          return { status: self.__SPECTOR_EVAL.status, canvasFound: !!canvas };
        })()`);
        logLines.push(`[${isoNow()}] Spector capture requested ${JSON.stringify(captureStart)}`);
        const captured = await waitFor(cdp, `self.__SPECTOR_EVAL?.status === 'captured' || self.__SPECTOR_EVAL?.status === 'capture-error' || self.__SPECTOR_EVAL?.status === 'serialization-error'`, 30_000);
        if (!captured) throw new Error('Spector capture timed out after 30 seconds');
        const spectorStatus = await evaluate(cdp, `({ status: self.__SPECTOR_EVAL.status, error: self.__SPECTOR_EVAL.error, bytes: self.__SPECTOR_EVAL.captureString?.length ?? 0 })`);
        await writeJson(path.join(directory, 'spector-status.json'), spectorStatus);
        if (spectorStatus.status !== 'captured') throw new Error(`Spector ${spectorStatus.status}: ${spectorStatus.error}`);

        const captureString = await evaluate(cdp, 'self.__SPECTOR_EVAL.captureString');
        await writeFile(path.join(directory, 'capture.json'), captureString, 'utf8');
        const capture = JSON.parse(captureString);
        const summary = captureSummary(capture);
        if (summary.commandCount === 0) throw new Error('Spector returned a capture with zero commands');
        await writeJson(path.join(directory, 'capture-summary.json'), summary);
        logLines.push(`[${isoNow()}] capture saved bytes=${Buffer.byteLength(captureString)} commands=${summary.commandCount} draws=${summary.drawCommandCount}`);
        result = {
          scene: scene.name,
          attempt,
          status: 'captured',
          startedAt: sceneStartedAt,
          finishedAt: isoNow(),
          state,
          captureBytes: Buffer.byteLength(captureString),
          ...summary,
        };
      } catch (error) {
        const failure = {
          scene: scene.name,
          attempt,
          status: 'not-measured',
          startedAt: sceneStartedAt,
          finishedAt: isoNow(),
          error: String(error?.stack ?? error),
          note: 'Real Spector/Edge failure evidence retained; no synthetic capture substituted.',
        };
        await writeJson(path.join(directory, 'failure.json'), failure);
        logLines.push(`[${isoNow()}] FAILURE ${failure.error}`);
        result = failure;
      }
      const sceneConsole = consoleEvents.slice(eventOffset);
      const applicationProblems = sceneConsole.filter((event) => event.source === 'exception' || (event.source === 'console' && ['error', 'assert'].includes(event.type)) || (event.source === 'log' && ['error', 'warning'].includes(event.entry?.level)));
      await writeJson(path.join(directory, 'console.json'), { all: sceneConsole, applicationProblems });
      await writeJson(path.join(directory, 'environment.json'), {
        scene: scene.name,
        attempt,
        capturedAt: isoNow(),
        baseUrl: BASE_URL,
        viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        gitHead,
        fixedTag,
        srcDiffStart,
        browserVersion,
        os: { platform: process.platform, release: os.release(), arch: process.arch, version: os.version() },
        cpu: os.cpus()[0]?.model ?? null,
        node: process.version,
        spectorjs: '0.9.30',
        edgeStderrAtCapture: edge.stderr(),
      });
      await writeFile(path.join(directory, 'run.log'), `${logLines.join('\n')}\n`, 'utf8');
      sceneResults.push(result);
    }
  } finally {
    await edge.close();
  }

  const srcDiffEnd = command('git', ['diff', '--exit-code', FIXED_TAG, '--', 'src']);
  const finishedAt = isoNow();
  const session = {
    status: sceneResults.every((result) => result.status === 'captured') && srcDiffEnd.exitCode === 0 ? 'complete' : 'incomplete',
    startedAt,
    finishedAt,
    baseUrl: BASE_URL,
    fixedTarget: EXPECTED_TARGET,
    gitHead,
    fixedTag,
    srcDiffStart,
    srcDiffEnd,
    browserVersion,
    results: sceneResults,
    boundary: 'Spector single-frame capture only; no continuous WebGL performance conclusion.',
  };
  await mkdir(OUTPUT_ROOT, { recursive: true });
  let sessionIndex = 1;
  while (true) {
    const sessionName = `session-${String(sessionIndex).padStart(2, '0')}-summary.json`;
    const sessionPath = path.join(OUTPUT_ROOT, sessionName);
    try {
      await writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      sessionIndex += 1;
    }
  }
  if (session.status !== 'complete') process.exitCode = 2;
}

main().catch(async (error) => {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const failure = {
    status: 'not-measured',
    capturedAt: isoNow(),
    error: String(error?.stack ?? error),
    note: 'Evaluator failed before completing the scene loop; no synthetic result substituted.',
  };
  await writeJson(path.join(OUTPUT_ROOT, `fatal-${Date.now()}.json`), failure);
  console.error(error);
  process.exitCode = 1;
});
