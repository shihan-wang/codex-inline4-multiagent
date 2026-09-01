import type {
  CameraPreset,
  EngineSceneBridge,
  EngineSimulationBridge,
  PartInteraction,
  PartInteractionListener,
  SnapshotListener,
  Unsubscribe,
  ViewMode,
} from './types';
import { getPartMetadata } from './data/parts';
import {
  Dashboard,
  type CameraPreset as DashboardCameraPreset,
  type DashboardSnapshot,
  type PartDetails,
} from './ui/dashboard';

export interface EngineAppOptions {
  root: HTMLElement;
  viewport: HTMLElement;
  scene: EngineSceneBridge;
  simulation: EngineSimulationBridge;
}

/**
 * Application coordinator and the only animation-loop owner. UI code talks to
 * this class, never directly to Three.js or the kinematics module.
 */
export class EngineApp {
  private readonly viewport: HTMLElement;
  private readonly scene: EngineSceneBridge;
  private readonly simulation: EngineSimulationBridge;
  private readonly dashboard: Dashboard;
  private readonly snapshotListeners = new Set<SnapshotListener>();
  private readonly partListeners = new Set<PartInteractionListener>();
  private selectedPartId: string | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private animationFrame = 0;
  private previousTime = 0;
  private previousInspectorUpdate = 0;
  private previousDashboardUpdate = 0;
  private started = false;

  public constructor(options: EngineAppOptions) {
    this.viewport = options.viewport;
    this.scene = options.scene;
    this.simulation = options.simulation;
    this.dashboard = new Dashboard(options.root, {
      onRunning: (value) => this.setRunning(value),
      onRpm: (value) => this.setRpm(value),
      onLoad: (value) => this.setLoad(value),
      onViewMode: (value) => this.setViewMode(value),
      onCamera: (value) => this.setCameraPreset(mapDashboardCameraPreset(value)),
      onReset: () => this.resetCamera(),
      onSelectPart: (partId) => this.selectPart(partId),
      onToggleLabels: (value) => this.scene.setLabelsVisible(value),
      onToggleFlows: (value) => this.scene.setFlowsVisible(value),
      onToggleExplode: (value) => this.scene.setExploded(value),
    });
    this.scene.setInteractionHandlers({
      onPartInteraction: (event) => this.emitPartInteraction(event),
    });
  }

  public start(): void {
    if (this.started) return;
    this.started = true;
    this.scene.mount(this.viewport);
    this.resizeObserver = new ResizeObserver(() => this.scene.resize());
    this.resizeObserver.observe(this.viewport);
    this.scene.resize();
    this.dashboard.setSnapshot(this.toDashboardSnapshot(this.simulation.snapshot));
    this.previousTime = performance.now();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  public dispose(): void {
    if (!this.started) return;
    this.started = false;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.snapshotListeners.clear();
    this.partListeners.clear();
    this.scene.dispose();
  }

  public setRunning(running: boolean): void {
    this.simulation.setRunning(running);
    this.emitSnapshot();
  }

  public setRpm(rpm: number): void {
    this.simulation.setRpm(rpm);
    this.emitSnapshot();
  }

  public setLoad(load: number): void {
    this.simulation.setLoad(load);
    this.emitSnapshot();
  }

  public setViewMode(mode: ViewMode): void {
    this.scene.setViewMode(mode);
    this.scene.setSectionEnabled(mode === 'section');
    this.dashboard.setViewMode(mode);
  }

  public setSectionEnabled(enabled: boolean): void {
    this.scene.setSectionEnabled(enabled);
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (preset === 'cranktrain') this.setViewMode('section');
    if (preset === 'valvetrain') this.setViewMode('xray');
    this.scene.setCameraPreset(preset);
    this.dashboard.setCameraPreset(mapEngineCameraPreset(preset));
  }

  public resetCamera(): void {
    this.setViewMode('solid');
    this.scene.resetCamera();
    this.dashboard.setCameraPreset('isometric');
  }

  public selectPart(partId: string | null): void {
    this.selectedPartId = partId;
    this.scene.setSelectedPart(partId);
    this.dashboard.setSelectedPart(partId);
    this.dashboard.showPart(this.createPartDetails(partId));
    const event: PartInteraction = {
      type: 'select',
      partId,
      clientX: 0,
      clientY: 0,
    };
    for (const listener of this.partListeners) listener(event);
  }

  public subscribe(listener: SnapshotListener): Unsubscribe {
    this.snapshotListeners.add(listener);
    listener(this.simulation.snapshot);
    return () => this.snapshotListeners.delete(listener);
  }

  public subscribePartInteraction(listener: PartInteractionListener): Unsubscribe {
    this.partListeners.add(listener);
    return () => this.partListeners.delete(listener);
  }

  public getSnapshot(): Readonly<EngineSimulationBridge['snapshot']> {
    return this.simulation.snapshot;
  }

  private readonly animate = (time: number): void => {
    if (!this.started) return;
    // Some headless and resume paths can report an initial rAF timestamp a
    // little earlier than the preceding performance.now(). Keep all scene
    // systems on a monotonic, bounded timestep.
    const deltaSeconds = Math.max(0, Math.min((time - this.previousTime) / 1000, 0.1));
    this.previousTime = time;
    const snapshot = this.simulation.tick(deltaSeconds);
    this.scene.update(snapshot, deltaSeconds);
    // The 3D mechanism stays frame-synchronous; text telemetry does not need
    // 60 DOM rewrites per second to remain readable.
    if (time - this.previousDashboardUpdate >= 80) {
      this.dashboard.setSnapshot(this.toDashboardSnapshot(snapshot));
      this.previousDashboardUpdate = time;
    }
    this.dashboard.setFps(time);
    if (this.selectedPartId && time - this.previousInspectorUpdate > 120) {
      this.dashboard.showPart(this.createPartDetails(this.selectedPartId));
      this.previousInspectorUpdate = time;
    }
    for (const listener of this.snapshotListeners) listener(snapshot);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  private emitSnapshot(): void {
    const snapshot = this.simulation.snapshot;
    for (const listener of this.snapshotListeners) listener(snapshot);
  }

  private emitPartInteraction(event: PartInteraction): void {
    if (event.type === 'select') {
      this.selectedPartId = event.partId;
      this.dashboard.setSelectedPart(event.partId);
    }
    const displayedPartId = event.type === 'hover'
      ? event.partId ?? this.selectedPartId
      : event.partId;
    this.dashboard.showPart(this.createPartDetails(displayedPartId));
    for (const listener of this.partListeners) listener(event);
  }

  private toDashboardSnapshot(snapshot: Readonly<EngineSimulationBridge['snapshot']>): DashboardSnapshot {
    return {
      running: snapshot.running,
      rpm: snapshot.rpm,
      load: snapshot.load,
      crankAngleDeg: snapshot.crankAngle * 180 / Math.PI,
      coolantC: snapshot.coolantC,
      oilPressureBar: snapshot.oilPressureBar,
      cylinders: snapshot.cylinders,
    };
  }

  private createPartDetails(partId: string | null): PartDetails | undefined {
    const metadata = getPartMetadata(partId);
    if (!metadata) return undefined;
    return {
      nameZh: metadata.nameZh,
      nameEn: metadata.nameEn,
      material: `${metadata.materialZh} · ${metadata.materialEn}`,
      process: `${metadata.manufacturingZh} · ${metadata.manufacturingEn}`,
      function: `${metadata.functionZh} ${metadata.functionEn}`,
      parameters: metadata.keyParameters.join(' · '),
      state: this.describePartState(partId, metadata.system),
      system: metadata.system.toUpperCase(),
    };
  }

  private describePartState(partId: string | null, system: string): string {
    const snapshot = this.simulation.snapshot;
    const cylinderMatch = partId?.match(/-(\d)$/);
    const cylinder = cylinderMatch ? snapshot.cylinders[Number(cylinderMatch[1]) - 1] : undefined;
    if (cylinder) {
      if (partId?.startsWith('injector-')) {
        return `INJECTION ${(cylinder.injection * 100).toFixed(0)}% · ${formatCycleAngle(cylinder.cycleAngleDeg)}° CA`;
      }
      return `${cylinder.stroke.toUpperCase()} · ${formatCycleAngle(cylinder.cycleAngleDeg)}° · `
        + `lift IN ${(cylinder.intakeLift * 100).toFixed(0)}% / EX ${(cylinder.exhaustLift * 100).toFixed(0)}%`;
    }
    if (system === 'cranktrain') {
      return `${snapshot.rpm.toFixed(0)} rpm · crank ${((snapshot.crankAngle * 180 / Math.PI) % 720 + 720) % 720 | 0}°`;
    }
    if (system === 'cooling') return `${snapshot.coolantC.toFixed(1)} °C`;
    if (system === 'lubrication') return `${snapshot.oilPressureBar.toFixed(1)} bar`;
    return snapshot.running ? 'ACTIVE / 运行中' : 'PAUSED / 已暂停';
  }
}

function mapDashboardCameraPreset(preset: DashboardCameraPreset): CameraPreset {
  if (preset === 'isometric') return 'hero';
  if (preset === 'crank') return 'cranktrain';
  if (preset === 'combustion') return 'valvetrain';
  return preset;
}

function mapEngineCameraPreset(preset: CameraPreset): DashboardCameraPreset {
  if (preset === 'hero') return 'isometric';
  if (preset === 'cranktrain') return 'crank';
  if (preset === 'valvetrain') return 'combustion';
  return preset;
}

function formatCycleAngle(angle: number): string {
  const normalized = ((angle % 720) + 720) % 720;
  return (Math.floor(normalized * 10) / 10).toFixed(1);
}
