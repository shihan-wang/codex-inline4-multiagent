import {
  BufferGeometry,
  Group,
  InstancedMesh,
  Line,
  Material,
  Matrix4,
  Mesh,
  Object3D,
  Points,
} from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_SPEC } from '../../src/data/engineSpec';
import { createEngineAssembly } from '../../src/scene/assembly';

type Category =
  | 'structural-solid'
  | 'dynamic-mechanism'
  | 'fluid-effect'
  | 'label'
  | 'auxiliary';

type ClosureExpectation = 'closed' | 'intentionally-open' | 'not-applicable';

interface SemanticRecord {
  semanticName: string;
  originalPartId: string;
  category: Category;
  closureExpectation: ClosureExpectation;
  primitiveKind: 'triangles' | 'points' | 'lines';
  sourcePath: string;
  geometryType: string;
  geometryHash: string;
  nodeHash: string;
  vertexCount: number;
  triangleCount: number;
  matrix: number[];
}

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..', '..');
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'artifacts', 'external-eval', 'geometry', 'export');
const GLB_PATH = path.join(OUTPUT_DIRECTORY, 'semantic-engine.glb');
const MANIFEST_PATH = path.join(OUTPUT_DIRECTORY, 'semantic-engine.manifest.json');
const TAU = Math.PI * 2;

class NodeFileReader {
  result: string | ArrayBuffer | null = null;

  error: Error | null = null;

  onloadend: null | (() => void) = null;

  onerror: null | (() => void) = null;

  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((value) => {
      this.result = value;
      this.onloadend?.();
    }).catch((error: Error) => {
      this.error = error;
      this.onerror?.();
    });
  }

  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((value) => {
      const base64 = Buffer.from(value).toString('base64');
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${base64}`;
      this.onloadend?.();
    }).catch((error: Error) => {
      this.error = error;
      this.onerror?.();
    });
  }
}

Object.assign(globalThis, { FileReader: NodeFileReader });

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function independentValveLift(cycleAngleDeg: number, openDeg: number, closeDeg: number): number {
  const angle = positiveModulo(cycleAngleDeg, 720);
  const duration = positiveModulo(closeDeg - openDeg, 720);
  const elapsed = positiveModulo(angle - positiveModulo(openDeg, 720), 720);
  if (duration === 0 || elapsed >= duration) return 0;
  const centered = elapsed / duration * 2 - 1;
  return (1 - centered * centered) ** 2;
}

function independentInjection(cycleAngleDeg: number): number {
  return independentValveLift(
    cycleAngleDeg,
    ENGINE_SPEC.injection.startDeg,
    ENGINE_SPEC.injection.endDeg,
  );
}

function independentCombustion(cycleAngleDeg: number): number {
  const angle = positiveModulo(cycleAngleDeg, 720);
  if (angle >= 710) return Math.sin((angle - 710) / 10 * Math.PI / 2) ** 2;
  if (angle <= 75) return Math.cos(angle / 75 * Math.PI / 2) ** 2;
  return 0;
}

function independentSnapshot(globalDegrees: number) {
  const crankAngle = globalDegrees * Math.PI / 180;
  const firingAngles = [0, 540, 180, 360] as const;
  const cylinders = firingAngles.map((firingAngleDeg, index) => {
    const cycleAngleDeg = positiveModulo(globalDegrees - firingAngleDeg, 720);
    const physicalAngle = cycleAngleDeg * Math.PI / 180;
    const crankPinY = ENGINE_SPEC.crankRadiusMm * Math.cos(physicalAngle);
    const crankPinZ = ENGINE_SPEC.crankRadiusMm * Math.sin(physicalAngle);
    const pistonY = crankPinY + Math.sqrt(
      ENGINE_SPEC.connectingRodLengthMm ** 2 - crankPinZ ** 2,
    );
    const stroke = cycleAngleDeg < 180
      ? 'power'
      : cycleAngleDeg < 360
        ? 'exhaust'
        : cycleAngleDeg < 540
          ? 'intake'
          : 'compression';
    return {
      cylinder: index + 1 as 1 | 2 | 3 | 4,
      cycleAngleDeg,
      stroke,
      pistonY,
      rodAngle: Math.atan2(-crankPinZ, pistonY - crankPinY),
      intakeLift: independentValveLift(
        cycleAngleDeg,
        ENGINE_SPEC.intakeValve.openDeg,
        ENGINE_SPEC.intakeValve.closeDeg,
      ),
      exhaustLift: independentValveLift(
        cycleAngleDeg,
        ENGINE_SPEC.exhaustValve.openDeg,
        ENGINE_SPEC.exhaustValve.closeDeg,
      ),
      injection: independentInjection(cycleAngleDeg),
      combustion: independentCombustion(cycleAngleDeg),
    };
  });
  return {
    crankAngle,
    rpm: 1800,
    load: 0.75,
    running: false,
    coolantC: 88,
    oilPressureBar: 4.2,
    cylinders,
  };
}

function stablePath(object: Object3D): string {
  const parts: string[] = [];
  let cursor: Object3D | null = object;
  while (cursor) {
    const siblingIndex = cursor.parent?.children.indexOf(cursor) ?? 0;
    parts.push(`${cursor.name || cursor.type}[${siblingIndex}]`);
    cursor = cursor.parent;
  }
  return parts.reverse().join('/');
}

function inheritedString(object: Object3D, key: string): string | undefined {
  let cursor: Object3D | null = object;
  while (cursor) {
    const value = cursor.userData[key];
    if (typeof value === 'string' && value.length > 0) return value;
    cursor = cursor.parent;
  }
  return undefined;
}

function isDescendantOf(object: Object3D, roots: Set<Object3D>): boolean {
  let cursor: Object3D | null = object;
  while (cursor) {
    if (roots.has(cursor)) return true;
    cursor = cursor.parent;
  }
  return false;
}

function sanitize(value: string): string {
  const normalized = value.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '-');
  return normalized.replace(/^-+|-+$/g, '').toLowerCase() || 'unnamed';
}

function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function geometryHash(geometry: BufferGeometry): string {
  const hash = createHash('sha256');
  const position = geometry.getAttribute('position');
  hash.update(Buffer.from(position.array.buffer, position.array.byteOffset, position.array.byteLength));
  if (geometry.index) {
    hash.update(Buffer.from(
      geometry.index.array.buffer,
      geometry.index.array.byteOffset,
      geometry.index.array.byteLength,
    ));
  }
  return hash.digest('hex');
}

function triangleCount(geometry: BufferGeometry): number {
  if (geometry.index) return Math.floor(geometry.index.count / 3);
  return Math.floor(geometry.getAttribute('position').count / 3);
}

function categoryFor(
  source: Object3D,
  dynamicRoots: Set<Object3D>,
  partId: string,
): Category {
  const role = inheritedString(source, 'visualRole');
  if (role === 'fluid' || stablePath(source).includes('animated-flow-effects')) return 'fluid-effect';
  if (isDescendantOf(source, dynamicRoots)) return 'dynamic-mechanism';
  if (
    source.name.includes('timing chain')
    || source.name.includes('accessory belt')
    || (partId === 'cooling-system' && role === 'detail')
  ) return 'dynamic-mechanism';
  if (role === 'shell' || role === 'detail' || role === 'hot' || partId !== 'unassigned') {
    return 'structural-solid';
  }
  return 'auxiliary';
}

function closureFor(
  category: Category,
  geometry: BufferGeometry,
  source: Object3D,
): ClosureExpectation {
  if (category === 'fluid-effect' || category === 'label' || category === 'auxiliary') {
    return 'not-applicable';
  }
  if (inheritedString(source, 'partId')?.startsWith('valve-spring')) return 'intentionally-open';
  if (geometry.type === 'TubeGeometry') {
    const parameters = geometry.parameters as { closed?: boolean } | undefined;
    return parameters?.closed ? 'closed' : 'intentionally-open';
  }
  if (geometry.type === 'CylinderGeometry' || geometry.type === 'ConeGeometry') {
    const parameters = geometry.parameters as { openEnded?: boolean } | undefined;
    return parameters?.openEnded ? 'intentionally-open' : 'closed';
  }
  if (geometry.type === 'PlaneGeometry') return 'intentionally-open';
  return 'closed';
}

function cloneMaterial(material: Material | Material[]): Material | Material[] {
  return Array.isArray(material) ? material.map((item) => item.clone()) : material.clone();
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });

const assembly = createEngineAssembly();
assembly.update(independentSnapshot(0), 0);
assembly.root.updateMatrixWorld(true);

const dynamicRoots = new Set<Object3D>([
  assembly.bindings.crankshaft,
  assembly.bindings.flywheel,
  assembly.bindings.camshaft,
  assembly.bindings.turboRotor,
]);
for (const cylinder of assembly.bindings.cylinders) {
  dynamicRoots.add(cylinder.piston);
  dynamicRoots.add(cylinder.pistonPin);
  dynamicRoots.add(cylinder.connectingRod);
  dynamicRoots.add(cylinder.intakeValve);
  dynamicRoots.add(cylinder.exhaustValve);
}

const exportRoot = new Group();
exportRoot.name = 'semantic-inline-four-diesel';
exportRoot.userData = {
  protocolVersion: '1.0',
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  poseGlobalCrankDegrees: 0,
};

const records: SemanticRecord[] = [];
const counters = new Map<string, number>();

function addRenderable(
  source: Mesh | Points | Line,
  matrix: Matrix4,
  instanceSuffix = '',
): void {
  const partId = inheritedString(source, 'partId') ?? 'unassigned';
  const category = categoryFor(source, dynamicRoots, partId);
  const primitiveKind = source instanceof Mesh ? 'triangles' : source instanceof Points ? 'points' : 'lines';
  const closureExpectation = primitiveKind === 'triangles'
    ? closureFor(category, source.geometry, source)
    : 'not-applicable';
  const counterKey = `${category}:${partId}`;
  const index = (counters.get(counterKey) ?? 0) + 1;
  counters.set(counterKey, index);
  const semanticName = `${category}__${sanitize(partId)}__${String(index).padStart(3, '0')}${instanceSuffix}`;
  const geometryDigest = geometryHash(source.geometry);
  const matrixValues = matrix.toArray().map((value) => Number(value.toFixed(12)));
  const extras = {
    semanticName,
    originalPartId: partId,
    category,
    closureExpectation,
    primitiveKind,
    sourcePath: stablePath(source),
    geometryHash: geometryDigest,
  };
  const nodeDigest = sha256(JSON.stringify({ ...extras, matrix: matrixValues }));
  const cloned = source instanceof Mesh
    ? new Mesh(source.geometry, cloneMaterial(source.material))
    : source instanceof Points
      ? new Points(source.geometry, cloneMaterial(source.material) as Material)
      : new Line(source.geometry, cloneMaterial(source.material) as Material);
  cloned.name = semanticName;
  cloned.userData = { ...extras, nodeHash: nodeDigest };
  cloned.matrixAutoUpdate = false;
  cloned.matrix.copy(matrix);
  cloned.visible = true;
  exportRoot.add(cloned);
  records.push({
    ...extras,
    nodeHash: nodeDigest,
    geometryType: source.geometry.type,
    vertexCount: source.geometry.getAttribute('position').count,
    triangleCount: primitiveKind === 'triangles' ? triangleCount(source.geometry) : 0,
    matrix: matrixValues,
  });
}

assembly.root.traverse((object) => {
  if (object instanceof InstancedMesh) {
    const instanceMatrix = new Matrix4();
    for (let instanceIndex = 0; instanceIndex < object.count; instanceIndex += 1) {
      object.getMatrixAt(instanceIndex, instanceMatrix);
      addRenderable(
        object,
        object.matrixWorld.clone().multiply(instanceMatrix),
        `__instance-${String(instanceIndex + 1).padStart(3, '0')}`,
      );
    }
    return;
  }
  if (object instanceof Mesh || object instanceof Points || object instanceof Line) {
    addRenderable(object, object.matrixWorld.clone());
  }
});

const exporter = new GLTFExporter();
const binary = await exporter.parseAsync(exportRoot, {
  binary: true,
  onlyVisible: false,
  trs: false,
  truncateDrawRange: true,
});
if (!(binary instanceof ArrayBuffer)) throw new Error('GLTFExporter did not return binary GLB data.');
const glbBytes = new Uint8Array(binary);
await writeFile(GLB_PATH, glbBytes);

const triangleRecords = records.filter((record) => record.primitiveKind === 'triangles');
const classifiedTriangleRecords = triangleRecords.filter((record) => Boolean(record.category));
const categoryCounts = Object.fromEntries(
  (['structural-solid', 'dynamic-mechanism', 'fluid-effect', 'label', 'auxiliary'] as Category[])
    .map((category) => [category, records.filter((record) => record.category === category).length]),
);
const closureCounts = Object.fromEntries(
  (['closed', 'intentionally-open', 'not-applicable'] as ClosureExpectation[])
    .map((closure) => [closure, records.filter((record) => record.closureExpectation === closure).length]),
);
const pickableRoots = Array.from(new Set(
  assembly.pickables.map((object) => String(object.userData.partId ?? 'unassigned')),
)).sort();
const uniqueNames = new Set(records.map((record) => record.semanticName));
const glbSha256 = sha256(glbBytes);
const sourceDiff = execFileSync('git', ['diff', '--exit-code', 'v3-model-final', '--', 'src'], {
  cwd: PROJECT_ROOT,
  encoding: 'utf8',
});
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  protocolVersion: '1.0',
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  targetTag: 'v3-model-final',
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
  sourceDiffAgainstTargetEmpty: sourceDiff.length === 0,
  exportPoseGlobalCrankDegrees: 0,
  glb: {
    file: path.relative(PROJECT_ROOT, GLB_PATH).replaceAll('\\', '/'),
    bytes: glbBytes.byteLength,
    sha256: glbSha256,
  },
  exporter: {
    node: process.version,
    three: JSON.parse(await readFile(path.join(PROJECT_ROOT, 'node_modules', 'three', 'package.json'), 'utf8')).version,
    name: 'Three.js GLTFExporter with explicit InstancedMesh expansion',
  },
  coverage: {
    totalRenderables: records.length,
    triangleRenderables: triangleRecords.length,
    classifiedTriangleRenderables: classifiedTriangleRecords.length,
    classifiedTrianglePercent: triangleRecords.length === 0
      ? 100
      : classifiedTriangleRecords.length / triangleRecords.length * 100,
    uniqueSemanticNames: uniqueNames.size,
    semanticNamesUnique: uniqueNames.size === records.length,
    pickableRootPartIds: pickableRoots,
    pickableRootPartIdCount: pickableRoots.length,
    categoryCounts,
    closureCounts,
  },
  records,
};
await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  glb: manifest.glb,
  coverage: manifest.coverage,
  manifest: path.relative(PROJECT_ROOT, MANIFEST_PATH).replaceAll('\\', '/'),
}, null, 2));

assembly.dispose();
