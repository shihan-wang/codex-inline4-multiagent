from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("v4_check", HERE / "v4_check.py")
assert SPEC is not None and SPEC.loader is not None
V4 = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(V4)


class V4BoundaryTests(unittest.TestCase):
    def test_frozen_bundle_has_exact_required_role_counts(self) -> None:
        bundle = V4.load_bundle(HERE / "fixtures" / "v3-frozen-input.json")
        counts = {item["role"]: item["manifestNodes"] for item in bundle["coverageChecks"]}
        self.assertEqual(counts["crankshaft"], 44)
        self.assertEqual(counts["timing-sprocket"], 19)
        self.assertEqual(counts["timing-chain"], 1)
        self.assertEqual(counts["accessory-belt"], 1)
        self.assertEqual(counts["accessory-pulley"], 1)
        self.assertTrue(all(item["pass"] for item in bundle["coverageChecks"]))

    def test_dry_report_keeps_proxy_and_surface_sections_separate(self) -> None:
        bundle = V4.load_bundle(HERE / "fixtures" / "v3-frozen-input.json")
        report = V4.base_report(bundle, "dry-run")
        self.assertIn("proxy", report)
        self.assertIn("surfaceIntersection", report)
        self.assertFalse(report["proxy"]["source"]["importedAsCollisionTruth"])
        self.assertFalse(report["surfaceIntersection"]["proxyDepthComputed"])

    def test_runtime_whitelist_extension_is_not_a_cli_or_pair_escape_hatch(self) -> None:
        bundle = V4.load_bundle(HERE / "fixtures" / "v3-frozen-input.json")
        with self.assertRaises(V4.InputError):
            V4.exact_allowed_contact(bundle["whitelist"], {"a": "new-a", "b": "new-b"})

    def test_cli_dry_run_writes_only_selected_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "report.json"
            code = V4.main([
                "--input", str(HERE / "fixtures" / "v3-frozen-input.json"),
                "--output", str(output),
                "--dry-run",
            ])
            self.assertEqual(code, 0)
            report = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(report["pass"])
            self.assertEqual(report["range"], V4.RANGE_721)
            self.assertEqual([item.name for item in Path(directory).iterdir()], ["report.json"])


if __name__ == "__main__":
    unittest.main()
