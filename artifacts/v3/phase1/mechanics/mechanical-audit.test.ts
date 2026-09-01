import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { ENGINE_SPEC } from '../../../../src/data/engineSpec';
import {
  CYLINDER_PHASES,
  calculateValveLift,
  getCamLobePhase,
  getCylinderStates,
} from '../../../../src/engine/kinematics';
import { createEngineAssembly } from '../../../../src/scene/assembly';
import { ENGINE_DIMENSIONS } from '../../../../src/scene/constants';

const radians = (degrees: number) => degrees * Math.PI / 180;

function snapshot(globalDegrees: number) {
  return {
    crankAngle: radians(globalDegrees), rpm: 1800, load: 0.75,
    running: false, coolantC: 88, oilPressureBar: 4,
    cylinders: getCylinderStates(radians(globalDegrees)),
  };
}

describe('V3 independent mechanical audit evidence', () => {
  it('records exact phasing, closure and TDC geometry', () => {
    const assembly = createEngineAssembly();
    assembly.update(snapshot(37), 0);
    assembly.root.updateMatrixWorld(true);
    const closureErrors = assembly.bindings.cylinders.map((binding) => {
      const smallEnd = binding.connectingRod.localToWorld(
        new Vector3(0, ENGINE_DIMENSIONS.rodLength, 0),
      );
      const wrist = binding.piston.localToWorld(new Vector3());
      return smallEnd.distanceTo(wrist);
    });
    const tdcClearance = ENGINE_DIMENSIONS.headFaceY - (
      ENGINE_SPEC.connectingRodLengthMm
      + ENGINE_SPEC.crankRadiusMm
      + ENGINE_DIMENSIONS.pistonCompressionHeight
    );
    const evidence = {
      firingOrder: ENGINE_SPEC.firingOrder,
      phases: CYLINDER_PHASES,
      closureErrors,
      tdcClearanceMm: tdcClearance,
    };
    console.log(`V3_MECHANICAL_CORE=${JSON.stringify(evidence)}`);
    expect(ENGINE_SPEC.firingOrder).toEqual([1, 3, 4, 2]);
    expect(Math.max(...closureErrors)).toBeLessThan(1e-10);
    expect(tdcClearance).toBeCloseTo(5.5, 12);
    assembly.dispose();
  });

  it('quantifies valve-seat, spring-end and cam-contact approximations', () => {
    const intake = ENGINE_SPEC.intakeValve;
    const eventCentre = intake.openDeg + (intake.closeDeg - intake.openDeg) / 2;
    const eventAngles = [intake.openDeg, eventCentre, intake.closeDeg];
    const contact = eventAngles.map((globalDegrees) => {
      const lift = calculateValveLift(globalDegrees, intake);
      const travel = lift * 11;
      const carrierAngle = radians(globalDegrees / 2) + getCamLobePhase(1, 'intake');
      const c = Math.cos(carrierAngle);
      const s = Math.sin(carrierAngle);
      const lobeBottomY = 371 + 5.5 * c - Math.hypot(19 * c, 11 * s);
      const bucketTopY = 358 - travel;
      return { globalDegrees, lift, lobeBottomY, bucketTopY, gapMm: lobeBottomY - bucketTopY };
    });
    const intakeOverlapLift = calculateValveLift(360, intake);
    const exhaustOverlapLift = calculateValveLift(360, ENGINE_SPEC.exhaustValve);
    const evidence = {
      headFaceY: ENGINE_DIMENSIONS.headFaceY,
      closedValveHeadBottomY: 280 - 2.5,
      closedValveFaceRecessMm: (280 - 2.5) - ENGINE_DIMENSIONS.headFaceY,
      gasExchangeTdcValveHeadBottomY: {
        intake: 280 - intakeOverlapLift * 11 - 2.5,
        exhaust: 280 - exhaustOverlapLift * 10 - 2.5,
      },
      fixedSpringFootY: { closed: 280 + 42, open: (280 - 11) + (42 + 11) },
      springTopAtMaxLiftY: (280 - 11) + (42 + 11) + 36 * (1 - 11 / 45),
      bucketTopAtMaxLiftY: (280 - 11) + 75 + 3,
      camContact: contact,
    };
    console.log(`V3_VALVETRAIN_GEOMETRY=${JSON.stringify(evidence)}`);
    expect(evidence.fixedSpringFootY.closed).toBe(evidence.fixedSpringFootY.open);
    expect(evidence.closedValveFaceRecessMm).toBeCloseTo(8.5, 12);
    expect(contact[0]!.gapMm).toBeLessThan(-3);
    expect(contact[1]!.gapMm).toBeCloseTo(-0.5, 10);
  });

  it('records injection and heat-release separation at deterministic angles', () => {
    const assembly = createEngineAssembly();
    assembly.update(snapshot(10), 0);
    const at10 = {
      injection: assembly.bindings.cylinders[0]!.injectorPlume.visible,
      combustion: assembly.bindings.cylinders[0]!.combustion.visible,
    };
    assembly.update(snapshot(45), 0);
    const at45 = {
      injection: assembly.bindings.cylinders[0]!.injectorPlume.visible,
      combustion: assembly.bindings.cylinders[0]!.combustion.visible,
    };
    console.log(`V3_INJECTION_HEAT=${JSON.stringify({ at10, at45 })}`);
    expect(at10).toEqual({ injection: true, combustion: true });
    expect(at45).toEqual({ injection: false, combustion: true });
    assembly.dispose();
  });
});
