# V4 Round-3 independent geometry review evidence

- `v4-surface-report.json` — full Blender triangle-surface scan, 0–720° inclusive at 1°; SHA-256 `9350af225ea3060aed3561ae4ed234a36f3985c7e7387a415f4e4710fab18a70`.
- `trimesh-results.json` — independent Trimesh topology result; SHA-256 `5a19c7a15fc273b94b2af8543c364c335623799268eddd6f6c8e000af4e4f99d`.
- `blender-results.json` — independent Blender BMesh topology result; SHA-256 `5de31e745408047125b8f215ebdc373b458dbfae9b82ab41d5f0c9c2d234e156`.
- `browser/round3-crank-section-1280x720.png` — paused 598.3° crank-section production page; SHA-256 `ce771a5afefd64564c435222c2beef9130131b80e5347a1d29f4ac0217df6d3e`.
- `browser/round3-valvetrain-xray-1280x720.png` — same-angle valvetrain X-Ray production page; SHA-256 `27e5eab4e5873e3f03df2d034f0f5bf8f09916219a5f349b01e1f8ca71bae31f`.
- `browser/round3-fixed-angle-page.json` — Intel Arc renderer, mode/preset, fixed angle and error channels; SHA-256 `0e7ce62fa59a61e77cc5896b21ea208674407677646bbe93675dbed8f047a2d5`.
- `commands-and-exits.json` — exact commands and successful exit status.
- `summary.json` — compact gate result.
- `review-report.md` — independent finding classification and release recommendation.

Frozen inputs:

- Round-3 input SHA-256 `a351372fa9153a47848c2b2ca9442ba179b2e326c5a3d3324e34f5e2fa7cb0eb`.
- GLB SHA-256 `1e0ec6d82c0bcd11122bf805d8387f42da9346dabcbdce7f3fead4ab61022ad0`.
- Manifest SHA-256 `d5b2e3f581dec7f4ec3a868c05f19d71d6a1e29334c9a6d5b60d7f073ee5b586`.
- 721-angle snapshot registry SHA-256 `b8ec4cac0342119ccd95a81fe623d324cf289a80980ba82e756f75d40b40de72`.
- Frozen whitelist SHA-256 `0eb5ab7d6e298b5227102550c124326c114aad791eab9d65479fb833a6b5fce2`.

No Round-1/2 evidence was rerun or overwritten. This reviewer did not change `src/` or the collision whitelist.
