import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { evaluate, launchEdge, sleep } from './cdp.mjs';

const projectRoot = path.resolve('../..');
const artifactsRoot = path.join(projectRoot, 'artifacts/external-eval');
const url = 'http://127.0.0.1:16310/';
const head = '38c00417812fa87ca76b520c17c978a14cbd8ad2';
const target = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';
const paths = [
  { directory: 'intel-arc', gpuMode: 'hardware', expected: /Intel\(R\) Arc/i },
  { directory: 'swiftshader', gpuMode: 'swiftshader', expected: /SwiftShader/i },
];

const instrumentation = `(() => {
  globalThis.__externalWebgl = { drawArrays: 0, drawElements: 0, drawArraysInstanced: 0, drawElementsInstanced: 0, contextLost: 0, contextRestored: 0 };
  for (const constructor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!constructor) continue;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced']) {
      const original = constructor.prototype[name];
      if (typeof original !== 'function') continue;
      constructor.prototype[name] = function (...args) { globalThis.__externalWebgl[name] += 1; return original.apply(this, args); };
    }
  }
  addEventListener('webglcontextlost', () => { globalThis.__externalWebgl.contextLost += 1; }, true);
  addEventListener('webglcontextrestored', () => { globalThis.__externalWebgl.contextRestored += 1; }, true);
})();`;

for (const pathConfiguration of paths) {
  for (let runIndex = 1; runIndex <= 3; runIndex += 1) {
    const token = `${pathConfiguration.directory}-run-${String(runIndex).padStart(2, '0')}`;
    const runDirectory = path.join(artifactsRoot, `performance/webgl/${pathConfiguration.directory}/run-${String(runIndex).padStart(2, '0')}`);
    const logPath = path.join(artifactsRoot, `logs/performance-webgl-${token}.log`);
    const environmentPath = path.join(artifactsRoot, `environment/performance-webgl-${token}.json`);
    await Promise.all([mkdir(runDirectory, { recursive: true }), mkdir(path.dirname(logPath), { recursive: true }), mkdir(path.dirname(environmentPath), { recursive: true })]);
    const startedAt = new Date();
    let exitCode = 0;
    let failure = null;
    let result = null;
    const consoleMessages = [];
    const pageExceptions = [];
    const logEntries = [];
    const edge = await launchEdge({ port: 27_000 + paths.indexOf(pathConfiguration) * 10 + runIndex, profilePrefix: `inline4-webgl-${token}-`, gpuMode: pathConfiguration.gpuMode });
    try {
      const { cdp } = edge;
      await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Performance.enable'), cdp.send('HeapProfiler.enable')]);
      cdp.on('Runtime.consoleAPICalled', ({ type, args }) => consoleMessages.push({ type, text: args.map((item) => item.value ?? item.description ?? '').join(' ') }));
      cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text));
      cdp.on('Log.entryAdded', ({ entry }) => logEntries.push({ level: entry.level, source: entry.source, text: entry.text }));
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await loaded;
      await evaluate(cdp, `new Promise((resolve, reject) => { const deadline = performance.now() + 15000; const poll = () => { const c = document.querySelector('canvas'); const ready = c && c.clientWidth > 0 && c.clientHeight > 0 && c.getContext('webgl2') && document.querySelector('.play-button'); if (ready) resolve(true); else if (performance.now() > deadline) reject(new Error('scene timeout')); else requestAnimationFrame(poll); }; poll(); })`, true);
      const renderer = await evaluate(cdp, `(() => { const c = document.querySelector('canvas'); const g = c?.getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unavailable'; })()`);
      if (!pathConfiguration.expected.test(renderer)) throw new Error(`Renderer mismatch: ${renderer}`);
      await sleep(5000);
      await evaluate(cdp, `Object.assign(globalThis.__externalWebgl, { drawArrays: 0, drawElements: 0, drawArraysInstanced: 0, drawElementsInstanced: 0 })`);
      const heapBefore = await cdp.send('Runtime.getHeapUsage');
      const sample = await evaluate(cdp, `new Promise((resolve) => {
        const started = performance.now();
        let previous = started;
        const deltas = [];
        const frame = (now) => {
          deltas.push(now - previous);
          previous = now;
          const durationMs = now - started;
          if (durationMs >= 30000 && deltas.length >= 600) resolve({ durationMs, deltas, drawStats: { ...globalThis.__externalWebgl } });
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      })`, true);
      const heapAfter = await cdp.send('Runtime.getHeapUsage');
      const sorted = [...sample.deltas].sort((a, b) => a - b);
      const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)];
      const summary = {
        frames: sample.deltas.length,
        durationMs: sample.durationMs,
        averageFps: sample.deltas.length * 1000 / sample.durationMs,
        p50FrameMs: percentile(0.50),
        p95FrameMs: percentile(0.95),
        p99FrameMs: percentile(0.99),
        maxFrameMs: sorted.at(-1),
        drawCalls: sample.drawStats,
        drawCallsPerFrame: (sample.drawStats.drawArrays + sample.drawStats.drawElements + sample.drawStats.drawArraysInstanced + sample.drawStats.drawElementsInstanced) / sample.deltas.length,
      };
      const { metrics } = await cdp.send('Performance.getMetrics');
      const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      await writeFile(path.join(runDirectory, 'post-sample.png'), Buffer.from(screenshot.data, 'base64'));
      const heapChunks = [];
      cdp.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) => heapChunks.push(chunk));
      await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false, captureNumericValue: true });
      await writeFile(path.join(runDirectory, 'heap.heapsnapshot'), heapChunks.join(''));
      result = {
        token,
        gpuMode: pathConfiguration.gpuMode,
        renderer,
        viewport: '1280x720',
        warmupMs: 5000,
        minimumFrames: 600,
        minimumDurationMs: 30000,
        sample: summary,
        heapBefore,
        heapAfter,
        performanceMetrics: Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
        diagnostics: { consoleMessages, pageExceptions, logEntries, browserStderr: edge.stderr() },
      };
    } catch (error) {
      exitCode = 1;
      failure = String(error?.stack ?? error);
    } finally {
      await edge.close();
    }
    const endedAt = new Date();
    const metadata = {
      token,
      startedAtUtc: startedAt.toISOString(),
      endedAtUtc: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      command: `node run-webgl.mjs (${token})`,
      exitCode,
      failure,
      gitHead: head,
      targetTagPeeled: target,
      url,
      renderer: result?.renderer ?? null,
      valid: exitCode === 0,
    };
    await writeFile(path.join(runDirectory, 'raw-result.json'), `${JSON.stringify({ metadata, result }, null, 2)}\n`);
    await writeFile(path.join(runDirectory, 'run-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(environmentPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(logPath, `EXIT ${exitCode}\n${failure ?? 'OK'}\n`);
    process.stdout.write(`[webgl] ${token} exit=${exitCode} frames=${String(result?.sample.frames)} p95=${String(result?.sample.p95FrameMs)}\n`);
  }
}
