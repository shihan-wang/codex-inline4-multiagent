import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluate, launchEdge, sleep } from '../../../../../evaluation/performance/cdp.mjs';

const baseUrl = process.argv[2];
const debugPort = Number(process.argv[3]);
const output = path.resolve(process.argv[4] ?? '');
if (!baseUrl || !Number.isInteger(debugPort) || !process.argv[4]) {
  throw new Error('Usage: node capture-fixed-round3.mjs <url> <debug-port> <output-dir>');
}
await mkdir(output, { recursive: false });
const edge = await launchEdge({ port: debugPort, profilePrefix: 'inline4-v4-round3-fixed-', gpuMode: 'hardware' });
const { cdp } = edge;
const consoleEvents = [];
const waitUntil = async (expression, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { if (await evaluate(cdp, expression)) return; } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
};

try {
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable')]);
  cdp.on('Runtime.consoleAPICalled', (event) => consoleEvents.push({
    kind: 'console', type: event.type,
    args: (event.args ?? []).map((item) => item.value ?? item.description ?? item.type),
  }));
  cdp.on('Runtime.exceptionThrown', (event) => consoleEvents.push({ kind: 'exception', details: event.exceptionDetails }));
  cdp.on('Log.entryAdded', (event) => consoleEvents.push({ kind: 'log', entry: event.entry }));
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
    let frame = 0;
    const freezeAt = 361;
    globalThis.__V4_ROUND3_FIXED_RAF__ = { frame: 0, freezeAt, frozen: false, syntheticTimeMs: 0 };
    globalThis.requestAnimationFrame = (callback) => nativeRaf(() => {
      frame += 1;
      const record = globalThis.__V4_ROUND3_FIXED_RAF__;
      record.frame = frame;
      record.syntheticTimeMs = (frame - 1) * (1000 / 60);
      if (frame > freezeAt) { record.frozen = true; return; }
      callback(record.syntheticTimeMs);
      if (frame === freezeAt) record.frozen = true;
    });
  })();` });

  const scenes = [
    { name: 'solid-isometric', mode: 'solid', preset: 'isometric', width: 1280, height: 720 },
    { name: 'section-crank', mode: 'section', preset: 'crank', width: 1280, height: 720 },
    { name: 'xray-combustion', mode: 'xray', preset: 'combustion', width: 1280, height: 720 },
    { name: 'solid-isometric-exploded', mode: 'solid', preset: 'isometric', explode: true, width: 1280, height: 720 },
    { name: 'narrow-solid-isometric', mode: 'solid', preset: 'isometric', width: 390, height: 844 },
  ];
  const results = [];
  for (const scene of scenes) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: scene.width, height: scene.height, deviceScaleFactor: 1, mobile: false,
    });
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: baseUrl });
    await loaded;
    await waitUntil(`!!document.querySelector('.engine-canvas') && !!document.querySelector('.mode-control')`);
    await evaluate(cdp, `(() => {
      document.querySelector('.mode-control button[data-value=${JSON.stringify(scene.mode)}]')?.click();
      document.querySelector('.preset-row button[data-value=${JSON.stringify(scene.preset)}]')?.click();
      ${scene.explode ? `document.querySelector('#toggle-explode')?.click();` : ''}
      return true;
    })()`);
    await waitUntil(`globalThis.__V4_ROUND3_FIXED_RAF__?.frozen === true`);
    await evaluate(cdp, `document.querySelector('.play-button')?.click()`);
    await sleep(100);
    const state = await evaluate(cdp, `(() => {
      const canvas = document.querySelector('.engine-canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
        raf: globalThis.__V4_ROUND3_FIXED_RAF__,
        activeMode: document.querySelector('.mode-control button.is-active')?.dataset.value,
        activePreset: document.querySelector('.preset-row button.is-active')?.dataset.value,
        crankText: document.querySelector('.gauge strong')?.textContent?.trim(),
        runText: document.querySelector('.run-copy strong')?.textContent?.trim(),
        exploded: document.querySelector('#toggle-explode')?.checked ?? false,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        verticalOverflow: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : gl ? 'webgl' : null,
      };
    })()`);
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    await writeFile(path.join(output, `${scene.name}-${scene.width}x${scene.height}.png`), Buffer.from(screenshot.data, 'base64'));
    results.push({ ...scene, state });
  }

  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  await waitUntil(`!!document.querySelector('#semantic-part-select')`);
  await evaluate(cdp, `document.body.focus()`);
  const focusTrail = [];
  for (let index = 0; index < 48; index += 1) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    const active = await evaluate(cdp, `({
      id: document.activeElement?.id ?? '',
      tag: document.activeElement?.tagName ?? '',
      className: document.activeElement?.className ?? '',
      value: document.activeElement?.value ?? null,
    })`);
    focusTrail.push(active);
    if (active.id === 'semantic-part-select') break;
  }
  const reachedPartSelect = focusTrail.at(-1)?.id === 'semantic-part-select';
  if (reachedPartSelect) {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(300);
  }
  const keyboardPartSelection = await evaluate(cdp, `(() => {
    const select = document.querySelector('#semantic-part-select');
    const inspector = document.querySelector('.inspector');
    return {
      reachedPartSelect: document.activeElement === select,
      value: select?.value ?? null,
      inspectorHasPart: inspector?.classList.contains('has-part') ?? false,
      inspectorFields: inspector?.querySelectorAll('dd').length ?? 0,
      inspectorTitle: inspector?.querySelector('.part-title strong')?.textContent ?? null,
    };
  })()`);
  const keyboardShot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  await writeFile(path.join(output, 'keyboard-part-selected-1280x720.png'), Buffer.from(keyboardShot.data, 'base64'));

  const errorEvents = consoleEvents.filter((event) => event.kind === 'exception'
    || (event.kind === 'console' && event.type === 'error')
    || (event.kind === 'log' && event.entry?.level === 'error'));
  const payload = {
    schema: 'inline4-v4-round3-fixed-visual-v1',
    capturedAtUtc: new Date().toISOString(),
    baseUrl,
    methodology: {
      desktopViewport: '1280x720@1', narrowViewport: '390x844@1',
      syntheticRafHz: 60, freezeFrame: 361, expectedDisplayedCrankAngle: '000.0°',
      matchingV3Evidence: 'artifacts/v4/phase1/visual-performance/fixed-v3/',
      boundary: 'Evaluator-only timestamp control; product source unmodified.',
    },
    results,
    keyboardPartSelection: { ...keyboardPartSelection, focusTrail },
    diagnostics: { events: consoleEvents, errorEventCount: errorEvents.length, browserStderr: edge.stderr() },
  };
  await writeFile(path.join(output, 'fixed-state-results.json'), `${JSON.stringify(payload, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    scenes: results.length,
    crankTexts: [...new Set(results.map((item) => item.state.crankText))],
    renderer: results[0]?.state.renderer,
    keyboardPartSelection,
    errorEvents: errorEvents.length,
  }, null, 2)}\n`);
  if (results.some((item) => item.state.crankText !== '000.0°'
    || item.state.runText !== 'ENGINE PAUSED'
    || item.state.activeMode !== item.mode
    || item.state.activePreset !== item.preset
    || item.state.horizontalOverflow
    || item.state.verticalOverflow)
    || !keyboardPartSelection.reachedPartSelect
    || !keyboardPartSelection.value
    || !keyboardPartSelection.inspectorHasPart
    || keyboardPartSelection.inspectorFields < 5
    || errorEvents.length) {
    process.exitCode = 1;
  }
} finally {
  await edge.close();
}
