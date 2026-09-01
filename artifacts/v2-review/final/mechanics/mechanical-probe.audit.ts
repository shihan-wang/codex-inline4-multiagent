import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ENGINE_SPEC } from '../../../../src/data/engineSpec';
import {
  CYLINDER_PHASES,
  getCylinderStates,
  normalizeCycleDegrees,
} from '../../../../src/engine/kinematics';
import { createEngineAssembly } from '../../../../src/scene/assembly';
import { ENGINE_DIMENSIONS } from '../../../../src/scene/constants';

const radians = (degrees: number) => degrees * Math.PI / 180;

function snapshot(globalDegrees: number) {
  return {
    crankAngle: radians(globalDegrees), rpm: 900, load: 0.6,
    running: false, coolantC: 88, oilPressureBar: 4,
    cylinders: getCylinderStates(radians(globalDegrees)),
  };
}

describe('v2 final mechanical scene probe', () => {
  it('keeps all four scene rods closed between crankpins and wrist pins', () => {
    const assembly = createEngineAssembly();
    assembly.update(snapshot(37), 0);
    assembly.root.updateMatrixWorld(true);
    for (const binding of assembly.bindings.cylinders) {
      const smallEnd = binding.connectingRod.localToWorld(new Vector3(0, ENGINE_DIMENSIONS.rodLength, 0));
      const wrist = binding.piston.localToWorld(new Vector3(0, 0, 0));
      expect(smallEnd.distanceTo(wrist)).toBeLessThan(1e-10);
    }
    assembly.dispose();
  });

  it('preserves 1-3-4-2 state order and half-speed cam motion in scene bindings', () => {
    const assembly = createEngineAssembly();
    expect(ENGINE_SPEC.firingOrder).toEqual([1, 3, 4, 2]);
    for (const [event, cylinder] of ENGINE_SPEC.firingOrder.entries()) {
      const globalDegrees = event * 180;
      const state = snapshot(globalDegrees);
      expect(state.cylinders.find((item) => item.cylinder === cylinder)?.cycleAngleDeg).toBe(0);
      assembly.update(state, 0);
      expect(assembly.bindings.crankshaft.rotation.x).toBeCloseTo(radians(globalDegrees), 12);
      for (const shaft of assembly.bindings.camshaft.children) {
        expect(shaft.rotation.x).toBeCloseTo(radians(globalDegrees) / 2, 12);
      }
    }
    assembly.dispose();
  });

  it('puts every cam carrier nose down at its matching maximum valve lift', () => {
    const assembly = createEngineAssembly();
    for (const phase of CYLINDER_PHASES) {
      for (const [shaftIndex, kind] of ['intake', 'exhaust'].entries()) {
        const event = kind === 'intake' ? ENGINE_SPEC.intakeValve : ENGINE_SPEC.exhaustValve;
        const centre = normalizeCycleDegrees(event.openDeg + normalizeCycleDegrees(event.closeDeg - event.openDeg) / 2);
        const globalDegrees = normalizeCycleDegrees(phase.firingAngleDeg + centre);
        assembly.update(snapshot(globalDegrees), 0);
        const shaft = assembly.bindings.camshaft.children[shaftIndex]!;
        const carrier = shaft.children[1 + (phase.cylinder - 1) * 2]!;
        expect(Math.cos(shaft.rotation.x + carrier.rotation.x)).toBeCloseTo(-1, 10);
        expect(Math.sin(shaft.rotation.x + carrier.rotation.x)).toBeCloseTo(0, 10);
      }
    }
    assembly.dispose();
  });

  it('holds the spring foot fixed while valves travel and keeps diesel-scale TDC clearance', () => {
    const assembly = createEngineAssembly();
    const binding = assembly.bindings.cylinders[0]!;
    assembly.update(snapshot(0), 0);
    const closedFoot = binding.intakeValve.position.y + binding.intakeSprings[0]!.position.y;
    const intakePeak = normalizeCycleDegrees(
      ENGINE_SPEC.intakeValve.openDeg
      + normalizeCycleDegrees(ENGINE_SPEC.intakeValve.closeDeg - ENGINE_SPEC.intakeValve.openDeg) / 2,
    );
    assembly.update(snapshot(intakePeak), 0);
    const openFoot = binding.intakeValve.position.y + binding.intakeSprings[0]!.position.y;
    expect(openFoot).toBeCloseTo(closedFoot, 12);
    const crownAtTdc = ENGINE_SPEC.connectingRodLengthMm
      + ENGINE_SPEC.crankRadiusMm + ENGINE_DIMENSIONS.pistonCompressionHeight;
    expect(ENGINE_DIMENSIONS.headFaceY - crownAtTdc).toBeCloseTo(5.5, 12);
    assembly.dispose();
  });

  it('shows injection only during its command while heat release continues independently', () => {
    const assembly = createEngineAssembly();
    const binding = assembly.bindings.cylinders[0]!;
    assembly.update(snapshot(10), 0);
    expect(binding.injectorPlume.visible).toBe(true);
    expect(binding.combustion.visible).toBe(true);
    assembly.update(snapshot(45), 0);
    expect(binding.injectorPlume.visible).toBe(false);
    expect(binding.combustion.visible).toBe(true);
    expect(new Set(assembly.bindings.cylinders.map((item) => item.injectorPlume.material)).size).toBe(4);
    expect(new Set(assembly.bindings.cylinders.map((item) => item.combustion.material)).size).toBe(4);
    assembly.dispose();
  });
});
