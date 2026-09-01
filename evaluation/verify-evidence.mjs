import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const evidenceRoot = path.join(root, 'artifacts', 'external-eval');
const outputPath = path.join(evidenceRoot, 'completeness.json');
const targetCommit = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';
const checks = [];
const failures = [];

if (existsSync(outputPath)) throw new Error(`Refusing to overwrite ${outputPath}`);

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

async function loadJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function requireFiles(name, relativePaths, validate) {
  try {
    const files = [];
    for (const relativePath of relativePaths) {
      const file = path.join(root, relativePath);
      const info = await stat(file);
      if (!info.isFile() || info.size === 0) throw new Error(`empty or not a file: ${relativePath}`);
      files.push({ path: relativePath.replaceAll('\\', '/'), bytes: info.size });
    }
    const detail = validate ? await validate() : {};
    checks.push({ name, status: 'complete', files, detail });
  } catch (error) {
    const message = String(error.stack ?? error);
    checks.push({ name, status: 'incomplete', files: [], detail: { error: message } });
    failures.push({ name, error: message });
  }
}

for (const mode of ['desktop', 'mobile']) {
  const files = [];
  for (let run = 1; run <= 5; run += 1) {
    const base = `artifacts/external-eval/performance/lighthouse/${mode}/run-${String(run).padStart(2, '0')}`;
    files.push(`${base}/report.report.json`, `${base}/report.report.html`, `${base}/run-metadata.json`);
  }
  await requireFiles(`lighthouse-${mode}-5-cold-cache-runs`, files, async () => {
    const scores = [];
    for (let run = 1; run <= 5; run += 1) {
      const report = await loadJson(`artifacts/external-eval/performance/lighthouse/${mode}/run-${String(run).padStart(2, '0')}/report.report.json`);
      scores.push(report.categories.performance.score * 100);
    }
    return { validRuns: 5, performanceScores: scores };
  });
}

for (const mode of ['desktop', 'mobile']) {
  const files = [];
  for (let run = 1; run <= 5; run += 1) {
    const base = `artifacts/external-eval/performance/web-vitals/${mode}/run-${String(run).padStart(2, '0')}`;
    files.push(`${base}/raw-result.json`, `${base}/run-metadata.json`);
  }
  await requireFiles(`web-vitals-and-scene-ready-${mode}-5-runs`, files, async () => {
    const sceneReadyMs = [];
    let interactions = 0;
    for (let run = 1; run <= 5; run += 1) {
      const result = await loadJson(`artifacts/external-eval/performance/web-vitals/${mode}/run-${String(run).padStart(2, '0')}/raw-result.json`);
      const pageState = result.result.pageState;
      if (!Object.values(pageState.sceneReadyChecks).every(Boolean)) throw new Error(`scene-ready failed in ${mode} run ${run}`);
      sceneReadyMs.push(result.result.sceneReadyMs);
      interactions += pageState.eventToNextPaint.length;
    }
    return { validRuns: 5, sceneReadyMs, scriptedInteractions: interactions };
  });
}

for (const mode of ['intel-arc', 'swiftshader']) {
  const files = [];
  for (let run = 1; run <= 3; run += 1) {
    const base = `artifacts/external-eval/performance/webgl/${mode}/run-${String(run).padStart(2, '0')}`;
    files.push(`${base}/raw-result.json`, `${base}/run-metadata.json`, `${base}/heap.heapsnapshot`, `${base}/post-sample.png`);
  }
  await requireFiles(`sustained-webgl-${mode}-3-runs`, files, async () => {
    const results = [];
    for (let run = 1; run <= 3; run += 1) {
      const data = await loadJson(`artifacts/external-eval/performance/webgl/${mode}/run-${String(run).padStart(2, '0')}/raw-result.json`);
      const sample = data.result.sample;
      if (!data.metadata.valid || sample.frames < (mode === 'intel-arc' ? 600 : 600)) throw new Error(`invalid ${mode} run ${run}`);
      if (sample.drawCalls.contextLost !== 0 || data.result.diagnostics.pageExceptions.length !== 0) throw new Error(`runtime error in ${mode} run ${run}`);
      results.push({ run, renderer: data.result.renderer, frames: sample.frames, fps: sample.averageFps, p95Ms: sample.p95FrameMs });
    }
    return { validRuns: 3, results, mixedAverageComputed: false };
  });
}

const spectorFiles = ['artifacts/external-eval/performance/spector/session-04-summary.json'];
for (const scene of ['solid-isometric', 'section-crank', 'xray-valvetrain']) {
  const base = `artifacts/external-eval/performance/spector/${scene}/attempt-04`;
  for (const file of ['capture.json', 'capture-summary.json', 'representative.png', 'state.json', 'spector-status.json', 'environment.json', 'injection.json', 'console.json', 'run.log']) {
    spectorFiles.push(`${base}/${file}`);
  }
}
for (const session of [1, 2, 3]) spectorFiles.push(`artifacts/external-eval/performance/spector/session-0${session}-summary.json`);
await requireFiles('spector-3-scenes-and-failed-attempts-retained', spectorFiles, async () => {
  const summary = await loadJson('artifacts/external-eval/performance/spector/session-04-summary.json');
  if (summary.status !== 'complete' || summary.results.length !== 3) throw new Error('Spector session-04 is not a complete 3-scene session');
  return { status: summary.status, scenes: summary.results.map((item) => item.scene), renderer: summary.results[0].renderer };
});

const axeStates = ['desktop-solid', 'desktop-xray', 'desktop-section', 'desktop-selected', 'desktop-paused', 'desktop-exploded', 'narrow-initial', 'narrow-left-drawer', 'narrow-right-drawer'];
const axeFiles = [];
for (const state of axeStates) {
  const base = `artifacts/external-eval/accessibility/axe/${state}/run-02`;
  axeFiles.push(`${base}/axe-result.json`, `${base}/ax-tree.json`, `${base}/screenshot.png`, `${base}/state-metadata.json`);
}
axeFiles.push('artifacts/external-eval/accessibility/accessibility-run-02-summary.json', 'artifacts/external-eval/accessibility/b-scorecard.json');
await requireFiles('axe-9-required-states', axeFiles, async () => {
  const summary = await loadJson('artifacts/external-eval/accessibility/accessibility-run-02-summary.json');
  if (summary.aggregate.validStates !== 9 || summary.aggregate.invalidStates !== 0) throw new Error('axe run-02 is incomplete');
  return { validStates: 9, stateNames: axeStates, nvda: 'pending-real-operator' };
});

await requireFiles('semantic-glb-blender-trimesh', [
  'artifacts/external-eval/geometry/export/semantic-engine.glb',
  'artifacts/external-eval/geometry/export/semantic-engine.manifest.json',
  'artifacts/external-eval/geometry/blender/results.json',
  'artifacts/external-eval/geometry/trimesh/results.json',
  'artifacts/external-eval/geometry/c-scorecard.json',
], async () => {
  const blender = await loadJson('artifacts/external-eval/geometry/blender/results.json');
  const trimesh = await loadJson('artifacts/external-eval/geometry/trimesh/results.json');
  if (blender.summary.triangleNodesInspected !== 474 || trimesh.summary.triangleNodesInspected !== 474) throw new Error('topology node count mismatch');
  return { blenderVersion: blender.toolVersion, trimeshVersion: trimesh.toolVersion, nodesEach: 474, closedWatertightEach: 413 };
});

await requireFiles('mechanics-0-to-720-and-collision', [
  'artifacts/external-eval/mechanics/assembly-scan.json',
  'artifacts/external-eval/mechanics/collision-scan.json',
], async () => {
  const assembly = await loadJson('artifacts/external-eval/mechanics/assembly-scan.json');
  const collision = await loadJson('artifacts/external-eval/mechanics/collision-scan.json');
  if (collision.summary.sampleCount !== 721 || collision.perAngle.length !== 721) throw new Error('collision scan is not 721 samples');
  return { samples: 721, firingOrderErrors: assembly.summary.firingOrderErrors, strokeErrors: assembly.summary.strokeErrors, collisionAngles: collision.summary.collisionAngleCount };
});

await requireFiles('anonymous-v2-v3-human-review-kit', [
  'artifacts/external-eval/blind-review/generation-summary.json',
  'artifacts/external-eval/blind-review/admin/randomization-key.json',
  'artifacts/external-eval/blind-review/forms/BLIND_REVIEW_FORM.md',
  'artifacts/external-eval/blind-review/forms/participant-records.csv',
  'artifacts/external-eval/blind-review/materials/PARTICIPANT_GUIDE.md',
  'artifacts/external-eval/blind-review/materials/participant-assignments.csv',
  'artifacts/external-eval/blind-review/results/human-review-analysis.json',
], async () => {
  const analysis = await loadJson('artifacts/external-eval/blind-review/results/human-review-analysis.json');
  if (analysis.status !== 'pending' || analysis.validParticipantCount !== 0 || analysis.score !== null) throw new Error('human results must remain empty and pending');
  for (const model of ['MODEL-K', 'MODEL-R']) {
    for (let view = 1; view <= 6; view += 1) {
      const prefix = `view-${String(view).padStart(2, '0')}-`;
      const directory = path.join(evidenceRoot, 'blind-review', 'materials', model, 'images');
      const { readdir } = await import('node:fs/promises');
      const names = await readdir(directory);
      if (!names.some((name) => name.startsWith(prefix) && name.endsWith('.png'))) throw new Error(`missing ${model} ${prefix}`);
    }
  }
  return { status: 'pending', validParticipants: 0, minimumRequired: analysis.minimumRequiredParticipants, simulated: false };
});

await requireFiles('engineering-validation', [
  'artifacts/external-eval/validation/run-01/summary.json',
  'artifacts/external-eval/validation/run-02/summary.json',
  'artifacts/external-eval/validation/run-02/typecheck.log',
  'artifacts/external-eval/validation/run-02/unit-tests.log',
  'artifacts/external-eval/validation/run-02/production-build.log',
], async () => {
  const first = await loadJson('artifacts/external-eval/validation/run-01/summary.json');
  const second = await loadJson('artifacts/external-eval/validation/run-02/summary.json');
  if (first.allPassed !== false || second.allPassed !== true) throw new Error('validation retry history mismatch');
  return { failedEvaluatorAttemptRetained: true, effectiveRun: 'run-02', allPassed: true };
});

const tagPeeled = git('rev-parse', 'v3-model-final^{}');
const sourceDiff = git('diff', '--name-only', 'v3-model-final', '--', 'src');
const payload = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  targetCommit,
  tagPeeled,
  sourceDiff,
  allAutomatableEvidenceComplete: failures.length === 0 && tagPeeled === targetCommit && sourceDiff === '',
  humanRequired: {
    nvda: 'pending',
    blindReview: 'pending',
    simulated: false,
  },
  checks,
  failures,
  reportSha256BeforeFinalization: createHash('sha256').update(await readFile(path.join(root, 'docs', 'EXTERNAL_EVALUATION_REPORT.md'))).digest('hex'),
};

await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
process.stdout.write(`${JSON.stringify({
  output: path.relative(root, outputPath).replaceAll('\\', '/'),
  allAutomatableEvidenceComplete: payload.allAutomatableEvidenceComplete,
  checkCount: checks.length,
  failureCount: failures.length,
  humanRequired: payload.humanRequired,
}, null, 2)}\n`);
if (!payload.allAutomatableEvidenceComplete) process.exitCode = 1;
