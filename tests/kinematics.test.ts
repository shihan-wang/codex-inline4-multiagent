import { describe, expect, it } from 'vitest';
import {
  CYLINDER_PHASES,
  ENGINE_SPEC,
  calculateCombustion,
  calculateInjection,
  calculateValveLift,
  classifyStroke,
  getCamshaftAngle,
  getCamLobePhase,
  getCylinderCycleAngleDeg,
  getCylinderStates,
  normalizeCycleDegrees,
  rpmToRadiansPerSecond,
  sliderCrank,
} from '../src/engine/kinematics';
import { ENGINE_DIMENSIONS } from '../src/scene/constants';

const radians = (degrees: number) => (degrees * Math.PI) / 180;

describe('angle and speed helpers', () => {
  it('normalizes arbitrary angles into a 720 degree cycle', () => {
    expect(normalizeCycleDegrees(-10)).toBe(710);
    expect(normalizeCycleDegrees(720)).toBe(0);
    expect(normalizeCycleDegrees(1460)).toBe(20);
  });

  it('keeps the camshaft at exactly half crank speed', () => {
    expect(getCamshaftAngle(radians(720))).toBeCloseTo(radians(360), 12);
    expect(rpmToRadiansPerSecond(60)).toBeCloseTo(Math.PI * 2, 12);
  });
});

describe('exact slider-crank geometry', () => {
  it('hits exact dead centres and the configured stroke', () => {
    const top = sliderCrank(0);
    const bottom = sliderCrank(Math.PI);

    expect(top.pistonY).toBeCloseTo(
      ENGINE_SPEC.connectingRodLengthMm + ENGINE_SPEC.crankRadiusMm,
      12,
    );
    expect(bottom.pistonY).toBeCloseTo(
      ENGINE_SPEC.connectingRodLengthMm - ENGINE_SPEC.crankRadiusMm,
      12,
    );
    expect(top.pistonY - bottom.pistonY).toBeCloseTo(ENGINE_SPEC.strokeMm, 12);
  });

  it('preserves the connecting-rod length throughout a revolution', () => {
    for (let degree = 0; degree < 360; degree += 7) {
      const pose = sliderCrank(radians(degree));
      const rodY = pose.pistonY - pose.crankPinY;
      const rodZ = -pose.crankPinZ;
      expect(Math.hypot(rodY, rodZ)).toBeCloseTo(
        ENGINE_SPEC.connectingRodLengthMm,
        10,
      );
    }
  });

  it('uses the documented +X rotation and rod-angle sign', () => {
    const pose = sliderCrank(Math.PI / 2);
    expect(pose.crankPinZ).toBeCloseTo(ENGINE_SPEC.crankRadiusMm, 12);
    expect(pose.rodAngle).toBeLessThan(0);
  });

  it('places the modeled piston crown at a diesel-scale TDC clearance', () => {
    const wristAtTdc = sliderCrank(0).pistonY;
    const clearance = ENGINE_DIMENSIONS.headFaceY
      - (wristAtTdc + ENGINE_DIMENSIONS.pistonCompressionHeight);
    const equivalentClearanceHeight = ENGINE_SPEC.strokeMm / (ENGINE_SPEC.compressionRatio - 1);

    expect(clearance).toBeCloseTo(5.5, 10);
    expect(clearance).toBeCloseTo(equivalentClearanceHeight, 0);
  });
});

describe('four-stroke phasing', () => {
  it('uses paired 1/4 and 2/3 throws 180 degrees apart', () => {
    expect(CYLINDER_PHASES.map((phase) => phase.throwPhaseDeg)).toEqual([0, 180, 180, 0]);

    const [cylinder1, cylinder2, cylinder3, cylinder4] = getCylinderStates(radians(37));
    expect(cylinder1?.pistonY).toBeCloseTo(cylinder4?.pistonY ?? Number.NaN, 12);
    expect(cylinder2?.pistonY).toBeCloseTo(cylinder3?.pistonY ?? Number.NaN, 12);
    expect(Math.abs((cylinder1?.pistonY ?? 0) - (cylinder2?.pistonY ?? 0))).toBeGreaterThan(20);
  });

  it('fires 1-3-4-2 at equal 180 degree intervals', () => {
    const expected = [1, 3, 4, 2];
    for (let event = 0; event < expected.length; event += 1) {
      const globalAngle = radians(event * 180);
      const firing = CYLINDER_PHASES.filter(
        ({ cylinder }) => Math.abs(getCylinderCycleAngleDeg(globalAngle, cylinder)) < 1e-10,
      );
      expect(firing.map(({ cylinder }) => cylinder)).toEqual([expected[event]]);
    }
  });

  it('assigns the correct simultaneous strokes at cylinder 1 firing TDC', () => {
    const stateByCylinder = Object.fromEntries(
      getCylinderStates(0).map((state) => [state.cylinder, state.stroke]),
    );
    expect(stateByCylinder).toEqual({
      1: 'power',
      2: 'exhaust',
      3: 'compression',
      4: 'intake',
    });
  });

  it('classifies all four strokes across the full 720 degree cycle', () => {
    expect([0, 179.9, 180, 359.9, 360, 539.9, 540, 719.9].map(classifyStroke)).toEqual([
      'power',
      'power',
      'exhaust',
      'exhaust',
      'intake',
      'intake',
      'compression',
      'compression',
    ]);
  });
});

describe('valve and combustion envelopes', () => {
  it('opens and seats the intake valve at its editable timing events', () => {
    const event = ENGINE_SPEC.intakeValve;
    expect(calculateValveLift(event.openDeg, event)).toBe(0);
    expect(calculateValveLift((event.openDeg + event.closeDeg) / 2, event)).toBeCloseTo(1, 12);
    expect(calculateValveLift(event.closeDeg, event)).toBe(0);
  });

  it('represents valve overlap around the exhaust/intake TDC', () => {
    expect(calculateValveLift(360, ENGINE_SPEC.intakeValve)).toBeGreaterThan(0);
    expect(calculateValveLift(360, ENGINE_SPEC.exhaustValve)).toBeGreaterThan(0);
  });

  it('phases every cam lobe nose to its cylinder valve-event centre', () => {
    for (const phase of CYLINDER_PHASES) {
      for (const kind of ['intake', 'exhaust'] as const) {
        const event = kind === 'intake' ? ENGINE_SPEC.intakeValve : ENGINE_SPEC.exhaustValve;
        const duration = normalizeCycleDegrees(event.closeDeg - event.openDeg);
        const globalPeakDeg = normalizeCycleDegrees(
          phase.firingAngleDeg + event.openDeg + duration / 2,
        );
        const carrierAngle = getCamshaftAngle(radians(globalPeakDeg))
          + getCamLobePhase(phase.cylinder, kind);
        expect(Math.cos(carrierAngle)).toBeCloseTo(-1, 10);
        expect(Math.sin(carrierAngle)).toBeCloseTo(0, 10);
      }
    }
  });

  it('wraps injection through firing TDC and fades combustion in power', () => {
    expect(calculateInjection(715)).toBeGreaterThan(0);
    expect(calculateInjection(10)).toBeGreaterThan(0);
    expect(calculateInjection(30)).toBe(0);
    expect(calculateCombustion(0)).toBeCloseTo(1, 12);
    expect(calculateCombustion(75)).toBeCloseTo(0, 12);
  });

  it('publishes injector command separately from the longer heat-release envelope', () => {
    const duringInjection = getCylinderStates(radians(10))[0]!;
    const afterInjection = getCylinderStates(radians(45))[0]!;

    expect(duringInjection.injection).toBeGreaterThan(0);
    expect(duringInjection.combustion).toBeGreaterThan(0);
    expect(afterInjection.injection).toBe(0);
    expect(afterInjection.combustion).toBeGreaterThan(0);
  });

  it('keeps the visual combustion envelope continuous across 720/0 degrees', () => {
    const epsilon = 1e-4;
    expect(calculateCombustion(720 - epsilon)).toBeCloseTo(
      calculateCombustion(epsilon),
      8,
    );
  });
});
