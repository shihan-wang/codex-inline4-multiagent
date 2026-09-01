# V4 final engineering verification

Date: 2026-09-01 (Asia/Shanghai)

This gate was run only after the independent Round-3 geometry and visual/performance reviewers returned GO. It did not repeat Spector, Lighthouse, Blender, Trimesh, the 721-angle scan, or either sustained WebGL path.

## Environment

- Node.js: `v24.14.0`
- npm: `11.9.0`
- TypeScript command: `npm run typecheck`
- Test command: `npm test`
- Build command: `npm run build`
- Diff integrity command: `git diff --check`

## Actual results

| Gate | Exit | Result |
| --- | ---: | --- |
| TypeScript | 0 | `tsc --noEmit`; no diagnostic |
| Complete unit suite | 0 | Vitest 3.2.7; 4 files, 28/28 tests passed |
| Production build | 0 | Vite 7.3.6; 21 modules transformed |
| Diff integrity | 0 | No whitespace error; only Git's informational LF-to-CRLF warnings |

Test split: dashboard accessibility 3, kinematics 16, effects 2, scene geometry 7.

Production output:

- `dist/index.html`: 0.91 kB, gzip 0.59 kB
- `dist/assets/index-93DqoS68.css`: 13.83 kB, gzip 3.91 kB
- `dist/assets/index-BuZ4WUmu.js`: 615.94 kB, gzip 162.81 kB

The Vite warning for a minified chunk above 500 kB remains a non-fatal P3 advisory; it was not hidden or converted into a pass claim.

## Reused valid gates

- V4 evaluator boundary unit tests: 4/4 passed before Round-3; the evaluator implementation did not change afterwards.
- Negative browser fixture: six injected failures were all detected with the expected non-zero exit before the final geometry-only correction; the browser acceptance implementation did not change afterwards.
- Round-2 accessibility release: P0/P1/P2=0 in the retested scope; NVDA remains human-pending.
- Round-3 geometry release and Round-3 renderer/browser release are recorded in their independent reports.
