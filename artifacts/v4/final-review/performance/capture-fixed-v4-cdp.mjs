import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluate, launchEdge, sleep } from '../../../../evaluation/performance/cdp.mjs';

const output = path.resolve('artifacts/v4/final-review/performance/fixed-v4-attempt-03');
await mkdir(output, { recursive: false });
const edge = await launchEdge({ port: 16447, profilePrefix: 'inline4-v4-fixed-cdp-', gpuMode: 'hardware' });
const { cdp } = edge;
const consoleEvents = [];
const waitUntil = async (expression, timeoutMs = 30000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await evaluate(cdp, expression)) return;
    } catch {}
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${expression}`);
};

try {
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable')]);
  cdp.on('Runtime.consoleAPICalled', (event) => consoleEvents.push({
    kind: 'console',
    type: event.type,
    args: (event.args ?? []).map((item) => item.value ?? item.description ?? item.type),
  }));
  cdp.on('Runtime.exceptionThrown', (event) => consoleEvents.push({ kind: 'exception', details: event.exceptionDetails }));
  cdp.on('Log.entryAdded', (event) => consoleEvents.push({ kind: 'log', entry: event.entry }));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
    const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
    let frame = 0;
    const freezeAt = 361;
    globalThis.__V4_FIXED_RAF__ = { frame: 0, freezeAt, frozen: false, syntheticTimeMs: 0 };
    globalThis.requestAnimationFrame = (callback) => nativeRaf(() => {
      frame += 1;
      const record = globalThis.__V4_FIXED_RAF__;
      record.frame = frame;
      record.syntheticTimeMs = (frame - 1) * (1000 / 60);
      if (frame > freezeAt) { record.frozen = true; return; }
      callback(record.syntheticTimeMs);
      if (frame === freezeAt) record.frozen = true;
    });
  })();` });

  const scenes = [
    { name: 'solid-isometric', mode: 'solid', preset: 'isometric' },
    { name: 'section-crank', mode: 'section', preset: 'crank' },
    { name: 'xray-combustion', mode: 'xray', preset: 'combustion' },
    { name: 'solid-isometric-exploded', mode: 'solid', preset: 'isometric', explode: true },
  ];
  const results = [];
  for (const scene of scenes) {
    const loaded = cdp.once('Page.loadEventFired');
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:16442/' });
    await loaded;
    await waitUntil(`!!document.querySelector('.engine-canvas') && !!document.querySelector('.mode-control')`);
    await evaluate(cdp, `(() => {
      document.querySelector('.mode-control button[data-value=${JSON.stringify(scene.mode)}]')?.click();
      document.querySelector('.preset-row button[data-value=${JSON.stringify(scene.preset)}]')?.click();
      ${scene.explode ? `document.querySelector('#toggle-explode')?.click();` : ''}
      return true;
    })()`);
    await waitUntil(`globalThis.__V4_FIXED_RAF__?.frozen === true`);
    await evaluate(cdp, `document.querySelector('.play-button')?.click()`);
    await sleep(100);
    const state = await evaluate(cdp, `(() => {
      const canvas = document.querySelector('.engine-canvas');
      const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
      const debug = gl?.getExtension('WEBGL_debug_renderer_info');
      return {
        viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
        canvas: canvas ? { width: canvas.width, height: canvas.height, clientWidth: canvas.clientWidth, clientHeight: canvas.clientHeight } : null,
        raf: globalThis.__V4_FIXED_RAF__,
        activeMode: document.querySelector('.mode-control button.is-active')?.dataset.value,
        activePreset: document.querySelector('.preset-row button.is-active')?.dataset.value,
        crankText: document.querySelector('.gauge strong')?.textContent?.trim(),
        runText: document.querySelector('.run-copy strong')?.textContent?.trim(),
        toggles: [...document.querySelectorAll('.toggle-row input')].map((node) => ({ id: node.id, checked: node.checked })),
        renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
        contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : gl ? 'webgl' : null,
      };
    })()`);
    const screenshot = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(path.join(output, `${scene.name}-1280x720.png`), Buffer.from(screenshot.data, 'base64'));
    results.push({ ...scene, state });
  }
  await writeFile(path.join(output, 'fixed-state-results.json'), `${JSON.stringify({
    schema: 'inline4-v4-final-fixed-visual-v1',
    capturedAtUtc: new Date().toISOString(),
    baseUrl: 'http://127.0.0.1:16442/',
    methodology: {
      viewport: '1280x720@1',
      syntheticRafHz: 60,
      freezeFrame: 361,
      expectedDisplayedCrankAngle: '000.0°',
      matchingV3Evidence: 'artifacts/v4/phase1/visual-performance/fixed-v3/',
      boundary: 'Evaluator-only timestamp control; product source unmodified.',
    },
    results,
    diagnostics: { events: consoleEvents, browserStderr: edge.stderr() },
  }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({
    scenes: results.length,
    crankTexts: [...new Set(results.map((item) => item.state.crankText))],
    renderer: results[0]?.state.renderer,
    events: consoleEvents.length,
  }, null, 2)}\n`);
} finally {
  await edge.close();
}
