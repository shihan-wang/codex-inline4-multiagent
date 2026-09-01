import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const projectRoot = 'D:\\ComputePicture\\codex-inline4-multiagent';
const outputRoot = path.join(projectRoot, 'artifacts', 'v4', 'final-review', 'accessibility', 'manual');
const baseUrl = 'http://127.0.0.1:16441/';
const debugPort = 16443;
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
await mkdir(outputRoot, { recursive: true });

const startedAt = new Date().toISOString();
const logLines = [];
const pageErrors = [];
const pageLogs = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const log = async (message) => {
  const line = `${new Date().toISOString()} ${message}`;
  logLines.push(line);
  process.stderr.write(`${line}\n`);
  await writeFile(path.join(outputRoot, 'run.log'), `${logLines.join('\n')}\n`);
};
const command = (program, args) => {
  const result = spawnSync(program, args, { cwd: projectRoot, encoding: 'utf8', windowsHide: true });
  return { command: [program, ...args], exitCode: result.status, stdout: result.stdout?.trim() ?? '', stderr: result.stderr?.trim() ?? '' };
};

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
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((candidate) => candidate !== listener));
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

async function waitForDebugger() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
      const page = pages.find((candidate) => candidate.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch {
      // Browser is starting.
    }
    await sleep(150);
  }
  throw new Error('Edge debug endpoint did not become ready.');
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true, userGesture: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(cdp, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  const ready = await evaluate(cdp, `new Promise((resolve) => {
    const deadline = performance.now() + 15000;
    const check = () => {
      const canvas = document.querySelector('canvas');
      const select = document.querySelector('#semantic-part-select');
      const okay = canvas?.width > 0 && canvas?.height > 0 && select?.options.length >= 9
        && document.querySelectorAll('.mode-control button').length === 3
        && document.querySelectorAll('.preset-row button').length === 7;
      if (okay) resolve(true);
      else if (performance.now() > deadline) resolve(false);
      else requestAnimationFrame(check);
    };
    check();
  })`, true);
  if (!ready) throw new Error(`Page did not become ready at ${width}x${height}.`);
  await sleep(600);
}

async function capture(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(outputRoot, name), Buffer.from(data, 'base64'));
}

async function focus(cdp, selector) {
  return evaluate(cdp, `(() => { const n=document.querySelector(${JSON.stringify(selector)}); if(!n)return false; n.focus(); return document.activeElement===n; })()`);
}

async function press(cdp, key) {
  const specs = {
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
    Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
    Tab: { key: 'Tab', code: 'Tab', keyCode: 9, text: '' },
    End: { key: 'End', code: 'End', keyCode: 35, text: '' },
    Home: { key: 'Home', code: 'Home', keyCode: 36, text: '' },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, text: '' },
    PageDown: { key: 'PageDown', code: 'PageDown', keyCode: 34, text: '' },
  };
  const spec = specs[key];
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

const activeStyleExpression = `(() => {
  const n=document.activeElement,s=getComputedStyle(n),r=n.getBoundingClientRect();
  return { tag:n.tagName.toLowerCase(), id:n.id||null, value:n.value||n.dataset?.value||null,
    outlineStyle:s.outlineStyle, outlineWidth:s.outlineWidth, outlineColor:s.outlineColor,
    outlineOffset:s.outlineOffset, boxShadow:s.boxShadow, rect:{x:r.x,y:r.y,width:r.width,height:r.height} };
})()`;

const contrastExpression = `(() => {
  const parse=(v)=>{const m=v?.match(/rgba?\\(([^)]+)\\)/);if(!m)return null;const a=m[1].split(/[, ]+/).filter(Boolean).map(Number);return{r:a[0],g:a[1],b:a[2],a:a.length>3?a[3]:1}};
  const mix=(f,b)=>({r:f.r*f.a+b.r*(1-f.a),g:f.g*f.a+b.g*(1-f.a),b:f.b*f.a+b.b*(1-f.a),a:1});
  const bg=(n)=>{const layers=[];for(let x=n;x;x=x.parentElement){const c=parse(getComputedStyle(x).backgroundColor);if(c&&c.a>0)layers.push(c)}let out={r:8,g:15,b:19,a:1};for(const c of layers.reverse())out=mix(c,out);return out};
  const lum=(c)=>{const f=(x)=>{x/=255;return x<=.03928?x/12.92:((x+.055)/1.055)**2.4};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b)};
  const ratio=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  return ['.interaction-hint','.panel-title span','.part-picker small','.inspector-empty p','.preset-row button'].map((selector)=>{const n=document.querySelector(selector);if(!n)return{selector,found:false};const s=getComputedStyle(n),back=bg(n),raw=parse(s.color),front=raw?mix(raw,back):null;return{selector,found:true,text:n.textContent?.trim().replace(/\\s+/g,' ').slice(0,120),color:s.color,fontSize:s.fontSize,background:s.backgroundColor,ratio:front?ratio(front,back):null}});
})()`;

const semanticsExpression = `(() => ({
  viewport:{role:document.querySelector('.scene-viewport')?.getAttribute('role'),name:document.querySelector('.scene-viewport')?.getAttribute('aria-label')},
  landmarks:[...document.querySelectorAll('aside')].map(n=>({id:n.id,labelledby:n.getAttribute('aria-labelledby'),labelText:document.getElementById(n.getAttribute('aria-labelledby')||'')?.textContent?.trim()||null,tabIndex:n.tabIndex})),
  modePressed:[...document.querySelectorAll('.mode-control button')].map(n=>({value:n.dataset.value,pressed:n.getAttribute('aria-pressed'),active:n.classList.contains('is-active')})),
  cameraPressed:[...document.querySelectorAll('.preset-row button[data-value]')].map(n=>({value:n.dataset.value,pressed:n.getAttribute('aria-pressed'),active:n.classList.contains('is-active')})),
  pause:{pressed:document.querySelector('.play-button')?.getAttribute('aria-pressed'),state:document.querySelector('.play-button')?.dataset.state,label:document.querySelector('.play-button')?.getAttribute('aria-label'),title:document.querySelector('.play-button')?.title},
  picker:{name:document.querySelector('label[for="semantic-part-select"]')?.textContent?.trim(),optionCount:document.querySelector('#semantic-part-select')?.options.length,value:document.querySelector('#semantic-part-select')?.value},
  inspector:{live:document.querySelector('.inspector')?.getAttribute('aria-live'),atomic:document.querySelector('.inspector')?.getAttribute('aria-atomic'),labelledby:document.querySelector('.inspector')?.getAttribute('aria-labelledby')}
}))()`;

async function keyboardSelection(cdp) {
  await navigate(cdp, 1280, 720);
  const selectFocused = await focus(cdp, '#semantic-part-select');
  const before = await evaluate(cdp, `document.querySelector('#semantic-part-select').value`);
  await press(cdp, 'End');
  await press(cdp, 'Enter');
  const selected = await evaluate(cdp, `(() => ({value:document.querySelector('#semantic-part-select').value,inspector:document.querySelector('.inspector').classList.contains('has-part'),name:document.querySelector('.part-title strong')?.textContent?.trim()||null,live:document.querySelector('.live-state dd')?.textContent?.trim()||null}))()`);
  await capture(cdp, 'keyboard-part-selection.png');

  await press(cdp, 'Home');
  await press(cdp, 'ArrowDown');
  await press(cdp, 'Enter');
  const second = await evaluate(cdp, `(() => ({value:document.querySelector('#semantic-part-select').value,inspector:document.querySelector('.inspector').classList.contains('has-part'),name:document.querySelector('.part-title strong')?.textContent?.trim()||null}))()`);

  await navigate(cdp, 1280, 720);
  let pointerSelected = null;
  for (const [x,y] of [[640,310],[720,280],[570,400],[780,430],[500,270],[640,430]]) {
    await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,clickCount:1});
    await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',buttons:0,clickCount:1});
    await sleep(250);
    const snapshot = await evaluate(cdp, `(() => ({value:document.querySelector('#semantic-part-select').value,inspector:document.querySelector('.inspector').classList.contains('has-part'),name:document.querySelector('.part-title strong')?.textContent?.trim()||null}))()`);
    if (snapshot.inspector) { pointerSelected={x,y,...snapshot}; break; }
  }
  await capture(cdp, 'pointer-selection-reverse-sync.png');
  return { selectFocused, before, firstSelection:selected, secondSelection:second, keyboardChanged:before!==selected.value && selected.inspector, secondChanged:selected.value!==second.value && second.inspector, pointerSelected, reverseSynced:Boolean(pointerSelected?.value) };
}

async function controlStates(cdp) {
  await navigate(cdp, 1280, 720);
  const results = [];
  for (const selector of ['.mode-control button[data-value="xray"]','.mode-control button[data-value="section"]','.preset-row button[data-value="crank"]','.preset-row button[data-value="combustion"]']) {
    await focus(cdp, selector); await press(cdp, 'Enter');
    results.push({selector,semantics:await evaluate(cdp, semanticsExpression)});
  }
  await focus(cdp,'.play-button'); await press(cdp,'Space');
  const paused = await evaluate(cdp, semanticsExpression);
  await press(cdp,'Space');
  const restored = await evaluate(cdp, semanticsExpression);
  return {results,paused,restored};
}

async function focusAndScroll(cdp) {
  await navigate(cdp,1280,720);
  const styles={};
  for (const [name,selector] of [['canvas','canvas'],['button','.mode-control button[data-value="xray"]'],['range','input[type="range"]'],['checkbox','#toggle-labels'],['select','#semantic-part-select'],['panel','#telemetry-panel']]) {
    await focus(cdp,selector);
    styles[name]=await evaluate(cdp,activeStyleExpression);
    if(name==='checkbox') styles.checkboxVisual=await evaluate(cdp,`(() => {const n=document.querySelector('#toggle-labels')?.parentElement?.querySelector('.toggle-visual'),s=getComputedStyle(n);return{outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineColor:s.outlineColor,outlineOffset:s.outlineOffset}})()`);
    if(name==='select') await capture(cdp,'focus-part-selector.png');
  }
  const scroll=await evaluate(cdp,`(() => {const n=document.querySelector('#telemetry-panel');n.focus();return{focused:document.activeElement===n,tabIndex:n.tabIndex,before:n.scrollTop,clientHeight:n.clientHeight,scrollHeight:n.scrollHeight}})()`);
  await press(cdp,'PageDown');
  scroll.after=await evaluate(cdp,`document.querySelector('#telemetry-panel').scrollTop`);
  scroll.moved=scroll.after>scroll.before || scroll.scrollHeight<=scroll.clientHeight;
  await focus(cdp,'.mode-control button[data-value="xray"]');
  await capture(cdp,'focus-xray.png');
  return {styles,scroll};
}

async function resizeAndNarrow(cdp) {
  await navigate(cdp,1280,720);
  await evaluate(cdp,`(() => {const selectors='button,label,p,span,strong,small,dt,dd,h1,h2,h3,output,select';[...document.querySelectorAll(selectors)].forEach(n=>{const size=parseFloat(getComputedStyle(n).fontSize);if(Number.isFinite(size)&&size>0)n.style.fontSize=(size*2)+'px'});return true})()`);
  await sleep(350);
  const resize200=await evaluate(cdp,`(() => {
    const overlap=(a,b)=>{const x=Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left)),y=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));return{x,y,area:x*y}};
    const group=(selectors)=>selectors.flatMap(s=>[...document.querySelectorAll(s)]).filter(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return s.visibility!=='hidden'&&s.display!=='none'&&r.width>0&&r.height>0});
    const nodes=group(['.top-metric small','.top-metric strong','.gauge span','.gauge strong','.preset-row button','.mode-control button','.panel-title strong','.panel-title span','.control-label>span','.control-label>strong']);
    const collisions=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){if(nodes[i].contains(nodes[j])||nodes[j].contains(nodes[i]))continue;const o=overlap(nodes[i].getBoundingClientRect(),nodes[j].getBoundingClientRect());if(o.area>4)collisions.push({a:nodes[i].textContent?.trim(),b:nodes[j].textContent?.trim(),...o})}
    const clipped=[...document.querySelectorAll('button,label,p,span,strong,small,dt,dd,output,select')].filter(n=>n.scrollWidth>n.clientWidth+1||n.scrollHeight>n.clientHeight+1).map(n=>({tag:n.tagName.toLowerCase(),className:n.className||null,text:n.textContent?.trim().replace(/\\s+/g,' ').slice(0,100),client:[n.clientWidth,n.clientHeight],scroll:[n.scrollWidth,n.scrollHeight]}));
    return{document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},collisions,clipped};
  })()`);
  await capture(cdp,'text-resize-200.png');

  await navigate(cdp,390,844);
  const narrow={};
  const snap=()=>evaluate(cdp,`(() => ({doc:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},expanded:[...document.querySelectorAll('.mobile-panel-toggle')].map(n=>n.getAttribute('aria-expanded')),active:[...document.querySelectorAll('.mobile-panel-toggle')].map(n=>n===document.activeElement),panels:[...document.querySelectorAll('.panel')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{id:n.id,x:r.x,y:r.y,right:r.right,bottom:r.bottom,visibility:s.visibility,overflowY:s.overflowY}}),pickerVisible:(()=>{const n=document.querySelector('#semantic-part-select'),r=n.getBoundingClientRect(),s=getComputedStyle(n);return s.visibility!=='hidden'&&r.width>0&&r.height>0})()}))()`);
  narrow.initial=await snap(); await capture(cdp,'narrow-initial.png');
  await focus(cdp,'.mobile-panel-toggle:nth-child(1)'); await press(cdp,'Enter'); narrow.left=await snap(); await capture(cdp,'narrow-left.png');
  await press(cdp,'Enter'); await focus(cdp,'.mobile-panel-toggle:nth-child(2)'); await press(cdp,'Enter'); narrow.right=await snap(); await capture(cdp,'narrow-right.png');
  narrow.rightPickerKeyboardFocus=await focus(cdp,'#semantic-part-select');
  narrow.rightPickerFocusStyle=await evaluate(cdp,activeStyleExpression);
  await capture(cdp,'narrow-right-picker-focus.png');
  return{resize200,narrow};
}

const profileDirectory = await mkdtemp(path.join(os.tmpdir(),'inline4-v4-final-a11y-'));
const browser = spawn(edgePath,[
  '--headless=new','--no-sandbox',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${profileDirectory}`,
  '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync',
  '--disable-gpu-sandbox','--disable-dev-shm-usage','--disable-gpu-shader-disk-cache','--disable-features=SkiaGraphite','about:blank',
],{stdio:['ignore','pipe','pipe'],windowsHide:true});
const browserStderr=[]; browser.stderr.on('data',(chunk)=>browserStderr.push(chunk.toString()));

let cdp;
let exitCode=0;
let results={};
try {
  await log('final accessibility manual review start');
  cdp=new CdpSession(await waitForDebugger()); await cdp.connect();
  cdp.on('Runtime.exceptionThrown',(event)=>pageErrors.push({type:'exception',event}));
  cdp.on('Log.entryAdded',(event)=>{pageLogs.push(event.entry);if(['error','warning'].includes(event.entry.level))pageErrors.push({type:'log',event:event.entry})});
  await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable'),cdp.send('Log.enable'),cdp.send('Accessibility.enable')]);
  results.keyboardSelection=await keyboardSelection(cdp);
  results.controlStates=await controlStates(cdp);
  results.focusAndScroll=await focusAndScroll(cdp);
  await navigate(cdp,1280,720);
  results.semantics=await evaluate(cdp,semanticsExpression);
  results.contrast=await evaluate(cdp,contrastExpression);
  results.resizeAndNarrow=await resizeAndNarrow(cdp);
  results.axTree=await cdp.send('Accessibility.getFullAXTree');
  await log('final accessibility manual review complete');
} catch(error) {
  exitCode=1;
  results.executionError=String(error?.stack??error);
  await log(`execution error ${results.executionError}`);
} finally {
  cdp?.close(); browser.kill(); await sleep(800);
  try { await rm(profileDirectory,{recursive:true,force:true,maxRetries:5,retryDelay:300}); } catch(error) { await log(`profile cleanup warning ${String(error)}`); }
}

const finishedAt=new Date().toISOString();
const environment={startedAt,finishedAt,exitCode,baseUrl,debugPort,projectRoot,
  gitHead:command('git',['rev-parse','HEAD']),branch:command('git',['branch','--show-current']),
  srcDiff:command('git',['diff','--','src']),status:command('git',['status','--short']),
  node:process.version,edgeFileVersion:command('powershell',['-NoProfile','-Command',`(Get-Item '${edgePath}').VersionInfo.FileVersion`]),
  os:{platform:os.platform(),release:os.release(),arch:os.arch()},cpu:os.cpus()[0]?.model,
  browserStderr:browserStderr.join('').slice(-8000)};
await writeFile(path.join(outputRoot,'results.json'),`${JSON.stringify({startedAt,finishedAt,exitCode,results},null,2)}\n`);
await writeFile(path.join(outputRoot,'console-and-errors.json'),`${JSON.stringify({pageErrors,pageLogs},null,2)}\n`);
await writeFile(path.join(outputRoot,'environment.json'),`${JSON.stringify(environment,null,2)}\n`);
process.exitCode=exitCode;
