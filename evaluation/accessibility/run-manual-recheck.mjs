import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..', '..');
const baseUrl = 'http://127.0.0.1:16320';
const debugPort = 16322;
const edgePath = process.env.EDGE_PATH ?? 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outputDirectory = path.join(projectRoot, 'artifacts', 'external-eval', 'accessibility', 'manual', 'recheck-02');
const environmentPath = path.join(projectRoot, 'artifacts', 'external-eval', 'environment', 'accessibility-manual-recheck-02.json');
const logPath = path.join(projectRoot, 'artifacts', 'external-eval', 'logs', 'accessibility-manual-recheck-02.log');
await mkdir(outputDirectory, { recursive: true });

const startedAt = new Date().toISOString();
const logs = [];
const log = async (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  logs.push(line);
  process.stderr.write(`${line}\n`);
  await writeFile(logPath, `${logs.join('\n')}\n`);
};

const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'inline4-accessibility-manual-'));
const browser = spawn(edgePath, [
  '--headless=new', '--no-sandbox', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profileDirectory}`, '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-sync',
  '--disable-gpu-sandbox', '--disable-dev-shm-usage', '--disable-gpu-shader-disk-cache',
  '--disable-features=SkiaGraphite', '--hide-scrollbars', 'about:blank',
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
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
      } else {
        for (const listener of this.listeners.get(message.method) ?? []) listener(message.params);
      }
    });
  }
  on(method, listener) {
    const current = this.listeners.get(method) ?? [];
    current.push(listener);
    this.listeners.set(method, current);
  }
  once(method, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeoutMs);
      const listener = (value) => {
        clearTimeout(timeout);
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== listener));
        resolve(value);
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* Edge is starting. */ }
    await sleep(100);
  }
  throw new Error('Edge debugger unavailable');
}
async function evaluate(cdp, expression, awaitPromise = false) {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result.value;
}
async function navigate(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  await sleep(1_000);
}
async function capture(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(outputDirectory, name), Buffer.from(data, 'base64'));
}
async function press(cdp, key) {
  const spec = key === 'Enter'
    ? { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' }
    : key === ' '
      ? { key: ' ', code: 'Space', keyCode: 32, text: ' ' }
      : { key: 'Tab', code: 'Tab', keyCode: 9, text: '' };
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown', key: spec.key, code: spec.code,
    windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode,
    text: spec.text, unmodifiedText: spec.text,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: spec.key, code: spec.code,
    windowsVirtualKeyCode: spec.keyCode, nativeVirtualKeyCode: spec.keyCode,
  });
  await sleep(180);
}
async function focus(cdp, selector) {
  return evaluate(cdp, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return false; node.focus(); return document.activeElement===node; })()`);
}
async function activeSnapshot(cdp) {
  return evaluate(cdp, `(() => { const n=document.activeElement,s=getComputedStyle(n),r=n.getBoundingClientRect(); return { tag:n.tagName.toLowerCase(), id:n.id||null, value:n.dataset.value||null, text:n.textContent?.trim()||null, outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth, outlineColor:s.outlineColor, boxShadow:s.boxShadow, borderColor:s.borderColor, rect:{x:r.x,y:r.y,width:r.width,height:r.height} }; })()`);
}

async function activation(cdp, name, selector, key, stateExpression, resetExpression = null) {
  const focused = await focus(cdp, selector);
  const before = await evaluate(cdp, stateExpression);
  await press(cdp, key);
  const after = await evaluate(cdp, stateExpression);
  if (resetExpression) await evaluate(cdp, resetExpression);
  return { name, selector, key, focused, before, after, changed: JSON.stringify(before) !== JSON.stringify(after) };
}

const contrastExpression = `(() => {
  const parse = (value) => { const m=value?.match(/rgba?\\(([^)]+)\\)/); if(!m)return null; const v=m[1].split(/[, ]+/).filter(Boolean).map(Number); return {r:v[0],g:v[1],b:v[2],a:v.length>3?v[3]:1}; };
  const mix = (f,b) => ({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
  const bg = (node) => { const layers=[]; for(let n=node;n;n=n.parentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&c.a>0)layers.push(c);} let out={r:8,g:15,b:19,a:1}; for(const c of layers.reverse())out=mix(c,out); return out; };
  const lum = (c) => { const f=(x)=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4;};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b); };
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  const selectors=['.engine-part-label span b','.engine-part-label span small','.interaction-hint span','.mode-control button.is-active','.preset-row button.is-active','.mobile-panel-toggle','.inspector dd','.top-metric strong','.panel-title strong'];
  return selectors.map((selector)=>{const n=document.querySelector(selector);if(!n)return{selector,found:false};const s=getComputedStyle(n),back=bg(n),raw=parse(s.color),front=raw?mix(raw,back):null;return{selector,found:true,text:n.textContent?.trim().replace(/\\s+/g,' ').slice(0,100),color:s.color,background:s.backgroundColor,backgroundImage:s.backgroundImage,fontSize:s.fontSize,fontWeight:s.fontWeight,ratio:front?ratio(front,back):null};});
})()`;

let cdp;
let exitCode = 0;
try {
  await log('manual recheck start');
  cdp = new CdpSession(await waitForDebugger());
  await cdp.connect();
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable')]);
  await navigate(cdp, 1280, 720);

  const tests = [];
  tests.push(await activation(cdp, 'pause', '.play-button', ' ', `document.querySelector('.play-button')?.title`, `document.querySelector('.play-button')?.click()`));
  for (const mode of ['solid','xray','section']) tests.push(await activation(cdp, `mode-${mode}`, `.mode-control button[data-value="${mode}"]`, 'Enter', `document.querySelector('.mode-control button[data-value="${mode}"]')?.classList.contains('is-active')`));
  for (const preset of ['isometric','front','side','top','crank','combustion']) tests.push(await activation(cdp, `preset-${preset}`, `.preset-row button[data-value="${preset}"]`, 'Enter', `document.querySelector('.preset-row button[data-value="${preset}"]')?.classList.contains('is-active')`));
  tests.push(await activation(cdp, 'reset', '.reset-camera', 'Enter', `({m:[...document.querySelectorAll('.mode-control button.is-active')].map(n=>n.dataset.value),p:[...document.querySelectorAll('.preset-row button.is-active')].map(n=>n.dataset.value)})`));
  for (const id of ['toggle-labels','toggle-flows','toggle-explode']) tests.push(await activation(cdp, id, `#${id}`, ' ', `document.querySelector('#${id}')?.checked`, `document.querySelector('#${id}')?.click()`));

  const tabFocus = [];
  await navigate(cdp, 1280, 720);
  await evaluate(cdp, `document.body.focus()`);
  for (let index=0;index<18;index+=1) {
    await press(cdp, 'Tab');
    const snap=await activeSnapshot(cdp);
    tabFocus.push(snap);
    if (snap.value==='xray') await capture(cdp, 'keyboard-tab-focus-xray.png');
  }
  const inspectorKeyboard = await evaluate(cdp, `(() => { const c=document.querySelector('canvas'); return {canvasTabIndex:c?.tabIndex,focusablePartControls:[...document.querySelectorAll('[data-part-id],[data-part]')].filter(n=>n.tabIndex>=0).length,hasPart:document.querySelector('.inspector')?.classList.contains('has-part')??false}; })()`);
  await focus(cdp, 'canvas');
  for (const key of ['Enter',' ','Tab']) await press(cdp,key);
  inspectorKeyboard.hasPartAfterCanvasKeys = await evaluate(cdp, `document.querySelector('.inspector')?.classList.contains('has-part')??false`);
  inspectorKeyboard.keyboardReachable = inspectorKeyboard.focusablePartControls>0 || inspectorKeyboard.hasPartAfterCanvasKeys;

  const desktopContrast = await evaluate(cdp, contrastExpression);
  await navigate(cdp, 390, 844);
  const drawers = [];
  for (const [name,selector] of [['left','.mobile-panel-toggle:nth-child(1)'],['right','.mobile-panel-toggle:nth-child(2)']]) {
    drawers.push(await activation(cdp, `${name}-drawer`, selector, 'Enter', `document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-expanded')`, `document.querySelector(${JSON.stringify(selector)})?.click()`));
  }
  await evaluate(cdp, `document.querySelector('.mobile-panel-toggle:nth-child(1)')?.click()`);
  const narrowContrast = await evaluate(cdp, contrastExpression);

  const result = { startedAt, finishedAt:new Date().toISOString(), tests, drawers, tabFocus, inspectorKeyboard };
  await writeFile(path.join(outputDirectory, 'keyboard-focus.json'), `${JSON.stringify(result,null,2)}\n`);
  await writeFile(path.join(outputDirectory, 'contrast-samples.json'), `${JSON.stringify({methodology:'Computed-color approximation including engine labels; axe incomplete nodes remain unproven and are not converted to passes.',desktop:desktopContrast,narrow:narrowContrast},null,2)}\n`);
  await log('manual recheck complete');
} catch (error) {
  exitCode = 1;
  await log(`manual recheck error ${String(error?.stack ?? error)}`);
} finally {
  cdp?.close();
  browser.kill();
  await sleep(500);
}

const git = (args) => { const r=spawnSync('git',args,{cwd:projectRoot,encoding:'utf8'});return{command:['git',...args],exitCode:r.status,stdout:r.stdout.trim(),stderr:r.stderr.trim()};};
await writeFile(environmentPath, `${JSON.stringify({
  status:exitCode===0?'valid':'invalid', startedAt, finishedAt:new Date().toISOString(), exitCode,
  command:'node evaluation/accessibility/run-manual-recheck.mjs', baseUrl, viewport:['1280x720','390x844'],
  gitHead:git(['rev-parse','HEAD']), fixedTag:git(['rev-parse','v3-model-final^{}']),
  srcDiffEnd:git(['diff','--exit-code','v3-model-final','--','src']),
  os:{platform:os.platform(),release:os.release(),arch:os.arch()},cpu:os.cpus()[0]?.model,
  browserStderrSummary:browserStderr.join('').slice(-4000),
  temporaryProfileRetained:profileDirectory,
},null,2)}\n`);
process.exitCode=exitCode;
