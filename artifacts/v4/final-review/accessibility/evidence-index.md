# Evidence index

## Preserved nine-state axe evidence

- `axe-reproduction/accessibility/accessibility-run-01-summary.json` — valid state aggregate and the post-capture timeout exit
- `axe-reproduction/accessibility/manifest-run-01.json` — original evidence manifest
- `axe-reproduction/accessibility/axe/*/run-01/axe-result.json` — nine raw axe results
- `axe-reproduction/accessibility/axe/*/run-01/ax-tree.json` — nine accessibility trees
- `axe-reproduction/accessibility/axe/*/run-01/state-metadata.json` — state setup/validation
- `axe-reproduction/accessibility/axe/*/run-01/screenshot.png` — state screenshots
- `axe-reproduction/accessibility/manual/run-01/keyboard-focus.json` and `.png` — real Tab order and focus visibility
- `axe-reproduction/logs/accessibility-run-01.log` — original command log and timeout
- `axe-reproduction/environment/accessibility-run-01.json` — tool/environment record
- `axe-evidence-hashes.json` — SHA-256 manifest of the above preserved evidence

## Supplemental independent evidence

- `manual/results.json` — keyboard selection, reverse sync, ARIA state, AX tree, scroll, contrast, 200% and narrow measurements
- `manual/environment.json` — command, tool versions, exit code and environment
- `manual/console-and-errors.json` — zero page exceptions/console messages
- `manual/run.log` — bounded run timestamps
- `manual/keyboard-part-selection.png` — keyboard-selected semantic part and inspector
- `manual/pointer-selection-reverse-sync.png` — pointer selection synchronized to the selector
- `manual/focus-part-selector.png`, `manual/focus-xray.png` — focus-state screenshots (real Tab focus judgment comes from the preserved keyboard run)
- `manual/text-resize-200.png` — 200% text-resize view
- `manual/narrow-initial.png`, `manual/narrow-left.png`, `manual/narrow-right.png`, `manual/narrow-right-picker-focus.png` — 390×844 drawer/reflow evidence
- `final-accessibility-review.mjs` — read-only evaluator source used to create supplemental evidence

## Review outputs

- `review-report.md` — independent findings and release disposition
- `summary.json` — machine-readable disposition

NVDA is intentionally absent: it requires a real human operator and remains pending.
