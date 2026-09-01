import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate, launchEdge, sleep } from '../../../../evaluation/performance/cdp.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const gpuMode = process.argv[2];
const debugPort = Number(process.argv[3]);
const baseUrl = process.argv[4] ?? 'http://127.0.0.1:16442/';
if (!['hardware', 'swiftshader'].includes(gpuMode) || !Number.isInteger(debugPort)) {
  throw new Error('Usage: node run-sustained-webgl.mjs <hardware|swiftshader> <debug-port> [url]');
}
const expectedRenderer = gpuMode === 'hardware' ? /Intel\(R\) Arc/i : /SwiftShader/i;
const outputDirectory = path.join(here, `sustained-${gpuMode}`);
await mkdir(outputDirectory, { recursive: false });

const instrumentation = `(() => {
  globalThis.__v4FinalWebgl = {
    drawArrays: 0, drawElements: 0, drawArraysInstanced: 0, drawElementsInstanced: 0,
    contextLost: 0, contextRestored: 0,
  };
  for (const constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!constructor) continue;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = constructor.prototype[name];
      if (typeof original !== 'function') continue;
      constructor.prototype[name] = function (...args) {
        globalThis.__v4FinalWebgl[name] += 1;
        return original.apply(this, args);
      };
    }
  }
  addEventListener('webglcontextlost', () => { globalThis.__v4FinalWebgl.contextLost += 1; }, true);
  addEventListener('webglcontextrestored', () => { globalThis.__v4FinalWebgl.contextRestored += 1; }, true);
})();`;

const startedAt = new Date();
const consoleMessages = [];
const pageExceptions = [];
const logEntries = [];
let result = null;
let failure = null;
let exitCode = 0;
const edge = await launchEdge({
  port: debugPort,
  profilePrefix: `inline4-v4-final-${gpuMode}-`,
  gpuMode,
});
try {
  const { cdp } = edge;
  await Promise.all([
    cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Performance.enable'),
  ]);
  cdp.on('Runtime.consoleAPICalled', ({ type, args }) => consoleMessages.push({
    type,
    text: args.map((item) => item.value ?? item.description ?? '').join(' '),
  }));
  cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
    pageExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text);
  });
  cdp.on('Log.entryAdded', ({ entry }) => logEntries.push({
    level: entry.level,
    source: entry.source,
    text: entry.text,
  }));
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 720,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url: baseUrl });
  await loaded;
  await evaluate(cdp, `new Promise((resolve, reject) => {
    const deadline = performance.now() + 30000;
    const poll = () => {
      const canvas = document.querySelector('.engine-canvas');
      const ready = canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0
        && canvas.getContext('webgl2') && document.querySelector('.play-button');
      if (ready) resolve(true);
      else if (performance.now() > deadline) reject(new Error('scene-ready timeout'));
      else requestAnimationFrame(poll);
    };
    poll();
  })`, true);
  const renderer = await evaluate(cdp, `(() => {
    const canvas = document.querySelector('.engine-canvas');
    const gl = canvas?.getContext('webgl2');
    const extension = gl?.getExtension('WEBGL_debug_renderer_info');
    return extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unavailable';
  })()`);
  if (!expectedRenderer.test(renderer)) throw new Error(`Renderer mismatch: ${renderer}`);
  await sleep(5000);
  await evaluate(cdp, `Object.assign(globalThis.__v4FinalWebgl, {
    drawArrays: 0, drawElements: 0, drawArraysInstanced: 0, drawElementsInstanced: 0,
  })`);
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  const sample = await evaluate(cdp, `new Promise((resolve) => {
    const started = performance.now();
    let previous = started;
    const deltas = [];
    const frame = (now) => {
      deltas.push(now - previous);
      previous = now;
      const durationMs = now - started;
      if (durationMs >= 30000 && deltas.length >= 600) {
        resolve({ durationMs, deltas, drawStats: { ...globalThis.__v4FinalWebgl } });
      } else requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  })`, true);
  const heapAfter = await cdp.send('Runtime.getHeapUsage');
  const sorted = [...sample.deltas].sort((a, b) => a - b);
  const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
  const drawCalls = sample.drawStats.drawArrays + sample.drawStats.drawElements
    + sample.drawStats.drawArraysInstanced + sample.drawStats.drawElementsInstanced;
  const { metrics } = await cdp.send('Performance.getMetrics');
  const screenshot = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDirectory, 'post-sample.png'), Buffer.from(screenshot.data, 'base64'));
  result = {
    requestedGpuMode: gpuMode,
    renderer,
    viewport: '1280x720@1',
    warmupMs: 5000,
    minimumDurationMs: 30000,
    minimumFrames: 600,
    sample: {
      frames: sample.deltas.length,
      durationMs: sample.durationMs,
      averageFps: sample.deltas.length * 1000 / sample.durationMs,
      p50FrameMs: percentile(0.50),
      p95FrameMs: percentile(0.95),
      p99FrameMs: percentile(0.99),
      maxFrameMs: sorted.at(-1),
      drawCalls: sample.drawStats,
      drawCallsPerFrame: drawCalls / sample.deltas.length,
    },
    heapBefore,
    heapAfter,
    performanceMetrics: Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
    diagnostics: {
      consoleMessages,
      pageExceptions,
      logEntries,
      applicationConsoleErrors: consoleMessages.filter((item) => item.type === 'error').length,
      browserLogErrors: logEntries.filter((item) => item.level === 'error').length,
      contextLost: sample.drawStats.contextLost,
      contextRestored: sample.drawStats.contextRestored,
      browserStderr: edge.stderr(),
    },
  };
} catch (error) {
  exitCode = 1;
  failure = String(error?.stack ?? error);
} finally {
  await edge.close();
}
const endedAt = new Date();
const payload = {
  schema: 'inline4-v4-final-sustained-webgl-v1',
  metadata: {
    startedAtUtc: startedAt.toISOString(),
    endedAtUtc: endedAt.toISOString(),
    durationMs: endedAt.getTime() - startedAt.getTime(),
    command: `node artifacts/v4/final-review/performance/run-sustained-webgl.mjs ${gpuMode} ${debugPort} ${baseUrl}`,
    exitCode,
    failure,
    gitHead: 'eccde839811d6991b9583f3c4fd6c08918ec64c1',
    v4SourceUncommittedAtMeasurement: true,
    baseUrl,
  },
  result,
};
await writeFile(path.join(outputDirectory, 'raw-result.json'), `${JSON.stringify(payload, null, 2)}\n`);
await writeFile(path.join(outputDirectory, 'run.log'), `EXIT ${exitCode}\n${failure ?? 'OK'}\n`);
process.stdout.write(`${JSON.stringify({
  gpuMode,
  exitCode,
  renderer: result?.renderer,
  sample: result?.sample,
  diagnostics: result?.diagnostics && {
    applicationConsoleErrors: result.diagnostics.applicationConsoleErrors,
    pageExceptions: result.diagnostics.pageExceptions.length,
    browserLogErrors: result.diagnostics.browserLogErrors,
    contextLost: result.diagnostics.contextLost,
  },
}, null, 2)}\n`);
if (exitCode !== 0) process.exitCode = exitCode;
