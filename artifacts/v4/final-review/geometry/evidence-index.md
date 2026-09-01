# V4 几何最终复验证据索引

## 原始测量（恢复后未重跑）

| 文件 | 字节 | SHA-256 | 用途 |
|---|---:|---|---|
| `dry-run.json` | 14,824 | `fcd59cf9b6f0975c263e4fe66f2ec352d94de1558590b1e22096f88f0715891b` | 输入哈希、角色、扫描契约 |
| `dry-run.log` | 233 | `7543ea30de13c5d0ce901421e3e291966814db2abc9ebeef07b9d8b62e66d9a0` | dry-run 通过摘要 |
| `trimesh-results.json` | 431,301 | `785e89abb6fe964baa2b33b384864d925d0d5cde27fd4997c88ea28815f178a9` | Trimesh 497 节点拓扑原始结果 |
| `trimesh-run.log` | 722 | `9bb82e24061b6f0d479afa722ea745e29c740eccf7a9198de37b726f12bc0044` | Trimesh 摘要日志 |
| `blender-results.json` | 430,998 | `4ae2bcf2eae0ed1af8dc33a92bc836bcff0dc08d7454bed66a955775844df684` | Blender 497 节点拓扑原始结果 |
| `blender-topology-run.log` | 24,660 | `c5eee2caf41cd6daa62304f1a9b1b144bf5a19d1c4314048a9826a3bec3be6bf` | Blender 导入、版本和摘要日志 |
| `v4-surface-report.json` | 2,885,466 | `71dab393da8d61869beef822aa410f1f90b01a6000913687f857536bfd8aeeb2` | 721 点、完整语义节点、全三角窄相原始报告 |
| `v4-surface-run.log` | 24,372 | `d116d52d7c3c119c8bc7b4c8d1521908fc6beb211b94e87ecdd79bf7e2a6ad1b` | Blender 5.2.1 和 `pass=false` 摘要 |
| `input-hashes.json` | 1,075 | `ed1d968b9291ff65bcb6bcdc506993d9b5617bcc212f8da586b4816271396adc` | 预登记输入哈希快照 |

## 实际生产页面证据（本次追加）

| 文件 | 字节 | SHA-256 | 用途 |
|---|---:|---|---|
| `browser/fixed-angle-crank-section-1280x720.png` | 489,805 | `76498aa3fcbba69307a588d1ed9d110a97892972ebc898230868aaba8fc2c61a` | 曲轴剖切固定角度画面 |
| `browser/fixed-angle-valvetrain-xray-1280x720.png` | 573,292 | `aa614b7b617bbb1fcb324b7dc7d50d4ec3c8a19171ca7d5ac52170c5688568e1` | 配气/燃烧 X-Ray 固定角度画面 |
| `browser/fixed-angle-page.json` | 897 | `6531cb0b3ad73d59bf621a97811574e2b8ac1991179dbe9a837b6d8ca51f85e3` | Renderer、Canvas、暂停状态、console/page error |
| `capture-fixed-page.mjs` | 3,425 | `70fd34bcf5c2c065a3f9cf792ac3a90a78553c7a9df546a2147730825f4eda99` | 可复现捕获脚本；不属于产品 `src/` |

## 审查产物

- `final-review-report.md`：证据解释、四类裁决、P0/P1/P2、风险和验收。
- `summary.json`：机器可读结论。
- `commands-and-exits.json`：实际命令与退出语义。
- 本索引仅引用原始证据；不替代原始 JSON。

## 外部输入哈希复核

恢复时重新计算以下五项，全部与 `input-hashes.json` 一致：

- `evaluation/v4/fixtures/v4-round1-input.json`：`0c31d8a45c573b29f439e425172107257a6b7d28cd53f8fd8cf1d2b149697186`
- `semantic-engine.glb`：`1dae7d0d2bb557b4bc04c8f09d895b1a7a9ce29bcdd77889f4425b9a96f85100`
- `semantic-engine.manifest.json`：`3c0ddbae24eb86b5f3bb15d1ecd87f0819313bba8ff6d8a03f2d316ebcc209e7`
- `assembly-scan.json`：`b8ec4cac0342119ccd95a81fe623d324cf289a80980ba82e756f75d40b40de72`
- 冻结白名单：`0eb5ab7d6e298b5227102550c124326c114aad791eab9d65479fb833a6b5fce2`
