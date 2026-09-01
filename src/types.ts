export type CylinderId = 1 | 2 | 3 | 4;

export type Stroke = 'intake' | 'compression' | 'power' | 'exhaust';

export type ViewMode = 'solid' | 'xray' | 'section';

export type CameraPreset =
  | 'hero'
  | 'cranktrain'
  | 'valvetrain'
  | 'front'
  | 'side'
  | 'top';

export interface CylinderState {
  cylinder: CylinderId;
  cycleAngleDeg: number;
  stroke: Stroke;
  pistonY: number;
  rodAngle: number;
  intakeLift: number;
  exhaustLift: number;
  /** Normalized injector command; deliberately distinct from heat release. */
  injection: number;
  combustion: number;
}

export interface SimulationSnapshot {
  crankAngle: number;
  rpm: number;
  load: number;
  running: boolean;
  coolantC: number;
  oilPressureBar: number;
  cylinders: CylinderState[];
}

export interface EnginePartMetadata {
  id: string;
  nameZh: string;
  nameEn: string;
  materialZh: string;
  materialEn: string;
  manufacturingZh: string;
  manufacturingEn: string;
  functionZh: string;
  functionEn: string;
  keyParameters: readonly string[];
  system:
    | 'structure'
    | 'cranktrain'
    | 'valvetrain'
    | 'fuel'
    | 'lubrication'
    | 'cooling'
    | 'air';
}

export interface PartInteraction {
  type: 'hover' | 'select';
  partId: string | null;
  clientX: number;
  clientY: number;
}

export interface SceneInteractionHandlers {
  onPartInteraction(event: PartInteraction): void;
}

/**
 * Integration boundary for Three.js. Scene modules own rendering and picking,
 * while EngineApp remains the sole requestAnimationFrame owner.
 */
export interface EngineSceneBridge {
  mount(container: HTMLElement): void;
  update(snapshot: SimulationSnapshot, deltaSeconds: number): void;
  setViewMode(mode: ViewMode): void;
  setSectionEnabled(enabled: boolean): void;
  setCameraPreset(preset: CameraPreset): void;
  setInteractionHandlers(handlers: SceneInteractionHandlers): void;
  setSelectedPart(partId: string | null): void;
  setLabelsVisible(visible: boolean): void;
  setFlowsVisible(visible: boolean): void;
  setExploded(exploded: boolean): void;
  resetCamera(): void;
  resize(): void;
  dispose(): void;
}

export type SnapshotListener = (snapshot: Readonly<SimulationSnapshot>) => void;
export type PartInteractionListener = (event: Readonly<PartInteraction>) => void;
export type Unsubscribe = () => void;

/** Pure simulation contract: no DOM and no Three.js dependencies. */
export interface EngineSimulationBridge {
  readonly snapshot: Readonly<SimulationSnapshot>;
  tick(deltaSeconds: number): Readonly<SimulationSnapshot>;
  setRunning(running: boolean): void;
  setRpm(rpm: number): void;
  setLoad(load: number): void;
}
