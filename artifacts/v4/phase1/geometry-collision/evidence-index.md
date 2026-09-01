# V4 几何与碰撞审查证据索引

固定对象：`7e5ea916a115dcef1bf3ba467a31b78c6206c612`。本索引区分最终有效证据、复现入口、运行日志以及保留但不得用于结论的失败/被替代尝试。SHA-256 均在报告收尾时重新读取现有文件计算；没有重跑成功测量。

## 冻结输入（只读，目录外引用）

| 输入 | SHA-256 | 用途 |
|---|---|---|
| `artifacts/external-eval/geometry/export/semantic-engine.glb` | `8848aa63e50afc7154b92f8140a3d36dcb39b42e7f5b222b863a149abaeec43a` | 唯一几何对象 |
| `artifacts/external-eval/geometry/export/semantic-engine.manifest.json` | `0b8cb455c6f029105c81a5ce31525fdfb1cfea7bfd379f4d6c47e81cf5375b1a` | 语义名、分类、闭合期望、几何哈希 |
| `artifacts/external-eval/mechanics/assembly-scan.json` | `5fb3def6a45e0b9365dc8e93ae458da166b7e69aa92f017f9e584ea084e9aed4` | 721 个独立姿态快照 |
| `evaluation/config/collision-whitelist.json` | `0eb5ab7d6e298b5227102550c124326c114aad791eab9d65479fb833a6b5fce2` | 冻结的有意配合清单；未修改 |
| `evaluation/config/protocol.json` | `2e2bab5fe2df00087077a4dcc4673ae67bde84869de9d1c9a0a214a604b1c79d` | 冻结阈值和范围 |

## 最终有效结果

| 文件 | SHA-256 | 结论 |
|---|---|---|
| `trimesh/results.json` | `947c148ace374c87ea00f7f865f7adfa9f56d3e118457d8e3ca0474fb4564637` | Trimesh 474 节点拓扑复现 |
| `blender/results.json` | `6ee025995593a181cd76360b7c12bfb8a99da1c45843238f721145e71297079f` | Blender 474 节点独立拓扑复现 |
| `collision/collision-scan.json` | `d81710609ad8f2ed95c0a917267fd733eb2852c41be4cc154d7f633d35288ab4` | 冻结 721 点扫描复现；代理量只作为待分类输入 |
| `duplicate-seam-analysis.json` | `88dd55d9a471aa1c07978ec011bc10b564c46d1d581629df082747bbfc8cfffa` | 位置重复点的法线/UV 接缝与同属性冗余分解 |
| `sampling-coverage.json` | `fdd7a6509bd13ee11cd115c01c5ec54ce854a7887931f7c30ed6f60fad33c2b0` | 48 点曲轴聚合采样的语义节点覆盖 |
| `blender-narrow-phase.json` | `ef0c4465268bc9c8af147806b96b1eab8222538cdee3dd28da9d2d9132065d45` | 最终 attempt-03；正确坐标映射；主缸体与缸套 pair 全部 721 点三角面窄相 |

## 最终报告与机器可读裁决

| 文件 | SHA-256 | 说明 |
|---|---|---|
| `audit-report.md` | `0f1ac73e6ecb34641964ad6ec2cebd657076d995de24c91899f7bff088752425` | 人类可读的独立审查 |
| `summary.json` | `c2d344684b0c40c37858cdbfdeb253510d922ecf2427021f90e5f9b0c2757f83` | 13 个重点 pair、拓扑、覆盖、评分与验收的机器可读摘要 |
| `commands-and-exits.json` | `feb4b576d82f9e5919179b0664bb1b3a0aa89cbd2ecc2be630acb93a694428da` | 工具版本、命令、退出码及逻辑有效性 |

## 审查探针与复现入口

| 文件 | SHA-256 | 边界 |
|---|---|---|
| `repro_trimesh.py` | `ad151f1d3208204082f95c5d8ae3f85f50da0f2b11718fe195400ab931a54f37` | 仅把冻结 Trimesh 输出重定向到 V4 目录 |
| `repro_collision.py` | `b5a9d120983fc1aceda7e29feaec79d2b74b6395eb5b2181f7f0edbdd59957c1` | 仅把冻结碰撞输出重定向到 V4 目录 |
| `analyze_duplicate_seams.py` | `1907bf8b0aa01cdf14ee0b87b6e3c91955d7e6cb2a471c5e7b32eca0a7a3d5ed` | 只读比较同位置点的 normal/UV 属性 |
| `analyze_sampling_coverage.py` | `09f83f84b6cb329d6c63e3e37f11133a2d50f5025ca5c865307b7b718b7c7a98` | 精确重放冻结 48 点选择并回溯语义节点 |
| `blender_narrow_phase.py` | `9018d670549c980a4931c7d13751a3d98ae5a4d18271d08ec906f15b398f88a5` | Blender 全三角 721 点窄相，不导入项目运动学代码 |

## 有效运行日志

| 文件 | SHA-256 | 状态 |
|---|---|---|
| `trimesh-run.log` | `5335a9584e6f7903fc94e4c11cecd6249d7a5d350938eff4e3cef02db91726e3` | 有效，退出 0 |
| `blender-run.log` | `12aced8cde3281f44ad590b82aad2e2d1a1716b6a2becb9a295e8db343628f21` | 有效，退出 0 |
| `collision-run.log` | `010b25a0d0970797028afc54d9a1e685f32e467a6199e8488dec97623a677809` | 有效复现，退出 0；其判定仍需窄相分类 |
| `duplicate-seam-run-attempt-02.log` | `667acdaf57bb1d17dc239a2d5c0c57a793fbccbf662dde4960a73806ef58e6cf` | 有效，退出 0 |
| `sampling-coverage-run-attempt-02.log` | `a7139303eb75e1f6fd6fa52c10d5da0c75a585ec1d8434feb14a8a2a4ba41888` | 有效，退出 0 |
| `blender-narrow-phase-run-attempt-03.log` | `ce6ee5f2c87a6af7ef66b7a06587410983e683b9527ecee2386bd91338ef56fb` | 最终有效，退出 0 |

## 保留但不得用于最终结论的尝试

| 文件 | SHA-256 | 原因 |
|---|---|---|
| `duplicate-seam-run-attempt-01-failed.log` | `3d9f8f07b03959dd3bb2a7f55284f34f1e1b63feae944f7358075d9c76ec5138` | 退出 1；未跳过 PointCloud |
| `sampling-coverage-attempt-01-classifier-bug.json` | `efd000979f32353ce881eadb61290e743add01ab2732e64bb4ea0a248ff31463` | 命令退出 0，但角色分类顺序错误 |
| `sampling-coverage-run-attempt-01-classifier-bug.log` | `aa58f4340dd12cf294efaada050aaeb0b37c7ecc93973b8c1e3ff5cda40092a5` | 对应上述逻辑无效尝试 |
| `blender-narrow-phase-attempt-01-axis-bug.json` | `6db58dc63a3606922c7939b994275016d5e5eb8814b85b42c288c567bf81cf50` | glTF Y-up 动态变换未转换为 Blender Z-up |
| `blender-narrow-phase-run-attempt-01-axis-bug.log` | `9ba80fcaa772ef03379c71a4ecb81cae8af917c3dc9380984703be04e46b2fb2` | 对应 attempt-01，命令 0 但逻辑无效 |
| `blender-narrow-phase-attempt-02-representative-only.json` | `293f841b0a8122eaf59ac2f021273a7ea3461a273ee627f231b82d650bae542d` | 坐标已正确，但主缸体仅八个代表角；被 attempt-03 覆盖 |
| `blender-narrow-phase-run-attempt-02-representative-only.log` | `62ea6a7c79aac6e1e16a8f6afa45a9ff87db520aa7414b627dd9cdf9fa34ad2e` | 有效但不完整，保留审计轨迹 |

## 证据完整性说明

- 所有最终 JSON 都声明目标提交为 `7e5ea916a115dcef1bf3ba467a31b78c6206c612`。
- Trimesh、Blender、冻结扫描和窄相均消费同一 GLB；窄相记录的 GLB、manifest、快照哈希与上表一致。
- `collision-whitelist.json` 未修改，窄相没有读取白名单来排除三角相交。
- 没有生成碰撞截图；任务允许“截图或几何证据”，本文采用可复现的固定角度/全角度三角面编号、相交对数和质心作为几何证据。
- 恢复后只整理报告和校验文件，没有重跑成功的 Blender、Trimesh、721 点、重复顶点、覆盖或 attempt-03 测量。
