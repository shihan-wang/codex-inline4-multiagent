# V4 Round-2 narrow accessibility re-review

## Scope

This is a narrow, independent follow-up by `v4_accessibility_audit`, who did not implement the Round-2 fixes. The production build was served at `http://127.0.0.1:16444/` and opened in Edge `152.0.4191.53` at 1280×720. No product source was modified. Per instruction, the successful nine-state axe suite was not rerun.

Only the following former findings and the related generic-selection regression were retested:

1. `.panel-title span` and `.inspector-empty p` effective contrast;
2. running/paused accessible name, state, title and visible copy;
3. keyboard selection of generic numbered parts, 3D outline generation and selector/inspector synchronization;
4. console exceptions, console messages and failed network requests.

NVDA remains pending a real human operator; no simulation or pass claim is made.

## Actual browser measurements

### Contrast

Foreground and translucent ancestor backgrounds were composited before WCAG relative-luminance calculation.

| Selector | Computed foreground | Effective background | Font | Ratio | 4.5:1 result |
|---|---|---|---:|---:|---|
| `.panel-title span` | `rgb(135,147,155)` | `rgb(8,11,14)` | 8 px | **6.27:1** | pass |
| `.inspector-empty p` | `rgb(135,147,155)` | `rgb(6.56,9.02,11.48)` | 8 px | **6.34:1** | pass |

The former 4.10:1 and 3.07:1 failures were not reproduced.

### Running/pause programmatic state

The play control was focused and operated with a real Space key event.

| State | `aria-pressed` | `data-state` | Accessible name | Title/action | Visible copy |
|---|---|---|---|---|---|
| initial running | `true` | `running` | 发动机运行 | 暂停 / Pause | ENGINE RUNNING / 发动机运行中 |
| paused | `false` | `paused` | 发动机暂停 | 运行 / Run | ENGINE PAUSED / 发动机已暂停 |
| restored running | `true` | `running` | 发动机运行 | 暂停 / Pause | ENGINE RUNNING / 发动机运行中 |

The former stale paused accessible name was not reproduced. Name, pressed state, data state, action title and visible copy remained mutually consistent through both transitions.

### Generic numbered part selection and 3D feedback

The production page was placed in the crank camera/section view and paused to make an identical-angle comparison. The semantic selector received keyboard focus.

- `Home`, four `ArrowDown` keys and `Enter` selected generic value `piston`. The selector showed `活塞与活塞环 · Piston & rings`; the inspector became populated with matching Chinese/English names and current state. Visual comparison with `generic-selection-before.png` shows bright outline geometry on the piston/ring assemblies at all four cylinder positions.
- `Home`, six `ArrowDown` keys and `Enter` selected generic value `connecting-rod`. The selector showed `连杆 · Connecting rod`; the inspector names matched. `generic-connecting-rod-selected.png` shows outline geometry following the connecting-rod components across the four-cylinder mechanism; portions behind crank components remain naturally occluded.
- The pre-selection screenshot contains none of these selected-part outlines, so the outline is attributable to keyboard selection rather than static scene styling.

This verifies the end-to-end behavior in the real browser: keyboard input → generic selector value → inspector synchronization → multiple numbered 3D instances highlighted.

### Runtime errors

- Page exceptions: **0**
- Page console messages: **0**
- Failed network requests: **0**
- Evaluator exit code: **0**

## Finding disposition

| Prior finding | Round-2 result | Severity remaining |
|---|---|---|
| instructional/subtitle contrast below 4.5:1 | fixed; 6.27:1 and 6.34:1 | none |
| stale paused `aria-label` | fixed; state/name/title/copy agree | none |
| generic selection did not outline numbered instances | pass in actual browser for piston and connecting rod | none |

Scoped Round-2 finding count: **P0=0, P1=0, P2=0**.

## Evidence

- `results.json` — raw computed contrast, control state, selector/inspector and runtime results
- `contrast-and-initial-state.png` — contrast samples in the production UI
- `paused-state.png` — paused visible state
- `generic-selection-before.png` — fixed crank/section state before selection
- `generic-piston-selected.png` — generic piston selection and multi-instance outlines
- `generic-connecting-rod-selected.png` — generic connecting-rod selection and multi-instance outlines
- `console-and-errors.json` — empty page-error/console/network-failure arrays
- `environment.json` — tested build/tool identity
- `round2-accessibility-recheck.mjs` — read-only evaluator
- `run.log` — bounded run and exit status

## Recommendation

**Release the Round-2 automated/agent-assisted accessibility and visual-interaction gate.** The two prior defects are resolved and the generic-selection regression check passes without console or page errors. This recommendation is limited to the retested scope and the already-preserved broader evidence. It is not a claim of full WCAG 2.2 AA conformance or real-user accessibility: NVDA still requires a real human operator.
