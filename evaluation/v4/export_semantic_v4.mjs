import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..');
const V4_ARTIFACT_ROOT = path.join(PROJECT_ROOT, 'artifacts', 'v4');
const EXTERNAL_EVAL_ROOT = path.join(PROJECT_ROOT, 'artifacts', 'external-eval');
const EXISTING_EXPORTER = path.join(PROJECT_ROOT, 'evaluation', 'geometry', 'export-semantic-scene.ts');
const GLB_NAME = 'semantic-engine.glb';
const MANIFEST_NAME = 'semantic-engine.manifest.json';

function usage() {
  return [
    'Usage:',
    '  node evaluation/v4/export_semantic_v4.mjs --output-dir artifacts/v4/<run>/semantic-export [--overwrite]',
    '',
    'The output directory is required and must resolve inside artifacts/v4/.',
  ].join('\n');
}

function parseArguments(argv) {
  let outputDirectory;
  let overwrite = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--output-dir') {
      outputDirectory = argv[index + 1];
      index += 1;
    } else if (argument === '--overwrite') {
      overwrite = true;
    } else if (argument === '--help' || argument === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${argument}\n${usage()}`);
    }
  }
  if (!outputDirectory) throw new Error(`--output-dir is required.\n${usage()}`);
  return { outputDirectory: path.resolve(PROJECT_ROOT, outputDirectory), overwrite };
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function publishAtomically(destination, bytes, overwrite) {
  const temporary = `${destination}.tmp-${process.pid}`;
  await writeFile(temporary, bytes, { flag: 'wx' });
  try {
    if (overwrite) await rm(destination, { force: true });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

const { outputDirectory, overwrite } = parseArguments(process.argv.slice(2));
if (!isWithin(V4_ARTIFACT_ROOT, outputDirectory)) {
  throw new Error(`Refusing output outside artifacts/v4/: ${outputDirectory}`);
}
if (outputDirectory === EXTERNAL_EVAL_ROOT || isWithin(EXTERNAL_EVAL_ROOT, outputDirectory)) {
  throw new Error(`Refusing to write into frozen external-eval evidence: ${outputDirectory}`);
}

const finalGlb = path.join(outputDirectory, GLB_NAME);
const finalManifest = path.join(outputDirectory, MANIFEST_NAME);
if (!overwrite && (await exists(finalGlb) || await exists(finalManifest))) {
  throw new Error(`V4 export already exists; choose a new --output-dir or pass --overwrite: ${outputDirectory}`);
}

const sourceBytes = await readFile(EXISTING_EXPORTER);
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim();
const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'compute-picture-v4-export-'));
const stagedExport = path.join(stagingRoot, 'semantic-export');
const bundledExporter = path.join(stagingRoot, 'export-semantic-v4.mjs');

try {
  let source = sourceBytes.toString('utf8');
  const scriptRootDeclaration = [
    "const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));",
    "const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..', '..');",
  ].join('\n');
  const fixedRootDeclaration = [
    `const SCRIPT_DIRECTORY = ${JSON.stringify(path.join(PROJECT_ROOT, 'evaluation', 'geometry', 'runtime'))};`,
    `const PROJECT_ROOT = ${JSON.stringify(PROJECT_ROOT)};`,
  ].join('\n');
  if (!source.includes(scriptRootDeclaration)) throw new Error('Existing exporter root declaration changed; wrapper refuses an unsafe rewrite.');
  source = source.replace(scriptRootDeclaration, fixedRootDeclaration);

  const outputDeclaration = "const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'artifacts', 'external-eval', 'geometry', 'export');";
  if (!source.includes(outputDeclaration)) throw new Error('Existing exporter output declaration changed; wrapper refuses an unsafe rewrite.');
  source = source.replace(outputDeclaration, `const OUTPUT_DIRECTORY = ${JSON.stringify(stagedExport)};`);
  source = source.replaceAll('7e5ea916a115dcef1bf3ba467a31b78c6206c612', head);
  source = source.replace("targetTag: 'v3-model-final',", "targetTag: 'v4-candidate',");

  const frozenDiffProbe = [
    "const sourceDiff = execFileSync('git', ['diff', '--exit-code', 'v3-model-final', '--', 'src'], {",
    '  cwd: PROJECT_ROOT,',
    "  encoding: 'utf8',",
    '});',
  ].join('\n');
  const candidateStatusProbe = [
    "const sourceDiff = execFileSync('git', ['status', '--porcelain', '--', 'src'], {",
    '  cwd: PROJECT_ROOT,',
    "  encoding: 'utf8',",
    '});',
  ].join('\n');
  if (!source.includes(frozenDiffProbe)) throw new Error('Existing exporter V3 diff probe changed; wrapper refuses an unsafe rewrite.');
  source = source.replace(frozenDiffProbe, candidateStatusProbe);

  const buildResult = await build({
    stdin: {
      contents: source,
      loader: 'ts',
      resolveDir: path.join(PROJECT_ROOT, 'evaluation', 'geometry'),
      sourcefile: 'export-semantic-scene-v4.ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    logLevel: 'warning',
  });
  if (buildResult.outputFiles.length !== 1) throw new Error('Expected one bundled exporter output.');
  await writeFile(bundledExporter, buildResult.outputFiles[0].contents);
  await import(`${pathToFileURL(bundledExporter).href}?run=${Date.now()}`);

  const stagedGlb = await readFile(path.join(stagedExport, GLB_NAME));
  const manifest = JSON.parse(await readFile(path.join(stagedExport, MANIFEST_NAME), 'utf8'));
  if (manifest.glb.sha256 !== sha256(stagedGlb)) throw new Error('Staged GLB hash does not match its manifest.');
  manifest.glb.file = path.relative(PROJECT_ROOT, finalGlb).replaceAll('\\', '/');
  manifest.v4ParameterizedExport = {
    wrapper: 'evaluation/v4/export_semantic_v4.mjs',
    existingExporterSource: 'evaluation/geometry/export-semantic-scene.ts',
    existingExporterSourceSha256: sha256(sourceBytes),
    requestedOutputDirectory: path.relative(PROJECT_ROOT, outputDirectory).replaceAll('\\', '/'),
    externalEvalWritePrevented: true,
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await mkdir(outputDirectory, { recursive: true });
  await publishAtomically(finalGlb, stagedGlb, overwrite);
  await publishAtomically(finalManifest, manifestBytes, overwrite);
  console.log(JSON.stringify({
    outputDirectory: path.relative(PROJECT_ROOT, outputDirectory).replaceAll('\\', '/'),
    glb: { file: manifest.glb.file, bytes: stagedGlb.byteLength, sha256: manifest.glb.sha256 },
    manifest: path.relative(PROJECT_ROOT, finalManifest).replaceAll('\\', '/'),
    targetCommit: manifest.targetCommit,
  }, null, 2));
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
