"""Run the frozen 721-sample evaluator while redirecting only its output."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
SOURCE = ROOT / "artifacts" / "external-eval" / "mechanics" / "collision-scan.py"
OUTPUT = Path(__file__).resolve().parent / "collision" / "collision-scan.json"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

spec = importlib.util.spec_from_file_location("v3_frozen_collision_scan", SOURCE)
assert spec and spec.loader
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
module.OUTPUT = OUTPUT
module.main()
