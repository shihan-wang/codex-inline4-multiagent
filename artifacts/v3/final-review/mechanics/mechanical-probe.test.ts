import { Box3, Group, InstancedMesh, Matrix4, Mesh, Points, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ENGINE_SPEC } from '../../../../src/data/engineSpec';
import {
  CYLINDER_PHASES,
  calculateCombustion,
  calculateInjection,
  getCylinderStates,
  sliderCrank,
} from '../../../../src/engine/kinematics';
import { createEngineAssembly } from '../../../../src/scene/assembly';
import {
  ENGINE_DIMENSIONS,
  VALVETRAIN_DIMENSIONS,
  WORLD_SCALE,
} from '../../../../src/scene/constants';
import type { SceneSimulationSnapshot } from '../../../../src/scene/types';

const radians = (degrees: number) => degrees * Math.PI / 180;

function snapshot(globalDegrees: number, load = 0.75, rpm = 1800): SceneSimulationSnapshot {
  const crankAngle = radians(globalDegrees);
  return {
    crankAngle,
    rpm,
    load,
    running: false,
    coolantC: 88,
    oilPressureBar: 4.2,
    cylinders: getCylinderStates(crankAngle),
  };
}

function findNamedInstance(root: Group, name: string): InstancedMesh {
  let found: InstancedMesh | undefined;
  root.traverse((object) => {
    if (object instanceof InstancedMesh && object.name === name) found = object;
  });
  if (!found) throw new Error(`Missing instanced mesh: ${name}`);
  return found;
}

function instanceLowestWorldY(mesh: InstancedMesh, instanceIndex: number): number {
  const instanceMatrix = new Matrix4();
  mesh.getMatrixAt(instanceIndex, instanceMatrix);
  const transform = mesh.matrixWorld.clone().multiply(instanceMatrix);
  const positions = mesh.geometry.getAttribute('position');
  const point = new Vector3();
  let lowest = Number.POSITIVE_INFINITY;
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    point.fromBufferAttribute(positions, vertex).applyMatrix4(transform);
    lowest = Math.min(lowest, point.y);
  }
  return lowest;
}

function bucketTopWorldY(valveGroup: Group): number {
  let bucket: Mesh | undefined;
  valveGroup.traverse((object) => {
    if (
      object instanceof Mesh
      && object.geometry.type === 'CylinderGeometry'
      && Math.abs(object.position.y - 75) < 1e-9
    ) bucket = object;
  });
  if (!bucket) throw new Error('Missing flat bucket follower');
  return new Box3().setFromObject(bucket).max.y;
}

describe('V3 independent final mechanical probe', () => {
  it('checks the current assembly over a full 720-degree cycle', () => {
    const evidence: Record<string, unknown> = {};

    const boundaryDegrees = [0, 180, 360, 540];
    const boundaryStates = boundaryDegrees.map((degrees) => ({
      degrees,
      states: getCylinderStates(radians(degrees)).map((state) => ({
        cylinder: state.cylinder,
        cycleAngleDeg: state.cycleAngleDeg,
        stroke: state.stroke,
      })),
    }));
    const firingSequence = boundaryStates.map(({ states }) =>
      states.find((state) => Math.abs(state.cycleAngleDeg) < 1e-9)?.cylinder);
    expect(ENGINE_SPEC.firingOrder).toEqual([1, 3, 4, 2]);
    expect(firingSequence).toEqual([1, 3, 4, 2]);
    expect(boundaryStates.map(({ states }) => states.map(({ stroke }) => stroke))).toEqual([
      ['power', 'exhaust', 'compression', 'intake'],
      ['exhaust', 'intake', 'power', 'compression'],
      ['intake', 'compression', 'exhaust', 'power'],
      ['compression', 'power', 'intake', 'exhaust'],
    ]);
    evidence.boundaries = boundaryStates;

    let maxClosureErrorMm = 0;
    let maxPairErrorMm = 0;
    for (let degrees = 0; degrees <= 720; degrees += 1) {
      const crankAngle = radians(degrees);
      const states = getCylinderStates(crankAngle);
      maxPairErrorMm = Math.max(
        maxPairErrorMm,
        Math.abs(states[0]!.pistonY - states[3]!.pistonY),
        Math.abs(states[1]!.pistonY - states[2]!.pistonY),
      );
      CYLINDER_PHASES.forEach((phase, index) => {
        const physicalAngle = crankAngle + radians(phase.throwPhaseDeg);
        const pose = sliderCrank(physicalAngle);
        const closure = Math.hypot(
          states[index]!.pistonY - pose.crankPinY,
          pose.crankPinZ,
        );
        maxClosureErrorMm = Math.max(
          maxClosureErrorMm,
          Math.abs(closure - ENGINE_SPEC.connectingRodLengthMm),
        );
      });
    }
    expect(maxClosureErrorMm).toBeLessThan(1e-10);
    expect(maxPairErrorMm).toBeLessThan(1e-10);
    const tdcClearanceMm = ENGINE_DIMENSIONS.headFaceY - (
      ENGINE_DIMENSIONS.rodLength
      + ENGINE_DIMENSIONS.crankRadius
      + ENGINE_DIMENSIONS.pistonCompressionHeight
    );
    expect(tdcClearanceMm).toBeCloseTo(5.5, 12);
    evidence.cranktrain = { maxClosureErrorMm, maxPairErrorMm, tdcClearanceMm };

    const assembly = createEngineAssembly();
    const intakeLobes = findNamedInstance(assembly.root, 'intake direct-acting cam lobes');
    const exhaustLobes = findNamedInstance(assembly.root, 'exhaust direct-acting cam lobes');
    let minimumCamGapMm = Number.POSITIVE_INFINITY;
    let maximumCamGapMm = Number.NEGATIVE_INFINITY;
    let maximumSpringFixedDriftMm = 0;
    let maximumSpringMovingMismatchMm = 0;
    const springFixedReference: number[] = [];

    for (let degrees = 0; degrees <= 720; degrees += 2.5) {
      const state = snapshot(degrees);
      assembly.update(state, 0);
      assembly.root.updateMatrixWorld(true);
      expect(assembly.bindings.crankshaft.rotation.x).toBeCloseTo(radians(degrees), 12);
      assembly.bindings.camshaft.children.forEach((shaft) => {
        expect(shaft.rotation.x).toBeCloseTo(radians(degrees) / 2, 12);
      });

      for (const [kind, lobes] of [
        ['intake', intakeLobes],
        ['exhaust', exhaustLobes],
      ] as const) {
        assembly.bindings.cylinders.forEach((binding, cylinderIndex) => {
          const valveGroup = kind === 'intake' ? binding.intakeValve : binding.exhaustValve;
          const gapMm = (
            instanceLowestWorldY(lobes, cylinderIndex * 2) - bucketTopWorldY(valveGroup)
          ) / WORLD_SCALE;
          minimumCamGapMm = Math.min(minimumCamGapMm, gapMm);
          maximumCamGapMm = Math.max(maximumCamGapMm, gapMm);

          const springs = kind === 'intake' ? binding.intakeSprings : binding.exhaustSprings;
          springs.forEach((spring, springIndex) => {
            const fixedCenterMm = valveGroup.position.y + spring.position.y;
            const referenceIndex = (kind === 'intake' ? 0 : 8) + cylinderIndex * 2 + springIndex;
            springFixedReference[referenceIndex] ??= fixedCenterMm;
            maximumSpringFixedDriftMm = Math.max(
              maximumSpringFixedDriftMm,
              Math.abs(fixedCenterMm - springFixedReference[referenceIndex]!),
            );
            const movingCenterMm = fixedCenterMm
              + VALVETRAIN_DIMENSIONS.springFreeHeight * spring.scale.y;
            const bucketTopMm = valveGroup.position.y + VALVETRAIN_DIMENSIONS.bucketTopLocalY;
            maximumSpringMovingMismatchMm = Math.max(
              maximumSpringMovingMismatchMm,
              Math.abs(movingCenterMm - bucketTopMm),
            );
          });
        });
      }
    }
    expect(minimumCamGapMm).toBeGreaterThanOrEqual(0.47);
    expect(maximumCamGapMm).toBeLessThanOrEqual(0.71);
    expect(maximumSpringFixedDriftMm).toBeLessThan(1e-10);
    expect(maximumSpringMovingMismatchMm).toBeLessThan(1e-10);
    const closedValveFaceYmm = VALVETRAIN_DIMENSIONS.closedValveGroupY
      - VALVETRAIN_DIMENSIONS.valveHeadHeight / 2;
    expect(closedValveFaceYmm).toBeCloseTo(ENGINE_DIMENSIONS.headFaceY, 12);
    evidence.valvetrain = {
      camshaftToCrankRatio: 0.5,
      declaredColdClearanceMm: VALVETRAIN_DIMENSIONS.coldClearance,
      actualCamGapRangeMm: [minimumCamGapMm, maximumCamGapMm],
      maximumSpringFixedDriftMm,
      maximumSpringMovingMismatchMm,
      closedValveFaceYmm,
      headFaceYmm: ENGINE_DIMENSIONS.headFaceY,
    };

    const sprocketCounts: number[] = [];
    let timingChainPresent = false;
    let accessoryBeltPresent = false;
    let waterPumpPulley: Group | undefined;
    assembly.root.traverse((object) => {
      if (object instanceof InstancedMesh && [18, 36].includes(object.count)) {
        sprocketCounts.push(object.count);
      }
      if (object.name === '2-to-1 timing chain') timingChainPresent = true;
      if (object.name === 'crank-to-water-pump accessory belt') accessoryBeltPresent = true;
      if (
        object instanceof Group
        && object.userData.partId === 'cooling-system'
        && Math.abs(object.position.x + 343) < 1e-9
        && Math.abs(object.position.y - 160) < 1e-9
      ) waterPumpPulley = object;
    });
    expect(sprocketCounts.filter((count) => count === 18).length).toBeGreaterThanOrEqual(1);
    expect(sprocketCounts.filter((count) => count === 36).length).toBeGreaterThanOrEqual(2);
    expect(timingChainPresent).toBe(true);
    expect(accessoryBeltPresent).toBe(true);
    expect(waterPumpPulley).toBeDefined();
    assembly.update(snapshot(720), 0);
    const accessoryRatio = waterPumpPulley!.rotation.x / assembly.bindings.crankshaft.rotation.x;
    expect(accessoryRatio).toBeCloseTo(52 / 42, 12);
    evidence.drives = {
      visibleTimingSprocketTeeth: sprocketCounts.filter((count) => [18, 36].includes(count)).sort((a, b) => a - b),
      timingChainPresent,
      accessoryBeltPresent,
      commandedWaterPumpToCrankRatio: accessoryRatio,
    };

    const injectionSnapshot = snapshot(5, 0);
    assembly.update(injectionSnapshot, 0);
    const plume = assembly.bindings.cylinders[0]!.injectorPlume;
    const idleFuel = {
      visible: plume.visible,
      scaleX: plume.scale.x,
      opacity: Number((plume.material as { opacity?: number }).opacity),
    };
    assembly.update(snapshot(5, 1), 0);
    const fullLoadFuel = {
      visible: plume.visible,
      scaleX: plume.scale.x,
      opacity: Number((plume.material as { opacity?: number }).opacity),
    };
    expect(idleFuel.visible).toBe(true);
    expect(fullLoadFuel.visible).toBe(true);
    expect(fullLoadFuel.scaleX).toBeGreaterThan(idleFuel.scaleX);
    expect(fullLoadFuel.opacity).toBeGreaterThan(idleFuel.opacity);
    expect(calculateInjection(45)).toBe(0);
    expect(calculateCombustion(45)).toBeGreaterThan(0);
    evidence.fuel = { angleDeg: 5, idleFuel, fullLoadFuel, injectionAndHeatSeparatedAt45Deg: true };

    const flowRoots: Array<{ id: string; closed: boolean }> = [];
    let exhaustInstances: InstancedMesh | undefined;
    assembly.root.traverse((object) => {
      if (typeof object.userData.closed === 'boolean') {
        flowRoots.push({ id: String(object.userData.partId), closed: object.userData.closed });
      }
      if (object instanceof InstancedMesh && object.userData.partId === 'exhaust-flow') {
        exhaustInstances = object;
      }
    });
    expect(flowRoots.filter(({ id, closed }) => id === 'intake-manifold' && !closed)).toHaveLength(5);
    expect(flowRoots.filter(({ id, closed }) => id === 'oil-system' && !closed)).toHaveLength(4);
    expect(flowRoots.filter(({ id, closed }) => id === 'cooling-system' && !closed)).toHaveLength(4);

    assembly.update(snapshot(450, 0.75), 0);
    const intakeGateEvidence: Array<{
      firstParticleX: number;
      pointOpacity: number;
      tubeOpacity: number;
    }> = [];
    assembly.root.traverse((object) => {
      if (object.userData.partId !== 'intake-manifold' || object.userData.closed !== false) return;
      let firstParticleX = Number.NaN;
      let pointOpacity = Number.NaN;
      let tubeOpacity = Number.NaN;
      object.children.forEach((child) => {
        if (child instanceof Points) {
          firstParticleX = child.geometry.getAttribute('position').getX(0);
          pointOpacity = Number((child.material as { opacity?: number }).opacity);
        }
        if (child instanceof Mesh) tubeOpacity = Number((child.material as { opacity?: number }).opacity);
      });
      intakeGateEvidence.push({ firstParticleX, pointOpacity, tubeOpacity });
    });
    const intakeByStartX = new Map(
      intakeGateEvidence.map((item) => [Math.round(item.firstParticleX), item]),
    );
    expect(intakeByStartX.get(-150)!.pointOpacity).toBeGreaterThan(0.05);
    [-50, 50, 150].forEach((x) => {
      expect(intakeByStartX.get(x)!.pointOpacity).toBeCloseTo(0.05, 9);
    });

    assembly.update(snapshot(270, 0.75), 1 / 60);
    assembly.root.updateMatrixWorld(true);
    expect(exhaustInstances).toBeDefined();
    const exhaustScales: number[][] = [];
    const matrix = new Matrix4();
    const position = new Vector3();
    const quaternion = exhaustInstances!.quaternion.clone();
    const scale = new Vector3();
    for (let cylinder = 0; cylinder < 4; cylinder += 1) {
      const cylinderScales: number[] = [];
      for (let pulse = 0; pulse < 2; pulse += 1) {
        exhaustInstances!.getMatrixAt(cylinder * 2 + pulse, matrix);
        matrix.decompose(position, quaternion, scale);
        cylinderScales.push(scale.x);
      }
      exhaustScales.push(cylinderScales);
    }
    expect(exhaustScales[0]!.every((value) => value > 1)).toBe(true);
    expect(exhaustScales.slice(1).flat().every((value) => value < 0.01)).toBe(true);
    evidence.flows = {
      flowRoots,
      intakeProbeGlobalDeg: 450,
      intakeGateEvidence,
      exhaustProbeGlobalDeg: 270,
      exhaustScalesByCylinder: exhaustScales,
    };

    const turboAssembly = createEngineAssembly();
    const exhaustStateLow = snapshot(270, 0);
    const exhaustStateHigh = snapshot(270, 1);
    let previousAngle = turboAssembly.bindings.turboRotor.rotation.x;
    let lowSettledSpeed = 0;
    for (let frame = 0; frame < 360; frame += 1) {
      turboAssembly.update(exhaustStateLow, 1 / 60);
      lowSettledSpeed = (turboAssembly.bindings.turboRotor.rotation.x - previousAngle) * 60;
      previousAngle = turboAssembly.bindings.turboRotor.rotation.x;
    }
    turboAssembly.update(exhaustStateHigh, 1 / 60);
    const highFirstFrameSpeed = (turboAssembly.bindings.turboRotor.rotation.x - previousAngle) * 60;
    previousAngle = turboAssembly.bindings.turboRotor.rotation.x;
    let highSettledSpeed = highFirstFrameSpeed;
    for (let frame = 0; frame < 360; frame += 1) {
      turboAssembly.update(exhaustStateHigh, 1 / 60);
      highSettledSpeed = (turboAssembly.bindings.turboRotor.rotation.x - previousAngle) * 60;
      previousAngle = turboAssembly.bindings.turboRotor.rotation.x;
    }
    turboAssembly.update(exhaustStateLow, 1 / 60);
    const unloadFirstFrameSpeed = (turboAssembly.bindings.turboRotor.rotation.x - previousAngle) * 60;
    expect(highSettledSpeed).toBeGreaterThan(lowSettledSpeed + 10);
    expect(highFirstFrameSpeed).toBeLessThan(highSettledSpeed);
    expect(unloadFirstFrameSpeed).toBeGreaterThan(lowSettledSpeed);
    evidence.turbo = { lowSettledSpeed, highFirstFrameSpeed, highSettledSpeed, unloadFirstFrameSpeed };

    console.log(`V3_FINAL_MECHANICAL_PROBE=${JSON.stringify(evidence)}`);
    turboAssembly.dispose();
    assembly.dispose();
  });
});
