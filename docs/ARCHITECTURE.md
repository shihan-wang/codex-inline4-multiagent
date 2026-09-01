# Runtime architecture

The browser application uses a deliberately small dependency graph so that
mechanical dimensions, kinematics, geometry and interface work can evolve
independently.

```text
editable data ──► pure kinematics ──► EngineSimulation
                                            │
                                            ▼
Dashboard actions ────────────────────► EngineApp ──► Three.js scene bridge
Dashboard telemetry ◄──────────────────────┘              │
Dashboard inspector ◄──────── normalized pick events ◄────┘
```

## Ownership

- `src/data` contains editable specifications, operational limits, colors and
  bilingual part facts. It does not depend on the DOM or Three.js.
- `src/engine` owns exact four-stroke calculations and time integration. Its
  public result is `SimulationSnapshot`; it never mutates a Three.js object.
- `src/scene` owns renderer resources, procedural geometry, animation bindings,
  picking and visual effects. It never starts its own animation frame loop.
- `src/ui` owns DOM creation and controls. It communicates with the scene only
  through `EngineApp` actions and receives normalized snapshot/part data.
- `src/app.ts` is the lifecycle coordinator and sole animation-loop owner.
- `src/main.ts` is the composition root: it creates one instance of each major
  service, starts the app and disposes it on page exit.

## State invariants

- Crank angle is the single unbounded animation clock, expressed in radians.
- The camshaft is derived from crank angle at a strict 1:2 speed ratio.
- Browser frame time is capped before integration to avoid jumps after a hidden
  tab resumes.
- User input is clamped inside `EngineSimulation`; the UI is not trusted as a
  state validator.
- Scene units remain millimetres under a root scaled by `WORLD_SCALE`.
- All selectable geometry resolves through `userData.partId` and
  `src/data/parts.ts`; the inspector does not contain geometry-specific logic.

## Extension points

`EngineSceneBridge` in `src/types.ts` is the integration boundary. Its methods
cover labels, flow visualization and exploded assembly so every renderer keeps
the complete interaction contract. New camera
presets or part systems should be added to shared types/data before adding UI or
scene-specific branches.
