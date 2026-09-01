import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const V4_ARTIFACT_ROOT = path.join(PROJECT_ROOT, 'artifacts', 'v4');
const SOURCE = path.join(PROJECT_ROOT, 'evaluation', 'mechanics', 'scan-assembly.ts');
const FILE_NAME = 'assembly-scan.json';

function parseArguments(argv) {
  let outputDirectory;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output-dir') {
      outputDirectory = argv[index + 1];
      index += 1;
    } else if (argv[index] === '--help' || argv[index] === '-h') {
      console.log('Usage: node evaluation/v4/export_snapshots_v4.mjs --output-dir artifacts/v4/<run>/snapshots');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argv[index]}`);
    }
  }
  if (!outputDirectory) throw new Error('--output-dir is required');
  return path.resolve(PROJECT_ROOT, outputDirectory);
}

function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

const outputDirectory = parseArguments(process.argv.slice(2));
if (!isWithin(V4_ARTIFACT_ROOT, outputDirectory)) {
  throw new Error(`Refusing output outside artifacts/v4/: ${outputDirectory}`);
}
const outputPath = path.join(outputDirectory, FILE_NAME);
if (await exists(outputPath)) throw new Error(`Snapshot output already exists: ${outputPath}`);

const sourceBytes = await readFile(SOURCE);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'compute-picture-v4-snapshots-'));
const stagedDirectory = path.join(stagingRoot, 'snapshots');
const bundlePath = path.join(stagingRoot, 'scan-assembly-v4.mjs');

try {
  let source = sourceBytes.toString('utf8');
  const rootDeclaration = [
    "const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));",
    "const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..', '..');",
  ].join('\n');
  const fixedRoot = [
    `const SCRIPT_DIRECTORY = ${JSON.stringify(path.join(PROJECT_ROOT, 'evaluation', 'mechanics', 'runtime'))};`,
    `const PROJECT_ROOT = ${JSON.stringify(PROJECT_ROOT)};`,
  ].join('\n');
  if (!source.includes(rootDeclaration)) throw new Error('Mechanics scanner root declaration changed');
  source = source.replace(rootDeclaration, fixedRoot);

  const outputDeclaration = "const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'artifacts', 'external-eval', 'mechanics');";
  if (!source.includes(outputDeclaration)) throw new Error('Mechanics scanner output declaration changed');
  source = source.replace(outputDeclaration, `const OUTPUT_DIRECTORY = ${JSON.stringify(stagedDirectory)};`);
  source = source.replaceAll('7e5ea916a115dcef1bf3ba467a31b78c6206c612', head);

  const built = await build({
    stdin: {
      contents: source,
      loader: 'ts',
      resolveDir: path.join(PROJECT_ROOT, 'evaluation', 'mechanics'),
      sourcefile: 'scan-assembly-v4.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    logLevel: 'warning',
  });
  if (built.outputFiles.length !== 1) throw new Error('Expected one scanner bundle');
  await writeFile(bundlePath, built.outputFiles[0].contents);
  await import(`${pathToFileURL(bundlePath).href}?run=${Date.now()}`);
  const staged = await readFile(path.join(stagedDirectory, FILE_NAME));
  await mkdir(outputDirectory, { recursive: true });
  const temporary = `${outputPath}.tmp-${process.pid}`;
  await writeFile(temporary, staged, { flag: 'wx' });
  await rename(temporary, outputPath);
  console.log(JSON.stringify({
    output: path.relative(PROJECT_ROOT, outputPath).replaceAll('\\', '/'),
    bytes: staged.byteLength,
    targetCommit: head,
  }, null, 2));
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
