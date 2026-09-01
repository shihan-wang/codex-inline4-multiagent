import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { clickCenter, evaluate, launchEdge, sleep } from './cdp.mjs';

const projectRoot = path.resolve('../..');
const artifactsRoot = path.join(projectRoot, 'artifacts/external-eval');
const webVitalsSource = await readFile('node_modules/web-vitals/dist/web-vitals.iife.js', 'utf8');
const url = 'http://127.0.0.1:16310/';
const head = '38c00417812fa87ca76b520c17c978a14cbd8ad2';
const target = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';
const configurations = [
  { name: 'desktop', width: 1280, height: 720, mobile: false },
  { name: 'mobile', width: 390, height: 844, mobile: true },
];

const injection = `${webVitalsSource}\n;(() => {
  const state = globalThis.__externalPerformance = { metrics: {}, eventEntries: [], eventToNextPaint: [], sceneReadyMs: null, sceneReadyChecks: null };
  const compact = (metric) => ({ name: metric.name, value: metric.value, rating: metric.rating, delta: metric.delta, id: metric.id, navigationType: metric.navigationType });
  webVitals.onLCP((metric) => { state.metrics.LCP = compact(metric); }, { reportAllChanges: true });
  webVitals.onCLS((metric) => { state.metrics.CLS = compact(metric); }, { reportAllChanges: true });
  webVitals.onINP((metric) => { state.metrics.INP = compact(metric); }, { reportAllChanges: true, durationThreshold: 0 });
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) state.eventEntries.push({ name: entry.name, entryType: entry.entryType, startTime: entry.startTime, duration: entry.duration, processingStart: entry.processingStart, processingEnd: entry.processingEnd, interactionId: entry.interactionId });
    }).observe({ type: 'event', buffered: true, durationThreshold: 0 });
  } catch (error) { state.eventObserverError = String(error); }
  addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const start = event.timeStamp;
    requestAnimationFrame(() => requestAnimationFrame(() => state.eventToNextPaint.push({ type: 'click', selector: event.target?.className ?? event.target?.tagName, value: performance.now() - start })));
  }, true);
  let previousCrank = null;
  const poll = () => {
    const canvas = document.querySelector('canvas');
    const crank = document.querySelector('.telemetry-value')?.textContent ?? document.querySelector('.top-metric strong')?.textContent;
    const checks = {
      canvasSize: Boolean(canvas && canvas.clientWidth > 0 && canvas.clientHeight > 0),
      webgl2: Boolean(canvas?.getContext('webgl2')),
      pauseOperable: Boolean(document.querySelector('.play-button:not([disabled])')),
      crankChangedAcrossFrames: previousCrank !== null && crank !== previousCrank,
      modesInitialized: document.querySelectorAll('.mode-control button').length === 3,
    };
    previousCrank = crank;
    if (Object.values(checks).every(Boolean) && state.sceneReadyMs === null) {
      state.sceneReadyMs = performance.now();
      state.sceneReadyChecks = checks;
    }
    if (state.sceneReadyMs === null) requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
})();`;

for (let runIndex = 1; runIndex <= 5; runIndex += 1) {
  for (const configuration of configurations) {
    const token = `${configuration.name === 'desktop' ? 'D' : 'M'}${runIndex}`;
    const runDirectory = path.join(artifactsRoot, `performance/web-vitals/${configuration.name}/run-${String(runIndex).padStart(2, '0')}`);
    const logPath = path.join(artifactsRoot, `logs/performance-web-vitals-${token}.log`);
    const environmentPath = path.join(artifactsRoot, `environment/performance-web-vitals-${token}.json`);
    await Promise.all([mkdir(runDirectory, { recursive: true }), mkdir(path.dirname(logPath), { recursive: true }), mkdir(path.dirname(environmentPath), { recursive: true })]);
    const startedAt = new Date();
    let exitCode = 0;
    let failure = null;
    let result = null;
    const consoleMessages = [];
    const pageExceptions = [];
    const logEntries = [];
    const edge = await launchEdge({ port: 26_000 + runIndex * 2 + (configuration.mobile ? 1 : 0), profilePrefix: `inline4-vitals-${token}-`, gpuMode: 'hardware' });
    try {
      const { cdp } = edge;
      await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Performance.enable')]);
      cdp.on('Runtime.consoleAPICalled', ({ type, args }) => consoleMessages.push({ type, text: args.map((item) => item.value ?? item.description ?? '').join(' ') }));
      cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => pageExceptions.push(exceptionDetails.exception?.description ?? exceptionDetails.text));
      cdp.on('Log.entryAdded', ({ entry }) => logEntries.push({ level: entry.level, source: entry.source, text: entry.text }));
      await cdp.send('Emulation.setDeviceMetricsOverride', { width: configuration.width, height: configuration.height, deviceScaleFactor: 1, mobile: configuration.mobile });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: injection });
      const loaded = cdp.once('Page.loadEventFired');
      await cdp.send('Page.navigate', { url });
      await loaded;
      const sceneReady = await evaluate(cdp, `new Promise((resolve, reject) => { const deadline = performance.now() + 15000; const poll = () => { if (globalThis.__externalPerformance?.sceneReadyMs !== null) resolve(globalThis.__externalPerformance.sceneReadyMs); else if (performance.now() > deadline) reject(new Error('scene-ready timeout')); else setTimeout(poll, 25); }; poll(); })`, true);
      await sleep(1200);
      const interactions = [
        '.play-button',
        '.mode-control button[data-value="xray"]',
        '.mode-control button[data-value="section"]',
        '.preset-row button[data-value="isometric"]',
        '.play-button',
      ];
      for (const selector of interactions) {
        await clickCenter(cdp, selector);
        await sleep(350);
      }
      await sleep(1500);
      const pageState = await evaluate(cdp, `(() => ({ ...globalThis.__externalPerformance, navigation: performance.getEntriesByType('navigation')[0]?.toJSON(), lcpEntries: performance.getEntriesByType('largest-contentful-paint').map((entry) => entry.toJSON()) }))()`);
      const renderer = await evaluate(cdp, `(() => { const c = document.querySelector('canvas'); const g = c?.getContext('webgl2'); const e = g?.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unavailable'; })()`);
      const { metrics } = await cdp.send('Performance.getMetrics');
      result = {
        token,
        configuration,
        sceneReadyMs: sceneReady,
        pageState,
        renderer,
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
      configuration,
      startedAtUtc: startedAt.toISOString(),
      endedAtUtc: endedAt.toISOString(),
      durationMs: endedAt.getTime() - startedAt.getTime(),
      exitCode,
      failure,
      command: `node run-web-vitals.mjs (${token})`,
      gitHead: head,
      targetTagPeeled: target,
      url,
      freshProfile: true,
      metricNote: 'INP/Event Timing are scripted laboratory interactions, not field p75; Lighthouse TBT is not used',
    };
    await writeFile(path.join(runDirectory, 'raw-result.json'), `${JSON.stringify({ metadata, result }, null, 2)}\n`);
    await writeFile(path.join(runDirectory, 'run-metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
    await writeFile(environmentPath, `${JSON.stringify({ ...metadata, renderer: result?.renderer ?? null }, null, 2)}\n`);
    await writeFile(logPath, `EXIT ${exitCode}\n${failure ?? 'OK'}\n`);
    process.stdout.write(`[web-vitals] ${token} exit=${exitCode} sceneReady=${String(result?.sceneReadyMs)}\n`);
  }
}
