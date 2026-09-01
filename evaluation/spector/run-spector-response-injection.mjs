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
const SPECTOR_URL = new URL('/__external-eval-spector.bundle.js', BASE_URL).href;
const FIXED_TAG = 'v3-model-final';
const EXPECTED_TARGET = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';
const scenes = [
  { name: 'solid-isometric', mode: 'solid', preset: 'isometric' },
  { name: 'section-crank', mode: 'section', preset: 'crank' },
  { name: 'xray-valvetrain', mode: 'xray', preset: 'combustion' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

function command(executable, args) {
  const result = spawnSync(executable, args, { cwd: ROOT, encoding: 'utf8' });
  return { command: [executable, ...args], exitCode: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class Cdp {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.id = 0;
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
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
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
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.socket.close(); }
}

async function waitForDebugger(port) {
  for (let i = 0; i < 200; i += 1) {
    try {
      const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Edge debugger did not start on ${port}`);
}

async function launchEdge() {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'inline4-spector-response-'));
  const browser = spawn(EDGE_PATH, [
    '--headless=new', '--no-sandbox', `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-component-update', '--disable-sync',
    '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-gpu-shader-disk-cache',
    '--disable-features=SkiaGraphite', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  let stderr = '';
  browser.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const cdp = new Cdp(await waitForDebugger(DEBUG_PORT));
  await cdp.connect();
  return {
    cdp,
    stderr: () => stderr,
    async close() {
      cdp.close();
      browser.kill();
      await Promise.race([new Promise((resolve) => browser.once('exit', resolve)), sleep(3000)]);
      await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
    },
  };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(cdp, expression, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(cdp, expression)) return true;
    await sleep(200);
  }
  return false;
}

async function click(cdp, selector) {
  const point = await evaluate(cdp, `(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n)return null; const r=n.getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; })()`);
  if (!point) throw new Error(`Missing click target: ${selector}`);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}

async function nextAttempt(scene) {
  await mkdir(path.join(OUTPUT_ROOT, scene), { recursive: true });
  for (let index = 1; index < 100; index += 1) {
    const attempt = `attempt-${String(index).padStart(2, '0')}`;
    const directory = path.join(OUTPUT_ROOT, scene, attempt);
    try {
      await mkdir(directory);
      return { attempt, directory };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error(`No free attempt directory for ${scene}`);
}

function summary(capture) {
  const commands = Array.isArray(capture?.commands) ? capture.commands : [];
  const names = commands.map((entry) => entry?.name ?? entry?.commandName ?? entry?.command?.name ?? 'unknown');
  const histogram = {};
  for (const name of names) histogram[name] = (histogram[name] ?? 0) + 1;
  return {
    topLevelKeys: capture && typeof capture === 'object' ? Object.keys(capture) : [],
    commandCount: commands.length,
    drawCommandCount: names.filter((name) => /^draw(?:Arrays|Elements)/i.test(String(name))).length,
    commandHistogram: Object.fromEntries(Object.entries(histogram).sort((a, b) => b[1] - a[1])),
    canvas: capture?.canvas ?? null,
    context: capture?.context ?? null,
    frameMemory: capture?.frameMemory ?? null,
    analysesCount: Array.isArray(capture?.analyses) ? capture.analyses.length : null,
  };
}

async function main() {
  const startedAt = now();
  const gitHead = command('git', ['rev-parse', 'HEAD']);
  const fixedTag = command('git', ['rev-parse', `${FIXED_TAG}^{}`]);
  const srcDiffStart = command('git', ['diff', '--exit-code', FIXED_TAG, '--', 'src']);
  if (fixedTag.exitCode !== 0 || fixedTag.stdout !== EXPECTED_TARGET) throw new Error(`Fixed target mismatch: ${fixedTag.stdout || fixedTag.stderr}`);
  if (srcDiffStart.exitCode !== 0) throw new Error('src differs from v3-model-final at start');

  const spectorSource = await readFile(SPECTOR_BUNDLE, 'utf8');
  const setupSource = `;(() => { try {
    self.__SPECTOR_EVAL = { ready:false, status:'initializing', error:null, captureString:null };
    if (!self.SPECTOR || typeof self.SPECTOR.Spector !== 'function') throw new Error('SPECTOR.Spector UMD export missing');
    const instance = new self.SPECTOR.Spector();
    instance.onCapture.add((capture) => { try { self.__SPECTOR_EVAL.captureString=JSON.stringify(capture); self.__SPECTOR_EVAL.status='captured'; } catch(error) { self.__SPECTOR_EVAL.error=String(error?.stack||error); self.__SPECTOR_EVAL.status='serialization-error'; } });
    instance.onError.add((error) => { self.__SPECTOR_EVAL.error=String(error?.stack||error); self.__SPECTOR_EVAL.status='capture-error'; });
    instance.spyCanvases(); self.__SPECTOR_INSTANCE=instance; self.__SPECTOR_EVAL.ready=true; self.__SPECTOR_EVAL.status='ready';
  } catch(error) { self.__SPECTOR_EVAL={ready:false,status:'initialization-error',error:String(error?.stack||error),captureString:null}; } })();`;
  const injection = `<script src="${SPECTOR_URL}" data-external-evaluator="spectorjs-0.9.30"></script><script data-external-evaluator-setup="spectorjs-0.9.30">${setupSource}<\/script>`;

  const edge = await launchEdge();
  const { cdp } = edge;
  const events = [];
  const injectionEvents = [];
  let browserVersion;
  cdp.on('Runtime.consoleAPICalled', (event) => events.push({ source: 'console', capturedAt: now(), type: event.type, args: event.args?.map((arg) => arg.value ?? arg.description ?? arg.type) ?? [] }));
  cdp.on('Runtime.exceptionThrown', (event) => events.push({ source: 'exception', capturedAt: now(), exceptionDetails: event.exceptionDetails }));
  cdp.on('Log.entryAdded', (event) => events.push({ source: 'log', capturedAt: now(), entry: event.entry }));
  cdp.on('Fetch.requestPaused', async (event) => {
    try {
      if (!event.responseStatusCode && event.request.url === SPECTOR_URL) {
        await cdp.send('Fetch.fulfillRequest', {
          requestId: event.requestId,
          responseCode: 200,
          responseHeaders: [
            { name: 'content-type', value: 'text/javascript; charset=utf-8' },
            { name: 'content-length', value: String(Buffer.byteLength(spectorSource)) },
            { name: 'cache-control', value: 'no-store' },
          ],
          body: Buffer.from(spectorSource).toString('base64'),
        });
        injectionEvents.push({ capturedAt: now(), url: event.request.url, status: 'original-spector-bundle-fulfilled', responseBytes: Buffer.byteLength(spectorSource) });
      } else if (event.responseStatusCode && event.resourceType === 'Document' && event.request.url === BASE_URL) {
        const response = await cdp.send('Fetch.getResponseBody', { requestId: event.requestId });
        const source = response.base64Encoded ? Buffer.from(response.body, 'base64').toString('utf8') : response.body;
        const marker = '<script type="module"';
        if (!source.includes(marker)) throw new Error('Production module marker not found in HTML');
        const modified = source.replace(marker, `${injection}\n    ${marker}`);
        const headers = (event.responseHeaders ?? []).filter((header) => !['content-length', 'content-encoding'].includes(header.name.toLowerCase()));
        headers.push({ name: 'content-length', value: String(Buffer.byteLength(modified)) });
        await cdp.send('Fetch.fulfillRequest', { requestId: event.requestId, responseCode: event.responseStatusCode, responseHeaders: headers, body: Buffer.from(modified).toString('base64') });
        injectionEvents.push({ capturedAt: now(), url: event.request.url, status: 'injected-before-production-module', sourceBytes: Buffer.byteLength(source), responseBytes: Buffer.byteLength(modified) });
      } else {
        await cdp.send('Fetch.continueRequest', { requestId: event.requestId });
      }
    } catch (error) {
      injectionEvents.push({ capturedAt: now(), url: event.request.url, status: 'interception-error', error: String(error?.stack ?? error) });
      await cdp.send('Fetch.continueRequest', { requestId: event.requestId }).catch(() => {});
    }
  });

  const results = [];
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Fetch.enable', { patterns: [
      { urlPattern: BASE_URL, resourceType: 'Document', requestStage: 'Response' },
      { urlPattern: SPECTOR_URL, resourceType: 'Script', requestStage: 'Request' },
    ] });
    browserVersion = await cdp.send('Browser.getVersion');

    for (const scene of scenes) {
      const { attempt, directory } = await nextAttempt(scene.name);
      const sceneStartedAt = now();
      const eventOffset = events.length;
      const injectionOffset = injectionEvents.length;
      const log = [`[${sceneStartedAt}] scene=${scene.name} attempt=${attempt}`, `[${sceneStartedAt}] target=${BASE_URL} mode=${scene.mode} preset=${scene.preset}`, `[${sceneStartedAt}] injection=response rewrite immediately before production module`];
      let result;
      try {
        await cdp.send('Page.navigate', { url: BASE_URL });
        const initialized = await waitFor(cdp, `document.readyState==='complete' && !!document.querySelector('.engine-canvas') && !!self.__SPECTOR_EVAL && self.__SPECTOR_EVAL.status !== 'initializing'`, 30000);
        if (!initialized) throw new Error('Timed out waiting for production canvas and Spector initialization');
        const initialization = await evaluate(cdp, `({exportType:typeof self.SPECTOR?.Spector,status:self.__SPECTOR_EVAL?.status,ready:self.__SPECTOR_EVAL?.ready,error:self.__SPECTOR_EVAL?.error})`);
        if (!initialization.ready) throw new Error(`Spector initialization failed: ${JSON.stringify(initialization)}`);
        await sleep(2500);
        await click(cdp, `.mode-control button[data-value=${JSON.stringify(scene.mode)}]`);
        await click(cdp, `.preset-row button[data-value=${JSON.stringify(scene.preset)}]`);
        await sleep(1800);

        const state = await evaluate(cdp, `(() => { const canvas=document.querySelector('.engine-canvas'); const gl=canvas?.getContext('webgl2')||canvas?.getContext('webgl'); const ext=gl?.getExtension('WEBGL_debug_renderer_info'); return {
          url:location.href,title:document.title,viewport:{width:innerWidth,height:innerHeight,devicePixelRatio},
          activeModes:[...document.querySelectorAll('.mode-control button.is-active')].map(n=>n.dataset.value),
          activePresets:[...document.querySelectorAll('.preset-row button.is-active')].map(n=>n.dataset.value),
          canvas:canvas?{width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight}:null,
          contextType:gl instanceof WebGL2RenderingContext?'webgl2':gl?'webgl':null,
          renderer:gl&&ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null,vendor:gl&&ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):null,
          spector:{umdExportType:typeof self.SPECTOR?.Spector,ready:self.__SPECTOR_EVAL?.ready,status:self.__SPECTOR_EVAL?.status,error:self.__SPECTOR_EVAL?.error}
        }; })()`);
        await writeJson(path.join(directory, 'state.json'), state);
        if (state.activeModes.length !== 1 || state.activeModes[0] !== scene.mode) throw new Error(`Mode setup failed: ${JSON.stringify(state.activeModes)}`);
        if (state.activePresets.length !== 1 || state.activePresets[0] !== scene.preset) throw new Error(`Preset setup failed: ${JSON.stringify(state.activePresets)}`);
        if (!state.contextType) throw new Error('Production canvas has no WebGL context');
        log.push(`[${now()}] state verified context=${state.contextType} renderer=${state.renderer}`);
        const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
        await writeFile(path.join(directory, 'representative.png'), Buffer.from(screenshot.data, 'base64'));
        log.push(`[${now()}] representative screenshot saved`);

        const started = await evaluate(cdp, `(() => { const canvas=document.querySelector('.engine-canvas'); self.__SPECTOR_EVAL.captureString=null; self.__SPECTOR_EVAL.error=null; self.__SPECTOR_EVAL.status='capturing'; self.__SPECTOR_INSTANCE.captureCanvas(canvas); return {canvasFound:!!canvas,status:self.__SPECTOR_EVAL.status}; })()`);
        log.push(`[${now()}] Spector capture requested ${JSON.stringify(started)}`);
        const ended = await waitFor(cdp, `['captured','capture-error','serialization-error'].includes(self.__SPECTOR_EVAL?.status)`, 30000);
        if (!ended) throw new Error('Spector capture timed out after 30 seconds');
        const status = await evaluate(cdp, `({status:self.__SPECTOR_EVAL.status,error:self.__SPECTOR_EVAL.error,bytes:self.__SPECTOR_EVAL.captureString?.length??0})`);
        await writeJson(path.join(directory, 'spector-status.json'), status);
        if (status.status !== 'captured') throw new Error(`Spector ${status.status}: ${status.error}`);
        const captureString = await evaluate(cdp, 'self.__SPECTOR_EVAL.captureString');
        const capture = JSON.parse(captureString);
        const captureSummary = summary(capture);
        if (captureSummary.commandCount === 0) throw new Error('Spector returned a capture with zero commands');
        await writeFile(path.join(directory, 'capture.json'), captureString, 'utf8');
        await writeJson(path.join(directory, 'capture-summary.json'), captureSummary);
        log.push(`[${now()}] original Spector capture saved bytes=${Buffer.byteLength(captureString)} commands=${captureSummary.commandCount} draws=${captureSummary.drawCommandCount}`);
        result = { scene: scene.name, attempt, status: 'captured', startedAt: sceneStartedAt, finishedAt: now(), captureBytes: Buffer.byteLength(captureString), state, ...captureSummary };
      } catch (error) {
        result = { scene: scene.name, attempt, status: 'not-measured', startedAt: sceneStartedAt, finishedAt: now(), error: String(error?.stack ?? error), note: 'Real Spector/Edge failure evidence retained; no synthetic capture substituted.' };
        await writeJson(path.join(directory, 'failure.json'), result);
        log.push(`[${now()}] FAILURE ${result.error}`);
      }
      const sceneEvents = events.slice(eventOffset);
      const problems = sceneEvents.filter((event) => event.source === 'exception' || (event.source === 'console' && ['error', 'assert'].includes(event.type)) || (event.source === 'log' && ['error', 'warning'].includes(event.entry?.level)));
      await writeJson(path.join(directory, 'console.json'), { all: sceneEvents, applicationProblems: problems });
      await writeJson(path.join(directory, 'injection.json'), { events: injectionEvents.slice(injectionOffset) });
      await writeJson(path.join(directory, 'environment.json'), {
        scene: scene.name, attempt, capturedAt: now(), baseUrl: BASE_URL, viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
        gitHead, fixedTag, srcDiffStart, browserVersion,
        os: { platform: process.platform, release: os.release(), arch: process.arch, version: os.version() }, cpu: os.cpus()[0]?.model ?? null,
        node: process.version, spectorjs: '0.9.30', injectionMethod: 'CDP Fetch response rewrite immediately before production module; no repository production file modified', edgeStderrAtCapture: edge.stderr(),
      });
      await writeFile(path.join(directory, 'run.log'), `${log.join('\n')}\n`, 'utf8');
      results.push(result);
    }
  } finally {
    await edge.close();
  }

  const srcDiffEnd = command('git', ['diff', '--exit-code', FIXED_TAG, '--', 'src']);
  const session = {
    status: results.every((result) => result.status === 'captured') && srcDiffEnd.exitCode === 0 ? 'complete' : 'incomplete',
    startedAt, finishedAt: now(), baseUrl: BASE_URL, fixedTarget: EXPECTED_TARGET,
    gitHead, fixedTag, srcDiffStart, srcDiffEnd, browserVersion, results,
    boundary: 'Spector single-frame capture only; no continuous WebGL performance conclusion.',
  };
  await mkdir(OUTPUT_ROOT, { recursive: true });
  for (let index = 1; ; index += 1) {
    try {
      await writeFile(path.join(OUTPUT_ROOT, `session-${String(index).padStart(2, '0')}-summary.json`), `${JSON.stringify(session, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  if (session.status !== 'complete') process.exitCode = 2;
}

main().catch(async (error) => {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  await writeJson(path.join(OUTPUT_ROOT, `fatal-${Date.now()}.json`), { status: 'not-measured', capturedAt: now(), error: String(error?.stack ?? error), note: 'Evaluator failed before completing the scene loop; no synthetic result substituted.' });
  console.error(error);
  process.exitCode = 1;
});
