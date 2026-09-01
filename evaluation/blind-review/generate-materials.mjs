import { copyFile, cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..', '..');
const outputRoot = path.join(repositoryRoot, 'artifacts', 'external-eval', 'blind-review');
const materialsRoot = path.join(outputRoot, 'materials');
const adminRoot = path.join(outputRoot, 'admin');
const formsRoot = path.join(outputRoot, 'forms');
const seed = 20260831;

function mulberry32(initialSeed) {
  let state = initialSeed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function sha256(filePath) {
  const buffer = await readFile(filePath);
  return createHash('sha256').update(buffer).digest('hex');
}

const random = mulberry32(seed);
const anonymousCodes = ['MODEL-K', 'MODEL-R'];
if (random() > 0.5) anonymousCodes.reverse();

const versions = [
  {
    version: 'v2',
    commit: '12472172925ec3108d096f2402a48e3f7939931b',
    code: anonymousCodes[0],
    screenshots: path.join(repositoryRoot, 'artifacts', 'v3', 'phase1', 'visual', 'cameras'),
    app: path.join(repositoryRoot, 'artifacts', 'v3', 'phase1', 'qa', 'build'),
  },
  {
    version: 'v3',
    commit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
    code: anonymousCodes[1],
    screenshots: path.join(repositoryRoot, 'artifacts', 'v3', 'final-review', 'visual', 'browser'),
    app: path.join(repositoryRoot, 'artifacts', 'v3', 'final-review', 'qa', 'build'),
  },
];

const views = ['isometric', 'front', 'side', 'top', 'crank', 'combustion'];
await Promise.all([mkdir(materialsRoot, { recursive: true }), mkdir(adminRoot, { recursive: true }), mkdir(formsRoot, { recursive: true })]);

const copiedFiles = [];
for (const version of versions) {
  const modelRoot = path.join(materialsRoot, version.code);
  const imageRoot = path.join(modelRoot, 'images');
  const appRoot = path.join(modelRoot, 'app');
  await mkdir(imageRoot, { recursive: true });
  await cp(version.app, appRoot, { recursive: true });
  for (const [index, view] of views.entries()) {
    const source = path.join(version.screenshots, `camera-${view}-1280x720.png`);
    const target = path.join(imageRoot, `view-${String(index + 1).padStart(2, '0')}-${view}.png`);
    await copyFile(source, target);
    copiedFiles.push({ code: version.code, kind: 'image', relativePath: path.relative(outputRoot, target).replaceAll('\\', '/'), sha256: await sha256(target) });
  }
  const appFiles = [];
  async function collect(directory) {
    const { readdir } = await import('node:fs/promises');
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await collect(entryPath);
      else appFiles.push(entryPath);
    }
  }
  await collect(appRoot);
  for (const file of appFiles) copiedFiles.push({ code: version.code, kind: 'app', relativePath: path.relative(outputRoot, file).replaceAll('\\', '/'), sha256: await sha256(file) });
}

const assignments = [];
for (let index = 0; index < 12; index += 1) {
  const first = index % 2 === 0 ? anonymousCodes[0] : anonymousCodes[1];
  const second = first === anonymousCodes[0] ? anonymousCodes[1] : anonymousCodes[0];
  assignments.push({ participantId: `P${String(index + 1).padStart(2, '0')}`, first, second });
}

await writeFile(path.join(materialsRoot, 'participant-assignments.csv'), [
  'participant_id,first_model_code,second_model_code',
  ...assignments.map((row) => `${row.participantId},${row.first},${row.second}`),
  '',
].join('\n'), 'utf8');

await writeFile(path.join(adminRoot, 'randomization-key.json'), JSON.stringify({
  schemaVersion: 1,
  seed,
  warning: 'ADMIN ONLY — do not provide this file to participants.',
  mapping: Object.fromEntries(versions.map((entry) => [entry.code, { version: entry.version, commit: entry.commit }])),
  assignments,
  copiedFiles,
}, null, 2), 'utf8');

const header = [
  'participant_id', 'background', 'consent', 'technical_failure', 'prior_mapping_known', 'model_code', 'presentation_order',
  ...Array.from({ length: 7 }, (_, task) => [`task${task + 1}_success`, `task${task + 1}_time_s`, `task${task + 1}_errors`]).flat(),
  'visual_structure', 'visual_proportion', 'visual_materials', 'visual_internals', 'visual_section', 'visual_labels',
  ...Array.from({ length: 10 }, (_, item) => `sus${item + 1}`), 'notes',
];
await writeFile(path.join(formsRoot, 'participant-records.csv'), `${header.join(',')}\n`, 'utf8');
await copyFile(path.join(import.meta.dirname, 'PARTICIPANT_GUIDE.md'), path.join(materialsRoot, 'PARTICIPANT_GUIDE.md'));
await copyFile(path.join(import.meta.dirname, 'BLIND_REVIEW_FORM.md'), path.join(formsRoot, 'BLIND_REVIEW_FORM.md'));

await writeFile(path.join(outputRoot, 'generation-summary.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  seed,
  participantMaterialsExposeVersion: false,
  modelCodes: anonymousCodes.slice().sort(),
  plannedParticipants: assignments.length,
  imageSize: '1280x720',
  views,
  realHumanRecords: 0,
  blindReviewStatus: 'pending',
}, null, 2), 'utf8');

process.stdout.write(JSON.stringify({ outputRoot, modelCodes: anonymousCodes.slice().sort(), assignments: assignments.length, status: 'pending' }, null, 2));
