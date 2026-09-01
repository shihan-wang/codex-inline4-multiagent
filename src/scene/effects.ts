import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  SphereGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import type { MaterialModeController } from './materials';

export interface FlowPathOptions {
  id: string;
  points: Vector3[];
  color: number;
  tubeColor?: number;
  radius?: number;
  particles?: number;
  pointSize?: number;
  speed?: number;
  opacity?: number;
  emissive?: boolean;
  closed?: boolean;
  minimumActivity?: number;
}

export class FlowPath {
  readonly root = new Group();

  private readonly curve: CatmullRomCurve3;

  private readonly points: Points;

  private readonly tubeMaterial: MeshBasicMaterial;

  private readonly pointMaterial: PointsMaterial;

  private readonly positions: Float32BufferAttribute;

  private readonly phases: Float32Array;

  private readonly speed: number;

  private readonly baseTubeOpacity: number;

  private readonly minimumActivity: number;

  private readonly pointScratch = new Vector3();

  private time = 0;

  constructor(options: FlowPathOptions, materials: MaterialModeController) {
    this.root.name = options.id;
    this.root.userData.partId = options.id;
    this.root.userData.visualRole = 'fluid';
    const closed = options.closed ?? false;
    this.curve = new CatmullRomCurve3(options.points, closed, 'catmullrom', 0.28);
    this.speed = options.speed ?? 0.08;
    this.baseTubeOpacity = options.opacity ?? 0.32;
    this.minimumActivity = Math.max(0, Math.min(1, options.minimumActivity ?? 0.04));
    this.root.userData.closed = closed;

    this.tubeMaterial = new MeshBasicMaterial({
      color: options.tubeColor ?? options.color,
      transparent: true,
      opacity: this.baseTubeOpacity,
      depthWrite: false,
    });
    this.tubeMaterial.userData.visualRole = 'fluid';
    materials.register(this.tubeMaterial);
    const tube = new Mesh(
      new TubeGeometry(this.curve, Math.max(36, options.points.length * 10), options.radius ?? 1.8, 6, closed),
      this.tubeMaterial,
    );
    tube.userData.partId = options.id;
    tube.userData.visualRole = 'fluid';
    tube.renderOrder = 3;
    this.root.add(tube);

    const count = options.particles ?? 28;
    const data = new Float32Array(count * 3);
    this.positions = new Float32BufferAttribute(data, 3);
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', this.positions);
    this.pointMaterial = new PointsMaterial({
      color: new Color(options.color),
      // Point size is evaluated in scene units after projection, not in the
      // millimetre coordinates scaled by the engine root. This yields a crisp 2–4 px bead.
      size: options.pointSize ?? 0.082,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    if (options.emissive) this.pointMaterial.blending = AdditiveBlending;
    this.pointMaterial.userData.visualRole = 'fluid';
    materials.register(this.pointMaterial);
    this.points = new Points(geometry, this.pointMaterial);
    this.points.frustumCulled = false;
    this.root.add(this.points);

    this.phases = new Float32Array(count);
    for (let i = 0; i < count; i += 1) this.phases[i] = i / count;
    this.update(0, 1);
  }

  update(deltaSeconds: number, activity = 1): void {
    const safeDelta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    const safeActivity = Number.isFinite(activity) ? Math.max(0, activity) : 0;
    this.time = (this.time + safeDelta * this.speed * Math.max(0.08, safeActivity)) % 1;
    for (let i = 0; i < this.phases.length; i += 1) {
      const t = Math.min(0.999999, Math.max(0, (this.phases[i]! + this.time) % 1));
      this.curve.getPointAt(t, this.pointScratch);
      this.positions.setXYZ(i, this.pointScratch.x, this.pointScratch.y, this.pointScratch.z);
    }
    this.positions.needsUpdate = true;
    const strength = Math.min(1, Math.max(this.minimumActivity, safeActivity));
    this.pointMaterial.opacity = 0.05 + strength * 0.9;
    this.tubeMaterial.opacity = this.baseTubeOpacity * (0.18 + strength * 0.82);
  }

  disposeGeometry(): void {
    this.root.traverse((object) => {
      if (object instanceof Mesh || object instanceof Points) object.geometry.dispose();
    });
  }
}

export class ExhaustPulseField {
  readonly root = new Group();

  private readonly pulses: InstancedMesh;

  private readonly curves: CatmullRomCurve3[];

  private readonly dummy = new Object3D();

  private readonly pulseCountPerCylinder = 2;

  private time = 0;

  constructor(paths: readonly Vector3[][], materials: MaterialModeController) {
    const geometry = new SphereGeometry(1, 10, 8);
    const material = new MeshBasicMaterial({
      color: 0xff7138,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    material.userData.visualRole = 'fluid';
    materials.register(material);
    this.curves = paths.map((points) => new CatmullRomCurve3(points, false, 'catmullrom', 0.24));
    this.pulses = new InstancedMesh(
      geometry,
      material,
      Math.max(1, this.curves.length * this.pulseCountPerCylinder),
    );
    this.pulses.instanceMatrix.setUsage(DynamicDrawUsage);
    this.pulses.frustumCulled = false;
    this.pulses.userData.partId = 'exhaust-flow';
    this.pulses.userData.visualRole = 'fluid';
    this.root.name = 'cylinder-phased-exhaust-pulses';
    this.root.add(this.pulses);
  }

  update(deltaSeconds: number, cylinderActivities: readonly number[], flowActivity: number): void {
    const safeFlow = Number.isFinite(flowActivity) ? Math.max(0, Math.min(1, flowActivity)) : 0;
    this.time = (this.time + Math.max(0, deltaSeconds) * (0.22 + safeFlow * 0.72)) % 1;
    this.curves.forEach((curve, cylinderIndex) => {
      const cylinderActivity = Math.max(0, Math.min(1, cylinderActivities[cylinderIndex] ?? 0));
      for (let pulseIndex = 0; pulseIndex < this.pulseCountPerCylinder; pulseIndex += 1) {
        const instanceIndex = cylinderIndex * this.pulseCountPerCylinder + pulseIndex;
        const t = (pulseIndex / this.pulseCountPerCylinder + this.time) % 1;
        curve.getPointAt(Math.min(0.999999, t), this.dummy.position);
        const visibleStrength = cylinderActivity * safeFlow;
        const scale = visibleStrength > 0.012
          ? (3.8 + t * 7.5) * (0.5 + visibleStrength * 0.5)
          : 0.001;
        this.dummy.scale.setScalar(scale);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.updateMatrix();
        this.pulses.setMatrixAt(instanceIndex, this.dummy.matrix);
      }
    });
    this.pulses.instanceMatrix.needsUpdate = true;
  }

  disposeGeometry(): void {
    this.pulses.geometry.dispose();
  }
}
