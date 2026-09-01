import { ENGINE_SPEC, type ValveEvent } from '../data/engineSpec';
import type { CylinderState, Stroke } from '../types';

export { ENGINE_SPEC };

export const TAU = Math.PI * 2;
export const FOUR_STROKE_RADIANS = TAU * 2;

export type CylinderNumber = 1 | 2 | 3 | 4;

export interface SliderCrankPose {
  /** Wrist-pin height above the crankshaft centreline, millimetres. */
  pistonY: number;
  /** Crankpin coordinates in the Y/Z plane, millimetres. */
  crankPinY: number;
  crankPinZ: number;
  /** Rod rotation about +X from local +Y, radians. */
  rodAngle: number;
}

export interface CylinderPhase {
  cylinder: CylinderNumber;
  /** Crank angle at firing TDC in the global 720 degree sequence. */
  firingAngleDeg: number;
  /** Physical crank-throw phase; cylinders 1/4 and 2/3 are paired. */
  throwPhaseDeg: 0 | 180;
}

export const CYLINDER_PHASES: readonly CylinderPhase[] = Object.freeze([
  { cylinder: 1, firingAngleDeg: 0, throwPhaseDeg: 0 },
  { cylinder: 2, firingAngleDeg: 540, throwPhaseDeg: 180 },
  { cylinder: 3, firingAngleDeg: 180, throwPhaseDeg: 180 },
  { cylinder: 4, firingAngleDeg: 360, throwPhaseDeg: 0 },
]);

export function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function normalizeCycleDegrees(angleDeg: number): number {
  return positiveModulo(angleDeg, 720);
}

export function radiansToDegrees(angleRad: number): number {
  return (angleRad * 180) / Math.PI;
}

export function rpmToRadiansPerSecond(rpm: number): number {
  return (rpm * TAU) / 60;
}

/** The camshaft is positively geared at exactly half crankshaft angular speed. */
export function getCamshaftAngle(crankAngleRad: number): number {
  return crankAngleRad * 0.5;
}

/**
 * Exact in-line slider-crank closure. At angle zero the crankpin and wrist pin
 * are at TDC on +Y. Positive crank rotation is about +X, so crankpin Z is
 * positive in the first quadrant.
 */
export function sliderCrank(
  crankAngleRad: number,
  crankRadiusMm = ENGINE_SPEC.crankRadiusMm,
  connectingRodLengthMm = ENGINE_SPEC.connectingRodLengthMm,
): SliderCrankPose {
  if (!(crankRadiusMm > 0) || !(connectingRodLengthMm > crankRadiusMm)) {
    throw new RangeError('Slider-crank requires connectingRodLengthMm > crankRadiusMm > 0.');
  }

  const sin = Math.sin(crankAngleRad);
  const cos = Math.cos(crankAngleRad);
  const crankPinY = crankRadiusMm * cos;
  const crankPinZ = crankRadiusMm * sin;
  const rodVerticalProjection = Math.sqrt(
    connectingRodLengthMm ** 2 - crankPinZ ** 2,
  );

  return {
    pistonY: crankPinY + rodVerticalProjection,
    crankPinY,
    crankPinZ,
    rodAngle: Math.atan2(-crankPinZ, rodVerticalProjection),
  };
}

export function getCylinderPhase(cylinder: CylinderNumber): CylinderPhase {
  const phase = CYLINDER_PHASES[cylinder - 1];
  if (!phase || phase.cylinder !== cylinder) {
    throw new RangeError(`Invalid cylinder number: ${String(cylinder)}`);
  }
  return phase;
}

export function getCylinderCycleAngleDeg(
  globalCrankAngleRad: number,
  cylinder: CylinderNumber,
): number {
  const { firingAngleDeg } = getCylinderPhase(cylinder);
  return normalizeCycleDegrees(radiansToDegrees(globalCrankAngleRad) - firingAngleDeg);
}

export function classifyStroke(cycleAngleDeg: number): Stroke {
  const angle = normalizeCycleDegrees(cycleAngleDeg);
  if (angle < 180) return 'power';
  if (angle < 360) return 'exhaust';
  if (angle < 540) return 'intake';
  return 'compression';
}

export function getStrokeProgress(cycleAngleDeg: number): number {
  return (normalizeCycleDegrees(cycleAngleDeg) % 180) / 180;
}

/**
 * Smooth normalized lift between the editable opening and closing events.
 * A symmetric quartic has zero lift and zero slope at both seats while keeping
 * follower acceleration compatible with the declared direct-acting cam base.
 */
export function calculateValveLift(cycleAngleDeg: number, event: ValveEvent): number {
  const angle = normalizeCycleDegrees(cycleAngleDeg);
  const open = normalizeCycleDegrees(event.openDeg);
  const duration = positiveModulo(event.closeDeg - event.openDeg, 720);
  if (duration === 0) return 0;

  const elapsed = positiveModulo(angle - open, 720);
  if (elapsed >= duration) return 0;

  const centered = (elapsed / duration) * 2 - 1;
  return (1 - centered * centered) ** 2;
}

/** Local +X phase for an eccentric cam carrier whose nose points down at peak lift. */
export function getCamLobePhase(
  cylinder: CylinderNumber,
  kind: 'intake' | 'exhaust',
): number {
  const event = kind === 'intake' ? ENGINE_SPEC.intakeValve : ENGINE_SPEC.exhaustValve;
  const duration = positiveModulo(event.closeDeg - event.openDeg, 720);
  const eventCentreCycleDeg = normalizeCycleDegrees(event.openDeg + duration / 2);
  const eventCentreGlobalDeg = normalizeCycleDegrees(
    getCylinderPhase(cylinder).firingAngleDeg + eventCentreCycleDeg,
  );
  return Math.PI - eventCentreGlobalDeg * Math.PI / 360;
}

/** Normalized injector-command envelope, including its 720/0 degree wrap. */
export function calculateInjection(cycleAngleDeg: number): number {
  const event: ValveEvent = {
    openDeg: ENGINE_SPEC.injection.startDeg,
    closeDeg: ENGINE_SPEC.injection.endDeg,
    maxLiftMm: 1,
  };
  return calculateValveLift(cycleAngleDeg, event);
}

/**
 * A deliberately longer visual heat-release envelope than injector command.
 * It rises during the final 10 degrees of compression, peaks at firing TDC,
 * and fades during the first 75 degrees of the power stroke.
 */
export function calculateCombustion(cycleAngleDeg: number): number {
  const angle = normalizeCycleDegrees(cycleAngleDeg);
  if (angle >= 710) {
    return Math.sin(((angle - 710) / 10) * (Math.PI / 2)) ** 2;
  }
  if (angle <= 75) {
    return Math.cos((angle / 75) * (Math.PI / 2)) ** 2;
  }
  return 0;
}

export function getCylinderState(
  globalCrankAngleRad: number,
  cylinder: CylinderNumber,
): CylinderState {
  const cycleAngleDeg = getCylinderCycleAngleDeg(globalCrankAngleRad, cylinder);
  const physicalAngleRad = (cycleAngleDeg * Math.PI) / 180;
  const pose = sliderCrank(physicalAngleRad);

  return {
    cylinder,
    cycleAngleDeg,
    stroke: classifyStroke(cycleAngleDeg),
    pistonY: pose.pistonY,
    rodAngle: pose.rodAngle,
    intakeLift: calculateValveLift(cycleAngleDeg, ENGINE_SPEC.intakeValve),
    exhaustLift: calculateValveLift(cycleAngleDeg, ENGINE_SPEC.exhaustValve),
    injection: calculateInjection(cycleAngleDeg),
    combustion: calculateCombustion(cycleAngleDeg),
  };
}

export function getCylinderStates(globalCrankAngleRad: number): CylinderState[] {
  return CYLINDER_PHASES.map(({ cylinder }) =>
    getCylinderState(globalCrankAngleRad, cylinder),
  );
}
