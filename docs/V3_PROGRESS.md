# V3 可恢复进度

最后更新：2026-08-31 03:39（提交前检查点，Asia/Shanghai）

## 当前阶段

阶段 0、阶段 1、第一轮定向实现、完整验证、三路独立最终复验和最终质量报告均已完成。Pauli、McClintock、Cicero 都建议放行，P0/P1 均为 0，没有审查者提出仍可低风险实现的明显高收益项。提交前类型检查、22/22 正式测试、生产构建与 `git diff --check` 再次通过；尚未创建 v3 提交。

## 当前 HEAD 与工作树

- 项目：`D:\ComputePicture\codex-inline4-multiagent`
- HEAD：`12472172925ec3108d096f2402a48e3f7939931b`
- `v1-baseline^{}`：`5518627ae0430add55b31cd8a4c3e8fb5ab02db3`
- `v2-baseline^{}`：`12472172925ec3108d096f2402a48e3f7939931b`
- Git remote：无
- 创建本文件前工作树：干净
- 当前工作树：保留全部 v3 已跟踪源码改动，以及未跟踪的 `docs/V3_PROGRESS.md`、`artifacts/v3/`、`src/scene/mechanical-geometry.ts`、`tests/scene-geometry.test.ts`、`vitest.config.ts`；尚未提交

## 已完成事项

- 只读确认路径、HEAD、干净工作树、v1 标签和无远程仓库。
- 创建 annotated tag `v2-baseline`，标签对象 `8e3c5cabf610396108efede27a2984b5ad0f20dc`，剥离后精确指向 v2 提交。
- 检查代理树：3 个既有子代理均可恢复；最大并发为 3 个子代理。
- 完成三路阶段 1 独立只读审查：机械 76/100、视觉 74/100、交互性能 QA 82/100。
- 裁决视觉报告的标签表述冲突：`f18862a...` 是 annotated tag 对象，`v1-baseline^{}` 实际仍精确指向 `5518627...`；标签未被修改。
- 生成 `artifacts/v3/phase1/synthesis.md`，记录候选收益/成本/风险/验收、选用与暂缓理由、权威资料和简化边界。
- 完成第一轮实现：平底挺柱凸轮支承包络与闭合阀系、负载喷油量、显式分支流路与逐缸进排气、涡轮一阶惯性、附件皮带与 2:1 定时传动、机位/模式单一真源、窄屏抽屉、顶部机位、暗部补光、贴合网格选中轮廓、定向实例化和验收扩展。
- 主代理在快速浏览器检查中否决了第一版“径向凸轮”实现：虽理想公式通过，但真实平底挺柱支承会产生约 3 mm 干涉；已改为满足支承函数条件的 quartic 升程与平底挺柱凸轮包络，生产几何逐角度间隙测试为 0.48–0.70 mm 范围内且无穿透。
- 完成最终生产包验证：类型检查、22/22 正式单元测试、构建、Intel Arc 硬件浏览器、SwiftShader、桌面/390×844 窄屏、六机位、三模式、流体开关、爆炸、网格选择、轨道/缩放/平移与控制台检查全部通过。
- 负向夹具故意注入 6 类故障，脚本捕获全部 6 类并按预期以退出码 1 拒绝验收，证明验收不是恒真。

## 代理

| 代理 | v3 职责 | 当前状态 |
|---|---|---|
| `/root` | 项目负责人、接口、汇总、整合、最终裁决 | running |
| Pauli / `/root/v2_mechanical_audit` | 机械与运动学只读审查；最终复验端口 15411 | completed；91/100，P0/P1/P2=0，建议放行，端口已停止 |
| McClintock / `/root/v2_visual_audit` | 程序化几何与视觉只读审查；最终复验端口 15412 | completed；88/100，P0/P1=0，2项P2有不实施证据，建议放行，端口已停止 |
| Cicero / `/root/v2_performance_audit` | 交互、性能与 QA 只读审查；最终复验端口 15413 | completed；92/100，P0/P1=0，2项P2有不实施证据，建议放行，端口已停止 |

## 证据目录

- 机械：`artifacts/v3/phase1/mechanics/`
- 几何与视觉：`artifacts/v3/phase1/visual/`
- 交互、性能与 QA：`artifacts/v3/phase1/qa/`
- 第一轮冒烟：`artifacts/v3/round1/smoke/`
- 第一轮硬件初验：`artifacts/v3/round1/acceptance-hardware-prelim/`
- 第一轮 SwiftShader 语义脚本调试：`artifacts/v3/round1/acceptance-swiftshader/`
- 第一轮最终硬件：`artifacts/v3/round1/final/hardware-immediate/`
- 第一轮最终 SwiftShader：`artifacts/v3/round1/final/swiftshader-immediate/`
- 第一轮最终负向夹具：`artifacts/v3/round1/final/negative-fixture/`
- 中断前最终机械复验证据：`artifacts/v3/final-review/mechanics/browser/`
- 中断前最终视觉复验证据：`artifacts/v3/final-review/visual/browser/`
- 中断前最终 QA 硬件/软件证据：`artifacts/v3/final-review/qa/hardware/`、`artifacts/v3/final-review/qa/swiftshader/`
- 最终机械报告与探针：`artifacts/v3/final-review/mechanics/audit-report.md`、`scorecard.json`、`mechanical-probe.json`
- 最终视觉报告与18张截图：`artifacts/v3/final-review/visual/audit-report.md`、`scorecard.json`、`browser/`
- 最终 QA 报告、统计与负向夹具：`artifacts/v3/final-review/qa/audit-report.md`、`scorecard.json`、`assembly-stats.json`、`negative/`

三份 `audit-report.md` 与 `scorecard.json` 均完整；包含桌面/窄屏、三模式、六机位、选择、流体、硬件 GPU、SwiftShader、负向夹具与机械探针证据。视觉证据没有独立爆炸模式截图，报告已明确不作无证据结论。

## 已修改文件

- 文档/证据：`docs/V3_PROGRESS.md`、`artifacts/v3/phase1/synthesis.md`、`artifacts/v3/round1/`
- 集成/UI：`src/app.ts`、`src/ui/dashboard.ts`、`src/style.css`
- 机械/场景：`src/engine/kinematics.ts`、`src/scene/assembly.ts`、`src/scene/constants.ts`、`src/scene/effects.ts`、`src/scene/index.ts`、`src/scene/materials.ts`、新增 `src/scene/mechanical-geometry.ts`
- 测试：`scripts/browser-acceptance.mjs`、`tests/effects.test.ts`、新增 `tests/scene-geometry.test.ts`、新增 `vitest.config.ts`

## 已运行测试

- 机械审查：正式测试 17/17、独立机械探针 3/3、生产构建与 SwiftShader 浏览器验收通过；页面/控制台异常 0。
- QA 审查：正式测试 17/17、类型检查、生产构建、Intel Arc D3D11 与 SwiftShader 浏览器验收通过；负向夹具 10 项失败并正确返回退出码 1。
- 硬件实测：Intel Arc D3D11 120 FPS、p95 8.4 ms、约 377.11 draw calls/frame。
- 软件实测：SwiftShader 3.76 FPS、p95 566.7 ms、约 376.60 draw calls/frame；不作为普通电脑帧率结论。
- 视觉证据：Edge/SwiftShader 下 1280×720、1600×1000、390×844，三模式、六机位、选择与流体截图完成；测试发现被 artifacts 中 `.test.ts` 污染的问题已记录。
- 第一轮实现后类型检查通过；正式测试固定为 3 文件 22/22，通过且不再发现 artifacts 中审查测试。
- 第一轮实现后生产构建通过：JS 608.39 kB（gzip 160.60 kB），保留单块 >500 kB 提示。
- 硬件初验通过：Intel Arc D3D11 120 FPS、p95 8.4 ms、269.22 draw calls/frame、页面/控制台错误 0；相对 v2 的约 377.11 draws/frame 降低约 28.6%。
- 窄屏初验：390×844 初始可见面板宽度 0、六机位均可达；左右 310 px 抽屉分别可打开、ARIA 状态正确，关闭后恢复无遮挡。
- SwiftShader 初次扩展验收的应用功能均正常；脚本在同一个长 `Runtime.evaluate` 内读取 CSS 过渡导致抽屉宽度假阴性。已改为跨浏览器任务分段等待，随后硬件路径通过。该失败证据保留，不覆盖。
- 最终硬件实测通过：Intel Arc D3D11，1280×720，120.00 FPS、p95 8.4 ms、max 8.5 ms、269.23 draw calls/frame；桌面/窄屏布局、全部交互、页面异常和应用控制台错误均为 0。
- 最终 SwiftShader 实测通过：Vulkan SwiftShader，1280×720，12.11 FPS、p95 91.7 ms、max 100.1 ms、269.24 draw calls/frame；不代表普通电脑硬件帧率。为保证该低性能路径的窄屏抽屉确定性，移动端取消抽屉动画并即时切换可见状态。
- 最终负向夹具按预期失败：捕获 canvas 缺失、窄屏溢出、暂停遥测未保持、快捷键语义错误、轨道旋转无变化、页面异常共 6 类，退出码 1。
- 2026-08-31 03:38 提交前门禁再次通过：类型检查 0 错误、3 文件 22/22 测试、生产构建、`git diff --check`；最终三份审查报告与质量报告路径均存在。

## 未解决问题

- 视觉与 QA 保留真剖切封口/工程剖面线为 P2；需多遍/stencil 或代理封口，和透明、阴影、动态件、拾取、性能高度耦合，两名独立审查者均给出高成本/高风险的非阻断裁决。
- 视觉保留外壳铸造轮廓重塑为 P2；需要重组缸体/缸盖程序化几何，独立审查认为不应在收口阶段无依据大改。
- QA 保留自动像素差异与窄屏横向机位点击为 P2 测试余量；当前功能已有人工截图和状态证据通过，跨 GPU 稳定视觉基线成本中等且会增加假失败维护。
- 生产 JS 单块 608.48 kB（gzip 160.64 kB）仍有 Vite 500 kB 提示；QA 将其评为 P3，硬件实测无当前瓶颈证据。
- 代理额度中断发生在独立最终复验报告整理阶段。2026-08-31 恢复时确认 328 个 v3 证据文件（约 118.02 MiB）均保留，未删除或覆盖。
- 三路最终报告现已全部完成：机械 91、视觉 88、QA 92，均建议放行；平均分从 v2 的 77.3 提升至 v3 的 90.3。

## 下一步唯一动作

创建普通 v3 Git 提交，然后核对 `v1-baseline^{}`、`v2-baseline^{}`、新 HEAD、干净工作树和无远程仓库。
