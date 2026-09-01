import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const output = path.resolve('artifacts/v4/final-review/performance/fixed-v4-attempt-02');
await mkdir(output, { recursive: false });
const puppeteerPath = path.resolve('evaluation/performance/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js');
const { default: puppeteer } = await import(pathToFileURL(puppeteerPath).href);
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-gpu-sandbox',
    '--disable-dev-shm-usage',
    '--disable-features=SkiaGraphite',
    '--window-size=1280,720',
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const consoleErrors = [];
const pageErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(String(error)));
await page.evaluateOnNewDocument(() => {
  const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
  let frame = 0;
  const freezeAt = 361;
  globalThis.__V4_FIXED_RAF__ = { frame: 0, freezeAt, frozen: false, syntheticTimeMs: 0 };
  globalThis.requestAnimationFrame = (callback) => nativeRaf(() => {
    frame += 1;
    const record = globalThis.__V4_FIXED_RAF__;
    record.frame = frame;
    record.syntheticTimeMs = (frame - 1) * (1000 / 60);
    if (frame > freezeAt) {
      record.frozen = true;
      return;
    }
    callback(record.syntheticTimeMs);
    if (frame === freezeAt) record.frozen = true;
  });
});

const scenes = [
  { name: 'solid-isometric', mode: 'solid', preset: 'isometric' },
  { name: 'section-crank', mode: 'section', preset: 'crank' },
  { name: 'xray-combustion', mode: 'xray', preset: 'combustion' },
  { name: 'solid-isometric-exploded', mode: 'solid', preset: 'isometric', explode: true },
];
const results = [];
for (const scene of scenes) {
  await page.goto('http://127.0.0.1:16442/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('.engine-canvas', { timeout: 15000 });
  await page.evaluate((configuration) => {
    document.querySelector(`.mode-control button[data-value="${configuration.mode}"]`)?.click();
    document.querySelector(`.preset-row button[data-value="${configuration.preset}"]`)?.click();
    if (configuration.explode) document.querySelector('#toggle-explode')?.click();
  }, scene);
  await page.waitForFunction(() => globalThis.__V4_FIXED_RAF__?.frozen === true, { timeout: 30000 });
  await page.evaluate(() => document.querySelector('.play-button')?.click());
  const state = await page.evaluate(() => {
    const canvas = document.querySelector('.engine-canvas');
    const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
    const debug = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      canvas: canvas ? {
        width: canvas.width,
        height: canvas.height,
        clientWidth: canvas.clientWidth,
        clientHeight: canvas.clientHeight,
      } : null,
      raf: globalThis.__V4_FIXED_RAF__,
      activeMode: document.querySelector('.mode-control button.is-active')?.getAttribute('data-value'),
      activePreset: document.querySelector('.preset-row button.is-active')?.getAttribute('data-value'),
      crankText: document.querySelector('.gauge strong')?.textContent?.trim(),
      runText: document.querySelector('.run-copy strong')?.textContent?.trim(),
      toggles: [...document.querySelectorAll('.toggle-row input')].map((node) => ({
        id: node.id,
        checked: node.checked,
      })),
      renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
      contextType: gl instanceof WebGL2RenderingContext ? 'webgl2' : gl ? 'webgl' : null,
    };
  });
  await page.screenshot({ path: path.join(output, `${scene.name}-1280x720.png`) });
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
  diagnostics: { consoleErrors, pageErrors },
}, null, 2)}\n`);
await browser.close();
process.stdout.write(`${JSON.stringify({
  scenes: results.length,
  crankTexts: [...new Set(results.map((item) => item.state.crankText))],
  renderer: results[0]?.state.renderer,
  consoleErrors: consoleErrors.length,
  pageErrors: pageErrors.length,
}, null, 2)}\n`);
