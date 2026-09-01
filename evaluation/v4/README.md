# V4 independent geometry evaluator

This directory is an additive evaluation boundary. It does not import product
kinematics, modify the semantic export, update the frozen collision whitelist,
or write into `artifacts/external-eval`. The only output is the caller-selected
`--output` report (written atomically); replacing an existing report requires
the explicit `--overwrite` flag.

## What it checks

- Every registered moving semantic GLB node is loaded separately. The frozen
  fixture requires crankshaft `44/44`, timing sprocket `19/19`, timing chain
  `1/1`, accessory belt `1/1`, accessory pulley `1/1`, and cam lobe `16/16`.
  There is no aggregate 48-point crank mesh.
- Full mode covers the inclusive `0..720` degree registry at `1` degree steps
  (`721` snapshots). It uses Blender `BVHTree.overlap` on complete exported
  triangle surfaces and reports the responsible moving and target semantic
  node. AABB/containment and sparse surface witnesses are not collision truth.
- The existing pre-registered whitelist is opened read-only. The input file
  pins its SHA-256; a changed file fails before Blender starts. There is no CLI
  option for adding an allowed contact. A pair can use an intended-contact
  exclusion only when its exact `a`/`b` registration already exists in that
  frozen file.
- `proxy` and `surfaceIntersection` are distinct report sections. Prior proxy
  evidence is referenced only by path and hash and is explicitly not imported
  as physical penetration or collision truth.
- Cam-lobe winding, watertight node count, degenerate triangles, and duplicate
  faces are recomputed per node and compared with the registered Blender
  baseline. This lets the V4 result show the expected winding delta while
  guarding the other three topology properties.

## Commands

Create a V4 semantic GLB without touching the frozen external-evaluation
directory. `--output-dir` is mandatory and the wrapper refuses any resolved
path outside `artifacts/v4/`. It reuses the checked-in exporter source, stages
the generated files outside the repository, then publishes the GLB and
manifest to the requested directory. Existing outputs are not replaced unless
`--overwrite` is explicit.

```powershell
node evaluation/v4/export_semantic_v4.mjs `
  --output-dir artifacts/v4/<run>/semantic-export
```

Create the matching independent 0..720-degree snapshot registry in a V4-only
directory. This wrapper preserves the scanner's independent formulas, redirects
its hard-coded output through a system temporary directory, and refuses to
replace an existing result.

```powershell
node evaluation/v4/export_snapshots_v4.mjs `
  --output-dir artifacts/v4/<run>/snapshots
```

The manifest records the current HEAD, whether `src/` has uncommitted changes,
the reused exporter source hash, and the final V4 output path. The wrapper
never invokes the original hard-coded runtime entry, so it cannot first write
and then copy from `artifacts/external-eval`.

Lightweight contract validation with ordinary Python (does not load Blender,
does not scan triangles, and is safe to use with the existing frozen evidence):

```powershell
python evaluation/v4/v4_check.py `
  --input evaluation/v4/fixtures/v3-frozen-input.json `
  --output <caller-path>/v4-dry-run.json `
  --dry-run
```

Full independent scan through Blender:

```powershell
blender --background --factory-startup `
  --python evaluation/v4/v4_check.py -- `
  --input <pre-registered-v4-input.json> `
  --output <caller-path>/v4-surface-report.json
```

Run the lightweight tests:

```powershell
python -m unittest evaluation/v4/test_v4_check.py
```

Do not point a V4 run at the frozen external-evaluation output path. Create a
new input JSON from the fixture, update its GLB/manifest/snapshot references to
the candidate export, retain the existing whitelist path and pinned hash, and
pre-register any changed semantic selectors or scan pairs before the run.

## Report shape

```text
inputHashes
frozenWhitelist
roleCoverage[]                 # manifest count; full mode also has GLB-loaded count
proxy                          # reference/hash only, never triangle truth
surfaceIntersection
  pairs[]
    scanCoverage[]             # includes 44/44 and 19/19 gates
    nodes[]                    # one result per semantic mover node
      targetResults[]
        checkedAngles          # 721
        surfaceIntersectionAngleCount
        surfaceIntersectionAngleRanges
        peak                   # triangle-pair count and a triangle witness
topology
  current                      # cam aggregate
  nodes[]                      # per-cam metrics
  baselineComparison           # current-minus-baseline deltas
pass
```

The full report passes only when all registered roles are loaded and scanned,
all non-whitelisted triangle intersections are zero, and the 16 cam lobes have
zero winding errors while remaining watertight with zero degenerate and
duplicate faces. Tool completion and acceptance are therefore not conflated:
an exit code of `2` means a complete report found an acceptance failure.
