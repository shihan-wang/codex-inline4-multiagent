import { Vector3 } from 'three';
import { ENGINE_SPEC } from '../data/engineSpec';

export const WORLD_SCALE = 0.01;

export const ENGINE_DIMENSIONS = {
  bore: ENGINE_SPEC.boreMm,
  stroke: ENGINE_SPEC.strokeMm,
  crankRadius: ENGINE_SPEC.crankRadiusMm,
  rodLength: ENGINE_SPEC.connectingRodLengthMm,
  cylinderPitch: ENGINE_SPEC.cylinderPitchMm,
  crankAxisY: 0,
  /** Wrist-pin centre to crown at TDC, an explicit visual assembly dimension. */
  pistonCompressionHeight: 68.5,
  /** Underside of the modeled head casting / chamber roof. */
  headFaceY: 269,
  blockTopY: 286,
  blockBottomY: -82,
  headTopY: 355,
  cylinderX: [-150, -50, 50, 150] as const,
} as const;

/** Shared visual dimensions for the direct-acting bucket valvetrain. */
export const VALVETRAIN_DIMENSIONS = {
  valveHeadHeight: 5,
  closedValveGroupY: 271.5,
  springSeatLocalY: 42,
  springFreeHeight: 36,
  bucketTopLocalY: 78,
  camshaftAxisY: 375,
  camBaseRadius: 25,
  coldClearance: 0.5,
  camLobeWidth: 16,
} as const;

export const INTAKE_Z = -1;
export const EXHAUST_Z = 1;

export const CAMERA_PRESETS = {
  hero: {
    position: new Vector3(9.5, 6.4, 10.8),
    target: new Vector3(0, 1.25, 0),
    up: new Vector3(0, 1, 0),
  },
  front: {
    position: new Vector3(-12.2, 3.7, 5.4),
    target: new Vector3(-0.2, 1.35, 0),
    up: new Vector3(0, 1, 0),
  },
  side: {
    position: new Vector3(0.01, 2.5, 12.5),
    target: new Vector3(0, 1.25, 0),
    up: new Vector3(0, 1, 0),
  },
  top: {
    position: new Vector3(0.01, 15.8, 0.01),
    target: new Vector3(0, 1.25, 0),
    up: new Vector3(0, 0, -1),
  },
  cranktrain: {
    // The section plane removes the near exhaust-side half, exposing the full
    // crank/rod/piston chain from a deliberately low inspection angle.
    position: new Vector3(5.8, 1.65, 10.4),
    target: new Vector3(0, 0.65, 0),
    up: new Vector3(0, 1, 0),
  },
  valvetrain: {
    position: new Vector3(5.7, 5.45, -8.2),
    target: new Vector3(0, 3.18, 0),
    up: new Vector3(0, 1, 0),
  },
} as const;

/** Wider, slightly higher framing for the 105 mm exploded cylinder-head lift. */
export const EXPLODED_HERO_PRESET = {
  position: new Vector3(10.7, 7.2, 12.2),
  target: new Vector3(0, 1.72, 0),
  up: new Vector3(0, 1, 0),
} as const;
