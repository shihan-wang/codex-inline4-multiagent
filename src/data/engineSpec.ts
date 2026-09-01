export interface ValveEvent {
  /** Event start in cylinder cycle degrees (0 = firing TDC). */
  openDeg: number;
  /** Event end in cylinder cycle degrees. May be numerically before openDeg when wrapping 720. */
  closeDeg: number;
  maxLiftMm: number;
}

export interface EngineSpecification {
  cylinders: 4;
  firingOrder: readonly [1, 3, 4, 2];
  boreMm: number;
  strokeMm: number;
  crankRadiusMm: number;
  connectingRodLengthMm: number;
  cylinderPitchMm: number;
  compressionRatio: number;
  displacementLitres: number;
  ratedRpm: number;
  idleRpm: number;
  commonRailPressureBar: number;
  normalCoolantC: number;
  normalOilPressureBar: number;
  intakeValve: ValveEvent;
  exhaustValve: ValveEvent;
  injection: {
    startDeg: number;
    endDeg: number;
  };
}

/**
 * Representative, editable modern compact industrial inline-four diesel.
 * The bore/stroke/displacement are aligned with Yanmar's 4TNV86CT envelope;
 * the remaining visual-model dimensions are explicit engineering assumptions.
 */
export const ENGINE_SPEC: Readonly<EngineSpecification> = Object.freeze({
  cylinders: 4,
  firingOrder: [1, 3, 4, 2] as const,
  boreMm: 86,
  strokeMm: 90,
  crankRadiusMm: 45,
  connectingRodLengthMm: 150,
  cylinderPitchMm: 100,
  compressionRatio: 17.5,
  displacementLitres: 2.091,
  ratedRpm: 3000,
  idleRpm: 780,
  commonRailPressureBar: 1600,
  normalCoolantC: 88,
  normalOilPressureBar: 4.2,
  // Cycle convention: power 0..180, exhaust 180..360,
  // intake 360..540, compression 540..720.
  intakeValve: {
    openDeg: 345, // 15 deg BTDC at the exhaust/intake transition
    closeDeg: 580, // 40 deg ABDC after the intake stroke
    maxLiftMm: 8,
  },
  exhaustValve: {
    openDeg: 135, // 45 deg BBDC near the end of the power stroke
    closeDeg: 375, // 15 deg ATDC into the intake stroke
    maxLiftMm: 9,
  },
  injection: {
    startDeg: 710, // 10 deg BTDC of firing TDC
    endDeg: 20, // 20 deg ATDC; event wraps through 720/0
  },
});
