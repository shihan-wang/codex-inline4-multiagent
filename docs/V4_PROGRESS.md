# V4 Progress Checkpoint

Last updated: 2026-09-01 13:08 (Asia/Shanghai)

## Current phase

Complete — V4 automatic scope released. All independent review directions and the complete engineering gate are GO; the quality report and final engineering evidence are written; generated caches and the task-owned preview are closed; the exact stage set is audited. This checkpoint is included in the ordinary V4 commit and annotated `v4-model-final` release tag, followed by post-commit integrity verification.

## Incremental recovery state

- **Last completed gate:** final engineering validation. Node 24.14.0/npm 11.9.0; typecheck exit 0; Vitest 4 files and 28/28 tests exit 0; Vite 7.3.6 production build exit 0; `git diff --check` exit 0. `docs/V4_QUALITY_REPORT.md` and `artifacts/v4/final-engineering/verification.md` record the release evidence.
- **Current stage:** V4 automatic scope complete; Git release handoff.
- **Next exact task:** no further automatic V4 work. A real NVDA operator and preregistered real participants may complete the explicitly human-pending evaluation without changing this model tag.
- **Active agents:** `/root` lead completing Git handoff; `/root/v4_round3_geometry_reviewer` completed/GO; `/root/v4_round3_perf_reviewer` completed/GO. No child reviewer is running.
- **Valid artifacts:** all Round-1/2 reports remain immutable; Round-3 GLB SHA-256 `1e0ec6d82c0bcd11122bf805d8387f42da9346dabcbdce7f3fead4ab61022ad0`; independent geometry and performance reports are GO; full scan 7/7 pairs zero, 44/44 crank, 19/19 sprocket, unchanged whitelist; Intel and SwiftShader paths remain separate; affected browser regression and fixed screenshots are valid; final engineering verification records all exit-zero release commands.
- **Interrupted commands:** all failed attempts remain evidenced. The Round-3 reviewer retained its first production-build directory because the outer call did not return an auditable exit, then built to a fresh verified directory with exit 0. No `.tmp`, `.partial` or `.lock` file remains; no interrupted command requires resumption.
- **Uncommitted files:** at release preparation, all 414 intended V4 paths are staged, with zero unstaged/untracked path, zero `artifacts/external-eval/` change and zero path outside the audited source/tests/evaluator/docs/`artifacts/v4/` boundary. The reviewed `src/` diff object remains `9661b3da8a93dd07d7f8a480798408770de1efa9`.

## Repository checkpoint

- Repository: `D:\ComputePicture\codex-inline4-multiagent`
- Branch: `v4-remediation`
- Starting HEAD: `eccde839811d6991b9583f3c4fd6c08918ec64c1`
- V3 model commit: `7e5ea916a115dcef1bf3ba467a31b78c6206c612`
- Worktree before branch creation: clean
- `src/` diff versus V3 before V4 work: empty
- Git remotes: none
- Protected refs verified:
  - `v1-baseline` -> `5518627ae0430add55b31cd8a4c3e8fb5ab02db3`
  - `v2-baseline` -> `12472172925ec3108d096f2402a48e3f7939931b`
  - `v3-model-final` -> `7e5ea916a115dcef1bf3ba467a31b78c6206c612`

## Completed

- Confirmed the external-evaluation commit and preregistered evidence are present.
- Confirmed `artifacts/external-eval/manifest/evidence-completeness.json` reports the fixed V3 target and no `src/` difference.
- Confirmed the current agent tree initially contained only `/root`; three child slots are available (four total concurrent agents including the lead).
- Created `v4-remediation` from the external-evaluation commit without rewriting history.
- Completed the independent accessibility audit: 9/9 axe states plus separate keyboard/focus/200%/ARIA/contrast review; 5 P1 and 3 P2 findings; NVDA remains human-pending.
- Completed the independent visual/performance baseline: 9 deterministic 1280×720 V3 frames, one real Intel Arc browser acceptance pass, and frozen no-regression gates; no expensive baseline reruns.
- Reproduced Blender 5.2.1, Trimesh 4.8.3, the frozen 721-point collision scan, duplicate-seam analysis, sampling coverage and a valid narrow-phase pass. The geometry agent was interrupted by quota only before its final report and has now resumed from those files.
- Completed the resumed geometry/collision report without rerunning successful measurements: 0 P0, 3 P1, 2 P2; 13 priority pairs classified with full-angle narrow-phase evidence.
- Issued the Phase 1 lead triage. Confirmed real defects are separated from enclosure/proxy/coverage limitations; low-yield or score-gaming changes are explicitly excluded.
- Completed the three isolated implementation assignments and lead-owned coupled integration; no implementation agent changed Git history or existing evidence.
- Completed a first real V4 browser acceptance pass and a measured draw-call optimization pass. The final measured Intel Arc result is 120 FPS, p95 8.4 ms and 270.2417 draws/frame with zero application/page errors, within the preregistered 282-draw gate.
- Recovery audit on 2026-09-01 verified branch `v4-remediation`, HEAD `eccde839811d6991b9583f3c4fd6c08918ec64c1`, protected tags unchanged, no remote, deliberate uncommitted V4 work retained and no partial `.tmp`/`.partial`/`.lock` file under `artifacts/v4/`.
- The first final-review attempt generated complete Blender, Trimesh and 721-frame JSON before the agent stopped: 497/497 triangle nodes loaded, 436/436 expected closed nodes watertight, zero degenerate triangles, duplicate faces, winding errors, invalid normals or inward closed nodes. The surface scan completed with full semantic coverage but correctly returned `pass=false`; classification is pending and the result is not a release pass.

## Agents

| Agent | Responsibility | Status |
| --- | --- | --- |
| `/root` | Lead, scope control, evidence synthesis and later coupled implementation | Running |
| `/root/v4_geometry_collision_audit` (Euler) | Geometry, topology, normals and 0–720° collision audit | Running after quota recovery; reusing completed measurements and adding classification/report only |
| `/root/v4_accessibility_audit` (Lagrange) | Keyboard, focus, 200% zoom, ARIA, contrast and landmark audit | Running after quota recovery; 9-state axe evidence retained, only missing manual checks added |
| `/root/v4_visual_perf_baseline` (Archimedes) | Fixed V3 visual, Lighthouse and WebGL no-regression baseline | Running after quota recovery; positive/negative browser evidence retained, only missing one-run sustained paths added |
| `/root/v4_ui_remediation_impl` (Fermat) | Isolated keyboard, ARIA, focus and text-resize implementation | Completed; excluded from corresponding final review |
| `/root/v4_cam_winding_impl` (Raman) | Isolated cam-cap winding correction and regression test | Completed; excluded from corresponding final review |
| `/root/v4_eval_harness_impl` (Nietzsche) | V4-only semantic exporter/checker with frozen whitelist and coverage gates | Completed; excluded from final QA review |

## Evidence locations

- Existing immutable external evaluation: `artifacts/external-eval/`
- V4 evidence root: `artifacts/v4/`
- Phase 1 geometry/collision: `artifacts/v4/phase1/geometry-collision/`
- Phase 1 accessibility: `artifacts/v4/phase1/accessibility/`
- Phase 1 visual/performance: `artifacts/v4/phase1/visual-performance/`

## Modified files

- `docs/V4_PROGRESS.md`
- `src/scene/mechanical-geometry.ts`
- `src/scene/assembly.ts`
- `src/scene/constants.ts`
- `src/scene/index.ts`
- `src/types.ts`
- `src/app.ts`
- `src/ui/dashboard.ts`
- `src/style.css`
- `src/main.ts`
- `tests/scene-geometry.test.ts`
- `tests/dashboard-accessibility.test.ts`
- `evaluation/v4/` (implementation complete; V4-scoped output and overwrite guards verified)

V4 now has deliberate, uncommitted source changes. The protected V3 commit/tag remain unchanged.

## Tests and measurements

- Accessibility: real Edge 152 / Intel Arc WebGL2, 9/9 axe states valid, raw evidence and manual-recheck evidence complete.
- Visual/performance: real browser acceptance passed with 0 application/page errors; 9 fixed V3 frames complete.
- Geometry: Blender, Trimesh, 721-point scan, duplicate-seam, coverage and final narrow-phase JSON/report are valid. Confirmed block/crank 721/721 surface intersection, rod/liner 272 angles per pair, 2,304 cam winding edges, and incomplete crank/timing/accessory coverage.
- Phase 2 fast verification after initial integration:
  - `npm run typecheck`: pass.
  - `npm test`: pass, 4 files / 27 tests.
  - `npm run build`: pass; the existing Vite 500 kB advisory remains.
  - Real Intel Arc browser acceptance after final instancing: pass, WebGL2 via D3D11, 120 FPS, p95 8.4 ms, 270.2417 draws/frame, 0 application/page errors, desktop and 390x844 functional checks pass.
  - Earlier pre-instancing evidence (289.4 draws/frame) is retained to show the detected regression and correction.
- V4 evaluation harness tests: 4/4 pass; dry-run and output-boundary guard pass; frozen whitelist SHA-256 is `0eb5ab7d6e298b5227102550c124326c114aad791eab9d65479fb833a6b5fce2`.
  - V4 semantic export completed without overwriting prior evidence: 512 unique renderables / 497 triangle renderables, 100% classified; GLB SHA-256 `1dae7d0d2bb557b4bc04c8f09d895b1a7a9ce29bcdd77889f4425b9a96f85100`.
  - Matching independent 721-sample snapshot registry completed: firing order 1-3-4-2, 0 firing/stroke errors, maximum closure error `5.684341886080802e-14 mm`, cam ratio error 0.
  - V4 round-1 collision registry was fixed before result inspection and dry-run passed all role counts, including 44/44 crank nodes, 19/19 timing-sprocket nodes, chain/belt/pulley nodes and 65 unrelated-shell nodes; whitelist hash remains frozen.
  - Existing external-evaluation evidence has not been rerun or overwritten.
- Final-review recovery evidence already present and retained:
  - Geometry: Trimesh SHA-256 `785e89abb6fe964baa2b33b384864d925d0d5cde27fd4997c88ea28815f178a9`; Blender SHA-256 `4ae2bcf2eae0ed1af8dc33a92bc836bcff0dc08d7454bed66a955775844df684`; full surface report SHA-256 `71dab393da8d61869beef822aa410f1f90b01a6000913687f857536bfd8aeeb2`.
  - Accessibility: 9-state axe reproduction and keyboard-focus evidence exist; missing post-implementation manual checks are being appended, not rerun.
  - Performance: positive Intel Arc and negative-fixture browser directories exist; sustained Intel/SwiftShader results and final report were interrupted before valid output and are the only expensive performance steps being resumed.

## Current implementation

- Corrected both cam-cap index loops and added directed-edge/positive-volume/finite-normal regression coverage.
- Replaced the closed solid block shortcut with individually closed side walls, upper end walls, a four-bore deck, exterior ribs and external bearing-bay rings around an open crank sweep.
- Derived the liner lower relief from a 720° swept 36 mm big-end envelope with 4 mm radial clearance and 1 mm axial safety; the resulting editable lower edge is 72 mm.
- Added keyboard selection for all 18 semantic part classes and connected it bidirectionally to scene highlight/inspector state.
- Added programmatic selected states, named landmarks/region, focus-visible styling, focusable telemetry scrolling and text-resize layout changes.
- Added an exploded-only isometric camera goal; the other five presets and non-exploded hero framing remain unchanged.
- Round-2 remediation derives the liner/register lower edge from both the big-end envelope and the actual 84.413 mm programmatic crank-web sweep, resulting in a 79 mm lower register with a 4 mm analytic clearance constraint.
- Replaced the solid oil-pan flange plate with a four-member open perimeter frame; moving geometry is unchanged.
- Replaced the bevel-expanded monolithic lower head volume with an upper casting plus a seven-member fire deck containing four real 88 mm chamber openings at the original 269 mm head face.
- Raised the two independently measured low-contrast text colors, made the pause accessible name state-consistent, and made generic keyboard selection outline all numbered instances.
- Round-2 fast verification: typecheck passed; targeted scene/accessibility tests passed 10/10; production build passed with only the unchanged 500 kB advisory.
- Round-2 semantic export completed at `artifacts/v4/round2/geometry/semantic-export/`: 522 unique renderables, 507 triangle renderables, 100% classified; GLB SHA-256 `6b6240fce0c650b6f5268edfca84bd39b3ce609f9b744da3077d1ca410aaf04e`.
- Round-2 role/pair registry was frozen before results and dry-run passed with the unchanged whitelist hash; target coverage is now 44 crank, 19 timing-sprocket, 4 liner and 75 unrelated-shell nodes, including the new crankshaft-versus-liner surface pair.

## Unresolved items

- Round-2 GLB has not yet been exported or independently checked; the three prior P1 families remain open until the unchanged 721-frame protocol reports zero surface intersections.
- The round-2 registry must add crankshaft-versus-liner surface coverage before results are inspected; this is coverage expansion, not a whitelist change.
- Accessibility contrast and pause-name changes require a narrow independent recheck; 9-state axe and unrelated manual checks must not be rerun.
- Rendering geometry count changed slightly; one round-2 Intel Arc browser/performance check and one SwiftShader compatibility check are required, while Spector remains unnecessary unless the renderer/material pipeline or Draw Calls change materially.
- NVDA and real-person blind review remain human-pending. Mobile cold-cache LCP and SwiftShader smoothness remain documented P2 limitations.
- Position-only duplicate vertices remain about 50.5%; no blanket weld is authorized because normal/UV/material seams are not redundant geometry.
- Two untracked Python cache directories are generated caches, not evidence; preserve until final exact-path cleanup. The older unowned port-5173 Node process remains untouched.

## Recovery method

1. Read this file and inspect `git status --short --branch` without resetting.
2. Inspect the three Phase 1 evidence directories and the live agent tree.
3. Resume only unfinished audit work; do not rerun valid expensive evidence.
4. Continue from the single `Next unique action`; never repeat a successful expensive evidence batch without a changed affected input.

## Next unique action

No automatic V4 action remains after Git handoff. Preserve `v4-model-final`; append real NVDA and real-participant results separately rather than changing the released model or inventing an external total.
