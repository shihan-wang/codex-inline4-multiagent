import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve('../..');
const artifactsRoot = path.join(projectRoot, 'artifacts/external-eval');
const outputRoot = path.join(artifactsRoot, 'performance');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const stats = (values) => ({ raw: values, min: Math.min(...values), median: percentile(values, 0.5), max: Math.max(...values) });
const rounded = (value, digits = 3) => Number(value.toFixed(digits));

const lighthouse = {};
for (const kind of ['desktop', 'mobile']) {
  const runs = [];
  for (let index = 1; index <= 5; index += 1) {
    const report = await readJson(path.join(outputRoot, `lighthouse/${kind}/run-${String(index).padStart(2, '0')}/report.report.json`));
    runs.push({
      run: index,
      performanceScore: report.categories.performance.score * 100,
      fcpMs: report.audits['first-contentful-paint'].numericValue,
      lcpMs: report.audits['largest-contentful-paint'].numericValue,
      tbtMs: report.audits['total-blocking-time'].numericValue,
      cls: report.audits['cumulative-layout-shift'].numericValue,
      speedIndexMs: report.audits['speed-index'].numericValue,
      ttiMs: report.audits.interactive.numericValue,
      userAgent: report.environment.hostUserAgent,
    });
  }
  lighthouse[kind] = {
    runs,
    summary: Object.fromEntries(['performanceScore', 'fcpMs', 'lcpMs', 'tbtMs', 'cls', 'speedIndexMs', 'ttiMs'].map((key) => [key, stats(runs.map((run) => run[key]))])),
  };
}

const webVitals = {};
const allInteractionDurations = [];
const allEventToNextPaint = [];
for (const kind of ['desktop', 'mobile']) {
  const runs = [];
  const interactionDurations = [];
  const eventToNextPaint = [];
  for (let index = 1; index <= 5; index += 1) {
    const raw = await readJson(path.join(outputRoot, `web-vitals/${kind}/run-${String(index).padStart(2, '0')}/raw-result.json`));
    const state = raw.result.pageState;
    const groups = new Map();
    for (const entry of state.eventEntries.filter((entry) => entry.interactionId > 0)) {
      groups.set(entry.interactionId, Math.max(groups.get(entry.interactionId) ?? 0, entry.duration));
    }
    const grouped = [...groups.values()];
    const paints = state.eventToNextPaint.map((entry) => entry.value);
    interactionDurations.push(...grouped);
    eventToNextPaint.push(...paints);
    runs.push({
      run: index,
      exitCode: raw.metadata.exitCode,
      renderer: raw.result.renderer,
      sceneReadyMs: raw.result.sceneReadyMs,
      lcpMs: state.metrics.LCP?.value ?? null,
      cls: state.metrics.CLS?.value ?? null,
      scriptedInpMs: state.metrics.INP?.value ?? null,
      eventEntryCount: state.eventEntries.length,
      interactionCount: grouped.length,
      eventToNextPaintCount: paints.length,
      applicationErrorCount: raw.result.diagnostics.pageExceptions.length + raw.result.diagnostics.consoleMessages.filter((entry) => entry.type === 'error').length + raw.result.diagnostics.logEntries.filter((entry) => entry.level === 'error').length,
    });
  }
  allInteractionDurations.push(...interactionDurations);
  allEventToNextPaint.push(...eventToNextPaint);
  webVitals[kind] = {
    runs,
    sceneReadyMs: stats(runs.map((run) => run.sceneReadyMs)),
    lcpMs: stats(runs.map((run) => run.lcpMs)),
    cls: stats(runs.map((run) => run.cls)),
    scriptedInpMs: stats(runs.map((run) => run.scriptedInpMs)),
    groupedEventTiming: { count: interactionDurations.length, p75Ms: percentile(interactionDurations, 0.75), minMs: Math.min(...interactionDurations), maxMs: Math.max(...interactionDurations) },
    eventToNextPaint: { count: eventToNextPaint.length, p75Ms: percentile(eventToNextPaint, 0.75), minMs: Math.min(...eventToNextPaint), maxMs: Math.max(...eventToNextPaint) },
  };
}
webVitals.combinedScriptedInteractions = {
  groupedEventTiming: { count: allInteractionDurations.length, p75Ms: percentile(allInteractionDurations, 0.75), minMs: Math.min(...allInteractionDurations), maxMs: Math.max(...allInteractionDurations) },
  eventToNextPaint: { count: allEventToNextPaint.length, p75Ms: percentile(allEventToNextPaint, 0.75), minMs: Math.min(...allEventToNextPaint), maxMs: Math.max(...allEventToNextPaint) },
  interpretation: 'scripted laboratory interactions; not field INP p75',
};

const webgl = {};
for (const kind of ['intel-arc', 'swiftshader']) {
  const runs = [];
  for (let index = 1; index <= 3; index += 1) {
    const raw = await readJson(path.join(outputRoot, `webgl/${kind}/run-${String(index).padStart(2, '0')}/raw-result.json`));
    const sample = raw.result.sample;
    runs.push({
      run: index,
      exitCode: raw.metadata.exitCode,
      renderer: raw.result.renderer,
      frames: sample.frames,
      durationMs: sample.durationMs,
      averageFps: sample.averageFps,
      p50FrameMs: sample.p50FrameMs,
      p95FrameMs: sample.p95FrameMs,
      p99FrameMs: sample.p99FrameMs,
      maxFrameMs: sample.maxFrameMs,
      drawCallsPerFrame: sample.drawCallsPerFrame,
      contextLost: sample.drawCalls.contextLost,
      contextRestored: sample.drawCalls.contextRestored,
      heapUsedBefore: raw.result.heapBefore.usedSize,
      heapUsedAfter: raw.result.heapAfter.usedSize,
      applicationErrorCount: raw.result.diagnostics.pageExceptions.length + raw.result.diagnostics.consoleMessages.filter((entry) => entry.type === 'error').length + raw.result.diagnostics.logEntries.filter((entry) => entry.level === 'error').length,
    });
  }
  webgl[kind] = {
    runs,
    averageFps: stats(runs.map((run) => run.averageFps)),
    p95FrameMs: stats(runs.map((run) => run.p95FrameMs)),
    drawCallsPerFrame: stats(runs.map((run) => run.drawCallsPerFrame)),
    pooledP95Note: 'Per-frame delta arrays were not retained. The maximum per-run p95 is a conservative upper bound on the pooled p95 because all runs have equal sample counts.',
  };
}

const invalidAttempts = [];
for (const kind of ['desktop', 'mobile']) {
  const root = path.join(outputRoot, `lighthouse/${kind}`);
  for (const name of await readdir(root)) {
    if (!name.includes('invalid')) continue;
    let metadata = null;
    try { metadata = await readJson(path.join(root, name, 'run-metadata.json')); } catch {}
    invalidAttempts.push({
      kind,
      directory: path.relative(projectRoot, path.join(root, name)).replaceAll('\\', '/'),
      metadata,
      preserved: true,
      classification: metadata
        ? 'invalid: Lighthouse report was produced, then chrome-launcher cleanup raised EPERM and returned exit code 1'
        : 'invalid: interrupted while diagnosing the preceding chrome-launcher cleanup failure; no measurement report',
    });
  }
}

const score = {
  lighthouseDesktopPerformance: lighthouse.desktop.summary.performanceScore.median >= 95 ? 3 : lighthouse.desktop.summary.performanceScore.median >= 90 ? 2.5 : lighthouse.desktop.summary.performanceScore.median >= 80 ? 1.5 : lighthouse.desktop.summary.performanceScore.median >= 60 ? 0.5 : 0,
  lighthouseMobilePerformance: lighthouse.mobile.summary.performanceScore.median >= 90 ? 4 : lighthouse.mobile.summary.performanceScore.median >= 80 ? 3 : lighthouse.mobile.summary.performanceScore.median >= 70 ? 2 : lighthouse.mobile.summary.performanceScore.median >= 50 ? 1 : 0,
  lcpDesktop: lighthouse.desktop.summary.lcpMs.median <= 2500 && lighthouse.desktop.summary.lcpMs.max <= 4000 ? 2 : lighthouse.desktop.summary.lcpMs.median <= 4000 ? 1 : 0,
  lcpMobile: lighthouse.mobile.summary.lcpMs.median <= 2500 && lighthouse.mobile.summary.lcpMs.max <= 4000 ? 2 : lighthouse.mobile.summary.lcpMs.median <= 4000 ? 1 : 0,
  clsDesktop: lighthouse.desktop.summary.cls.median <= 0.1 && lighthouse.desktop.summary.cls.max <= 0.25 ? 1 : 0,
  clsMobile: lighthouse.mobile.summary.cls.median <= 0.1 && lighthouse.mobile.summary.cls.max <= 0.25 ? 1 : 0,
  sceneReadyDesktop: webVitals.desktop.sceneReadyMs.median <= 2500 ? 2 : webVitals.desktop.sceneReadyMs.median <= 4000 ? 1 : 0,
  sceneReadyMobile: webVitals.mobile.sceneReadyMs.median <= 4000 ? 2 : webVitals.mobile.sceneReadyMs.median <= 6000 ? 1 : 0,
  scriptedInteraction: webVitals.combinedScriptedInteractions.groupedEventTiming.p75Ms <= 200 ? 3 : webVitals.combinedScriptedInteractions.groupedEventTiming.p75Ms <= 300 ? 2 : webVitals.combinedScriptedInteractions.groupedEventTiming.p75Ms <= 500 ? 1 : 0,
  hardwareWebgl: webgl['intel-arc'].runs.every((run) => run.exitCode === 0 && run.applicationErrorCount === 0 && run.contextLost === 0) && Math.max(...webgl['intel-arc'].runs.map((run) => run.p95FrameMs)) <= 16.7 ? 3 : Math.max(...webgl['intel-arc'].runs.map((run) => run.p95FrameMs)) <= 33.3 ? 2 : Math.max(...webgl['intel-arc'].runs.map((run) => run.p95FrameMs)) <= 50 ? 1 : 0,
  swiftshaderCompatibility: webgl.swiftshader.runs.every((run) => run.exitCode === 0 && run.applicationErrorCount === 0 && run.contextLost === 0) ? (Math.max(...webgl.swiftshader.runs.map((run) => run.p95FrameMs)) <= 150 ? 2 : 1) : 0,
};
score.total = Object.values(score).reduce((sum, value) => sum + value, 0);

const summary = {
  schema: 'inline4-external-evaluation-a-v1',
  generatedAtUtc: new Date().toISOString(),
  protocolCommit: '38c00417812fa87ca76b520c17c978a14cbd8ad2',
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  url: 'http://127.0.0.1:16310/',
  environment: {
    operatingSystem: 'Windows 10 Home China 25H2 build 26200.9168 x64',
    processor: 'Intel(R) Core(TM) Ultra 9 185H',
    logicalProcessors: 22,
    browser: 'Microsoft Edge 152.0.4191.53',
    node: '24.14.0',
    npm: '11.9.0',
    lighthouse: '12.8.2',
    webVitals: '5.3.0',
    hardwareRenderer: webgl['intel-arc'].runs[0].renderer,
    softwareRenderer: webgl.swiftshader.runs[0].renderer,
    timezone: 'China Standard Time / Asia/Shanghai',
  },
  runCounts: {
    lighthouse: { validDesktop: 5, validMobile: 5, invalidAttempts: invalidAttempts.length },
    webVitals: { validDesktop: 5, validMobile: 5, invalidAttempts: 0 },
    webgl: { validIntelArc: 3, validSwiftShader: 3, invalidAttempts: 0 },
  },
  lighthouseOrder: ['D1', 'M1', 'M2', 'D2', 'D3', 'M3', 'M4', 'D4', 'D5', 'M5'],
  lighthouse,
  webVitals,
  webgl,
  invalidAttempts,
  score: { earned: score.total, maximum: 25, components: score },
  spector: { status: 'delegated-to-independent-visual-agent', includedInThisSummary: false },
  cautions: [
    'Lighthouse TBT is reported only as TBT and is never called INP.',
    'Web Vitals INP and Event Timing values are scripted laboratory interactions, not field 75th-percentile user data.',
    'SwiftShader results are software-rendering compatibility/performance only and are not mixed with Intel Arc statistics.',
    'Spector representative frames are a separate evidence class and are not mixed into sustained WebGL measurements.',
  ],
};
await mkdir(outputRoot, { recursive: true });
await writeFile(path.join(outputRoot, 'a-scorecard.json'), `${JSON.stringify(summary, null, 2)}\n`);
await mkdir(path.join(artifactsRoot, 'environment'), { recursive: true });
await writeFile(path.join(artifactsRoot, 'environment/performance-runtime.json'), `${JSON.stringify({
  generatedAtUtc: summary.generatedAtUtc,
  protocolCommit: summary.protocolCommit,
  targetCommit: summary.targetCommit,
  ...summary.environment,
}, null, 2)}\n`);

const formatStats = (item, digits = 2) => `${item.raw.map((value) => rounded(value, digits)).join(', ')}；中位 ${rounded(item.median, digits)}，最小 ${rounded(item.min, digits)}，最大 ${rounded(item.max, digits)}`;
const lines = [
  '# External evaluation A 类性能汇总',
  '',
  `固定对象：\`7e5ea916a115dcef1bf3ba467a31b78c6206c612\`；协议提交：\`38c00417812fa87ca76b520c17c978a14cbd8ad2\`。`,
  '',
  `A 类得分：**${score.total}/25**。Spector 单帧由独立视觉代理执行，不混入持续 WebGL。`,
  '',
  '## 环境与有效性',
  '',
  '- Windows 10 Home China 25H2 build 26200.9168 x64；Intel Core Ultra 9 185H，22 逻辑处理器。',
  '- Microsoft Edge 152.0.4191.53；Node 24.14.0；npm 11.9.0；Lighthouse 12.8.2；web-vitals 5.3.0。',
  `- 硬件 renderer：\`${webgl['intel-arc'].runs[0].renderer}\`。`,
  `- 软件 renderer：\`${webgl.swiftshader.runs[0].renderer}\`。`,
  '- 有效运行：Lighthouse 桌面 5 + 移动 5；Web Vitals 桌面 5 + 移动 5；Intel Arc 3；SwiftShader 3。',
  `- 无效运行：Lighthouse ${invalidAttempts.length} 个（3 个报告生成后清理 EPERM；1 个诊断中断且无报告）；全部原样保留且没有进入计分。Web Vitals/WebGL 无无效运行。`,
  '',
  '## Lighthouse 冷缓存',
  '',
  `- 桌面 Performance：${formatStats(lighthouse.desktop.summary.performanceScore, 0)}，得 ${score.lighthouseDesktopPerformance}/3。`,
  `- 移动 Performance：${formatStats(lighthouse.mobile.summary.performanceScore, 0)}，得 ${score.lighthouseMobilePerformance}/4。`,
  `- 桌面 LCP ms：${formatStats(lighthouse.desktop.summary.lcpMs, 1)}，得 ${score.lcpDesktop}/2。`,
  `- 移动 LCP ms：${formatStats(lighthouse.mobile.summary.lcpMs, 1)}，得 ${score.lcpMobile}/2。`,
  `- 桌面 CLS：${formatStats(lighthouse.desktop.summary.cls, 6)}，得 ${score.clsDesktop}/1。`,
  `- 移动 CLS：${formatStats(lighthouse.mobile.summary.cls, 6)}，得 ${score.clsMobile}/1。`,
  `- 桌面 TBT ms：${formatStats(lighthouse.desktop.summary.tbtMs, 1)}。移动 TBT ms：${formatStats(lighthouse.mobile.summary.tbtMs, 1)}。这些数值仅称为 TBT。`,
  `- 固定顺序 10 次全部有效；另保留 ${invalidAttempts.length} 个无效尝试目录。`,
  '',
  '## Web Vitals 与 scene-ready',
  '',
  `- scene-ready 桌面 ms：${formatStats(webVitals.desktop.sceneReadyMs, 1)}，得 ${score.sceneReadyDesktop}/2。`,
  `- scene-ready 移动 ms：${formatStats(webVitals.mobile.sceneReadyMs, 1)}，得 ${score.sceneReadyMobile}/2。`,
  `- 独立 LCP 桌面 ms：${formatStats(webVitals.desktop.lcpMs, 1)}；移动 ms：${formatStats(webVitals.mobile.lcpMs, 1)}。`,
  `- 独立 CLS 桌面：${formatStats(webVitals.desktop.cls, 6)}；移动：${formatStats(webVitals.mobile.cls, 6)}。`,
  `- web-vitals 脚本 INP 桌面 ms：${formatStats(webVitals.desktop.scriptedInpMs, 1)}；移动 ms：${formatStats(webVitals.mobile.scriptedInpMs, 1)}。这是实验室脚本交互，不是现场 p75。`,
  `- 50 个有效 Event Timing 交互分组：p75 ${rounded(webVitals.combinedScriptedInteractions.groupedEventTiming.p75Ms, 1)} ms，范围 ${rounded(webVitals.combinedScriptedInteractions.groupedEventTiming.minMs, 1)}–${rounded(webVitals.combinedScriptedInteractions.groupedEventTiming.maxMs, 1)} ms，得 ${score.scriptedInteraction}/3。`,
  `- 50 个 event-to-next-paint：p75 ${rounded(webVitals.combinedScriptedInteractions.eventToNextPaint.p75Ms, 1)} ms，范围 ${rounded(webVitals.combinedScriptedInteractions.eventToNextPaint.minMs, 1)}–${rounded(webVitals.combinedScriptedInteractions.eventToNextPaint.maxMs, 1)} ms。`,
  '',
  '## 持续 WebGL',
  '',
  ...webgl['intel-arc'].runs.map((run) => `- Intel Arc run-${String(run.run).padStart(2, '0')}：${run.frames} 帧 / ${rounded(run.durationMs / 1000, 2)} s，${rounded(run.averageFps, 2)} FPS，p50/p95/p99/max ${rounded(run.p50FrameMs, 1)}/${rounded(run.p95FrameMs, 1)}/${rounded(run.p99FrameMs, 1)}/${rounded(run.maxFrameMs, 1)} ms，${rounded(run.drawCallsPerFrame, 2)} draws/frame，错误 ${run.applicationErrorCount}，context lost ${run.contextLost}。`),
  `- 硬件得 ${score.hardwareWebgl}/3。`,
  ...webgl.swiftshader.runs.map((run) => `- SwiftShader run-${String(run.run).padStart(2, '0')}：${run.frames} 帧 / ${rounded(run.durationMs / 1000, 2)} s，${rounded(run.averageFps, 3)} FPS，p50/p95/p99/max ${rounded(run.p50FrameMs, 1)}/${rounded(run.p95FrameMs, 1)}/${rounded(run.p99FrameMs, 1)}/${rounded(run.maxFrameMs, 1)} ms，${rounded(run.drawCallsPerFrame, 2)} draws/frame，错误 ${run.applicationErrorCount}，context lost ${run.contextLost}。`),
  `- SwiftShader 功能通过但 p95 >150 ms，得 ${score.swiftshaderCompatibility}/2；不得代表普通电脑硬件帧率。`,
  '',
  '## 未测/边界',
  '',
  '- 本汇总不包含 Spector 捕获；该项由独立视觉代理负责。',
  '- 未采集真实现场 Web Vitals p75；实验室脚本值不可冒充现场数据。',
  '- 持续 WebGL 原始文件保留每次统计与 heap snapshot，但没有保留逐帧 delta 数组；报告以三次逐运行 p95 和保守最大值作阈值判定。',
];
await writeFile(path.join(outputRoot, 'A-PERFORMANCE-AUDIT.md'), `${lines.join('\n')}\n`);
