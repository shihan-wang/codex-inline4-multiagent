import {
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  TubeGeometry,
  Vector3,
} from 'three';

const TAU = Math.PI * 2;

export function fuelVisualQuantity(load: number): number {
  const safeLoad = Number.isFinite(load) ? Math.max(0, Math.min(1, load)) : 0;
  return 0.18 + safeLoad * 0.82;
}

function signedAngle(angle: number): number {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

/**
 * Normalized, symmetric cam rise about the lobe nose. The half-angle is the
 * camshaft angle from maximum lift to the zero-lift base circle.
 */
export function camLiftFraction(profileAngleRad: number, flankHalfAngleRad: number): number {
  if (!(flankHalfAngleRad > 0)) return 0;
  const distance = Math.abs(signedAngle(profileAngleRad));
  if (distance >= flankHalfAngleRad) return 0;
  const normalized = distance / flankHalfAngleRad;
  return (1 - normalized * normalized) ** 2;
}

export function camProfileRadius(
  profileAngleRad: number,
  baseRadiusMm: number,
  maxLiftMm: number,
  eventDurationCrankDeg: number,
): number {
  const flankHalfAngle = eventDurationCrankDeg * Math.PI / 720;
  return baseRadiusMm + maxLiftMm * camLiftFraction(profileAngleRad, flankHalfAngle);
}

/**
 * Creates an editable non-circular overhead-cam lobe around the +X shaft.
 * Local +Y is the nose direction; getCamLobePhase rotates it downward at peak.
 */
export function directActingCamGeometry(options: {
  widthMm: number;
  baseRadiusMm: number;
  maxLiftMm: number;
  eventDurationCrankDeg: number;
  segments?: number;
}): BufferGeometry {
  const segments = Math.max(32, Math.round(options.segments ?? 72));
  const vertices: number[] = [];
  const indices: number[] = [];
  const halfWidth = options.widthMm / 2;
  const flankHalfAngle = options.eventDurationCrankDeg * Math.PI / 720;

  for (const x of [-halfWidth, halfWidth]) {
    for (let index = 0; index < segments; index += 1) {
      const relativeAngle = -Math.PI + index / segments * TAU;
      const normalized = relativeAngle / flankHalfAngle;
      const active = Math.abs(normalized) < 1;
      const lift = active
        ? options.maxLiftMm * (1 - normalized * normalized) ** 2
        : 0;
      const liftDerivative = active
        ? options.maxLiftMm * (-4 * normalized * (1 - normalized * normalized)) / flankHalfAngle
        : 0;
      // Envelope of the rotating follower planes. Unlike a naive polar bump,
      // this keeps every point above the flat bucket at all cam angles.
      const carrierAngle = Math.PI + relativeAngle;
      const followerHeight = options.baseRadiusMm + lift;
      const y = -followerHeight * Math.cos(carrierAngle)
        + liftDerivative * Math.sin(carrierAngle);
      const z = followerHeight * Math.sin(carrierAngle)
        + liftDerivative * Math.cos(carrierAngle);
      vertices.push(x, y, z);
    }
  }

  const frontCenter = vertices.length / 3;
  vertices.push(-halfWidth, 0, 0);
  const rearCenter = vertices.length / 3;
  vertices.push(halfWidth, 0, 0);

  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const front = index;
    const frontNext = next;
    const rear = segments + index;
    const rearNext = segments + next;
    indices.push(front, rear, frontNext, frontNext, rear, rearNext);
    indices.push(frontCenter, front, frontNext);
    indices.push(rearCenter, rearNext, rear);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Finds the lowest liner height that clears the swept outer envelope of the
 * connecting-rod big end.  The test is intentionally performed in the rod's
 * Y/Z motion plane over the complete 720-degree teaching cycle.  Clearance is
 * applied radially, then the result is rounded upward to a machinable millimetre.
 */
export function deriveLinerReliefBottomY(options: {
  crankAxisY: number;
  crankRadiusMm: number;
  connectingRodLengthMm: number;
  bigEndEnvelopeRadiusMm: number;
  linerInnerRadiusMm: number;
  radialClearanceMm: number;
  axialSafetyMm: number;
  crankStepDeg?: number;
  envelopeStepDeg?: number;
}): number {
  const crankStep = Math.max(0.25, options.crankStepDeg ?? 1);
  const envelopeStep = Math.max(0.5, options.envelopeStepDeg ?? 2);
  const radialLimit = options.linerInnerRadiusMm - options.radialClearanceMm;
  if (!(radialLimit > 0) || !(options.connectingRodLengthMm > options.crankRadiusMm)) {
    throw new Error('Invalid connecting-rod or liner relief dimensions.');
  }

  let highestInterferingY = Number.NEGATIVE_INFINITY;
  for (let crankDeg = 0; crankDeg <= 720; crankDeg += crankStep) {
    const crankAngle = crankDeg * Math.PI / 180;
    const bigEndY = options.crankAxisY + Math.cos(crankAngle) * options.crankRadiusMm;
    const bigEndZ = Math.sin(crankAngle) * options.crankRadiusMm;
    const rodAxialProjection = Math.sqrt(
      options.connectingRodLengthMm ** 2 - bigEndZ ** 2,
    );
    const rodAngle = Math.atan2(-bigEndZ, rodAxialProjection);
    const cosRod = Math.cos(rodAngle);
    const sinRod = Math.sin(rodAngle);

    for (let envelopeDeg = 0; envelopeDeg < 360; envelopeDeg += envelopeStep) {
      const envelopeAngle = envelopeDeg * Math.PI / 180;
      const localY = Math.cos(envelopeAngle) * options.bigEndEnvelopeRadiusMm;
      const localZ = Math.sin(envelopeAngle) * options.bigEndEnvelopeRadiusMm;
      const worldY = bigEndY + cosRod * localY - sinRod * localZ;
      const worldZ = bigEndZ + sinRod * localY + cosRod * localZ;
      if (Math.abs(worldZ) >= radialLimit) highestInterferingY = Math.max(highestInterferingY, worldY);
    }
  }

  if (!Number.isFinite(highestInterferingY)) return options.crankAxisY;
  return Math.ceil(highestInterferingY + options.axialSafetyMm);
}

/**
 * Places an annular register above a rotating swept envelope without changing
 * the moving geometry. The nearest register point is its lower face at the
 * inner torus radius, so the Pythagorean constraint is conservative over the
 * complete rotation rather than tuned to a few rendered angles.
 */
export function deriveAnnularRegisterCenterY(options: {
  crankAxisY: number;
  sweptRadiusMm: number;
  sweptAxialExtentMm: number;
  registerMajorRadiusMm: number;
  registerTubeRadiusMm: number;
  radialClearanceMm: number;
}): number {
  const innerRadius = options.registerMajorRadiusMm - options.registerTubeRadiusMm;
  const requiredRadius = options.sweptRadiusMm + options.radialClearanceMm;
  if (!(innerRadius > options.sweptAxialExtentMm)
    || !(requiredRadius > innerRadius)) {
    throw new Error('Invalid annular-register clearance dimensions.');
  }
  // The crank rotates in Y/Z, but each web occupies a non-zero X interval
  // relative to the cylinder axis. At the largest axial reach, the liner's
  // inner annulus has only this much Z radius left. Using that smaller Z value
  // avoids the invalid 2-D projection that ignored the web's ±31 mm offset.
  const availableZAtAxialExtent = Math.sqrt(
    innerRadius ** 2 - options.sweptAxialExtentMm ** 2,
  );
  const lowerFaceY = Math.sqrt(
    requiredRadius ** 2 - availableZAtAxialExtent ** 2,
  );
  return Math.ceil(options.crankAxisY + lowerFaceY + options.registerTubeRadiusMm);
}

/** A closed, two-pulley belt centreline in the Y/Z plane at constant X. */
export function twoPulleyBeltPoints(options: {
  xMm: number;
  lowerYmm: number;
  upperYmm: number;
  lowerRadiusMm: number;
  upperRadiusMm: number;
  zMm?: number;
  arcSegments?: number;
}): Vector3[] {
  const points: Vector3[] = [];
  const segments = Math.max(8, Math.round(options.arcSegments ?? 18));
  const zOffset = options.zMm ?? 0;

  points.push(new Vector3(options.xMm, options.lowerYmm, zOffset + options.lowerRadiusMm));
  points.push(new Vector3(options.xMm, options.upperYmm, zOffset + options.upperRadiusMm));
  for (let index = 1; index <= segments; index += 1) {
    const angle = index / segments * Math.PI;
    points.push(new Vector3(
      options.xMm,
      options.upperYmm + Math.sin(angle) * options.upperRadiusMm,
      zOffset + Math.cos(angle) * options.upperRadiusMm,
    ));
  }
  points.push(new Vector3(options.xMm, options.lowerYmm, zOffset - options.lowerRadiusMm));
  for (let index = 1; index <= segments; index += 1) {
    const angle = Math.PI + index / segments * Math.PI;
    points.push(new Vector3(
      options.xMm,
      options.lowerYmm + Math.sin(angle) * options.lowerRadiusMm,
      zOffset + Math.cos(angle) * options.lowerRadiusMm,
    ));
  }
  return points;
}

export function twoPulleyBeltGeometry(
  options: Parameters<typeof twoPulleyBeltPoints>[0] & { beltRadiusMm?: number },
): TubeGeometry {
  const points = twoPulleyBeltPoints(options);
  return new TubeGeometry(
    new CatmullRomCurve3(points, true, 'catmullrom', 0.08),
    Math.max(96, points.length * 3),
    options.beltRadiusMm ?? 3.5,
    8,
    true,
  );
}
