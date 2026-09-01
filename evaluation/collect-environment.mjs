import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(repositoryRoot, 'artifacts', 'external-eval', 'environment', 'host.json');
const run = (command, args, cwd = repositoryRoot) => {
  try { return execFileSync(command, args, { cwd, encoding: 'utf8', windowsHide: true }).trim(); }
  catch (error) { return { unavailable: true, message: String(error.message).split('\n')[0] }; }
};

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const edgeVersionQuery = `(Get-Item '${edgePath.replaceAll('\\', '\\\\')}').VersionInfo.ProductVersion`;
const payload = {
  collectedAt: new Date().toISOString(),
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  targetTagPeeled: run('git', ['rev-parse', 'v3-model-final^{}']),
  protocolCommit: '38c00417812fa87ca76b520c17c978a14cbd8ad2',
  currentHead: run('git', ['rev-parse', 'HEAD']),
  branch: run('git', ['branch', '--show-current']),
  sourceDiffFromTarget: run('git', ['diff', '--name-only', 'v3-model-final', '--', 'src']),
  platform: { type: os.type(), release: os.release(), version: os.version(), arch: os.arch() },
  cpu: { model: os.cpus()[0]?.model, logicalProcessors: os.cpus().length },
  totalMemoryBytes: os.totalmem(),
  node: process.version,
  npm: run('cmd.exe', ['/d', '/c', 'npm', '--version']),
  git: run('git', ['--version']),
  edge: run('powershell.exe', ['-NoProfile', '-Command', edgeVersionQuery]),
  gpuEvidencePolicy: 'Exact renderer strings are recorded by each WebGL browser run; host CIM/PnP inventory is unavailable in this sandbox.',
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');
process.stdout.write(JSON.stringify(payload, null, 2));
