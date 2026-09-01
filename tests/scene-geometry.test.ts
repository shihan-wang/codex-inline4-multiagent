import { describe, expect, it } from 'vitest';
import { ENGINE_SPEC } from '../src/data/engineSpec';
import {
  CYLINDER_PHASES,
  calculateValveLift,
  getCamLobePhase,
} from '../src/engine/kinematics';
import {
  ENGINE_DIMENSIONS,
  VALVETRAIN_DIMENSIONS,
} from '../src/scene/constants';
import {
  camLiftFraction,
  camProfileRadius,
  deriveAnnularRegisterCenterY,
  deriveLinerReliefBottomY,
  directActingCamGeometry,
  fuelVisualQuantity,
  twoPulleyBeltPoints,
} from '../src/scene/mechanical-geometry';

const radians = (degrees: number) => degrees * Math.PI / 180;

describe('direct-acting valvetrain geometry', () => {
  it('creates a closed consistently wound cam mesh with finite normals and positive volume', () => {
    const geometry = directActingCamGeometry({
      widthMm: VALVETRAIN_DIMENSIONS.camLobeWidth,
      baseRadiusMm: VALVETRAIN_DIMENSIONS.camBaseRadius,
      maxLiftMm: ENGINE_SPEC.intakeValve.maxLiftMm,
      eventDurationCrankDeg: (
        ENGINE_SPEC.intakeValve.closeDeg - ENGINE_SPEC.intakeValve.openDeg + 720
      ) % 720,
    });
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    const index = geometry.getIndex();
    expect(index).not.toBeNull();
    if (index === null) throw new Error('Cam geometry must be indexed');

    const edgeUses = new Map<string, Array<[number, number]>>();
    let signedVolumeTimesSix = 0;
    for (let offset = 0; offset < index.count; offset += 3) {
      const triangle = [index.getX(offset), index.getX(offset + 1), index.getX(offset + 2)];
      for (let edge = 0; edge < 3; edge += 1) {
        const from = triangle[edge];
        const to = triangle[(edge + 1) % 3];
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const uses = edgeUses.get(key) ?? [];
        uses.push([from, to]);
        edgeUses.set(key, uses);
      }

      const [a, b, c] = triangle.map((vertex) => ({
        x: positions.getX(vertex),
        y: positions.getY(vertex),
        z: positions.getZ(vertex),
      }));
      signedVolumeTimesSix += a.x * (b.y * c.z - b.z * c.y)
        + a.y * (b.z * c.x - b.x * c.z)
        + a.z * (b.x * c.y - b.y * c.x);
    }

    for (const uses of edgeUses.values()) {
      expect(uses).toHaveLength(2);
      expect(uses[0]).toEqual([uses[1][1], uses[1][0]]);
    }
    expect(signedVolumeTimesSix).toBeGreaterThan(0);
    for (let vertex = 0; vertex < normals.count; vertex += 1) {
      expect(Number.isFinite(normals.getX(vertex))).toBe(true);
      expect(Number.isFinite(normals.getY(vertex))).toBe(true);
      expect(Number.isFinite(normals.getZ(vertex))).toBe(true);
    }
    geometry.dispose();
  });

  it('seats the closed valve face at the chamber roof and closes the spring endpoints', () => {
    const closedFace = VALVETRAIN_DIMENSIONS.closedValveGroupY
      - VALVETRAIN_DIMENSIONS.valveHeadHeight / 2;
    expect(closedFace).toBeCloseTo(ENGINE_DIMENSIONS.headFaceY, 12);
    expect(
      VALVETRAIN_DIMENSIONS.springSeatLocalY + VALVETRAIN_DIMENSIONS.springFreeHeight,
    ).toBeCloseTo(VALVETRAIN_DIMENSIONS.bucketTopLocalY, 12);
  });

  it('matches the editable valve-lift envelope and preserves declared cold clearance', () => {
    for (const phase of CYLINDER_PHASES) {
      for (const kind of ['intake', 'exhaust'] as const) {
        const event = kind === 'intake' ? ENGINE_SPEC.intakeValve : ENGINE_SPEC.exhaustValve;
        const duration = ((event.closeDeg - event.openDeg) % 720 + 720) % 720;
        const halfAngle = radians(duration / 4);
        const geometry = directActingCamGeometry({
          widthMm: VALVETRAIN_DIMENSIONS.camLobeWidth,
          baseRadiusMm: VALVETRAIN_DIMENSIONS.camBaseRadius,
          maxLiftMm: event.maxLiftMm,
          eventDurationCrankDeg: duration,
        });
        const positions = geometry.getAttribute('position');
        for (let cycleAngle = 0; cycleAngle < 720; cycleAngle += 2.5) {
          const globalAngle = phase.firingAngleDeg + cycleAngle;
          const carrierAngle = radians(globalAngle) / 2 + getCamLobePhase(phase.cylinder, kind);
          const profileAngleTowardBucket = Math.PI - carrierAngle;
          const expectedLift = calculateValveLift(cycleAngle, event);
          const profileLift = camLiftFraction(profileAngleTowardBucket, halfAngle);
          expect(profileLift).toBeCloseTo(expectedLift, 9);

          const travel = expectedLift * event.maxLiftMm;
          const bucketTop = VALVETRAIN_DIMENSIONS.closedValveGroupY
            - travel
            + VALVETRAIN_DIMENSIONS.bucketTopLocalY;
          const camSurface = VALVETRAIN_DIMENSIONS.camshaftAxisY - camProfileRadius(
            profileAngleTowardBucket,
            VALVETRAIN_DIMENSIONS.camBaseRadius,
            event.maxLiftMm,
            duration,
          );
          expect(camSurface - bucketTop).toBeCloseTo(VALVETRAIN_DIMENSIONS.coldClearance, 9);

          let actualLowestSurface = Number.POSITIVE_INFINITY;
          for (let vertex = 0; vertex < positions.count; vertex += 1) {
            const rotatedY = positions.getY(vertex) * Math.cos(carrierAngle)
              - positions.getZ(vertex) * Math.sin(carrierAngle);
            actualLowestSurface = Math.min(actualLowestSurface, rotatedY);
          }
          const actualGap = VALVETRAIN_DIMENSIONS.camshaftAxisY
            + actualLowestSurface - bucketTop;
          expect(actualGap).toBeGreaterThanOrEqual(VALVETRAIN_DIMENSIONS.coldClearance - 0.02);
          expect(actualGap).toBeLessThan(0.7);

          const springFixedSeat = VALVETRAIN_DIMENSIONS.closedValveGroupY
            - travel
            + VALVETRAIN_DIMENSIONS.springSeatLocalY
            + travel;
          const springMovingEnd = springFixedSeat
            + VALVETRAIN_DIMENSIONS.springFreeHeight - travel;
          expect(springFixedSeat).toBeCloseTo(
            VALVETRAIN_DIMENSIONS.closedValveGroupY + VALVETRAIN_DIMENSIONS.springSeatLocalY,
            12,
          );
          expect(springMovingEnd).toBeCloseTo(bucketTop, 12);
        }
        geometry.dispose();
      }
    }
  });
});

describe('visible system relationships', () => {
  it('derives the liner lower relief from the full swept big-end envelope', () => {
    const reliefBottomY = deriveLinerReliefBottomY({
      crankAxisY: ENGINE_DIMENSIONS.crankAxisY,
      crankRadiusMm: ENGINE_DIMENSIONS.crankRadius,
      connectingRodLengthMm: ENGINE_DIMENSIONS.rodLength,
      bigEndEnvelopeRadiusMm: 36,
      linerInnerRadiusMm: 44,
      radialClearanceMm: 4,
      axialSafetyMm: 1,
    });
    expect(reliefBottomY).toBe(72);
    expect(reliefBottomY).toBeLessThan(ENGINE_DIMENSIONS.crankAxisY + ENGINE_DIMENSIONS.rodLength);
  });

  it('places the lower liner register outside the measured crank-web sweep', () => {
    const sweptRadiusMm = 84.4122;
    const centerY = deriveAnnularRegisterCenterY({
      crankAxisY: ENGINE_DIMENSIONS.crankAxisY,
      sweptRadiusMm,
      sweptAxialExtentMm: 35.5,
      registerMajorRadiusMm: 46,
      registerTubeRadiusMm: 2,
      radialClearanceMm: 4,
    });
    const nearestRegisterRadius = Math.hypot(centerY - 2, 46 - 2);
    const availableZ = Math.sqrt((46 - 2) ** 2 - 35.5 ** 2);
    const nearestSweptRadius = Math.hypot(centerY - 2, availableZ);
    expect(centerY).toBe(87);
    expect(nearestSweptRadius).toBeGreaterThanOrEqual(sweptRadiusMm + 4);
  });

  it('keeps idle fuel visible while increasing monotonically with load', () => {
    expect(fuelVisualQuantity(0)).toBeCloseTo(0.18, 12);
    expect(fuelVisualQuantity(0.5)).toBeGreaterThan(fuelVisualQuantity(0));
    expect(fuelVisualQuantity(1)).toBeCloseTo(1, 12);
    expect(fuelVisualQuantity(Number.NaN)).toBeCloseTo(0.18, 12);
  });

  it('constructs a coplanar closed accessory-belt envelope around both pulleys', () => {
    const points = twoPulleyBeltPoints({
      xMm: -357,
      lowerYmm: 0,
      upperYmm: 160,
      lowerRadiusMm: 55,
      upperRadiusMm: 45,
    });
    expect(points.length).toBeGreaterThan(30);
    expect(points.every((point) => point.x === -357)).toBe(true);
    expect(Math.min(...points.map((point) => point.y))).toBeCloseTo(-55, 8);
    expect(Math.max(...points.map((point) => point.y))).toBeCloseTo(205, 8);
  });
});
