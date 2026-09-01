import type {
  Group,
  Material,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';

export type SceneViewMode = 'solid' | 'xray' | 'section';

export interface SceneCylinderState {
  cylinder: 1 | 2 | 3 | 4;
  cycleAngleDeg: number;
  stroke: 'intake' | 'compression' | 'power' | 'exhaust';
  pistonY: number;
  rodAngle: number;
  intakeLift: number;
  exhaustLift: number;
  injection: number;
  combustion: number;
}

export interface SceneSimulationSnapshot {
  crankAngle: number;
  rpm: number;
  load: number;
  running: boolean;
  coolantC: number;
  oilPressureBar: number;
  cylinders: SceneCylinderState[];
}

export type VisualRole = 'shell' | 'mechanism' | 'detail' | 'fluid' | 'hot';

export interface PartObject extends Object3D {
  userData: {
    partId?: string;
    visualRole?: VisualRole;
    [key: string]: unknown;
  };
}

export interface CylinderBinding {
  piston: Group;
  pistonPin: Mesh;
  connectingRod: Group;
  intakeValve: Group;
  exhaustValve: Group;
  intakeSprings: Mesh[];
  exhaustSprings: Mesh[];
  combustion: Mesh;
  injectorPlume: Mesh;
}

export interface EngineAnimationBindings {
  crankshaft: Group;
  flywheel: Group;
  camshaft: Group;
  turboRotor: Group;
  cylinders: CylinderBinding[];
}

export interface EngineAssembly {
  root: Group;
  bindings: EngineAnimationBindings;
  pickables: Object3D[];
  update(snapshot: SceneSimulationSnapshot, deltaSeconds: number): void;
  setViewMode(mode: SceneViewMode): void;
  setSectionEnabled(enabled: boolean): void;
  setHighlighted(partId: string | null): void;
  setFlowsVisible(visible: boolean): void;
  setExploded(exploded: boolean): void;
  dispose(): void;
}

export interface SceneRuntime {
  scene: Scene;
  camera: PerspectiveCamera;
  renderer: WebGLRenderer;
  engine: EngineAssembly;
  materials: Set<Material>;
}
