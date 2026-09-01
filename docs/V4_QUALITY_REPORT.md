# Inline-4 Diesel V4 quality report

Date: 2026-09-01 (Asia/Shanghai)

Repository: `D:\ComputePicture\codex-inline4-multiagent`

Starting external-evaluation commit: `eccde839811d6991b9583f3c4fd6c08918ec64c1`

Fixed V3 model: `7e5ea916a115dcef1bf3ba467a31b78c6206c612` (`v3-model-final^{}`)

## Result

V4 closes the externally measured V3 geometry/collision and agent-verifiable accessibility failures without rewriting V3 history, weakening the motion model, shrinking or hiding moving parts, extending the collision whitelist, or regressing the hardware WebGL gate. Three independent final directions recommend release: geometry/mechanics GO, accessibility/visual-interaction GO, and visual/performance/browser GO. Their final P0 and P1 counts are zero.

This is the highest-quality version reached under this experiment's Codex version, available agents, tools, Intel Arc hardware and quota. It is not a claim about a permanent theoretical maximum. It is also not a complete external user score: real NVDA operation and the preregistered real-person blind study remain pending, so no final external total is reported.

## Protected history and scope

- `v1-baseline` remains `5518627ae0430add55b31cd8a4c3e8fb5ab02db3`.
- `v2-baseline` remains `12472172925ec3108d096f2402a48e3f7939931b`.
- `v3-model-final` remains `7e5ea916a115dcef1bf3ba467a31b78c6206c612`.
- V4 was developed on `v4-remediation` from the separate external-evaluation commit.
- No Git remote or GitHub repository was created.
- Existing V1/V2/V3/external-evaluation evidence was preserved. New evidence is isolated under `artifacts/v4/`.

## Agents and independence

The platform allowed three child agents concurrently, four active agents including the lead. Eight named child agents were used across review, implementation and re-review (nine actual agents including the lead); implementation agents did not review their own work.

| Agent | Role | Stage | Final state |
| --- | --- | --- | --- |
| `/root` | Lead, triage, coupled scene integration, evidence/Git release | all | completed |
| Euler / `v4_geometry_collision_audit` | V3 geometry, topology and collision audit | Phase 1, Round 1/2 review | completed; initial HOLD |
| Lagrange / `v4_accessibility_audit` | keyboard, focus, 200%, ARIA, contrast | Phase 1 and independent Round-2 recheck | completed; GO |
| Archimedes / `v4_visual_perf_baseline` | V3 visual/performance freeze; Round-1 QA | Phase 1 and first final review | completed; GO |
| Fermat / `v4_ui_remediation_impl` | isolated accessible UI implementation | implementation | completed; excluded from a11y review |
| Raman / `v4_cam_winding_impl` | isolated cam winding fix and regression test | implementation | completed; excluded from geometry review |
| Nietzsche / `v4_eval_harness_impl` | read-only semantic export/check boundary | implementation | completed; excluded from final QA |
| Feynman / `v4_round3_geometry_reviewer` | fresh independent Round-3 topology/collision/browser review | final review | completed; GO |
| `v4_round3_perf_reviewer` | fresh independent Round-3 visual/performance/browser review | final review | completed; GO |

Quota interrupted two review episodes: the first geometry audit was resumed from completed raw evidence, and the three first final reviewers later paused at a quota boundary. A subsequent old-thread capacity limit required the fresh Feynman reviewer rather than pretending the lead was independent. Three user recovery prompts restored the workflow. No user-supplied mechanical dimension, formula or design answer was used.

## Phase-1 findings and lead triage

### Confirmed real defects

- V3 exported a closed block proxy without real crankcase/cylinder openings. Independent Blender narrow phase confirmed crank/block intersection at 721/721 angles and four rod/liner intersections at 272 angles each.
- The external `107 mm` value was an enclosure/proxy overlap magnitude, not a literal physical penetration depth; nevertheless, the full-triangle intersection itself was real.
- The `21.413884 mm` rod/liner value was a radial proxy excess, not a surface penetration depth; full-triangle narrow phase again confirmed the underlying collision.
- Sixteen cam nodes had 2,304 directed-edge winding errors in both Blender and Trimesh.
- V3's semantic scan covered only 18/44 crank nodes and lacked complete timing/accessory child coverage.
- The part inspector had no complete keyboard entry path; 200% text scaling caused blocking overlap; current mode/camera states lacked programmatic selection; focus, scroll-region, contrast, viewport role and landmark naming had measured failures.

### Scanner limitations, not hidden failures

- Assembly-wide watertightness was never required. Only parts registered as closed solids were held to watertightness.
- About 51% position-coincident vertices combine necessary normal/UV/material seams with some attribute-identical duplication. Blind welding could destroy hard edges, shading and material boundaries, so it was not used to improve a headline metric.
- The frozen whitelist stayed at SHA-256 `0eb5ab7d6e298b5227102550c124326c114aad791eab9d65479fb833a6b5fce2`; runtime extension remained disabled.

## Implemented remediation

### Mechanical geometry

- Replaced the closed block shortcut with individually closed crankcase side walls, upper end walls, a four-bore deck, exterior ribs and bearing-bay rings around a real open crank sweep.
- Replaced the solid oil-pan flange with an open four-member perimeter frame.
- Replaced the monolithic lower head face with an upper casting and seven-member fire deck containing four real 88 mm chamber openings at the original 269 mm face.
- Added open lower liners and registers. Their lower limit is derived from the actual programmatic crank-web swept Y/Z radius, full axial X extent, register radius and clearance, rather than an arbitrary visual gap. The final lower edge is 87 mm.
- Corrected both cam end-cap index loops; all 16 cam nodes now have consistent winding.
- Preserved the existing 720° four-stroke cycle, 1-3-4-2 firing order, slider-crank closure, 90° crank phasing and 0.5 cam/crank speed ratio. Moving parts were not scaled down or hidden.

### Accessibility and interaction

- Added a native keyboard-reachable selector for 18 semantic part classes, bidirectionally synchronized with inspector content and 3D outlines; generic piston and connecting-rod choices highlight all four numbered assemblies.
- Added programmatic selected states to modes, cameras, pause and toggles; the pause accessible name now follows running/paused state.
- Added visible focus treatment, a focusable/named telemetry scroll region, valid viewport region semantics and unique landmark names.
- Reflowed the interface for 200% text and narrow widths without hiding core controls.
- Raised low-contrast instructional text to independently measured 6.27:1 and 6.34:1.
- Added an exploded-only isometric camera goal so the complete assembly remains framed; the other five camera semantics are preserved.

### Evaluation and regression protection

- Added a V4-only semantic GLB/snapshot boundary that refuses external-evaluation output paths and requires explicit overwrite.
- Added frozen role counts, exact whitelist hash, separate proxy/surface results and complete 721-point triangle scanning.
- Added tests for cam directed edges, positive volume/finite normals, the three-dimensional crank-web/register clearance constraint, keyboard semantics and state synchronization.

## Iterative review evidence

The first implementation was not accepted on sight:

1. Round 1 fixed cam winding and opened the block, but independent scanning still found 1,344 crank-web/register pair-angles, 404 crank/oil-pan intersections and 426 piston/head intersections. Geometry review returned NO-GO.
2. Round 2 opened the oil-pan/head structures and closed those two families, but still found 448 web/register and 320 web/open-liner pair-angles. The first clearance formula had ignored crank-web axial X extent; geometry review again returned NO-GO.
3. Round 3 incorporated that X extent into the analytic constraint. A fresh reviewer then measured zero intersections for every registered family and returned GO.

Accessibility also required a narrow second round: the first review retained two low contrast failures and a stale pause accessible name; the independent Round-2 recheck measured 6.27:1/6.34:1, consistent run/pause name-state-action, all-instance keyboard highlights and zero runtime errors.

## V3-to-V4 measured comparison

| Metric | V3 / Phase-1 baseline | Final V4 | Result |
| --- | ---: | ---: | --- |
| Cam winding error edges | 2,304 | 0 | fixed |
| Expected closed nodes watertight | 413/413 | 446/446 | preserved at 100% with broader geometry |
| Degenerate triangles / duplicate faces | 0 / 0 | 0 / 0 | no regression |
| Registered crank nodes | 18/44 sampled by old proxy | 44/44 full surface | coverage fixed |
| Timing sprocket nodes | incomplete child coverage | 19/19 | coverage fixed |
| V3 block/crank actual intersection | 721/721 angles | 0/721 in registered surface family | fixed |
| V3 rod/liner actual intersection | 272 angles per cylinder | 0/721 for every registered rod/liner target | fixed |
| Full Round-3 surface work | not applicable | 5,483,926 node×target×angle checks; 7/7 families zero | pass |
| Keyboard-accessible semantic part task | unavailable | 18 classes; inspector + multi-instance outline | fixed |
| 200% text resize | blocking overlap | independent pass | fixed |
| Low-contrast samples | 3.07:1 / 4.10:1 in first V4 review | 6.34:1 / 6.27:1 | fixed |
| Intel Arc sustained | about 120 FPS, p95 8.4 ms, about 267 draws | 120.031 FPS, p95 8.4 ms, 269.000 draws | no material regression |
| SwiftShader sustained | 1.854–2.557 FPS, p95 700.1–916.7 ms | 12.082 FPS, p95 91.6 ms | compatible; single V4 run is not a distribution claim |

## Final automatic and browser validation

### Topology and mechanical scan — actual measurement

- Semantic GLB SHA-256: `1e0ec6d82c0bd11122bf805d8387f42da9346dabcbdce7f3fead4ab61022ad0`.
- Trimesh 4.8.3 and Blender 5.2.1 both loaded 507/507 triangle nodes.
- 446/446 expected closed nodes and 72,808/72,808 expected closed triangles are watertight.
- Zero degenerate triangles, duplicate faces, winding errors, invalid geometric normals or inward closed nodes.
- Seven registered surface families are all zero over angles 0–720 inclusive at 1° resolution; 5,483,926 individual node-target-angle checks completed.
- The unchanged independent snapshot registry reports 1-3-4-2 firing, zero stroke/firing errors, maximum slider-crank closure error `5.684341886080802e-14 mm` and zero cam-ratio error.

### Browser/accessibility — actual measurement

- Nine-state axe evidence is retained separately from manual checks; it is not used to claim complete WCAG 2.2 AA conformance.
- Real keyboard navigation, visible focus, scroll-region focus, 200% text reflow, programmatic selected state, named regions and desktop/narrow drawers passed the agent-verifiable checks.
- Round-3 production page passed at 1280×720 and 390×844: three modes, six cameras, pause, RPM/load, three toggles, orbit/zoom/pan, pointer inspection and keyboard part selection.
- Console errors, page exceptions, browser log errors, failed product requests and WebGL context loss: zero in the final affected runs.

### Performance — actual measurement, renderer paths separated

| Path | Renderer | Sample | FPS | p95 | draws/frame | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| Hardware | Intel Arc D3D11 WebGL2 | 3,601 frames / 30.0007 s | 120.031 | 8.4 ms | 269.000 | passes ≥110, ≤10 ms, ≤282 |
| Software | Vulkan SwiftShader | 600 frames / 49.6615 s | 12.082 | 91.6 ms | 269.0067 | compatibility pass only |

Intel Arc and SwiftShader are not averaged. Spector was not rerun: material, renderer, shadow and shader/program paths did not change, while sustained and acceptance draw counts increased only 0.373% and 0.376%, below the frozen 5% trigger. This is a preregistered review decision, not a claim that a new V4 Spector capture exists.

### Engineering gate — actual measurement

- Node 24.14.0, npm 11.9.0.
- `npm run typecheck`: exit 0.
- `npm test`: 4 files, 28/28 tests passed.
- `npm run build`: exit 0; Vite 7.3.6, 21 modules.
- Production assets: JS 615.94 kB / gzip 162.81 kB; CSS 13.83 kB / gzip 3.91 kB.
- `git diff --check`: exit 0; informational line-ending warnings only.
- The retained negative fixture detects all six injected browser faults with the expected non-zero exit.

## Same-state visual evidence

All desktop frames are 1280×720, DPR 1, Intel Arc D3D11 WebGL2, paused at `000.0°`; narrow frames are 390×844.

| View | V3 | V4 |
| --- | --- | --- |
| Solid isometric | [V3](../artifacts/v4/phase1/visual-performance/fixed-v3/solid-isometric-1280x720.png) | [V4](../artifacts/v4/round3/final-review/performance/fixed-visual/solid-isometric-1280x720.png) |
| Crank section | [V3](../artifacts/v4/phase1/visual-performance/fixed-v3/section-crank-1280x720.png) | [V4](../artifacts/v4/round3/final-review/performance/fixed-visual/section-crank-1280x720.png) |
| Valvetrain X-Ray | [V3](../artifacts/v4/phase1/visual-performance/fixed-v3/xray-combustion-1280x720.png) | [V4](../artifacts/v4/round3/final-review/performance/fixed-visual/xray-combustion-1280x720.png) |
| Exploded isometric | [V3](../artifacts/v4/phase1/visual-performance/fixed-v3/solid-isometric-exploded-1280x720.png) | [V4](../artifacts/v4/round3/final-review/performance/fixed-visual/solid-isometric-exploded-1280x720.png) |

Reviewer judgment: V4 preserves the material/light/label hierarchy, makes the crankcase and chamber openings mechanically legible in section/X-Ray, and keeps the exploded assembly fully framed. Screenshots support visual regression judgment; they do not replace the 721-angle collision evidence.

## Independent release decisions

- Geometry/mechanics: GO, P0=0, P1=0, one explained P2 (mixed duplicate-vertex metric; no blind weld).
- Accessibility/visual interaction: GO in agent-verifiable scope, P0/P1/P2=0 for the targeted recheck; NVDA remains human-pending.
- Visual/performance/browser: GO, P0=0, P1=0, two explained P2 limitations.
- Lead ruling: all measured release gates pass; no unexplained real motion-chain collision remains; no reviewer proposes a feasible high-benefit, low-risk fix that should block this release.

## Explicitly not implemented

| Item | Why it is not used to raise the score |
| --- | --- |
| Blanket welding of about 50.37% position duplicates | Mixed normal/UV/material seams; appearance and hard-edge risk; no topology failure to justify it |
| Lowering hardware visual quality for SwiftShader | Would trade the target hardware experience for a software-rasterizer score; software remains clearly labelled compatibility-only |
| Full V4 Lighthouse 5+5 rerun | No startup/render-pipeline change and the task required affected-only expensive reruns; V3 mobile cold-cache debt remains visible |
| New Spector captures | Frozen trigger was not met; existing 89–101 MB V3 captures are retained and not overwritten |
| `role=application` for the whole 3D page | Could harm screen-reader navigation; semantic native controls and named regions are safer pending real NVDA evidence |
| Engineering section caps/hatching or a complete cast-CAD rebuild | High coupling and collision/render risk; not a low-risk remediation of an externally measured V3 failure |

## Mechanical sources and modeling assumptions

- [Yanmar 4TNV86CT official specification](https://www.yanmar.com/eu/industrial/product/engines/4tnv86ct/) supports the representative four-cylinder, four-stroke, water-cooled, turbocharged direct-injection architecture and 86×90 mm class proportions.
- [Bosch common-rail system](https://www.bosch-mobility.com/en/solutions/powertrain/diesel/common-rail-system-solenoid/) supports controlling injection start/duration/quantity separately from a simple crank-speed visualization.
- [Purdue METL cam-follower test rigs](https://engineering.purdue.edu/METL/testrigs) supports treating cam/follower contact as a geometric support relationship; this remains a quasi-static teaching model, not valvetrain dynamics.
- [Gates accessory-belt material](https://www.gates.com/content/dam/gates/home/knowledge-center/vehicle-system-repair/abds-postcard.PDF) supports crank-driven accessory transmission.
- [Cummins turbocharger explanation](https://www.cummins.com/en-apac/components/turbochargers/how-a-turbocharger-works) supports exhaust-energy turbine drive and a shared compressor shaft.

The collision-clearance remedy is principally an internal analytic constraint verified over exported geometry, not a claim that 87 mm is a production-engine drawing dimension. Fluid paths are pedagogical direction/branch visualizations rather than CFD. Combustion is not thermodynamic or emissions prediction. The assembly is an editable browser model, not certified manufacturing CAD.

## Remaining limitations

### Actual unresolved measurements

- Position-only duplicate vertices remain about 50.37%; water-tightness, winding, normals, degenerate and duplicate-face gates nevertheless pass.
- SwiftShader is functional but not a fluid real-time path.
- The main production JS chunk is 615.94 kB and retains Vite's >500 kB advisory.
- V3's mobile cold-cache Lighthouse debt was not remeasured for V4; no improvement claim is made.

### Human-pending

- Real NVDA task completion and screen-reader usability.
- Preregistered real-person randomized V2/V3 (or any future V3/V4) blind review, task success/time/error, visual ratings and SUS.
- Therefore no complete external 100-point score or real-user preference result is reported.

### Inference boundaries

- Stable 120 FPS/p95 and <0.4% draw growth support “no material hardware render regression”; they do not predict every GPU.
- Zero collision in seven preregistered families does not prove every possible unregistered part pair is collision-free.
- Screenshot review supports “no obvious visual regression”; it is not a substitute for real user preference data.

## Evidence index

- [Phase-1 geometry audit](../artifacts/v4/phase1/geometry-collision/audit-report.md)
- [Phase-1 accessibility audit](../artifacts/v4/phase1/accessibility/audit-report.md)
- [Phase-1 visual/performance baseline](../artifacts/v4/phase1/visual-performance/audit-report.md)
- [Round-2 accessibility release](../artifacts/v4/round2/final-review/accessibility/review-report.md)
- [Round-3 geometry release](../artifacts/v4/round3/final-review/geometry/review-report.md)
- [Round-3 visual/performance release](../artifacts/v4/round3/final-review/performance/review-report.md)
- [Final engineering verification](../artifacts/v4/final-engineering/verification.md)

## Time and intervention record

The V4 checkpoint was created at 2026-08-31 21:42:23+08:00 and final automatic evidence completed on 2026-09-01 shortly after 12:57+08:00: approximately 15 hours 15 minutes of wall-clock span, including browser/Blender scans, quota waits and user recovery intervals; this is not pure compute time. Quota interruption episodes: 2. Old-agent thread-capacity recovery event: 1. Human process recovery prompts in V4: 3. Human mechanical answers or dimensions supplied: 0.

## Run locally

```powershell
cd D:\ComputePicture\codex-inline4-multiagent
npm install
npm run dev
```

For production:

```powershell
npm run build
npm run preview
```

Core automatic checks:

```powershell
npm run typecheck
npm test
npm run build
```

The final Git commit and annotated `v4-model-final` tag are created after this report is staged. Their exact hash is recorded by the post-commit verification and the delivery response; this file does not self-reference an unborn commit.
