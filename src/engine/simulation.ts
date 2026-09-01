import { OPERATING_LIMITS } from '../data/operating';
import type {
  CylinderState,
  EngineSimulationBridge,
  SimulationSnapshot,
} from '../types';

export type CylinderStateProvider = (crankAngle: number) => CylinderState[];

const TAU = Math.PI * 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Owns user-adjustable operating state and time integration. Detailed geometry
 * and four-stroke calculations are supplied by the pure cylinderStateProvider.
 */
export class EngineSimulation implements EngineSimulationBridge {
  private state: SimulationSnapshot;

  public constructor(private readonly cylinderStateProvider: CylinderStateProvider) {
    const { rpm, load, coolantC, oilPressureBar } = OPERATING_LIMITS;
    this.state = {
      crankAngle: 0,
      rpm: rpm.initial,
      load: load.initial,
      running: true,
      coolantC: coolantC.nominal,
      oilPressureBar: oilPressureBar.nominal,
      cylinders: cylinderStateProvider(0),
    };
  }

  public get snapshot(): Readonly<SimulationSnapshot> {
    return this.state;
  }

  public tick(deltaSeconds: number): Readonly<SimulationSnapshot> {
    const dt = clamp(deltaSeconds, 0, 0.1);
    const crankAngle = this.state.running
      ? this.state.crankAngle + dt * this.state.rpm * TAU / 60
      : this.state.crankAngle;
    const thermalTarget = 78 + this.state.load * 20;
    const coolantC = this.state.coolantC + (thermalTarget - this.state.coolantC) * dt * 0.035;
    const rpmRatio = this.state.rpm / OPERATING_LIMITS.rpm.max;
    const oilTarget = clamp(1.0 + rpmRatio * 4.4 - this.state.load * 0.35, 1.0, 5.8);
    const oilPressureBar = this.state.oilPressureBar + (oilTarget - this.state.oilPressureBar) * dt * 1.2;

    this.state = {
      ...this.state,
      crankAngle,
      coolantC,
      oilPressureBar,
      cylinders: this.cylinderStateProvider(crankAngle),
    };
    return this.state;
  }

  public setRunning(running: boolean): void {
    this.state = { ...this.state, running };
  }

  public setRpm(rpm: number): void {
    const limits = OPERATING_LIMITS.rpm;
    this.state = { ...this.state, rpm: clamp(rpm, limits.min, limits.max) };
  }

  public setLoad(load: number): void {
    const limits = OPERATING_LIMITS.load;
    this.state = { ...this.state, load: clamp(load, limits.min, limits.max) };
  }
}
