import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const evidenceRoot = path.join(repositoryRoot, 'artifacts', 'external-eval');
const manifestPath = path.join(evidenceRoot, 'manifest.json');

async function collect(directory) {
  const output = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await collect(fullPath));
    else if (fullPath !== manifestPath) output.push(fullPath);
  }
  return output;
}

const files = (await collect(evidenceRoot)).sort((a, b) => a.localeCompare(b, 'en'));
const entries = [];
for (const filePath of files) {
  const [buffer, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  entries.push({
    path: path.relative(evidenceRoot, filePath).replaceAll('\\', '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

const documentPaths = [
  path.join(repositoryRoot, 'docs', 'EXTERNAL_EVALUATION_PROTOCOL.md'),
  path.join(repositoryRoot, 'docs', 'EXTERNAL_EVALUATION_REPORT.md'),
];
const documents = [];
for (const filePath of documentPaths) {
  const [buffer, info] = await Promise.all([readFile(filePath), stat(filePath)]);
  documents.push({
    path: path.relative(repositoryRoot, filePath).replaceAll('\\', '/'),
    bytes: info.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
  });
}

const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  targetTag: 'v3-model-final',
  protocolCommit: '38c00417812fa87ca76b520c17c978a14cbd8ad2',
  fileCount: entries.length,
  totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
  documents,
  files: entries,
};
await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
process.stdout.write(JSON.stringify({ manifestPath, fileCount: manifest.fileCount, totalBytes: manifest.totalBytes }, null, 2));
