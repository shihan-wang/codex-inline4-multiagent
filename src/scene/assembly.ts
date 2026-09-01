import {
  BufferGeometry,
  CatmullRomCurve3,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { ENGINE_SPEC } from '../data/engineSpec';
import { ENGINE_DIMENSIONS, VALVETRAIN_DIMENSIONS, WORLD_SCALE } from './constants';
import { getCamLobePhase } from '../engine/kinematics';
import { ExhaustPulseField, FlowPath } from './effects';
import {
  cylinderAlongX,
  frustumBoxGeometry,
  roundedBoxGeometry,
  simpleBox,
  tubeBetween,
} from './geometry-utils';
import {
  deriveAnnularRegisterCenterY,
  deriveLinerReliefBottomY,
  directActingCamGeometry,
  fuelVisualQuantity,
  twoPulleyBeltGeometry,
} from './mechanical-geometry';
import {
  createEngineMaterials,
  MaterialModeController,
  type EngineMaterials,
} from './materials';
import type {
  CylinderBinding,
  EngineAssembly,
  SceneSimulationSnapshot,
  SceneViewMode,
  VisualRole,
} from './types';

const THROW_PHASES = [0, Math.PI, Math.PI, 0] as const;

interface BuildContext {
  root: Group;
  materials: EngineMaterials;
  materialModes: MaterialModeController;
  pickables: Object3D[];
}

interface InstancePose {
  position: readonly [number, number, number];
  rotation?: readonly [number, number, number];
  scale?: readonly [number, number, number];
}

function staticInstances(
  geometry: BufferGeometry,
  material: Material,
  poses: readonly InstancePose[],
): InstancedMesh {
  const mesh = prepareMesh(new InstancedMesh(geometry, material, poses.length));
  const dummy = new Object3D();
  poses.forEach((pose, index) => {
    dummy.position.set(...pose.position);
    dummy.rotation.set(...(pose.rotation ?? [0, 0, 0]));
    dummy.scale.set(...(pose.scale ?? [1, 1, 1]));
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function markPart<T extends Object3D>(
  object: T,
  partId: string,
  role: VisualRole,
  pickables?: Object3D[],
): T {
  object.userData.partId = partId;
  object.userData.visualRole = role;
  object.name = partId;
  if (pickables) pickables.push(object);
  return object;
}

function prepareMesh<T extends Mesh>(mesh: T, castShadow = false, receiveShadow = true): T {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function addRibbedCover(
  group: Group,
  material: Material,
  y: number,
  z: number,
): void {
  const cover = prepareMesh(new Mesh(roundedBoxGeometry(470, 50, 126, 15, 3), material), true);
  cover.position.set(0, y, z);
  group.add(cover);
  const ribPoses: InstancePose[] = [];
  for (let x = -205; x <= 205; x += 41) ribPoses.push({ position: [x, y + 27, z] });
  group.add(staticInstances(roundedBoxGeometry(5, 10, 132, 2, 1), material, ribPoses));
}

function buildStructuralShell(context: BuildContext): void {
  const { root, materials, pickables } = context;
  const block = markPart(new Group(), 'engine-block', 'shell', pickables);
  block.userData.geometryIntent = 'open-web cylinder block with real bore and crankcase paths';

  // The V3 block was one closed exterior solid.  This visually convincing but
  // physically impossible shortcut sealed the bores and crankcase.  V4 uses
  // individually closed cast members around an explicit central crank sweep.
  // The inner side-wall plane is ±93 mm; the crank/rod swept radial envelope is
  // 84 mm, leaving 9 mm without changing any moving-part dimension.
  const sideWallPoses: InstancePose[] = [-1, 1].map((side) => ({
    position: [0, 89, side * 100],
  }));
  const sideWalls = staticInstances(
    roundedBoxGeometry(510, 342, 14, 5, 2),
    materials.castIron,
    sideWallPoses,
  );
  sideWalls.name = 'open crankcase side walls';
  sideWalls.userData.partId = 'engine-block';
  sideWalls.userData.visualRole = 'shell';
  sideWalls.userData.componentRole = 'crankcase-side-wall';
  block.add(sideWalls);

  // Upper end walls close only the water-jacket region; the crank nose and
  // flywheel paths remain open below them.
  const upperEndWalls = staticInstances(
    roundedBoxGeometry(16, 166, 214, 6, 2),
    materials.castIron,
    [-247, 247].map((x) => ({ position: [x, 177, 0] })),
  );
  upperEndWalls.name = 'upper water-jacket end walls';
  upperEndWalls.userData.partId = 'engine-block';
  upperEndWalls.userData.visualRole = 'shell';
  upperEndWalls.userData.componentRole = 'upper-end-wall';
  block.add(upperEndWalls);

  // A four-bore deck built from front/rear rails, inter-bore bridges and end
  // bridges.  The 12 mm pitch bridges finish exactly at the 44 mm liner OD;
  // the 42 mm piston crown therefore keeps a measured 2 mm radial clearance.
  const deckMemberPoses: InstancePose[] = [
    { position: [0, 267, 84], scale: [535, 14, 62] },
    { position: [0, 267, -84], scale: [535, 14, 62] },
  ];
  for (const x of [-100, 0, 100]) {
    deckMemberPoses.push({ position: [x, 267, 0], scale: [12, 14, 106] });
  }
  for (const x of [-236.5, 236.5]) {
    deckMemberPoses.push({ position: [x, 267, 0], scale: [62, 14, 106] });
  }
  const deckMembers = staticInstances(simpleBox(1, 1, 1), materials.machinedSteel, deckMemberPoses);
  deckMembers.name = 'four-bore machined deck members';
  deckMembers.userData.partId = 'engine-block';
  deckMembers.userData.visualRole = 'shell';
  deckMembers.userData.componentRole = 'bore-deck-member';
  block.add(deckMembers);

  // Exterior ribs and bearing-bay rings retain the cast-engine silhouette but
  // stay outside the swept volume instead of filling the crankcase.
  const blockRibPoses: InstancePose[] = [];
  const bearingBayPoses: InstancePose[] = [];
  for (let x = -230; x <= 230; x += 115) {
    for (const side of [-1, 1]) {
      blockRibPoses.push({ position: [x, 89, side * 110] });
      bearingBayPoses.push({ position: [x, 0, side * 110] });
    }
  }
  const exteriorRibs = staticInstances(
    roundedBoxGeometry(14, 326, 10, 4, 1),
    materials.castIron,
    blockRibPoses,
  );
  exteriorRibs.name = 'cast exterior main-bearing ribs';
  exteriorRibs.userData.partId = 'engine-block';
  exteriorRibs.userData.visualRole = 'shell';
  exteriorRibs.userData.componentRole = 'exterior-rib';
  block.add(exteriorRibs);
  const bearingBayRings = staticInstances(
    new TorusGeometry(45, 7, 10, 32),
    materials.darkCastIron,
    bearingBayPoses,
  );
  bearingBayRings.name = 'external main-bearing bay rings';
  bearingBayRings.userData.partId = 'engine-block';
  bearingBayRings.userData.visualRole = 'shell';
  bearingBayRings.userData.componentRole = 'bearing-bay-exterior';
  block.add(bearingBayRings);

  const freezePlugPoses: InstancePose[] = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      freezePlugPoses.push({
        position: [ENGINE_DIMENSIONS.cylinderX[i]!, 156, side * 109],
        rotation: [Math.PI / 2, 0, 0],
      });
    }
  }
  block.add(staticInstances(new CylinderGeometry(25, 25, 4, 24), materials.machinedSteel, freezePlugPoses));

  root.add(block);

  const head = markPart(new Group(), 'cylinder-head', 'shell', pickables);
  // The former one-piece rounded solid extended below its nominal 269 mm
  // chamber face because of bevel geometry and intersected every piston near
  // TDC. V4.1 separates the upper casting from a seven-member fire deck. The
  // deck preserves the 269 mm chamber face while leaving four real 88 mm bore
  // openings around the 84 mm piston crowns.
  const headCasting = prepareMesh(new Mesh(roundedBoxGeometry(525, 61, 224, 10, 3), materials.aluminum), true);
  headCasting.name = 'upper cylinder-head casting above combustion chambers';
  headCasting.position.y = 320.5;
  head.add(headCasting);
  const fireDeckPoses: InstancePose[] = [
    { position: [0, 277, 80], scale: [525, 16, 64] },
    { position: [0, 277, -80], scale: [525, 16, 64] },
  ];
  for (const x of [-100, 0, 100]) {
    fireDeckPoses.push({ position: [x, 277, 0], scale: [12, 16, 96] });
  }
  for (const x of [-236.5, 236.5]) {
    fireDeckPoses.push({ position: [x, 277, 0], scale: [61, 16, 96] });
  }
  const fireDeck = staticInstances(simpleBox(1, 1, 1), materials.aluminum, fireDeckPoses);
  fireDeck.name = 'four-chamber cylinder-head fire deck';
  fireDeck.userData.partId = 'cylinder-head';
  fireDeck.userData.visualRole = 'shell';
  fireDeck.userData.componentRole = 'combustion-chamber-deck';
  head.add(fireDeck);
  addRibbedCover(head, materials.blackAluminum, 390, 0);
  for (const side of [-1, 1]) {
    const rail = prepareMesh(new Mesh(roundedBoxGeometry(500, 13, 20, 5, 1), materials.aluminum));
    rail.position.set(0, 346, side * 105);
    head.add(rail);
  }
  const gasket = prepareMesh(new Mesh(simpleBox(525, 5, 222), materials.gasket), false, true);
  gasket.position.y = 274;
  head.add(gasket);
  root.add(head);

  const pan = markPart(new Group(), 'oil-pan', 'shell', pickables);
  // The sump flange is a perimeter frame, not a solid plate across the crank
  // bay. Its 184 x 483 mm opening clears the complete crank-web sweep while
  // retaining the same exterior bolt-rail dimensions and visual silhouette.
  const flangePoses: InstancePose[] = [
    { position: [0, -91, 98], scale: [505, 12, 11] },
    { position: [0, -91, -98], scale: [505, 12, 11] },
    { position: [247, -91, 0], scale: [11, 12, 185] },
    { position: [-247, -91, 0], scale: [11, 12, 185] },
  ];
  const flange = staticInstances(simpleBox(1, 1, 1), materials.darkCastIron, flangePoses);
  flange.name = 'open oil-pan perimeter flange';
  flange.userData.partId = 'oil-pan';
  flange.userData.visualRole = 'shell';
  flange.userData.componentRole = 'sump-flange-frame';
  pan.add(flange);
  const panBowl = prepareMesh(new Mesh(frustumBoxGeometry(475, 190, 362, 152, 104), materials.blackAluminum), true);
  panBowl.position.y = -145;
  pan.add(panBowl);
  const panBoltPoses: InstancePose[] = [];
  for (let x = -210; x <= 210; x += 35) panBoltPoses.push({ position: [x, -85, 96] });
  pan.add(staticInstances(new CylinderGeometry(4, 4, 8, 6), materials.machinedSteel, panBoltPoses));
  const drain = prepareMesh(new Mesh(new CylinderGeometry(8, 8, 8, 6), materials.machinedSteel));
  drain.rotation.x = Math.PI / 2;
  drain.position.set(122, -164, 78);
  pan.add(drain);
  root.add(pan);

  // A cutaway-style metallic sheen preserves the liner surface while keeping
  // piston crowns and rods readable in X-Ray/section modes.
  const linerMaterial = new MeshStandardMaterial({
    color: 0x78909a,
    metalness: 0.82,
    roughness: 0.28,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: DoubleSide,
  });
  linerMaterial.name = 'honed cylinder liner cutaway';
  linerMaterial.userData.visualRole = 'mechanism';
  context.materialModes.register(linerMaterial);
  const bigEndReliefBottomY = deriveLinerReliefBottomY({
    crankAxisY: ENGINE_DIMENSIONS.crankAxisY,
    crankRadiusMm: ENGINE_DIMENSIONS.crankRadius,
    connectingRodLengthMm: ENGINE_DIMENSIONS.rodLength,
    bigEndEnvelopeRadiusMm: 36,
    linerInnerRadiusMm: 44,
    radialClearanceMm: 4,
    axialSafetyMm: 1,
  });
  // Measure the actual programmatic crank-web vertices, including the -8 mm
  // web carrier offset, rather than assuming the big-end circle is the widest
  // rotating member. The resulting 84.413 mm sweep drives the lower register
  // through an analytic annulus-clearance constraint.
  const crankWebProbe = crankWebGeometry();
  const crankWebPositions = crankWebProbe.getAttribute('position');
  let crankWebSweptRadiusMm = 0;
  let crankWebAxialExtentMm = 0;
  for (let index = 0; index < crankWebPositions.count; index += 1) {
    crankWebSweptRadiusMm = Math.max(
      crankWebSweptRadiusMm,
      Math.hypot(crankWebPositions.getY(index) - 8, crankWebPositions.getZ(index)),
    );
    crankWebAxialExtentMm = Math.max(
      crankWebAxialExtentMm,
      31 + Math.abs(crankWebPositions.getX(index)),
    );
  }
  crankWebProbe.dispose();
  const crankWebRegisterY = deriveAnnularRegisterCenterY({
    crankAxisY: ENGINE_DIMENSIONS.crankAxisY,
    sweptRadiusMm: crankWebSweptRadiusMm,
    sweptAxialExtentMm: crankWebAxialExtentMm,
    registerMajorRadiusMm: 46,
    registerTubeRadiusMm: 2,
    radialClearanceMm: 4,
  });
  const linerBottomY = Math.max(bigEndReliefBottomY, crankWebRegisterY);
  const linerTopY = 271;
  const linerHeight = linerTopY - linerBottomY;
  block.userData.linerReliefBottomY = linerBottomY;
  block.userData.linerRadialClearanceMm = 4;
  block.userData.crankWebSweptRadiusMm = crankWebSweptRadiusMm;
  block.userData.crankWebAxialExtentMm = crankWebAxialExtentMm;
  block.userData.crankWebRegisterY = crankWebRegisterY;

  // Four honed liners remain distinct in X-Ray/section views.  Their lower
  // relief is the stricter of the full 720° big-end envelope and the actual
  // crank-web three-dimensional annular clearance (87 mm here), not an
  // arbitrary visual trim. The full X reach of both offset web plates is part
  // of the constraint; the piston ring pack remains well inside the liner.
  ENGINE_DIMENSIONS.cylinderX.forEach((x, index) => {
    const liner = prepareMesh(new Mesh(
      new CylinderGeometry(44, 44, linerHeight, 40, 1, true),
      linerMaterial,
    ));
    liner.name = `cylinder ${index + 1} honed open liner`;
    liner.position.set(x, linerBottomY + linerHeight / 2, 0);
    liner.userData.partId = `engine-block`;
    liner.userData.cylinder = index + 1;
    liner.userData.visualRole = 'mechanism';
    liner.userData.componentRole = 'cylinder-liner';
    liner.userData.geometryIntent = 'open liner with swept-envelope lower relief';
    root.add(liner);

  });
  const lowerRegisters = staticInstances(
    new TorusGeometry(46, 2, 8, 40),
    materials.machinedSteel,
    ENGINE_DIMENSIONS.cylinderX.map((x) => ({
      position: [x, linerBottomY, 0],
      rotation: [Math.PI / 2, 0, 0],
    })),
  );
  lowerRegisters.name = 'four lower liner registers';
  lowerRegisters.userData.partId = 'engine-block';
  lowerRegisters.userData.visualRole = 'mechanism';
  lowerRegisters.userData.componentRole = 'liner-lower-register';
  root.add(lowerRegisters);
}

function buildPiston(
  context: BuildContext,
  cylinderIndex: number,
): { piston: Group; pin: Mesh } {
  const { root, materials, pickables } = context;
  const id = cylinderIndex + 1;
  const piston = markPart(new Group(), `piston-${id}`, 'mechanism', pickables);
  piston.userData.cylinder = id;
  piston.position.x = ENGINE_DIMENSIONS.cylinderX[cylinderIndex]!;

  // Keep the wrist-pin kinematics untouched while matching the modeled deck:
  // at TDC the crown now stops about 5.5 mm below the head face instead of 26 mm.
  const skirt = prepareMesh(new Mesh(new CylinderGeometry(41.7, 40.5, 76, 40), materials.pistonAluminum));
  skirt.position.y = 17;
  piston.add(skirt);
  const crown = prepareMesh(new Mesh(new CylinderGeometry(42, 42, 14, 40), materials.pistonAluminum));
  crown.position.y = ENGINE_DIMENSIONS.pistonCompressionHeight - 7;
  piston.add(crown);

  // A dark shallow insert reads as the re-entrant diesel combustion bowl without costly boolean geometry.
  const bowl = prepareMesh(new Mesh(new CylinderGeometry(23, 17, 3, 32), materials.darkCastIron), false, true);
  bowl.position.y = ENGINE_DIMENSIONS.pistonCompressionHeight + 0.2;
  piston.add(bowl);

  for (let ringIndex = 0; ringIndex < 3; ringIndex += 1) {
    const ring = prepareMesh(new Mesh(new TorusGeometry(42.3, ringIndex === 2 ? 1.7 : 1.3, 8, 40), materials.polishedSteel));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 54 - ringIndex * 7;
    ring.userData.partId = `piston-${id}`;
    ring.userData.visualRole = 'mechanism';
    piston.add(ring);
  }

  const pin = prepareMesh(new Mesh(cylinderAlongX(10, 72, 28), materials.polishedSteel));
  markPart(pin, `wrist-pin-${id}`, 'mechanism', pickables);
  piston.add(pin);

  const pinBoreA = prepareMesh(new Mesh(new TorusGeometry(13, 3.2, 8, 24), materials.machinedSteel));
  pinBoreA.rotation.y = Math.PI / 2;
  pinBoreA.position.x = -36;
  piston.add(pinBoreA);
  const pinBoreB = pinBoreA.clone();
  pinBoreB.position.x = 36;
  piston.add(pinBoreB);
  root.add(piston);
  return { piston, pin };
}

function buildConnectingRod(context: BuildContext, cylinderIndex: number): Group {
  const { root, materials, pickables } = context;
  const id = cylinderIndex + 1;
  const rod = markPart(new Group(), `connecting-rod-${id}`, 'mechanism', pickables);
  rod.position.x = ENGINE_DIMENSIONS.cylinderX[cylinderIndex]!;

  const beam = prepareMesh(new Mesh(roundedBoxGeometry(22, ENGINE_DIMENSIONS.rodLength - 44, 13, 5, 2), materials.machinedSteel));
  beam.position.y = ENGINE_DIMENSIONS.rodLength / 2;
  beam.name = 'forged I-beam shank';
  // Dark inset gives the shank an I-beam reading while keeping geometry inexpensive.
  const inset = prepareMesh(new Mesh(roundedBoxGeometry(13, ENGINE_DIMENSIONS.rodLength - 56, 14, 3, 1), materials.darkCastIron));
  inset.position.y = ENGINE_DIMENSIONS.rodLength / 2;
  inset.position.z = 1;
  rod.add(beam, inset);

  const bigEnd = prepareMesh(new Mesh(new TorusGeometry(28, 8, 10, 32), materials.machinedSteel));
  bigEnd.rotation.y = Math.PI / 2;
  rod.add(bigEnd);
  const smallEnd = prepareMesh(new Mesh(new TorusGeometry(15, 5, 8, 28), materials.machinedSteel));
  smallEnd.rotation.y = Math.PI / 2;
  smallEnd.position.y = ENGINE_DIMENSIONS.rodLength;
  rod.add(smallEnd);
  const capLine = prepareMesh(new Mesh(simpleBox(10, 2.2, 62), materials.darkCastIron));
  capLine.position.y = -1;
  rod.add(capLine);
  root.add(rod);
  return rod;
}

function crankWebGeometry(): BufferGeometry {
  const shape = new Shape();
  shape.moveTo(-42, 57);
  shape.quadraticCurveTo(0, 72, 42, 57);
  shape.lineTo(52, 3);
  shape.quadraticCurveTo(50, -57, 0, -84);
  shape.quadraticCurveTo(-50, -57, -52, 3);
  shape.closePath();
  const geometry = new ExtrudeGeometry(shape, {
    depth: 13,
    bevelEnabled: true,
    bevelThickness: 3,
    bevelSize: 2,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geometry.center();
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function buildCranktrain(context: BuildContext): {
  crankshaft: Group;
  flywheel: Group;
} {
  const { root, materials, pickables } = context;
  const crankshaft = markPart(new Group(), 'crankshaft', 'mechanism', pickables);
  const webGeometry = crankWebGeometry();

  for (let station = -2; station <= 2; station += 1) {
    const mainJournal = prepareMesh(new Mesh(cylinderAlongX(23, 53, 32), materials.polishedSteel));
    mainJournal.position.x = station * 115;
    crankshaft.add(mainJournal);
    const cheek = prepareMesh(new Mesh(new CylinderGeometry(34, 34, 9, 28), materials.darkCastIron));
    cheek.rotation.z = Math.PI / 2;
    cheek.position.x = station * 115;
    crankshaft.add(cheek);
  }

  ENGINE_DIMENSIONS.cylinderX.forEach((x, index) => {
    const throwGroup = new Group();
    throwGroup.rotation.x = THROW_PHASES[index]!;
    const pin = prepareMesh(new Mesh(cylinderAlongX(22, 66, 32), materials.polishedSteel));
    pin.position.set(x, ENGINE_DIMENSIONS.crankRadius, 0);
    throwGroup.add(pin);
    for (const xOffset of [-31, 31]) {
      const web = prepareMesh(new Mesh(webGeometry, materials.darkCastIron));
      web.position.set(x + xOffset, -8, 0);
      web.userData.partId = 'crankshaft';
      web.userData.visualRole = 'mechanism';
      throwGroup.add(web);
    }
    crankshaft.add(throwGroup);
  });

  const nose = prepareMesh(new Mesh(cylinderAlongX(18, 88, 28), materials.polishedSteel));
  nose.position.x = -302;
  crankshaft.add(nose);
  const damper = prepareMesh(new Mesh(new CylinderGeometry(62, 62, 28, 40), materials.rubber));
  damper.rotation.z = Math.PI / 2;
  damper.position.x = -339;
  crankshaft.add(damper);

  const flywheel = markPart(new Group(), 'flywheel', 'mechanism', pickables);
  flywheel.position.x = 302;
  const flywheelDisc = prepareMesh(new Mesh(new CylinderGeometry(102, 102, 31, 48), materials.darkCastIron));
  flywheelDisc.rotation.z = Math.PI / 2;
  flywheel.add(flywheelDisc);
  const frictionFace = prepareMesh(new Mesh(new TorusGeometry(76, 17, 10, 48), materials.machinedSteel));
  frictionFace.rotation.y = Math.PI / 2;
  frictionFace.position.x = 17;
  flywheel.add(frictionFace);
  const toothPoses: InstancePose[] = [];
  for (let i = 0; i < 40; i += 1) {
    const angle = (i / 40) * Math.PI * 2;
    toothPoses.push({
      position: [0, Math.cos(angle) * 105, Math.sin(angle) * 105],
      rotation: [angle, 0, 0],
    });
  }
  flywheel.add(staticInstances(simpleBox(22, 7, 8), materials.machinedSteel, toothPoses));
  crankshaft.add(flywheel);
  root.add(crankshaft);
  return { crankshaft, flywheel };
}

function springGeometry(radius: number, height: number): TubeGeometry {
  const turns = 8;
  const points: Vector3[] = [];
  for (let i = 0; i <= 64; i += 1) {
    const t = i / 64;
    const angle = t * turns * Math.PI * 2;
    points.push(new Vector3(Math.cos(angle) * radius, t * height, Math.sin(angle) * radius));
  }
  return new TubeGeometry(new CatmullRomCurve3(points), 80, 1.7, 6, false);
}

function buildValvePair(
  context: BuildContext,
  cylinderIndex: number,
  kind: 'intake' | 'exhaust',
): { valves: Group; springs: Mesh[] } {
  const { root, materials, pickables } = context;
  const id = cylinderIndex + 1;
  const partId = `${kind}-valve-${id}`;
  const z = kind === 'intake' ? -36 : 36;
  const valves = markPart(new Group(), partId, 'mechanism', pickables);
  valves.position.set(
    ENGINE_DIMENSIONS.cylinderX[cylinderIndex]!,
    VALVETRAIN_DIMENSIONS.closedValveGroupY,
    z,
  );
  const springs: Mesh[] = [];
  for (const xOffset of [-16, 16]) {
    const valve = new Group();
    valve.position.x = xOffset;
    const stem = prepareMesh(new Mesh(new CylinderGeometry(3.2, 3.2, 72, 14), materials.polishedSteel));
    stem.position.y = 36;
    const head = prepareMesh(new Mesh(new CylinderGeometry(
      kind === 'intake' ? 15 : 13,
      9,
      VALVETRAIN_DIMENSIONS.valveHeadHeight,
      28,
    ), materials.polishedSteel));
    head.position.y = 0;
    valve.add(stem, head);
    valves.add(valve);

    // Spring foot is the fixed head seat; the retainer end follows the valve.
    const spring = prepareMesh(new Mesh(
      springGeometry(9.5, VALVETRAIN_DIMENSIONS.springFreeHeight),
      materials.machinedSteel,
    ));
    spring.position.set(xOffset, VALVETRAIN_DIMENSIONS.springSeatLocalY, 0);
    spring.userData.partId = `valve-spring-${id}`;
    spring.userData.visualRole = 'mechanism';
    springs.push(spring);
    valves.add(spring);

    // Direct-acting bucket follower makes the cam-to-valve load path explicit.
    const bucket = prepareMesh(new Mesh(new CylinderGeometry(12, 12, 6, 24), materials.darkCastIron));
    bucket.position.set(xOffset, 75, 0);
    bucket.userData.partId = partId;
    bucket.userData.visualRole = 'mechanism';
    valves.add(bucket);
  }
  root.add(valves);
  return { valves, springs };
}

function buildCamshafts(context: BuildContext): Group {
  const { root, materials, pickables } = context;
  const assembly = markPart(new Group(), 'camshaft', 'mechanism', pickables);
  for (const [shaftIndex, z] of [-36, 36].entries()) {
    const kind = shaftIndex === 0 ? 'intake' : 'exhaust';
    const event = kind === 'intake' ? ENGINE_SPEC.intakeValve : ENGINE_SPEC.exhaustValve;
    const eventDuration = ((event.closeDeg - event.openDeg) % 720 + 720) % 720;
    const shaft = new Group();
    shaft.position.set(0, VALVETRAIN_DIMENSIONS.camshaftAxisY, z);
    const core = prepareMesh(new Mesh(cylinderAlongX(11, 520, 28), materials.darkCastIron));
    shaft.add(core);
    const lobePoses: InstancePose[] = [];
    ENGINE_DIMENSIONS.cylinderX.forEach((x, cylinderIndex) => {
      // Parent cam angle is crank/2. The local phase puts the non-circular lobe
      // nose downward over its bucket at the event's maximum lift.
      const carrierPhase = getCamLobePhase(
        cylinderIndex + 1 as 1 | 2 | 3 | 4,
        kind,
      );
      for (const xOffset of [-16, 16]) {
        lobePoses.push({
          position: [x + xOffset, 0, 0],
          rotation: [carrierPhase, 0, 0],
        });
      }
    });
    const lobeGeometry = directActingCamGeometry({
      widthMm: VALVETRAIN_DIMENSIONS.camLobeWidth,
      baseRadiusMm: VALVETRAIN_DIMENSIONS.camBaseRadius,
      maxLiftMm: event.maxLiftMm,
      eventDurationCrankDeg: eventDuration,
    });
    const lobes = staticInstances(lobeGeometry, materials.machinedSteel, lobePoses);
    lobes.name = `${kind} direct-acting cam lobes`;
    lobes.userData.partId = 'camshaft';
    lobes.userData.visualRole = 'mechanism';
    shaft.add(lobes);

    const bearingPoses: InstancePose[] = [];
    for (let x = -230; x <= 230; x += 115) {
      bearingPoses.push({ position: [x, 0, 0], rotation: [0, Math.PI / 2, 0] });
    }
    shaft.add(staticInstances(new TorusGeometry(14, 4, 8, 24), materials.polishedSteel, bearingPoses));
    assembly.add(shaft);
  }
  root.add(assembly);
  return assembly;
}

function buildFuelSystem(
  context: BuildContext,
): { injectorPlumes: Mesh[] } {
  const { root, materials, pickables } = context;
  const railGroup = markPart(new Group(), 'injector', 'detail', pickables);
  const rail = prepareMesh(new Mesh(cylinderAlongX(9, 505, 24), materials.polishedSteel));
  rail.position.set(0, 438, -82);
  railGroup.add(rail);
  const injectorPlumes: Mesh[] = [];
  ENGINE_DIMENSIONS.cylinderX.forEach((x, index) => {
    const injector = markPart(new Group(), `injector-${index + 1}`, 'detail', pickables);
    injector.position.set(x, 343, 0);
    const solenoid = prepareMesh(new Mesh(new CylinderGeometry(13, 13, 26, 20), materials.blackAluminum));
    solenoid.position.y = 26;
    const body = prepareMesh(new Mesh(new CylinderGeometry(7, 5, 54, 18), materials.machinedSteel));
    body.position.y = -12;
    const ceramicRing = prepareMesh(new Mesh(new TorusGeometry(8, 2.5, 7, 20), materials.ceramic));
    ceramicRing.rotation.x = Math.PI / 2;
    ceramicRing.position.y = 11;
    injector.add(solenoid, body, ceramicRing);
    root.add(injector);

    const line = prepareMesh(new Mesh(tubeBetween([
      new Vector3(x, 428, -82),
      new Vector3(x, 404, -46),
      new Vector3(x, 369, 0),
    ], 2.2, 18, 7), materials.copper));
    line.userData.partId = `injector-${index + 1}`;
    railGroup.add(line);

    // Opacity is animated per cylinder, so each cone needs independent state.
    const plumeMaterial = materials.fuel.clone();
    plumeMaterial.name = `diesel injection plume cylinder ${index + 1}`;
    plumeMaterial.userData.visualRole = 'fluid';
    context.materialModes.register(plumeMaterial);
    const plume = prepareMesh(new Mesh(new ConeGeometry(22, 40, 20, 1, true), plumeMaterial), false, false);
    plume.position.set(x, 285, 0);
    plume.rotation.z = Math.PI;
    plume.visible = false;
    plume.userData.partId = `injector-${index + 1}`;
    injectorPlumes.push(plume);
    root.add(plume);
  });
  root.add(railGroup);
  return { injectorPlumes };
}

function buildManifolds(context: BuildContext): { turboRotor: Group } {
  const { root, materials, pickables } = context;
  const intake = markPart(new Group(), 'intake-manifold', 'detail', pickables);
  const plenum = prepareMesh(new Mesh(roundedBoxGeometry(438, 60, 72, 18, 3), materials.intake), true);
  plenum.position.set(0, 276, -185);
  intake.add(plenum);
  ENGINE_DIMENSIONS.cylinderX.forEach((x) => {
    const runner = prepareMesh(new Mesh(tubeBetween([
      new Vector3(x, 276, -161),
      new Vector3(x, 260, -130),
      new Vector3(x, 302, -99),
    ], 13, 24, 10), materials.intake));
    intake.add(runner);
  });
  const throttle = prepareMesh(new Mesh(new CylinderGeometry(39, 39, 45, 32), materials.aluminum));
  throttle.rotation.z = Math.PI / 2;
  throttle.position.set(-245, 275, -185);
  intake.add(throttle);
  root.add(intake);

  const exhaust = markPart(new Group(), 'exhaust-manifold', 'hot', pickables);
  const collector = new Vector3(106, 230, 190);
  ENGINE_DIMENSIONS.cylinderX.forEach((x, index) => {
    const mergeX = 40 + index * 34;
    const runner = prepareMesh(new Mesh(tubeBetween([
      new Vector3(x, 302, 105),
      new Vector3(x, 274, 146),
      new Vector3(mergeX, 252, 175),
      collector,
    ], 13, 32, 10), materials.exhaust));
    exhaust.add(runner);
  });
  root.add(exhaust);

  const turbo = markPart(new Group(), 'turbocharger', 'hot', pickables);
  turbo.position.set(145, 226, 215);
  const turbineHousing = prepareMesh(new Mesh(new TorusGeometry(55, 22, 14, 42), materials.turboHot), true);
  turbineHousing.rotation.y = Math.PI / 2;
  turbineHousing.position.x = 25;
  turbo.add(turbineHousing);
  const compressorHousing = prepareMesh(new Mesh(new TorusGeometry(50, 18, 14, 42), materials.aluminum));
  compressorHousing.rotation.y = Math.PI / 2;
  compressorHousing.position.x = -43;
  turbo.add(compressorHousing);
  const centerHousing = prepareMesh(new Mesh(new CylinderGeometry(26, 26, 58, 28), materials.darkCastIron));
  centerHousing.rotation.z = Math.PI / 2;
  centerHousing.position.x = -8;
  turbo.add(centerHousing);

  const turboRotor = new Group();
  const shaft = prepareMesh(new Mesh(cylinderAlongX(5, 96, 16), materials.polishedSteel));
  turboRotor.add(shaft);
  for (const x of [-48, 31]) {
    const bladePoses: InstancePose[] = [];
    for (let bladeIndex = 0; bladeIndex < 12; bladeIndex += 1) {
      const angle = (bladeIndex / 12) * Math.PI * 2;
      bladePoses.push({
        position: [x, Math.cos(angle) * 21, Math.sin(angle) * 21],
        rotation: [angle + 0.42, 0, 0],
      });
    }
    turboRotor.add(staticInstances(
      simpleBox(4, 27, 9),
      x < 0 ? materials.aluminum : materials.machinedSteel,
      bladePoses,
    ));
  }
  turbo.add(turboRotor);
  root.add(turbo);

  const intakePipe = prepareMesh(new Mesh(tubeBetween([
    new Vector3(97, 226, 215),
    new Vector3(30, 250, 243),
    new Vector3(-170, 277, 236),
    new Vector3(-245, 275, -185),
  ], 25, 50, 12), materials.intake));
  intakePipe.userData.partId = 'intake-manifold';
  root.add(intakePipe);
  const downpipe = prepareMesh(new Mesh(tubeBetween([
    new Vector3(176, 226, 270),
    new Vector3(255, 195, 287),
    new Vector3(302, 90, 280),
  ], 29, 28, 12), materials.exhaust));
  downpipe.userData.partId = 'exhaust-manifold';
  root.add(downpipe);

  return { turboRotor };
}

function buildTimingDrive(
  context: BuildContext,
  crankshaft: Group,
  camshaft: Group,
): void {
  const { root, materials } = context;

  const addSprocket = (
    parent: Object3D,
    x: number,
    radius: number,
    teeth: number,
    partId: string,
  ): void => {
    const sprocket = new Group();
    sprocket.position.x = x;
    sprocket.userData.partId = partId;
    sprocket.userData.visualRole = 'mechanism';
    const disc = prepareMesh(new Mesh(new CylinderGeometry(radius - 4, radius - 4, 10, 36), materials.darkCastIron));
    disc.rotation.z = Math.PI / 2;
    sprocket.add(disc);
    const toothPoses: InstancePose[] = [];
    for (let index = 0; index < teeth; index += 1) {
      const angle = index / teeth * Math.PI * 2;
      toothPoses.push({
        position: [0, Math.cos(angle) * radius, Math.sin(angle) * radius],
        rotation: [angle, 0, 0],
      });
    }
    sprocket.add(staticInstances(simpleBox(11, 5.5, 6.5), materials.machinedSteel, toothPoses));
    parent.add(sprocket);
  };

  // Radius and tooth-count ratios both show the crank-to-cam 2:1 relationship.
  addSprocket(crankshaft, -287, 17, 18, 'crankshaft');
  camshaft.children.forEach((shaft) => addSprocket(shaft, -287, 34, 36, 'camshaft'));

  const chainPoints = [
    new Vector3(-297, 0, 18),
    new Vector3(-297, 318, 69),
    new Vector3(-297, VALVETRAIN_DIMENSIONS.camshaftAxisY, 70),
    new Vector3(-297, VALVETRAIN_DIMENSIONS.camshaftAxisY + 34, 36),
    new Vector3(-297, VALVETRAIN_DIMENSIONS.camshaftAxisY + 34, -36),
    new Vector3(-297, VALVETRAIN_DIMENSIONS.camshaftAxisY, -70),
    new Vector3(-297, 318, -69),
    new Vector3(-297, 0, -18),
    new Vector3(-297, -18, 0),
  ];
  const chain = prepareMesh(new Mesh(
    new TubeGeometry(new CatmullRomCurve3(chainPoints, true, 'catmullrom', 0.08), 128, 2.5, 6, true),
    materials.machinedSteel,
  ));
  chain.name = '2-to-1 timing chain';
  chain.userData.partId = 'camshaft';
  chain.userData.visualRole = 'mechanism';
  root.add(chain);
}

function buildAncillaries(
  context: BuildContext,
  crankshaft: Group,
): { fanHub: Group; waterPumpPulley: Group } {
  const { root, materials } = context;
  // The crank pulley shares the crankshaft axis; the water-pump/fan pulley is
  // coplanar so the continuous belt has a mechanically legible load path.
  const crankPulley = prepareMesh(new Mesh(new CylinderGeometry(52, 52, 25, 36), materials.blackAluminum));
  crankPulley.rotation.z = Math.PI / 2;
  crankPulley.position.set(-343, 0, 0);
  crankPulley.userData.partId = 'crankshaft';
  crankshaft.add(crankPulley);

  const waterPumpHousing = prepareMesh(new Mesh(new CylinderGeometry(43, 43, 35, 28), materials.aluminum));
  waterPumpHousing.rotation.z = Math.PI / 2;
  waterPumpHousing.position.set(-282, 160, 0);
  waterPumpHousing.userData.partId = 'cooling-system';
  root.add(waterPumpHousing);

  const waterPumpPulley = new Group();
  waterPumpPulley.position.set(-343, 160, 0);
  waterPumpPulley.userData.partId = 'cooling-system';
  waterPumpPulley.userData.visualRole = 'detail';
  const pumpPulleyDisc = prepareMesh(new Mesh(new CylinderGeometry(42, 42, 22, 36), materials.blackAluminum));
  pumpPulleyDisc.rotation.z = Math.PI / 2;
  const pumpPulleyGroove = prepareMesh(new Mesh(new TorusGeometry(42, 3.2, 8, 40), materials.rubber));
  pumpPulleyGroove.rotation.y = Math.PI / 2;
  waterPumpPulley.add(pumpPulleyDisc, pumpPulleyGroove);
  root.add(waterPumpPulley);

  const fanHub = new Group();
  fanHub.position.set(-376, 160, 0);
  fanHub.userData.partId = 'cooling-system';
  fanHub.userData.visualRole = 'detail';
  const fanBoss = prepareMesh(new Mesh(new CylinderGeometry(13, 13, 24, 24), materials.machinedSteel));
  fanBoss.rotation.z = Math.PI / 2;
  fanHub.add(fanBoss);
  const bladePoses: InstancePose[] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    bladePoses.push({
      position: [0, Math.cos(angle) * 57, Math.sin(angle) * 57],
      rotation: [angle - 0.28, 0, 0],
    });
  }
  fanHub.add(staticInstances(roundedBoxGeometry(8, 72, 25, 4, 1), materials.blackAluminum, bladePoses));
  root.add(fanHub);

  const accessoryBelt = prepareMesh(new Mesh(twoPulleyBeltGeometry({
    xMm: -357,
    lowerYmm: 0,
    upperYmm: 160,
    lowerRadiusMm: 55,
    upperRadiusMm: 45,
    beltRadiusMm: 3.8,
  }), materials.rubber));
  accessoryBelt.name = 'crank-to-water-pump accessory belt';
  accessoryBelt.userData.partId = 'cooling-system';
  accessoryBelt.userData.visualRole = 'detail';
  root.add(accessoryBelt);

  const filterGroup = markPart(new Group(), 'oil-system', 'detail');
  const filter = prepareMesh(new Mesh(new CylinderGeometry(31, 31, 74, 32), materials.blackAluminum));
  filter.position.set(-220, 135, -145);
  filter.userData.partId = 'oil-system';
  filterGroup.add(filter);
  const filterRibPoses: InstancePose[] = [];
  for (let y = 108; y <= 162; y += 9) {
    filterRibPoses.push({ position: [-220, y, -145], rotation: [Math.PI / 2, 0, 0] });
  }
  filterGroup.add(staticInstances(new TorusGeometry(31.5, 1.4, 5, 28), materials.machinedSteel, filterRibPoses));
  root.add(filterGroup);

  return { fanHub, waterPumpPulley };
}

function buildFluidEffects(
  context: BuildContext,
): {
  flows: Group;
  oilFlows: FlowPath[];
  coolantFlows: FlowPath[];
  intakeTrunk: FlowPath;
  intakeBranches: FlowPath[];
  exhaustPulses: ExhaustPulseField;
} {
  const flows = new Group();
  flows.name = 'animated-flow-effects';
  const oilFlows: FlowPath[] = [];
  const oilTrunk = new FlowPath({
    id: 'oil-system',
    points: [
      new Vector3(-210, -143, -40),
      new Vector3(-220, 105, -145),
      new Vector3(-200, 18, -40),
      new Vector3(220, 18, -40),
      new Vector3(215, 340, -28),
      new Vector3(-180, 340, -28),
      new Vector3(-176, 78, 52),
      new Vector3(-195, -105, 42),
    ],
    color: 0xf5a623,
    tubeColor: 0x8e5b08,
    radius: 3.2,
    particles: 42,
    speed: 0.075,
    opacity: 0.38,
    closed: true,
  }, context.materialModes);
  oilFlows.push(oilTrunk);
  flows.add(oilTrunk.root);
  ENGINE_DIMENSIONS.cylinderX.forEach((x) => {
    const branch = new FlowPath({
      id: 'oil-system',
      points: [
        new Vector3(x, 18, -40),
        new Vector3(x, 4, -12),
        new Vector3(x, 0, 0),
        new Vector3(x, 72, 8),
        new Vector3(x, 135, 16),
      ],
      color: 0xffc548,
      tubeColor: 0x8e5b08,
      radius: 1.9,
      particles: 10,
      speed: 0.095,
      opacity: 0.3,
      closed: false,
    }, context.materialModes);
    oilFlows.push(branch);
    flows.add(branch.root);
  });

  const coolantFlows: FlowPath[] = [];
  const coolantTrunk = new FlowPath({
    id: 'cooling-system',
    points: [
      new Vector3(-282, 160, 0),
      new Vector3(-232, 78, -72),
      new Vector3(232, 78, -72),
      new Vector3(232, 322, 72),
      new Vector3(-218, 322, 72),
      new Vector3(-250, 205, 48),
    ],
    color: 0x2be7ee,
    tubeColor: 0x126d76,
    radius: 4.2,
    particles: 44,
    speed: 0.055,
    emissive: true,
    opacity: 0.4,
    closed: true,
  }, context.materialModes);
  coolantFlows.push(coolantTrunk);
  flows.add(coolantTrunk.root);
  ENGINE_DIMENSIONS.cylinderX.forEach((x) => {
    const branch = new FlowPath({
      id: 'cooling-system',
      points: [
        new Vector3(x, 78, -72),
        new Vector3(x, 150, -80),
        new Vector3(x, 250, -68),
        new Vector3(x, 315, 68),
      ],
      color: 0x62f3f4,
      tubeColor: 0x126d76,
      radius: 2.5,
      particles: 12,
      speed: 0.07,
      emissive: true,
      opacity: 0.32,
      closed: false,
    }, context.materialModes);
    coolantFlows.push(branch);
    flows.add(branch.root);
  });

  const intakeTrunk = new FlowPath({
    id: 'intake-manifold',
    points: [
      new Vector3(97, 226, 215),
      new Vector3(30, 250, 243),
      new Vector3(-170, 277, 236),
      new Vector3(-245, 275, -185),
      new Vector3(0, 276, -185),
      new Vector3(220, 276, -185),
    ],
    color: 0x70ddff,
    tubeColor: 0x184a5f,
    radius: 3,
    particles: 36,
    speed: 0.1,
    emissive: true,
    opacity: 0.36,
    closed: false,
  }, context.materialModes);
  flows.add(intakeTrunk.root);

  const intakeBranches = ENGINE_DIMENSIONS.cylinderX.map((x) => {
    const branch = new FlowPath({
      id: 'intake-manifold',
      points: [
        new Vector3(x, 276, -185),
        new Vector3(x, 260, -130),
        new Vector3(x, 302, -99),
        new Vector3(x, 286, -44),
      ],
      color: 0x8de9ff,
      tubeColor: 0x184a5f,
      radius: 2.2,
      particles: 12,
      pointSize: 0.095,
      speed: 0.13,
      emissive: true,
      opacity: 0.32,
      minimumActivity: 0,
      closed: false,
    }, context.materialModes);
    flows.add(branch.root);
    return branch;
  });

  const exhaustPaths = ENGINE_DIMENSIONS.cylinderX.map((x, index) => [
    new Vector3(x, 302, 105),
    new Vector3(x, 274, 146),
    new Vector3(40 + index * 34, 252, 175),
    new Vector3(106, 230, 190),
    new Vector3(145, 226, 215),
    new Vector3(176, 226, 270),
    new Vector3(255, 195, 287),
    new Vector3(302, 90, 280),
  ]);
  const exhaustPulses = new ExhaustPulseField(exhaustPaths, context.materialModes);
  flows.add(exhaustPulses.root);
  context.root.add(flows);
  return { flows, oilFlows, coolantFlows, intakeTrunk, intakeBranches, exhaustPulses };
}

function buildCombustionGlow(context: BuildContext, cylinderIndex: number): Mesh {
  // Heat-release opacity is also per cylinder; sharing one material made the
  // final cylinder overwrite all four combustion chambers each frame.
  const glowMaterial = context.materials.combustion.clone();
  glowMaterial.name = `combustion glow cylinder ${cylinderIndex + 1}`;
  glowMaterial.userData.visualRole = 'fluid';
  context.materialModes.register(glowMaterial);
  const glow = prepareMesh(new Mesh(new SphereGeometry(30, 20, 14), glowMaterial), false, false);
  glow.scale.set(1, 0.18, 1);
  const pistonCrownAtTdc = ENGINE_DIMENSIONS.rodLength
    + ENGINE_DIMENSIONS.crankRadius
    + ENGINE_DIMENSIONS.pistonCompressionHeight;
  glow.position.set(
    ENGINE_DIMENSIONS.cylinderX[cylinderIndex]!,
    (pistonCrownAtTdc + ENGINE_DIMENSIONS.headFaceY) / 2,
    0,
  );
  glow.userData.partId = `piston-${cylinderIndex + 1}`;
  glow.renderOrder = 4;
  context.root.add(glow);
  return glow;
}

export function createEngineAssembly(): EngineAssembly {
  const root = new Group();
  root.name = 'procedural-inline-four-diesel';
  root.scale.setScalar(WORLD_SCALE);
  const materials = createEngineMaterials();
  const materialModes = new MaterialModeController();
  materialModes.registerLibrary(materials);
  const pickables: Object3D[] = [];
  const context: BuildContext = { root, materials, materialModes, pickables };

  buildStructuralShell(context);
  const crank = buildCranktrain(context);
  const camshaft = buildCamshafts(context);
  const fuel = buildFuelSystem(context);
  const manifold = buildManifolds(context);
  const ancillaries = buildAncillaries(context, crank.crankshaft);
  buildTimingDrive(context, crank.crankshaft, camshaft);
  const effects = buildFluidEffects(context);

  const cylinders: CylinderBinding[] = ENGINE_DIMENSIONS.cylinderX.map((_, index) => {
    const piston = buildPiston(context, index);
    const connectingRod = buildConnectingRod(context, index);
    const intake = buildValvePair(context, index, 'intake');
    const exhaust = buildValvePair(context, index, 'exhaust');
    return {
      piston: piston.piston,
      pistonPin: piston.pin,
      connectingRod,
      intakeValve: intake.valves,
      exhaustValve: exhaust.valves,
      intakeSprings: intake.springs,
      exhaustSprings: exhaust.springs,
      combustion: buildCombustionGlow(context, index),
      injectorPlume: fuel.injectorPlumes[index]!,
    };
  });

  const wristScratch = new Vector3();
  const bigEndScratch = new Vector3();
  const rodDirectionScratch = new Vector3();

  const highlightMaterial = new LineBasicMaterial({
    color: 0x62e6ff,
    transparent: true,
    opacity: 0.88,
    depthTest: true,
    depthWrite: false,
  });
  highlightMaterial.name = 'selected part fitted edge outline';
  highlightMaterial.userData.visualRole = 'mechanism';
  materialModes.register(highlightMaterial);
  const highlightLines: LineSegments[] = [];

  // Store the assembled positions once so exploded mode never accumulates offsets.
  root.traverse((object) => {
    object.userData.assembledPosition = object.position.clone();
  });

  let turboSpool = 0;

  function update(snapshot: SceneSimulationSnapshot, deltaSeconds: number): void {
    crank.crankshaft.rotation.x = snapshot.crankAngle;
    camshaft.children.forEach((shaft) => {
      shaft.rotation.x = snapshot.crankAngle * 0.5;
    });
    const accessoryAngle = snapshot.crankAngle * (52 / 42);
    ancillaries.waterPumpPulley.rotation.x = accessoryAngle;
    ancillaries.fanHub.rotation.x = accessoryAngle;

    cylinders.forEach((binding, index) => {
      const state = snapshot.cylinders[index];
      if (!state) return;
      binding.piston.position.y = state.pistonY;

      const throwAngle = snapshot.crankAngle + THROW_PHASES[index]!;
      const crankY = ENGINE_DIMENSIONS.crankAxisY + Math.cos(throwAngle) * ENGINE_DIMENSIONS.crankRadius;
      const crankZ = Math.sin(throwAngle) * ENGINE_DIMENSIONS.crankRadius;
      wristScratch.set(ENGINE_DIMENSIONS.cylinderX[index]!, state.pistonY, 0);
      bigEndScratch.set(ENGINE_DIMENSIONS.cylinderX[index]!, crankY, crankZ);
      rodDirectionScratch.copy(wristScratch).sub(bigEndScratch);
      const length = rodDirectionScratch.length();
      binding.connectingRod.position.copy(bigEndScratch);
      binding.connectingRod.rotation.set(Math.atan2(rodDirectionScratch.z, rodDirectionScratch.y), 0, 0);
      binding.connectingRod.children.forEach((child) => {
        if (child.name === 'forged I-beam shank') child.scale.y = length / ENGINE_DIMENSIONS.rodLength;
      });

      const intakeTravel = Math.max(0, Math.min(1, state.intakeLift)) * ENGINE_SPEC.intakeValve.maxLiftMm;
      const exhaustTravel = Math.max(0, Math.min(1, state.exhaustLift)) * ENGINE_SPEC.exhaustValve.maxLiftMm;
      binding.intakeValve.position.y = VALVETRAIN_DIMENSIONS.closedValveGroupY - intakeTravel;
      binding.exhaustValve.position.y = VALVETRAIN_DIMENSIONS.closedValveGroupY - exhaustTravel;
      binding.intakeSprings.forEach((spring) => {
        spring.position.y = VALVETRAIN_DIMENSIONS.springSeatLocalY + intakeTravel;
        spring.scale.y = 1 - intakeTravel / VALVETRAIN_DIMENSIONS.springFreeHeight;
      });
      binding.exhaustSprings.forEach((spring) => {
        spring.position.y = VALVETRAIN_DIMENSIONS.springSeatLocalY + exhaustTravel;
        spring.scale.y = 1 - exhaustTravel / VALVETRAIN_DIMENSIONS.springFreeHeight;
      });

      const combustion = Math.max(0, Math.min(1, state.combustion));
      const combustionMaterial = binding.combustion.material as MeshStandardMaterial;
      binding.combustion.visible = combustion > 0.015;
      combustionMaterial.opacity = Math.min(0.92, combustion * 0.88);
      combustionMaterial.emissiveIntensity = 2.5 + combustion * (8 + snapshot.load * 8);
      binding.combustion.scale.set(1 + combustion * 0.18, 0.16 + combustion * 0.2, 1 + combustion * 0.18);
      const injection = Math.max(0, Math.min(1, state.injection));
      binding.injectorPlume.visible = injection > 0.015;
      const visibleFuelQuantity = fuelVisualQuantity(snapshot.load);
      binding.injectorPlume.scale.set(
        0.72 + visibleFuelQuantity * 0.28,
        0.92 + visibleFuelQuantity * 0.08,
        0.72 + visibleFuelQuantity * 0.28,
      );
      (binding.injectorPlume.material as Material & { opacity: number }).opacity = injection
        * (0.24 + visibleFuelQuantity * 0.58);
    });

    const rpmActivity = Math.min(1, Math.max(0, snapshot.rpm / 3200));
    const oilActivity = Math.min(1, snapshot.oilPressureBar / 5);
    effects.oilFlows.forEach((flow) => flow.update(deltaSeconds, oilActivity));
    const coolantActivity = 0.35 + rpmActivity * 0.65;
    effects.coolantFlows.forEach((flow) => flow.update(deltaSeconds, coolantActivity));
    const intakeActivity = Math.min(1, rpmActivity * (0.32 + snapshot.load * 0.86));
    effects.intakeTrunk.update(deltaSeconds, intakeActivity);
    effects.intakeBranches.forEach((flow, index) => {
      flow.update(deltaSeconds, intakeActivity * (snapshot.cylinders[index]?.intakeLift ?? 0));
    });
    const exhaustActivities = snapshot.cylinders.map((state) => state.exhaustLift);
    const exhaustEnergy = Math.min(1, rpmActivity * snapshot.load * 1.35);
    effects.exhaustPulses.update(deltaSeconds, exhaustActivities, exhaustEnergy);

    const spoolTarget = rpmActivity * (0.12 + snapshot.load * 0.88)
      * (0.45 + Math.max(...exhaustActivities) * 0.55);
    const spoolTimeConstant = spoolTarget > turboSpool ? 1.05 : 1.7;
    turboSpool += (spoolTarget - turboSpool)
      * (1 - Math.exp(-Math.max(0, deltaSeconds) / spoolTimeConstant));
    manifold.turboRotor.rotation.x += deltaSeconds * (12 + turboSpool * 170);
  }

  function setHighlighted(partId: string | null): void {
    highlightLines.splice(0).forEach((line) => {
      line.removeFromParent();
      line.geometry.dispose();
    });
    if (!partId) return;
    const candidates = new Set<Mesh>();
    root.traverse((object) => {
      const objectPartId = String(object.userData.partId ?? '');
      const genericObjectPartId = objectPartId.replace(/-\d+$/, '');
      if (objectPartId !== partId && genericObjectPartId !== partId) return;
      object.traverse((child) => {
        if (child instanceof Mesh && !(child instanceof InstancedMesh)) candidates.add(child);
      });
    });
    candidates.forEach((candidate) => {
      const outline = new LineSegments(new EdgesGeometry(candidate.geometry, 28), highlightMaterial);
      outline.name = 'selected-part-outline';
      outline.renderOrder = 9;
      outline.raycast = () => undefined;
      candidate.add(outline);
      highlightLines.push(outline);
    });
  }

  function setExploded(exploded: boolean): void {
    for (const child of root.children) {
      const base = child.userData.assembledPosition as Vector3 | undefined;
      if (!base) continue;
      child.position.copy(base);
      if (!exploded) continue;
      const partId = String(child.userData.partId ?? '');
      if (partId === 'cylinder-head') child.position.y += 105;
      else if (partId === 'oil-pan') child.position.y -= 80;
      else if (partId === 'intake-manifold') child.position.z -= 90;
      else if (partId === 'exhaust-manifold' || partId === 'turbocharger') child.position.z += 90;
    }
  }

  function dispose(): void {
    const geometries = new Set<BufferGeometry>();
    root.traverse((object) => {
      if (object instanceof Mesh) geometries.add(object.geometry);
    });
    geometries.forEach((geometry) => geometry.dispose());
    effects.oilFlows.forEach((flow) => flow.disposeGeometry());
    effects.coolantFlows.forEach((flow) => flow.disposeGeometry());
    effects.intakeTrunk.disposeGeometry();
    effects.intakeBranches.forEach((flow) => flow.disposeGeometry());
    effects.exhaustPulses.disposeGeometry();
    highlightLines.splice(0).forEach((line) => line.geometry.dispose());
    materialModes.dispose();
  }

  return {
    root,
    bindings: {
      crankshaft: crank.crankshaft,
      flywheel: crank.flywheel,
      camshaft,
      turboRotor: manifold.turboRotor,
      cylinders,
    },
    pickables,
    update,
    setViewMode: (mode: SceneViewMode) => materialModes.setViewMode(mode),
    setSectionEnabled: (enabled: boolean) => materialModes.setSectionEnabled(enabled),
    setHighlighted,
    setFlowsVisible: (visible: boolean) => { effects.flows.visible = visible; },
    setExploded,
    dispose,
  };
}
