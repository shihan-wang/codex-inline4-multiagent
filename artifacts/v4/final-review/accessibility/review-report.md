# V4 independent accessibility and visual-interaction re-review

## Scope and disposition

- Reviewer: `v4_accessibility_audit` (Phase 1 accessibility auditor; did not implement V4 product changes)
- Product under review: the current production build served at `http://127.0.0.1:16441/`
- Browser/runtime: Microsoft Edge `152.0.4191.53`, Node `v24.14.0`, Windows `10.0.26200`, 1280×720 desktop and 390×844 narrow viewport
- Product source was read-only. This review wrote only below `artifacts/v4/final-review/accessibility/`.
- Overall automatic/agent-assisted release disposition: **HOLD** because one confirmed P1 text-contrast defect remains. No P0 was found.
- Full WCAG 2.2 AA disposition: **not determined**. axe produced no violations in the nine required states, but contrast remained incomplete and NVDA is pending a real human operator.

## Evidence integrity and test recovery

The existing axe run was preserved and not rerun. Its top-level process exit code is `1` because the evaluator timed out after it had already captured all nine axe states and its keyboard/focus evidence. The individual state artifacts are valid: `aggregate.validStates=9`, `invalidStates=0`, and every raw state has zero axe violations. The late timeout is a harness-level partial-run defect, not a product exception. `axe-evidence-hashes.json` records the SHA-256 digest of every pre-existing axe artifact.

The supplemental review completed successfully (`manual/environment.json`, exit code `0`) and only filled the missing 200%/narrow/ARIA/semantic-selection analyses. The page recorded zero page exceptions and zero page console messages (`manual/console-and-errors.json`).

## Actual measurements

### axe-core states

| State | Violations | Incomplete rule | Incomplete nodes |
|---|---:|---|---:|
| desktop solid | 0 | color-contrast | 94 |
| desktop X-Ray | 0 | color-contrast | 94 |
| desktop section | 0 | color-contrast | 94 |
| desktop selected part | 0 | color-contrast | 99 |
| desktop paused | 0 | color-contrast | 93 |
| desktop exploded | 0 | color-contrast | 94 |
| narrow initial | 0 | color-contrast | 30 |
| narrow left drawer | 0 | color-contrast | 52 |
| narrow right drawer | 0 | color-contrast | 63 |

The zero-violation count is not a WCAG conclusion. In every state, axe marked `color-contrast` incomplete because translucent/canvas-backed presentation prevented it from resolving the effective background.

### Keyboard, focus and selection

- Real Tab navigation in the preserved run reached the canvas, pause button, both ranges, three view modes, all three switches, the scrollable telemetry panel, semantic part selector, six camera buttons and reset. Canvas/buttons/ranges/panel/select showed a 3 px solid `rgb(255,224,155)` focus indicator.
- The semantic selector is exposed by Edge as a `combobox` named `零件选择 KEYBOARD PART SELECTOR`, with 19 options including the placeholder.
- Keyboard `End` + `Enter` selected `turbocharger`; the inspector updated to `废气涡轮增压器` and `ACTIVE / 运行中`. `Home` + `ArrowDown` + `Enter` then selected `engine-block`; the inspector updated to `气缸体`.
- A pointer hit on the model selected `turbocharger`, and the semantic selector reverse-synchronized to `turbocharger`.
- The telemetry panel has `tabIndex=0`; while focused, PageDown changed `scrollTop` from `0` to `30` (`clientHeight=566`, `scrollHeight=596`).

### Roles, names and state

- The 3D viewport is a named `region`: `柴油机三维视图`.
- The AX tree contains named, distinct landmarks/regions including main `直列四缸柴油机三维交互仿真`, viewport region `柴油机三维视图`, complementary `实时工况 LIVE TELEMETRY`, mobile navigation `移动端面板控制`, and region `PART INSPECTOR`.
- Each tested view-mode transition and camera transition had exactly one `aria-pressed=true`, matching the visible `.is-active` state.
- Pause toggled `aria-pressed` from `true` to `false`, `data-state` from `running` to `paused`, and restored correctly.
- The inspector is a named polite live region (`aria-live=polite`, `aria-labelledby=part-inspector-title`).

### 200% text resize and 390×844 reflow

- The 1280×720 200% text-resize fixture produced no cross-control text collisions and no document-level horizontal or vertical overflow (`scrollWidth=clientWidth=1280`, `scrollHeight=clientHeight=720`). Three non-text cycle-ring decorations and one heading line-box reported small client/scroll differences, but screenshot inspection found no missing actionable text or blocked control.
- At 390×844, all initial/left/right states kept document `scrollWidth=clientWidth=390` and `scrollHeight=clientHeight=844`.
- The left drawer occupied x=8..318 and the right drawer x=72..382. Inactive drawers were off-canvas and hidden. Drawer `aria-expanded` values and visible states matched.
- The part selector was visible in the right drawer and accepted keyboard focus with a 3 px gold outline.

### Sampled effective contrast

Effective colors were composited through ancestor backgrounds against the page fallback before WCAG luminance calculation.

| Text | Font size | Ratio | AA normal-text result |
|---|---:|---:|---|
| interaction hint | 9 px | 8.08:1 | pass |
| panel English subtitle | 8 px | 4.10:1 | **fail** |
| part-picker English subtitle | 7 px | 4.99:1 | pass |
| empty-inspector instruction | 8 px | 3.07:1 | **fail** |
| active camera preset | 9 px | 10.55:1 | pass |

## Findings

### A11Y-V4-FR-01 — P1 — normal-sized instructional/subtitle text is below 4.5:1

- Evidence: `manual/results.json` records `.inspector-empty p` at `3.0748:1` and `.panel-title span` at `4.1012:1`; `manual/text-resize-200.png` and narrow screenshots show these texts in real UI context. Every axe state separately reports color contrast as incomplete, so axe does not contradict the manual computation.
- User-visible impact: low-vision and low-contrast users may not reliably read the instruction for how to inspect parts; the English panel subtitle also falls below AA normal-text contrast.
- Quality impact: the explicit V4 contrast remediation acceptance criterion is not met, and WCAG 1.4.3 cannot be defended for these samples.
- Expected benefit: raising the two foreground colors to at least 4.5:1 preserves the visual design while making essential guidance readable.
- Implementation cost: low (two CSS color tokens/rules plus targeted remeasurement).
- Change risk: low; the main risk is visual hierarchy becoming slightly brighter.
- Verifiable acceptance: recompute effective contrast in initial/selected and narrow right-drawer states; require ≥4.5:1 for both texts, rerun affected axe states, and visually compare hierarchy.
- Release status: **blocking/hold** until corrected and independently rechecked.

### A11Y-V4-FR-02 — P2 — pause accessible name is stale in the paused state

- Evidence: `manual/results.json` records paused state `{pressed:"false", state:"paused", label:"发动机运行", title:"运行 / Run (Space)"}`. The visible copy changes to paused, but `aria-label` does not.
- User-visible impact: a screen-reader user hears a name that says the engine is running while the control state and visible action indicate paused/run, increasing ambiguity.
- Quality impact: name/state consistency is weakened even though `aria-pressed` itself updates correctly.
- Expected benefit: a state- or action-consistent label makes the control immediately understandable.
- Implementation cost: very low (update the label in the existing running-state setter).
- Change risk: low; choose and test a stable action-oriented or state-oriented naming convention.
- Verifiable acceptance: with a real accessibility-tree capture, require running and paused states to expose mutually consistent name, pressed state, data state and visible copy; then exercise Space twice.
- Release status: non-catastrophic but should be corrected before final release because it is high-value and low-risk.

### TOOL-V4-FR-01 — harness limitation, not a product defect

- Evidence: the preserved run has nine valid axe states and then exits `1` after a navigation readiness timeout; its summary incorrectly reports zero contrast nodes because it counts violation nodes, while raw axe files contain 30–99 incomplete contrast nodes per state.
- User-visible impact: none in the application; without careful interpretation it could overstate coverage.
- Benefit/cost/risk: documenting it prevents a false “axe 0 = WCAG pass” conclusion; no product change is appropriate.
- Acceptance: preserve the raw state JSON and hashes; treat contrast as manual/incomplete.
- Release status: does not block product release by itself.

## Passed or not reproduced

- P0: none.
- Keyboard access to the semantic part inspector: pass, including selection and pointer-to-selector reverse synchronization.
- Keyboard focus visibility: pass for major controls based on real Tab evidence; custom programmatic `focus()` samples were not used to judge `:focus-visible`.
- 200% text resize: no blocking overlap or document overflow reproduced.
- 390×844 reflow and both drawers: pass.
- Modes/cameras/pause state expression: pass except the stale paused accessible name reported above.
- Scrollable inspector/telemetry panel focus and keyboard scrolling: pass.
- Viewport role/name and landmark uniqueness: pass in the captured AX tree.
- Browser page exceptions and application console messages: zero.

## Human and tool-limited items

- **NVDA: pending a real human operator.** No pass, score or simulated result is claimed.
- Browser zoom/reflow behavior was tested through the pre-registered 200% text-resize fixture and screenshots, not by a human visually operating Edge's zoom UI.
- Contrast coverage is sampled/manual because axe marked all canvas/translucent-backed candidates incomplete. The two confirmed failures must not be hidden by the zero-violation count.
- No real-user usability or blind-review conclusion is made.

## Final recommendation

Do not issue unconditional accessibility/visual-interaction release approval for this build. Fix and remeasure A11Y-V4-FR-01; fix or explicitly resolve A11Y-V4-FR-02; then perform a narrowly scoped independent rerun of the affected contrast and pause-state evidence. Even after those pass, describe the result as an automated/agent-assisted accessibility gate, not full WCAG 2.2 AA compliance, until a real NVDA operator completes the pending test.
