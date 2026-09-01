import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const output = path.resolve('artifacts/v4/round3/final-review/geometry/browser');
await mkdir(output, { recursive: true });

const modulePath = path.resolve(
  'evaluation/performance/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js',
);
const { default: puppeteer } = await import(pathToFileURL(modulePath).href);
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

const baseUrl = 'http://127.0.0.1:16531/';
await page.goto(baseUrl, { waitUntil: 'networkidle0', timeout: 30_000 });
await page.waitForSelector('canvas', { timeout: 15_000 });
await new Promise((resolve) => setTimeout(resolve, 1_200));

if (!await page.evaluate(() => document.querySelector('.run-copy strong')?.textContent?.includes('PAUSED'))) {
  await page.evaluate(() => document.querySelector('.play-button')?.click());
  await page.waitForFunction(() => document.querySelector('.run-copy strong')?.textContent?.includes('PAUSED'));
}

const captureState = async (preset, fileName) => {
  await page.evaluate((value) => {
    document.querySelector(`.preset-row button[data-value="${value}"]`)?.click();
  }, preset);
  await new Promise((resolve) => setTimeout(resolve, 700));
  await page.screenshot({ path: path.join(output, fileName) });
  return page.evaluate(() => ({
    activeMode: document.querySelector('.mode-control button.is-active')?.getAttribute('data-value'),
    activePreset: document.querySelector('.preset-row button.is-active')?.getAttribute('data-value'),
    crankAngle: [...document.querySelectorAll('.gauge')]
      .find((node) => node.textContent?.includes('曲轴转角'))?.textContent?.trim(),
  }));
};

const crankSection = await captureState('crank', 'round3-crank-section-1280x720.png');
const valvetrainXray = await captureState('combustion', 'round3-valvetrain-xray-1280x720.png');

const diagnostics = await page.evaluate(() => {
  const canvas = document.querySelector('canvas');
  const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
  const debug = gl?.getExtension('WEBGL_debug_renderer_info');
  return {
    title: document.title,
    url: location.href,
    canvas: canvas ? {
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    } : null,
    renderer: gl && debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    runState: document.querySelector('.run-copy')?.textContent?.trim(),
    gauges: [...document.querySelectorAll('.gauge')].map((node) => node.textContent?.trim()),
  };
});

await writeFile(path.join(output, 'round3-fixed-angle-page.json'), `${JSON.stringify({
  capturedAt: new Date().toISOString(),
  baseUrl,
  fixedState: 'The app was paused once; both captures retain the same crank angle.',
  states: { crankSection, valvetrainXray },
  diagnostics,
  consoleErrors,
  pageErrors,
}, null, 2)}\n`);
await browser.close();
