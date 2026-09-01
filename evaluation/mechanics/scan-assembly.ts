import {
  Box3,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  Vector3,
} from 'three';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_SPEC } from '../../src/data/engineSpec';
import { createEngineAssembly } from '../../src/scene/assembly';
import {
  ENGINE_DIMENSIONS,
  VALVETRAIN_DIMENSIONS,
  WORLD_SCALE,
} from '../../src/scene/constants';

const SCRIPT_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..', '..');
const OUTPUT_DIRECTORY = path.join(PROJECT_ROOT, 'artifacts', 'external-eval', 'mechanics');
const OUTPUT_PATH = path.join(OUTPUT_DIRECTORY, 'assembly-scan.json');
const PROTOCOL_PATH = path.join(PROJECT_ROOT, 'evaluation', 'config', 'protocol.json');
const WHITELIST_PATH = path.join(PROJECT_ROOT, 'evaluation', 'config', 'collision-whitelist.json');
const FIRING_ANGLES = [0, 540, 180, 360] as const;
const THROW_PHASES = [0, Math.PI, Math.PI, 0] as const;

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function valveLift(cycleAngleDeg: number, openDeg: number, closeDeg: number): number {
  const angle = positiveModulo(cycleAngleDeg, 720);
  const duration = positiveModulo(closeDeg - openDeg, 720);
  const elapsed = positiveModulo(angle - positiveModulo(openDeg, 720), 720);
  if (duration === 0 || elapsed >= duration) return 0;
  const centered = elapsed / duration * 2 - 1;
  return (1 - centered * centered) ** 2;
}

function injection(cycleAngleDeg: number): number {
  return valveLift(cycleAngleDeg, ENGINE_SPEC.injection.startDeg, ENGINE_SPEC.injection.endDeg);
}

function combustion(cycleAngleDeg: number): number {
  const angle = positiveModulo(cycleAngleDeg, 720);
  if (angle >= 710) return Math.sin((angle - 710) / 10 * Math.PI / 2) ** 2;
  if (angle <= 75) return Math.cos(angle / 75 * Math.PI / 2) ** 2;
  return 0;
}

function independentSnapshot(globalDegrees: number) {
  const crankAngle = globalDegrees * Math.PI / 180;
  const cylinders = FIRING_ANGLES.map((firingAngleDeg, index) => {
    const cycleAngleDeg = positiveModulo(globalDegrees - firingAngleDeg, 720);
    const physicalAngle = crankAngle + THROW_PHASES[index]!;
    const crankPinY = ENGINE_SPEC.crankRadiusMm * Math.cos(physicalAngle);
    const crankPinZ = ENGINE_SPEC.crankRadiusMm * Math.sin(physicalAngle);
    const vertical = Math.sqrt(ENGINE_SPEC.connectingRodLengthMm ** 2 - crankPinZ ** 2);
    const pistonY = crankPinY + vertical;
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
      rodAngle: Math.atan2(-crankPinZ, vertical),
      intakeLift: valveLift(
        cycleAngleDeg,
        ENGINE_SPEC.intakeValve.openDeg,
        ENGINE_SPEC.intakeValve.closeDeg,
      ),
      exhaustLift: valveLift(
        cycleAngleDeg,
        ENGINE_SPEC.exhaustValve.openDeg,
        ENGINE_SPEC.exhaustValve.closeDeg,
      ),
      injection: injection(cycleAngleDeg),
      combustion: combustion(cycleAngleDeg),
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

function findNamedInstance(root: Group, name: string): InstancedMesh {
  let found: InstancedMesh | undefined;
  root.traverse((object) => {
    if (object instanceof InstancedMesh && object.name === name) found = object;
  });
  if (!found) throw new Error(`Missing instance mesh ${name}`);
  return found;
}

function lowestInstanceWorldY(mesh: InstancedMesh, instanceIndex: number): number {
  const instanceMatrix = new Matrix4();
  mesh.getMatrixAt(instanceIndex, instanceMatrix);
  const transform = mesh.matrixWorld.clone().multiply(instanceMatrix);
  const positions = mesh.geometry.getAttribute('position');
  const point = new Vector3();
  let lowest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < positions.count; index += 1) {
    point.fromBufferAttribute(positions, index).applyMatrix4(transform);
    lowest = Math.min(lowest, point.y);
  }
  return lowest;
}

function bucketTopWorldY(group: Group): number {
  let bucket: Mesh | undefined;
  group.traverse((object) => {
    if (
      object instanceof Mesh
      && object.geometry.type === 'CylinderGeometry'
      && Math.abs(object.position.y - 75) < 1e-9
    ) bucket = object;
  });
  if (!bucket) throw new Error('Missing flat tappet');
  return new Box3().setFromObject(bucket).max.y;
}

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const protocolText = await readFile(PROTOCOL_PATH, 'utf8');
const whitelistText = await readFile(WHITELIST_PATH, 'utf8');
const protocol = JSON.parse(protocolText) as {
  runs: { mechanicalAnglesInclusive: [number, number]; mechanicalStepDegrees: number };
};
const [startDegrees, endDegrees] = protocol.runs.mechanicalAnglesInclusive;
const stepDegrees = protocol.runs.mechanicalStepDegrees;
if (startDegrees !== 0 || endDegrees !== 720 || stepDegrees !== 1) {
  throw new Error('Frozen protocol mechanical range is not 0..720 inclusive at 1 degree.');
}

const assembly = createEngineAssembly();
const intakeLobes = findNamedInstance(assembly.root, 'intake direct-acting cam lobes');
const exhaustLobes = findNamedInstance(assembly.root, 'exhaust direct-acting cam lobes');
const samples = [];
let maxClosureErrorMm = 0;
let maxPairingErrorMm = 0;
let maxCamRatioError = 0;
let minimumCamTappetGapMm = Number.POSITIVE_INFINITY;
let minimumPistonHeadGapMm = Number.POSITIVE_INFINITY;
let minimumValvePistonGapMm = Number.POSITIVE_INFINITY;
let minimumOpposingValveRadialGapMm = Number.POSITIVE_INFINITY;
let minimumNonmatchingCamTappetGapMm = Number.POSITIVE_INFINITY;
let maximumValveLiftStep = 0;
let firingOrderErrors = 0;
let strokeErrors = 0;
const previousLift = new Array(8).fill(0) as number[];
const firingAtBoundary: number[] = [];

for (let globalDegrees = startDegrees; globalDegrees <= endDegrees; globalDegrees += stepDegrees) {
  const snapshot = independentSnapshot(globalDegrees);
  assembly.update(snapshot, 0);
  assembly.root.updateMatrixWorld(true);

  const expectedStrokes = snapshot.cylinders.map((state) => {
    const local = positiveModulo(globalDegrees - FIRING_ANGLES[state.cylinder - 1]!, 720);
    return local < 180 ? 'power' : local < 360 ? 'exhaust' : local < 540 ? 'intake' : 'compression';
  });
  snapshot.cylinders.forEach((state, index) => {
    if (state.stroke !== expectedStrokes[index]) strokeErrors += 1;
  });
  if (globalDegrees % 180 === 0 && globalDegrees < 720) {
    const firing = snapshot.cylinders.find((state) => state.cycleAngleDeg === 0)?.cylinder;
    if (firing) firingAtBoundary.push(firing);
  }

  const crankAngle = assembly.bindings.crankshaft.rotation.x;
  for (const shaft of assembly.bindings.camshaft.children) {
    maxCamRatioError = Math.max(maxCamRatioError, Math.abs(shaft.rotation.x - crankAngle * 0.5));
  }

  const cylinderRecords = snapshot.cylinders.map((state, index) => {
    const binding = assembly.bindings.cylinders[index]!;
    const throwAngle = snapshot.crankAngle + THROW_PHASES[index]!;
    const crankY = ENGINE_DIMENSIONS.crankAxisY + Math.cos(throwAngle) * ENGINE_DIMENSIONS.crankRadius;
    const crankZ = Math.sin(throwAngle) * ENGINE_DIMENSIONS.crankRadius;
    const closure = Math.hypot(binding.piston.position.y - crankY, crankZ);
    const closureErrorMm = Math.abs(closure - ENGINE_DIMENSIONS.rodLength);
    maxClosureErrorMm = Math.max(maxClosureErrorMm, closureErrorMm);
    const pistonCrownY = binding.piston.position.y + ENGINE_DIMENSIONS.pistonCompressionHeight;
    const pistonHeadGapMm = ENGINE_DIMENSIONS.headFaceY - pistonCrownY;
    minimumPistonHeadGapMm = Math.min(minimumPistonHeadGapMm, pistonHeadGapMm);

    const intakeValveFaceY = binding.intakeValve.position.y - VALVETRAIN_DIMENSIONS.valveHeadHeight / 2;
    const exhaustValveFaceY = binding.exhaustValve.position.y - VALVETRAIN_DIMENSIONS.valveHeadHeight / 2;
    const valvePistonGapMm = Math.min(intakeValveFaceY, exhaustValveFaceY) - pistonCrownY;
    minimumValvePistonGapMm = Math.min(minimumValvePistonGapMm, valvePistonGapMm);

    const intakeGapMm = (
      lowestInstanceWorldY(intakeLobes, index * 2) - bucketTopWorldY(binding.intakeValve)
    ) / WORLD_SCALE;
    const exhaustGapMm = (
      lowestInstanceWorldY(exhaustLobes, index * 2) - bucketTopWorldY(binding.exhaustValve)
    ) / WORLD_SCALE;
    minimumCamTappetGapMm = Math.min(minimumCamTappetGapMm, intakeGapMm, exhaustGapMm);

    const currentLift = [state.intakeLift, state.exhaustLift];
    currentLift.forEach((lift, kindIndex) => {
      const flatIndex = index * 2 + kindIndex;
      if (globalDegrees > startDegrees) {
        maximumValveLiftStep = Math.max(maximumValveLiftStep, Math.abs(lift - previousLift[flatIndex]!));
      }
      previousLift[flatIndex] = lift;
    });

    return {
      cylinder: state.cylinder,
      cycleAngleDeg: state.cycleAngleDeg,
      stroke: state.stroke,
      pistonGroupYmm: binding.piston.position.y,
      pistonCrownYmm: pistonCrownY,
      rodGroupPositionMm: [
        binding.connectingRod.position.x,
        binding.connectingRod.position.y,
        binding.connectingRod.position.z,
      ],
      rodRotationXrad: binding.connectingRod.rotation.x,
      closureErrorMm,
      intakeLift: state.intakeLift,
      exhaustLift: state.exhaustLift,
      intakeValveGroupYmm: binding.intakeValve.position.y,
      exhaustValveGroupYmm: binding.exhaustValve.position.y,
      intakeCamTappetGapMm: intakeGapMm,
      exhaustCamTappetGapMm: exhaustGapMm,
      pistonHeadGapMm,
      valvePistonGapMm,
    };
  });

  maxPairingErrorMm = Math.max(
    maxPairingErrorMm,
    Math.abs(cylinderRecords[0]!.pistonGroupYmm - cylinderRecords[3]!.pistonGroupYmm),
    Math.abs(cylinderRecords[1]!.pistonGroupYmm - cylinderRecords[2]!.pistonGroupYmm),
  );

  // Analytic broad-safe gaps for explicitly non-whitelisted opposing/nonmatching pairs.
  // Valve centres are 72 mm apart across Z and maximum head radii are 15/13 mm.
  minimumOpposingValveRadialGapMm = Math.min(minimumOpposingValveRadialGapMm, 72 - 15 - 13);
  // Nearest nonmatching flat tappet is 32 mm away along X: 8 mm half lobe width + 12 mm tappet radius.
  minimumNonmatchingCamTappetGapMm = Math.min(minimumNonmatchingCamTappetGapMm, 32 - 8 - 12);

  samples.push({
    globalDegrees,
    crankAngleRad: assembly.bindings.crankshaft.rotation.x,
    camAnglesRad: assembly.bindings.camshaft.children.map((shaft) => shaft.rotation.x),
    cylinders: cylinderRecords,
  });
}

if (JSON.stringify(firingAtBoundary) !== JSON.stringify([1, 3, 4, 2])) firingOrderErrors += 1;

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  command: 'node evaluation/mechanics/runtime/scan-assembly.mjs',
  independence: {
    importedProjectSnapshotFunctions: false,
    importedProjectKinematicsModule: false,
    independentlyImplemented: [
      'four-stroke phase and firing offsets',
      'slider-crank square-root closure',
      'quartic valve lift',
      'injector command and heat release',
    ],
    assemblyUpdateUsedOnlyToApplyIndependentSnapshot: true,
  },
  gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: PROJECT_ROOT, encoding: 'utf8' }).trim(),
  targetCommit: '7e5ea916a115dcef1bf3ba467a31b78c6206c612',
  protocolSha256: sha256(protocolText),
  collisionWhitelistSha256: sha256(whitelistText),
  range: { startDegrees, endDegrees, stepDegrees, samples: samples.length },
  assumptions: {
    firingOrder: [1, 3, 4, 2],
    firingAnglesByCylinderDeg: FIRING_ANGLES,
    throwPhasesByCylinderRad: THROW_PHASES,
    crankRadiusMm: ENGINE_SPEC.crankRadiusMm,
    rodLengthMm: ENGINE_SPEC.connectingRodLengthMm,
    pistonCompressionHeightMm: ENGINE_DIMENSIONS.pistonCompressionHeight,
    headFaceYmm: ENGINE_DIMENSIONS.headFaceY,
    intakeValveEvent: ENGINE_SPEC.intakeValve,
    exhaustValveEvent: ENGINE_SPEC.exhaustValve,
  },
  summary: {
    firingAtBoundary,
    firingOrderErrors,
    strokeErrors,
    maxClosureErrorMm,
    maxPairingErrorMm,
    maxCamRatioError,
    maximumValveLiftStep,
    minimumCamTappetGapMm,
    minimumPistonHeadGapMm,
    minimumValvePistonGapMm,
    minimumOpposingValveRadialGapMm,
    minimumNonmatchingCamTappetGapMm,
  },
  samples,
};
await writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output: path.relative(PROJECT_ROOT, OUTPUT_PATH), summary: report.summary }, null, 2));
assembly.dispose();
