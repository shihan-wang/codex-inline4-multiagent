# V4 Round-2 几何复验证据索引

| 文件 | 字节 | SHA-256 | 用途 |
|---|---:|---|---|
| `dry-run.json` | 15,450 | `9572aa5f563293e6fbf23334e0d6750477ca784e8144a850f28484c70c7e7fad` | 输入哈希、角色和 721 点契约 |
| `dry-run.log` | 241 | `8f557f9ce69d3653d27cdd7f91fb41f8be61f643d981b4054259a2784a2de9b9` | Dry-run 退出摘要 |
| `trimesh-results.json` | 439,858 | `08e55274f4f1acb4af3581a100a4bfe2b06d5bc746c2f3c1d0e6280a6be0f1ed` | Trimesh 507 节点拓扑 |
| `trimesh-run.log` | 730 | `79152a8c49570f08e105fc12c4ed10dee321076b2da9f2a2b3126802cfcfaf46` | Trimesh 摘要 |
| `blender-results.json` | 439,691 | `76e0a517310383f679e713bbff73b2dceec1fd2b6a243d8fb320a93bb44cf336` | Blender 507 节点拓扑 |
| `blender-topology-run.log` | 25,130 | `c34a4d3cd12c453e34df0d84d3d9b173ad4b727b2a663d6014f862419bf06f96` | Blender 版本、导入和摘要 |
| `v4-surface-report.json` | 3,389,486 | `4124314dbb3c8c313dbad48534ac2ea1f18e24de40c6d1ce3a3bc87ac9a52f76` | 七组 pair、721 点全三角窄相 |
| `v4-surface-run.log` | 24,850 | `7017032ef5dfa161bf2d11f7c65709f10be4d1d423e059900fd61173e08524c2` | Full run 版本和 `pass=false` 摘要 |
| `browser/round2-crank-section-1280x720.png` | 488,556 | `4c264a15d271f6782f243278680cc26a5bb7ba2dfb976c317149992e457c903a` | 生产页曲轴剖切画面 |
| `browser/round2-valvetrain-xray-1280x720.png` | 582,825 | `dec46d6863e857fd0ed8326354844443fd15f8229f90396603d57b19235a375b` | 生产页配气 X-Ray 画面 |
| `browser/round2-fixed-angle-page.json` | 701 | `2207542f4c2ae54f4afec6c592cac881fbbae669da1da664545e88c0bd8f7276` | Renderer、Canvas、暂停姿态与错误数组 |
| `capture-fixed-page.mjs` | 3,338 | `2eeba788ccafabae4a85c33604caec3cdca0068fa9ca5d7d1b224ce15c58520c` | 只读生产页面捕获脚本 |

审查解释见 `round2-review-report.md`，机器摘要见 `summary.json`，命令与退出语义见 `commands-and-exits.json`。Round-1 文件未覆盖。
