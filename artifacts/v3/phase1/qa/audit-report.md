# V3 Phase 1 — Independent QA Audit of v2

## Scope and baseline

- Audited baseline: `v2-baseline`, commit `12472172925ec3108d096f2402a48e3f7939931b`.
- Role: independent read-only interaction, performance and quality-assurance review.
- Browser application port: `15313`.
- The project source, tests, documentation, dependencies and Git state were not modified by this reviewer. All generated evidence is under this directory.
- `docs/V3_PROGRESS.md` was already untracked before this review and was not touched.

## Verification performed

- `npm run typecheck`: passed.
- Formal `npm test`: 2 files, 17/17 tests passed. The QA inventory probe uses `.audit.ts` and a dedicated configuration, so it is not part of the formal suite.
- Production build: passed; output saved under `build/`.
- Browser acceptance: passed on both SwiftShader and Intel Arc D3D11.
- Negative fixture: correctly failed with 10 findings and process exit code 1.
- Additional deep runtime audit checked exact active mode/preset state, six camera buttons, reset, numeric/R keyboard shortcuts, pause/resume, operating extremes and label visibility.
- Actual desktop, X-Ray, section, cranktrain, valvetrain, six-camera and 390x844 screenshots were visually inspected.

## Measured facts

### Runtime performance — kept strictly separate

| Environment | Renderer | Average FPS | p95 frame | Max frame | Draw calls/frame | JS heap | Nodes |
|---|---|---:|---:|---:|---:|---:|---:|
| Hardware GPU | Intel Arc, ANGLE D3D11 | 120.00 | 8.4 ms | 8.5 ms | 377.11 | 8.30 MB | 1,110 |
| Software renderer | SwiftShader Vulkan | 3.76 | 566.7 ms | 1,533.3 ms | 376.60 | 7.26 MB | 442 |

The SwiftShader figure is not representative of ordinary hardware and is not used to claim normal-computer FPS. Its stable draw-call count is still useful. The hardware run reached the browser's observed 120 Hz cadence.

### Scene and resource inventory

| Metric | Value |
|---|---:|
| Objects / meshes / points | 446 / 366 / 3 |
| Instanced meshes | 0 |
| Unique geometries / materials | 349 / 39 |
| Vertices / triangles | 83,613 / 82,596 |
| Geometry buffer bytes | 3,113,432 |
| Shadow casters / receivers | 6 / 345 |
| Transparent materials | 25 |
| Pickable roots | 34 |
| Cylinder / torus / box geometries | 129 / 48 / 69 |

Build resources:

- JavaScript: 595.54 kB minified, 157.21 kB gzip.
- CSS: 10.19 kB minified, 3.05 kB gzip.
- The single JavaScript chunk still triggers Vite's 500 kB advisory.

### Interaction evidence

- Pause held the crank display constant and resume advanced it.
- RPM/load extremes updated to `600 rpm / 0%` and `2600 rpm / 100%`; telemetry continued updating without exceptions.
- Mouse orbit, zoom, pan and part picking passed.
- Solid, X-Ray and section buttons each produced exactly one matching active DOM state.
- Six camera buttons produced preset-specific visible label sets.
- Label toggle changed both checkbox state and the label layer's `hidden` property, then restored correctly.
- Desktop and narrow layouts had no document overflow, but absence of overflow is not equivalent to useful model visibility on narrow screens.

## Score: 82 / 100

| Category | Score | Confidence | Basis |
|---|---:|---:|---|
| Mechanical correctness | 22 / 25 | 0.86 | Exact slider-crank, firing order, strokes, cam phase, injection and clearance tests; coherent sampled telemetry. Browser evidence does not directly couple visible cam contact to valve displacement. |
| Geometry and systems | 21 / 25 | 0.94 | Strong procedural system coverage and readable core mechanisms; almost one geometry per mesh, no instancing, and uncapped section cuts. |
| Visual quality | 16 / 20 | 0.96 | Strong desktop materials, lighting, labels and purpose-built views; narrow composition and section-cut finish reduce quality. |
| Interaction | 7 / 10 | 0.98 | Core mouse/buttons/sliders/picking work; reset, keyboard state and narrow preset access have concrete failures. |
| Performance | 8 / 10 | 0.91 | Hardware reaches 120 FPS with moderate memory; 377 draw calls and no instancing leave low-end efficiency headroom. |
| Test evidence | 8 / 10 | 0.98 | Positive dual-renderer evidence and a real negative fixture; semantic camera/reset/keyboard and regression-budget gaps remain. |

Full machine-readable scoring is in `scorecard.json`.

## Findings

### QA-01 — P1 — Narrow viewport is operationally obscured

- **Actual evidence:** `hardware/narrow-390x844.png` shows two fixed 184 px panels plus margins occupying 374 of 390 CSS pixels. Only a very narrow seam of the engine remains unobstructed. `src/style.css` at the narrow breakpoint also hides preset buttons 5 and 6.
- **Quality impact:** The page technically avoids overflow, but direct 3D inspection, picking and camera manipulation are impractical. Mobile/touch users cannot access the two most valuable mechanical inspection presets through visible controls.
- **Expected benefit:** A collapsible/drawer layout would materially improve model visibility and make the narrow mode genuinely usable rather than merely layout-valid.
- **Implementation cost:** Medium, approximately 0.5–1.5 focused days including responsive QA.
- **Risk:** Responsive regressions, focus management and touch hit-target issues if panels are simply hidden without an accessible opener.
- **Verifiable acceptance:** At 390x844, provide visible access to all six presets; allow both panels to collapse; with panels collapsed, at least 60% of viewport width should be unobstructed canvas; verify touch orbit/pinch/pan and part picking; retain zero document overflow.

### QA-02 — P1 — Reset and keyboard camera state diverge from the UI

- **Actual evidence:** `runtime-deep-audit.json` records that after activating `front` and clicking reset, the camera returns to the hero label set and mode becomes `solid`, but `activePreset` remains `front`. Keys `1`, `5`, `6` and `R` all leave the `front` button highlighted. Keys 5 and 6 change the camera/label set but leave mode `solid`, unlike the corresponding buttons, which intentionally select `section` and `xray`.
- **Quality impact:** The interface lies about the active viewpoint. Keyboard users receive a less useful cranktrain/valvetrain view than mouse users, despite the visible `<5>` and `<6>` shortcut hints.
- **Expected benefit:** Restores a single source of truth for camera and observation state; high interaction-quality gain for a small change.
- **Implementation cost:** Low, roughly 2–4 hours plus tests.
- **Risk:** Low. The main risk is accidental event recursion if keyboard actions are implemented by indiscriminate synthetic clicks.
- **Verifiable acceptance:** After every button and keyboard preset, assert exactly one matching active preset; key 5 must yield `crank + section`, key 6 `combustion + xray`; Reset and R must yield `isometric/hero + solid`; visually verify label set and camera screenshot.

### QA-03 — P2 — Browser acceptance misses semantic camera-state failures

- **Actual evidence:** Both positive acceptance runs report `passed=true`, although QA-02 is reproducible. The script checks each camera button's active class immediately after clicking it, but does not verify reset, keyboard shortcuts, resulting mode coupling or final camera identity. The negative fixture is trustworthy for the conditions it covers: it produced ten failures and exit code 1.
- **Quality impact:** Future camera-state regressions can ship with a green browser report.
- **Expected benefit:** A few semantic assertions would close the exact gap that allowed QA-02 through and make the evidence substantially more trustworthy.
- **Implementation cost:** Low, roughly 2–4 hours.
- **Risk:** Low to medium if assertions depend on pixel-perfect images; low if they use active state plus stable camera/label diagnostics.
- **Verifiable acceptance:** Add reset and keyboard cases from QA-02; assert mode coupling; assert six stable, distinct camera states after transition completion; run the existing negative fixture and a dedicated state-mismatch negative fixture.

### QA-04 — P2 — Section mode lacks engineered cut surfaces

- **Actual evidence:** `hardware/desktop-section.png` and `deep-camera-crank.png` show open clipped castings and abrupt dark cut boundaries without caps, material hatching or section outlines. Internal parts are visible, but the cut reads as graphics clipping rather than a mechanical section drawing.
- **Quality impact:** Reduces depth comprehension and the professional mechanical-visualization finish of a core observation mode.
- **Expected benefit:** Capped or hatched cut faces would make cylinder walls, block cavities and head/crankcase boundaries much easier to distinguish.
- **Implementation cost:** Medium, about 1–2 days depending on stencil/cap strategy.
- **Risk:** Extra draw calls, stencil ordering issues with X-Ray/transparency, and cap artifacts on nested geometry.
- **Verifiable acceptance:** Same-size before/after screenshots at section and crank presets; no holes or cap flicker while orbiting; caps use a distinct neutral/hatch material; preserve picking; keep hardware p95 below 12 ms and draw calls under an agreed budget.

### QA-05 — P2 — Scene remains draw-call heavy and geometry is scarcely reused

- **Actual evidence:** 366 meshes, 349 unique geometries, zero `InstancedMesh`, 377 draw calls/frame and only 82,596 triangles. Repeated primitives include 129 cylinders, 48 toruses and 69 boxes. Hardware performance is currently excellent, while SwiftShader demonstrates the cost on a weak renderer.
- **Quality impact:** Limits headroom for lower-end integrated GPUs, higher device-pixel ratios and future detail improvements.
- **Expected benefit:** Shared geometry and targeted instancing/merging of bolts, flywheel teeth, repeated rings and static fasteners could reduce CPU submission and GPU state work without reducing visible detail.
- **Implementation cost:** Medium to high, approximately 1–3 days for safe, selective work.
- **Risk:** Pick IDs, per-part highlights, X-Ray roles and exploded offsets can break if unrelated parts are merged blindly.
- **Verifiable acceptance:** Preserve all 34 pickable roots and inspector metadata; verify solid/X-Ray/section/exploded screenshots; target below 280 draw calls/frame before accepting the complexity; compare hardware p95 and a same-machine SwiftShader sample.

### QA-06 — P3 — Repeated telemetry DOM replacement creates avoidable churn

- **Actual evidence:** The hardware acceptance run reports 1,110 nodes and 303 style recalculations. Dashboard snapshot handling repeatedly writes text/classes, and running-state rendering reconstructs its copy even when the running state is unchanged.
- **Quality impact:** Not currently visible on Intel Arc, but it adds avoidable allocation/style work and can complicate long-session memory diagnostics.
- **Expected benefit:** Updating only changed values and preserving static inspector/run-state DOM reduces short-lived nodes and main-thread noise.
- **Implementation cost:** Low, approximately 2–4 hours.
- **Risk:** Low; stale telemetry if change detection omits a field.
- **Verifiable acceptance:** Run a 60-second hardware trace; node count should stabilize after interaction, detached nodes should not grow continuously, all displayed telemetry must update within 100 ms, and pause/resume copy must remain correct.

### QA-07 — P3 — Initial JavaScript remains a single warning-sized chunk

- **Actual evidence:** Production JavaScript is 595.54 kB minified and 157.21 kB gzip; Vite emits its greater-than-500-kB advisory.
- **Quality impact:** Mild first-load parse cost. There are no large external model/texture downloads, so this is not currently a dominant issue.
- **Expected benefit:** Limited unless code splitting can delay genuinely optional UI or audit code.
- **Implementation cost:** Medium.
- **Risk:** More requests and initialization complexity without reducing the Three.js code required for first meaningful render.
- **Verifiable acceptance:** Measure cold-cache transfer, parse and first meaningful render before/after; only retain the change if first render improves materially and interaction remains available immediately.

## Test gaps

- No unit tests for Dashboard active camera/mode state, Reset/R behavior or keyboard/button parity.
- No browser assertion that the final camera transform corresponds to the highlighted preset.
- No browser-level check that visible valve travel peaks with its intended cam lobe orientation.
- No scene lifecycle/resource-disposal test.
- Part picking samples one successful point rather than covering all 34 pickable roots and X-Ray shell pass-through.
- No enforced regression budgets for draw calls, geometry count, bundle size, heap stabilization or frame p95.
- Narrow acceptance checks overflow but not unobstructed canvas area, touch usability or access to hidden controls.

## Candidate improvement order

1. **QA-02 camera/reset/keyboard state synchronization** — highest ROI; concrete user-visible bug, low cost and low risk.
2. **QA-01 responsive panels and access to presets 5/6** — highest user-experience gain; medium implementation cost.
3. **QA-03 semantic browser assertions** — low cost and prevents recurrence of QA-02.
4. **QA-04 section caps/hatching** — strong visible quality gain for the main mechanical inspection mode.
5. **QA-05 selective geometry sharing/instancing** — useful performance headroom, but only with preserved picking and visual roles.
6. **QA-06 DOM churn cleanup** — safe polish after the interaction issues.
7. **QA-07 chunk restructuring** — defer until measured cold-load data justifies it.

## Final QA judgment

There is no P0 failure: the production page builds, runs, animates, renders on hardware and software WebGL, and its primary desktop controls work. There **are high-return improvements** remaining. QA-02 is a clear low-cost/high-benefit fix, and QA-01 materially affects narrow-screen usability. Those two issues, followed by the missing semantic assertions, should be selected before further decorative additions.
