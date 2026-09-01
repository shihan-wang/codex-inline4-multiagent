"""Run the frozen Trimesh evaluator while redirecting only its output."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "evaluation" / "geometry" / "trimesh_check.py"
OUTPUT_DIR = Path(__file__).resolve().parent / "trimesh"

spec = importlib.util.spec_from_file_location("v3_frozen_trimesh_check", SOURCE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.OUTPUT_DIR = OUTPUT_DIR
module.OUTPUT_PATH = OUTPUT_DIR / "results.json"
raise SystemExit(module.main())
