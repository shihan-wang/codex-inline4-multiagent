# Shared contracts

## Stack and module boundaries

- Vite + TypeScript + Three.js; no framework dependency is required for UI.
- `src/data`: editable specifications, metadata and constants only.
- `src/engine`: kinematics and four-stroke state calculations, no DOM or Three.js.
- `src/scene`: procedural geometry, materials, effects, picking and animation bindings.
- `src/ui`: DOM panels and input bindings; communicates through `EngineApp` only.
- `src/app.ts`: owns lifecycle and integrates scene, simulation and UI.

## Coordinate system

- Three.js axes: X = crankshaft/front-to-rear axis, Y = vertical/up, Z = intake-to-exhaust direction.
- Cylinders are numbered 1..4 from X negative (front/pulley) to X positive (flywheel).
- Crankshaft rotates about +X. Cylinder bore centers lie on Z=0.
- Dimensions in scene code are millimetres scaled by `WORLD_SCALE = 0.01` at an assembly root.

## Mechanical state

```ts
type Stroke = 'intake' | 'compression' | 'power' | 'exhaust';

interface CylinderState {
  cylinder: 1 | 2 | 3 | 4;
  cycleAngleDeg: number;   // 0..720, 0 = TDC firing transition into power
  stroke: Stroke;
  pistonY: number;         // wrist-pin height, mm
  rodAngle: number;        // radians, signed in Y/Z plane
  intakeLift: number;      // 0..1 normalized
  exhaustLift: number;     // 0..1 normalized
  combustion: number;      // 0..1 visual intensity
}

interface SimulationSnapshot {
  crankAngle: number;      // radians, unbounded
  rpm: number;
  load: number;            // 0..1
  running: boolean;
  coolantC: number;
  oilPressureBar: number;
  cylinders: CylinderState[];
}
```

- Inline-four crank throws: cylinders 1/4 share phase; 2/3 share phase +180°.
- Firing order: 1-3-4-2, evenly spaced 180 crank degrees over 720°.
- Camshaft speed is exactly half crankshaft speed.
- Slider-crank position uses crank radius `r = stroke/2` and rod length `l` with the exact square-root relation, not a sinusoidal shortcut.
- Visual valve lift may use smooth periodic envelopes, but timing events live in data and must remain editable.

## Integration API

`EngineApp` exposes `setRunning`, `setRpm`, `setLoad`, `setViewMode`, `setSectionEnabled`, `setCameraPreset`, `resetCamera`, and `subscribe`.

Scene assemblies return named bindings rather than owning the animation loop. Each selectable major group carries `userData.partId`; metadata is resolved through `src/data/parts.ts`.

## Quality and performance budgets

- Production build has no TypeScript errors.
- Target 60 fps on a typical desktop, graceful at 30 fps; cap DPR at 2.
- Prefer instancing/merged static geometry and shared materials; particle counts must be bounded.
- Browser acceptance: no console errors, controls usable at 1280x720, selection and all three view modes functional.

