import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outputDirectory = path.join(root, 'artifacts', 'external-eval', 'validation', 'run-02');
const targetCommit = '7e5ea916a115dcef1bf3ba467a31b78c6206c612';

if (existsSync(outputDirectory)) {
  throw new Error(`Refusing to overwrite existing validation evidence: ${outputDirectory}`);
}

function run(command, args) {
  const startedAt = new Date();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 32 * 1024 * 1024,
  });
  const finishedAt = new Date();
  return {
    command: [command, ...args],
    commandLine: [command, ...args].join(' '),
    startedAtUtc: startedAt.toISOString(),
    finishedAtUtc: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    exitCode: result.status,
    signal: result.signal,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    spawnError: result.error ? String(result.error.stack ?? result.error) : null,
  };
}

function runPackageTool(command, args) {
  return process.platform === 'win32'
    ? run('cmd.exe', ['/d', '/s', '/c', command, ...args])
    : run(command, args);
}

function git(...args) {
  const result = run('git', args);
  if (result.exitCode !== 0) throw new Error(`${result.commandLine} failed: ${result.stderr}`);
  return result.stdout.trim();
}

const headAtStart = git('rev-parse', 'HEAD');
const tagAtStart = git('rev-parse', 'v3-model-final^{}');
const sourceDiffAtStart = git('diff', '--name-only', 'v3-model-final', '--', 'src');
if (tagAtStart !== targetCommit) throw new Error(`Tag mismatch: ${tagAtStart}`);
if (sourceDiffAtStart !== '') throw new Error(`src differs before validation: ${sourceDiffAtStart}`);

await mkdir(outputDirectory, { recursive: true });

const versions = {
  node: process.version,
  npm: runPackageTool('npm', ['--version']),
  typescript: runPackageTool('npx', ['--no-install', 'tsc', '--version']),
  vitest: runPackageTool('npx', ['--no-install', 'vitest', '--version']),
  vite: runPackageTool('npx', ['--no-install', 'vite', '--version']),
};

const validations = [
  { id: 'typecheck', result: runPackageTool('npm', ['run', 'typecheck']) },
  { id: 'unit-tests', result: runPackageTool('npm', ['test']) },
  { id: 'production-build', result: runPackageTool('npm', ['run', 'build']) },
];

for (const validation of validations) {
  const result = validation.result;
  const log = [
    `command: ${result.commandLine}`,
    `startedAtUtc: ${result.startedAtUtc}`,
    `finishedAtUtc: ${result.finishedAtUtc}`,
    `durationMs: ${result.durationMs}`,
    `exitCode: ${result.exitCode}`,
    `signal: ${result.signal ?? ''}`,
    '',
    '--- stdout ---',
    result.stdout,
    '--- stderr ---',
    result.stderr,
    result.spawnError ? `--- spawn error ---\n${result.spawnError}` : '',
  ].join('\n');
  await writeFile(path.join(outputDirectory, `${validation.id}.log`), log, 'utf8');
}

const sourceDiffAtEnd = git('diff', '--name-only', 'v3-model-final', '--', 'src');
const summary = {
  schemaVersion: 1,
  generatedAtUtc: new Date().toISOString(),
  fixedTargetCommit: targetCommit,
  evaluatorHead: headAtStart,
  targetTagPeeledAtStart: tagAtStart,
  sourceDiffAtStart,
  sourceDiffAtEnd,
  versions: Object.fromEntries(Object.entries(versions).map(([name, value]) => [name,
    typeof value === 'string' ? value : {
      commandLine: value.commandLine,
      exitCode: value.exitCode,
      stdout: value.stdout.trim(),
      stderr: value.stderr.trim(),
    },
  ])),
  validations: validations.map(({ id, result }) => ({
    id,
    commandLine: result.commandLine,
    startedAtUtc: result.startedAtUtc,
    finishedAtUtc: result.finishedAtUtc,
    durationMs: result.durationMs,
    exitCode: result.exitCode,
    signal: result.signal,
    log: `artifacts/external-eval/validation/run-02/${id}.log`,
  })),
  allPassed: validations.every(({ result }) => result.exitCode === 0)
    && sourceDiffAtStart === ''
    && sourceDiffAtEnd === '',
};

await writeFile(
  path.join(outputDirectory, 'summary.json'),
  JSON.stringify(summary, null, 2),
  'utf8',
);

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (!summary.allPassed) process.exitCode = 1;
