import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { launchEdge, evaluate, sleep } from '../../../../../evaluation/performance/cdp.mjs';

const projectRoot = 'D:\\ComputePicture\\codex-inline4-multiagent';
const outputRoot = path.join(projectRoot, 'artifacts', 'v4', 'round2', 'final-review', 'accessibility');
const baseUrl = 'http://127.0.0.1:16444/';
const debugPort = 16445;
await mkdir(outputRoot, { recursive: true });

const startedAt = new Date().toISOString();
const pageErrors = [];
const consoleMessages = [];
const failedRequests = [];
let browser;

async function press(cdp, key) {
  const specs = {
    Enter: { key: 'Enter', code: 'Enter', keyCode: 13, text: '\r' },
    Space: { key: ' ', code: 'Space', keyCode: 32, text: ' ' },
    Home: { key: 'Home', code: 'Home', keyCode: 36, text: '' },
    ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, text: '' },
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

async function focus(cdp, selector) {
  return evaluate(cdp, `(() => { const node=document.querySelector(${JSON.stringify(selector)}); if(!node)return false; node.focus(); return document.activeElement===node; })()`);
}

async function capture(cdp, name) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(outputRoot, name), Buffer.from(data, 'base64'));
}

async function waitReady(cdp) {
  return evaluate(cdp, `new Promise((resolve) => {
    const deadline=performance.now()+15000;
    const check=()=>{
      const canvas=document.querySelector('canvas');
      const select=document.querySelector('#semantic-part-select');
      if(canvas?.width>0&&canvas?.height>0&&select?.options.length===19)resolve(true);
      else if(performance.now()>deadline)resolve(false);
      else requestAnimationFrame(check);
    }; check();
  })`, true);
}

const contrastExpression = `(() => {
  const parse=(value)=>{const match=value?.match(/rgba?\\(([^)]+)\\)/);if(!match)return null;const values=match[1].split(/[, ]+/).filter(Boolean).map(Number);return{r:values[0],g:values[1],b:values[2],a:values.length>3?values[3]:1}};
  const mix=(front,back)=>({r:front.r*front.a+back.r*(1-front.a),g:front.g*front.a+back.g*(1-front.a),b:front.b*front.a+back.b*(1-front.a),a:1});
  const background=(node)=>{const layers=[];for(let current=node;current;current=current.parentElement){const color=parse(getComputedStyle(current).backgroundColor);if(color&&color.a>0)layers.push(color)}let out={r:8,g:15,b:19,a:1};for(const color of layers.reverse())out=mix(color,out);return out};
  const luminance=(color)=>{const channel=(value)=>{value/=255;return value<=.03928?value/12.92:((value+.055)/1.055)**2.4};return .2126*channel(color.r)+.7152*channel(color.g)+.0722*channel(color.b)};
  const ratio=(first,second)=>{const a=luminance(first),b=luminance(second);return(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
  return ['.panel-title span','.inspector-empty p'].map((selector)=>{const node=document.querySelector(selector);const style=getComputedStyle(node),back=background(node),raw=parse(style.color),front=mix(raw,back);return{selector,text:node.textContent.trim().replace(/\\s+/g,' '),fontSize:style.fontSize,color:style.color,effectiveBackground:back,ratio:ratio(front,back),threshold:4.5,pass:ratio(front,back)>=4.5}});
})()`;

const stateExpression = `(() => { const button=document.querySelector('.play-button'); const copy=button.nextElementSibling; return {focused:document.activeElement===button,pressed:button.getAttribute('aria-pressed'),state:button.dataset.state,label:button.getAttribute('aria-label'),title:button.title,visibleCopy:copy?.textContent?.trim().replace(/\\s+/g,' ')||null}; })()`;

const selectionExpression = `(() => ({
  selectFocused:document.activeElement===document.querySelector('#semantic-part-select'),
  selectValue:document.querySelector('#semantic-part-select')?.value||null,
  selectedOption:document.querySelector('#semantic-part-select')?.selectedOptions[0]?.textContent?.trim()||null,
  inspectorHasPart:document.querySelector('.inspector')?.classList.contains('has-part')||false,
  inspectorName:document.querySelector('.part-title strong')?.textContent?.trim()||null,
  inspectorEnglishName:document.querySelector('.part-title small')?.textContent?.trim()||null,
  inspectorState:document.querySelector('.live-state dd')?.textContent?.trim()||null
}))()`;

try {
  browser = await launchEdge({ port: debugPort, profilePrefix: 'inline4-v4-r2-a11y-' });
  const { cdp } = browser;
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageErrors.push(exceptionDetails));
  cdp.on('Runtime.consoleAPICalled', (entry) => consoleMessages.push({ type: entry.type, args: entry.args?.map((arg) => arg.value ?? arg.description ?? null) ?? [] }));
  cdp.on('Network.loadingFailed', (entry) => { if (!entry.canceled) failedRequests.push(entry); });
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  if (!await waitReady(cdp)) throw new Error('Production page did not become ready.');
  await sleep(700);

  const contrast = await evaluate(cdp, contrastExpression);
  await capture(cdp, 'contrast-and-initial-state.png');

  const playFocused = await focus(cdp, '.play-button');
  const runningBefore = await evaluate(cdp, stateExpression);
  await press(cdp, 'Space');
  const paused = await evaluate(cdp, stateExpression);
  await capture(cdp, 'paused-state.png');
  await press(cdp, 'Space');
  const runningRestored = await evaluate(cdp, stateExpression);

  await focus(cdp, '.mode-control button[data-value="xray"]');
  await press(cdp, 'Enter');
  await focus(cdp, '.preset-row button[data-value="crank"]');
  await press(cdp, 'Enter');
  await focus(cdp, '.play-button');
  await press(cdp, 'Space');
  await sleep(450);
  await capture(cdp, 'generic-selection-before.png');

  const selectorFocused = await focus(cdp, '#semantic-part-select');
  await press(cdp, 'Home');
  for (let index=0; index<4; index+=1) await press(cdp, 'ArrowDown');
  await press(cdp, 'Enter');
  await sleep(500);
  const pistonSelection = await evaluate(cdp, selectionExpression);
  await capture(cdp, 'generic-piston-selected.png');

  await press(cdp, 'Home');
  for (let index=0; index<6; index+=1) await press(cdp, 'ArrowDown');
  await press(cdp, 'Enter');
  await sleep(500);
  const rodSelection = await evaluate(cdp, selectionExpression);
  await capture(cdp, 'generic-connecting-rod-selected.png');

  const screenshotState = await evaluate(cdp, `(() => ({mode:[...document.querySelectorAll('.mode-control button')].find(node=>node.getAttribute('aria-pressed')==='true')?.dataset.value||null,camera:[...document.querySelectorAll('.preset-row button[data-value]')].find(node=>node.getAttribute('aria-pressed')==='true')?.dataset.value||null,running:document.querySelector('.play-button')?.dataset.state||null,canvas:{width:document.querySelector('canvas')?.width,height:document.querySelector('canvas')?.height}}))()`);

  const results = {
    startedAt,
    finishedAt: new Date().toISOString(),
    exitCode: 0,
    baseUrl,
    contrast,
    runningState: { playFocused, before: runningBefore, paused, restored: runningRestored },
    genericSelection: { selectorFocused, piston: pistonSelection, connectingRod: rodSelection, screenshotState },
    runtime: { pageErrors, consoleMessages, failedRequests },
    nvda: { status: 'pending-real-human', simulated: false },
  };
  await writeFile(path.join(outputRoot, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(path.join(outputRoot, 'console-and-errors.json'), `${JSON.stringify({ pageErrors, consoleMessages, failedRequests }, null, 2)}\n`);
  await writeFile(path.join(outputRoot, 'run.log'), `${startedAt} start narrow Round-2 accessibility recheck\n${results.finishedAt} complete exit 0\n`);
} catch (error) {
  const failure = { startedAt, finishedAt: new Date().toISOString(), exitCode: 1, error: String(error?.stack ?? error), pageErrors, consoleMessages, failedRequests };
  await writeFile(path.join(outputRoot, 'failure.json'), `${JSON.stringify(failure, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
}
