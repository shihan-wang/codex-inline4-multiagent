# Inline-4 Diesel V3 多代理质量报告

日期：2026-08-31（Asia/Shanghai）  
项目：`D:\ComputePicture\codex-inline4-multiagent`  
V2 基线：`12472172925ec3108d096f2402a48e3f7939931b`（`v2-baseline^{}`）  
V1 基线：`5518627ae0430add55b31cd8a4c3e8fb5ab02db3`（`v1-baseline^{}`）

## 结论

V3 在保留 v1/v2 历史、无远程仓库、无外部付费 API、核心几何与运动逻辑继续由源码生成的前提下完成。三名未参与实现的独立审查者均建议放行：机械 91/100、视觉 88/100、QA 92/100；同一量表平均分由 V2 的 77.3 提升至 V3 的 90.3（+13.0）。三路 P0/P1 均为 0，没有审查者提出仍可低风险完成的明显高收益改进。

本报告所称“最高质量”限定为：在本次实验版本、代理能力、工具、本地 Intel Arc 硬件和可用额度条件下，经评分驱动的多代理审查—实现—实机复验循环得到的版本；不表示 Codex 的理论永久上限。

## 代理、职责与最终状态

| 代理 | 阶段 1 | 实施阶段 | 最终独立复验 | 最终状态 |
|---|---|---|---|---|
| `/root`（主代理） | 接口、证据汇总、冲突裁决 | 唯一核心源码整合者 | 只做报告核验，不代替独立评分 | 完成 |
| Pauli / `/root/v2_mechanical_audit` | 机械与运动学只读审查，76/100 | 未参与 | 实际生产页面、生产装配探针、P2 裁决，91/100 | 完成，建议放行 |
| McClintock / `/root/v2_visual_audit` | 几何与视觉只读审查，74/100 | 未参与 | Intel Arc 真实页面、18 张截图、同尺寸对比，88/100 | 完成，建议放行 |
| Cicero / `/root/v2_performance_audit` | 交互、性能与 QA 只读审查，82/100 | 未参与 | 硬件/SwiftShader、负向夹具、场景统计，92/100 | 完成，建议放行 |

实际参与代理数为 4（主代理 1 + 子代理 3），达到本环境允许的最大安全并发：同时最多运行 3 个子代理。三个子代理在两个审查阶段均只写各自 `artifacts/v3/` 证据目录，没有修改核心源码，因此没有审查自己的实现。

## 技术路线

- TypeScript + Vite + Three.js；所有发动机零件、装配参数、动画、流体和交互均在源码中程序化生成。
- 运动学使用 720° 四冲程状态、1-3-4-2 发火顺序、90° 相位曲轴、精确滑块曲柄闭合和凸轮轴 0.5 倍速。
- 配气采用 quartic 升程与平底挺柱支承包络，不用只在峰值看似对齐的椭球凸轮。
- WebGL2 同时验证 Intel Arc D3D11 硬件路径和 Vulkan SwiftShader 软件兼容路径，两者性能不互相替代。
- 通过定向 `InstancedMesh` 合并重复件，同时保留 34 个可拾取系统根、零件检查器、三观察模式和爆炸语义。
- 自动验收结合单元/几何探针、状态语义、真实鼠标操作、截图证据和故意失败的负向夹具；没有把只点按钮或只看 DOM 当作完整浏览器验收。

## V2 与 V3 统一评分

### 各审查者同口径总分

| 审查者 | V2 | V3 | 提升 |
|---|---:|---:|---:|
| 机械 / Pauli | 76 | 91 | +15 |
| 视觉 / McClintock | 74 | 88 | +14 |
| QA / Cicero | 82 | 92 | +10 |
| **算术平均** | **77.3** | **90.3** | **+13.0** |

### 六维平均分

| 维度 | 满分 | V2 平均 | V3 平均 | 变化 |
|---|---:|---:|---:|---:|
| 机械与运动学可信度 | 25 | 20.7 | 23.2 | +2.5 |
| 程序化几何与结构完整度 | 25 | 19.3 | 22.2 | +2.8 |
| 视觉表现与教学可读性 | 20 | 15.3 | 17.7 | +2.3 |
| 交互与使用体验 | 10 | 7.5 | 9.5 | +2.0 |
| 性能与运行可靠性 | 10 | 6.8 | 8.7 | +1.8 |
| 测试、证据与可复现性 | 10 | 7.7 | 9.2 | +1.5 |
| **总分** | **100** | **77.3** | **90.3** | **+13.0** |

原始评分与逐项证据：

- [机械最终报告](../artifacts/v3/final-review/mechanics/audit-report.md) / [机械评分](../artifacts/v3/final-review/mechanics/scorecard.json)
- [视觉最终报告](../artifacts/v3/final-review/visual/audit-report.md) / [视觉评分](../artifacts/v3/final-review/visual/scorecard.json)
- [QA 最终报告](../artifacts/v3/final-review/qa/audit-report.md) / [QA 评分](../artifacts/v3/final-review/qa/scorecard.json)

## 审查驱动的具体修改

### 机械与系统表达

- 用实际平底挺柱支承包络闭合凸轮—挺柱—弹簧—气门链；阀面与缸盖燃烧室面落座，弹簧固定/运动端连续。
- 增加可见 18:36:36 曲轴/双凸轮定时轮与定时链；增加曲轴—水泵/风扇附件皮带，风扇/水泵转速比为 52/42。
- 负载单调改变可视喷油量，同时保留 0% 负载下的怠速最小量；喷油与后续热释放相位分离。
- 油、冷却、进气改为显式开放干路与四缸分支；逐缸进气支路和排气脉冲按对应气门升程门控。
- 涡轮用转速、负载与排气活动驱动的一阶惯性视觉状态，不把未标定数值冒充真实涡轮 RPM。

### 几何、视觉和教学可读性

- 增加前端传动、配气细节、分支流路与可辨材料；暗部补光使风扇、皮带轮、油底壳和曲柄机构从背景中分离。
- 顶视机位固定 up 向量和安全构图；六机位分别适配实体、剖切和 X-Ray 教学目标。
- 将巨大 AABB 选中框替换为贴合实际网格的边线轮廓；检查器继续显示中英文、材料、工艺、功能、参数和实时状态。
- 窄屏改为初始收起的互斥左右抽屉，390×844 下模型无遮挡、六机位可达；在软件渲染慢路径上采用即时抽屉状态，避免 CSS 过渡造成交互滞后。

### 状态、性能和测试

- `EngineApp` 成为机位/模式唯一真源：按钮、键盘 1–6、R 与复位高亮和语义一致。
- 仪表角度向下截断到 0.1°，避免 179.99° 被四舍五入为下一冲程的 180.0°。
- 18 个实例网格批次承载 245 个实例；相对 V2，对象 -24.0%、Mesh -32.5%、独立几何 -28.1%、三角形 -10.0%、几何缓冲 -17.7%。34 个可拾取根保持不变。
- Vitest 仅发现 `tests/**/*.test.ts`，审查探针不再污染正式测试数；新增真实凸轮顶点支承、开放流路、负载喷油和皮带几何测试。
- 浏览器验收覆盖六机位、三模式、复位/快捷键语义、暂停、滑杆、流体、爆炸、拾取、旋转/缩放/平移、窄屏抽屉和 ARIA 状态。

## 关键机械证据

独立生产装配探针结果见 [mechanical-probe.json](../artifacts/v3/final-review/mechanics/mechanical-probe.json)：

- 0/180/360/540° 发火缸依次为 1/3/4/2，四缸冲程组合正确。
- 0–720° 扫描最大曲柄连杆闭合误差 `1.42e-13 mm`；1/4、2/3 活塞配对最大误差 `1.14e-13 mm`；TDC 顶隙 `5.5 mm`。
- 凸轮轴/曲轴转速比 `0.5`；实际生产凸轮顶点与平底挺柱支承间隙为 `0.499999–0.573884 mm`，无穿透。
- 关闭阀面与缸盖面均为 `y=269 mm`；弹簧固定端漂移 `0`，运动端最大误差 `5.68e-14 mm`。
- 450° 只有缸 1 进气支路处于高活动；270° 只有缸 1 排气实例可见。
- 低负载到高负载、再卸载时涡轮视觉角速度平滑响应，未发生瞬时跳变；报告明确不作真实 RPM 声称。

实现中曾否决第一版径向凸轮：理想公式虽通过，但直接扫描真实平底挺柱支承时出现约 3 mm 干涉。该方案未被保留；改用支承包络后才进入正式测试和最终页面。这是本轮“实现—实际几何复核—修正”的主要闭环证据。

## 同尺寸前后截图

下列桌面均为 1280×720，窄屏均为 390×844，可直接比较：

| 项目 | V2 | V3 | 结论 |
|---|---|---|---|
| 窄屏初始画面 | [V2](../artifacts/v3/phase1/visual/browser/narrow-390x844.png) | [V3](../artifacts/v3/final-review/visual/browser/narrow-390x844.png) | 从双面板几乎遮满变为默认无遮挡画布 |
| 顶部机位 | [V2](../artifacts/v3/phase1/visual/cameras/camera-top-1280x720.png) | [V3](../artifacts/v3/final-review/visual/browser/camera-top-1280x720.png) | 从斜滚/裁切变为稳定总览 |
| 前端传动 | [V2](../artifacts/v3/phase1/visual/cameras/camera-front-1280x720.png) | [V3](../artifacts/v3/final-review/visual/browser/camera-front-1280x720.png) | 增加连续附件带和定时传动因果链 |
| 流体开启 | [V2](../artifacts/v3/phase1/visual/flows/flows-on-xray.png) | [V3](../artifacts/v3/final-review/visual/browser/flows-on-xray.png) | 分支、颜色和开关差异明确 |
| 零件选择 | [V2](../artifacts/v3/phase1/visual/selected/selection-1280x720.png) | [V3](../artifacts/v3/final-review/visual/browser/desktop-selected.png) | 巨大包围盒改为贴合网格轮廓 |
| 配气近景 | [V2](../artifacts/v3/phase1/visual/browser/desktop-valvetrain.png) | [V3](../artifacts/v3/final-review/visual/browser/desktop-valvetrain.png) | 凸轮、挺柱、弹簧、气门与燃烧室关系更完整 |

V3 的实体、X-Ray、剖切、曲柄、燃烧、爆炸、流体开关、选择和窄屏抽屉完整截图位于 [最终视觉浏览器证据目录](../artifacts/v3/final-review/visual/browser/)；V2 原始证据保持在 `artifacts/v3/phase1/`，没有覆盖。

## 构建、浏览器与性能结果

### 自动测试与构建

- TypeScript：`tsc --noEmit` 通过，0 错误。
- Vitest：3 个正式文件、22/22 通过（运动学 16、效果 2、场景几何 4）。
- 独立机械生产装配探针：1/1 通过。
- 生产构建通过：JS 608.48 kB / gzip 160.64 kB；CSS 11.98 kB / gzip 3.47 kB。Vite 的单块 500 kB 提示保留为已知 P3。
- 负向夹具故意注入 canvas 缺失、窄屏溢出、暂停失效、快捷键语义错误、轨道旋转无变化、页面异常六类故障；全部被捕获，进程按预期退出码 1。

### 实际硬件 GPU

- Edge / WebGL2 / ANGLE Intel Arc D3D11。
- 1280×720，120 帧采样：120.00 FPS（受 120 Hz/采样上限限制），p95 8.4 ms，最大 8.5 ms。
- 269.23 Draw Calls/帧，较 V2 的约 377.11 下降 28.6%。
- 桌面、390×844、六机位、三模式、键盘/复位、暂停/滑杆、流体/爆炸、拾取、轨道/缩放/平移全部通过；应用控制台、页面异常、WebGL 异常均为 0。
- 独立视觉复验的另一硬件采样为 117.07 FPS、p95 8.4 ms、269.22 calls/帧，同样 0 应用异常。

### SwiftShader 软件渲染

- Edge / WebGL2 / ANGLE Vulkan SwiftShader。
- 主最终证据：12.11 FPS，p95 91.7 ms，最大 100.1 ms，269.24 calls/帧。
- 独立 QA 复验：11.48 FPS，p95 100.1 ms，最大 116.6 ms，269.23 calls/帧。
- 两次正向运行均通过，应用控制台和页面异常为 0。该数据只证明软件兼容路径，不代表普通电脑硬件帧率。

机器可读报告：

- [最终硬件](../artifacts/v3/round1/final/hardware-immediate/acceptance-report.json)
- [最终 SwiftShader](../artifacts/v3/round1/final/swiftshader-immediate/acceptance-report.json)
- [最终负向夹具](../artifacts/v3/round1/final/negative-fixture/acceptance-report.json)
- [独立 QA 场景统计](../artifacts/v3/final-review/qa/assembly-stats.json)

## 已实施与未实施问题裁决

### 已实施的高收益项

- 阶段 1 所有 P1：窄屏不可用、流体难辨、机位/模式状态分裂，均已关闭。
- 机械三个 P2：配气接触链、流路拓扑/逐缸门控、负载喷油量，均由生产装配探针关闭。
- 视觉/QA 的顶部构图、附件传动、网格选择、暗部、实例化、测试发现污染和语义验收均已关闭或降为 P3。

### 有证据不在本轮实施的 P2

| 问题 | 收益 | 成本/风险 | 独立裁决 |
|---|---|---|---|
| 真剖切封口和工程剖面线 | 高 | 需要 stencil/多遍或代理封口，联动透明、阴影、拾取、动态件和 Draw Calls；高成本高风险 | 视觉与 QA 均认定非阻断专项，不是低成本快修 |
| 外壳铸造轮廓重塑 | 中高 | 需重组缸体/缸盖程序化几何，易新增穿插、剖切碎片和无机械依据造型 | 视觉审查认定应独立立项，不应在稳定收口阶段无依据大改 |
| 自动像素差异与窄屏实际滑动点击 | 中，主要防未来回归 | GPU、字体、动画造成基线噪声；需要遮罩/容差与维护策略 | QA 认定当前功能已人工和状态证据通过，不是当前用户可见失败 |

这些 P2 均保留验收方案和风险说明，详见视觉/QA 最终报告；不是为了收口而忽略，也没有被主代理单方面降级。

## 权威机械资料与建模假设

- [Yanmar 4TNV86CT 官方规格](https://www.yanmar.com/eu/industrial/product/engines/4tnv86ct/)：代表性四缸、四冲程、水冷、涡轮、直喷、86×90 mm、2.091 L 架构参考。
- [Bosch Common Rail 官方资料](https://www.bosch-mobility.com/en/solutions/powertrain/diesel/common-rail-system-solenoid/)：喷射压力可独立于转速/负载，控制器按空气量调节喷油量、开始和持续时间。本模型只用负载改变可视燃油量，不把锥长冒充压力。
- [Purdue University Cam Follower Valvetrain Test Rig](https://engineering.purdue.edu/METL/testrigs)：真实非圆凸轮与从动件运动学关系依据。本模型使用教学级准静态平底挺柱包络，不求解弹性、油膜、跳跃、磨损或阀系动力学。
- [Gates 附件带资料](https://www.gates.com/content/dam/gates/home/knowledge-center/vehicle-system-repair/abds-postcard.PDF)：附件带由曲轴向附件传递动力。本模型表现曲轴—水泵/风扇连续传动，不声称复刻某一量产机附件布置。
- [Cummins 涡轮工作原理](https://www.cummins.com/en-apac/components/turbochargers/how-a-turbocharger-works)：排气能量驱动涡轮并同轴带动压气机。本模型用归一化一阶惯性表现 spool，不声称真实涡轮转速。

润滑、冷却和气体路径是方向与分支正确的教学流线，不是 CFD；燃烧效果不是热力学/排放预测；几何尺寸是面向浏览器可读性、在代表性柴油机比例上统一缩放的装配参数，不是特定量产机的测绘 CAD。

## 剩余限制

- 剖切仍是开放 clipping plane，没有工程封口、壁厚切面和剖面线。
- 缸体与缸盖主外轮廓仍由规则圆角大体块主导，近景不等同真实铸件 CAD。
- 弹簧保持器、锁片和桶形挺柱内部为教学简化；涡轮中心壳供/回油未单独画出。
- 定时链和附件带有正确传动关系，但连续体表面没有链节/条纹运动提示。
- 生产 JS 单块 608.48 kB 仍触发体积提示；没有长期循环内存泄漏基准或跨 GPU 自动像素回归。
- 窄屏标签局部偏密，自动避碰在动态相机下仍可能带来抖动风险，因此本轮未强行加入。

## 耗时、额度与人工干预

- V3 进度文件创建于 2026-08-30 17:44；三路最终报告于 2026-08-31 03:32 完成，提交前门禁于 03:39 通过。到提交前检查点总墙钟约 **9 小时 55 分**，包含浏览器长采样、两次额度等待和恢复。
- 代理额度/连续性中断 2 次；两次均从 `V3_PROGRESS.md` 和既有证据恢复，没有删除有效改动，也没有重跑全部昂贵测试。
- 人工流程干预 2 次，均为用户发出“额度已恢复、从检查点继续”的流程指令；用户提供机械答案、尺寸、运动公式或设计选择的次数为 **0**。

## 运行方法

```powershell
cd D:\ComputePicture\codex-inline4-multiagent
npm install
npm run dev
```

浏览器打开 Vite 显示的本地地址。生产路径：

```powershell
npm run build
npm run preview
```

复现核心自动验证：

```powershell
npm run typecheck
npm test
npm run build
npm run test:browser -- http://127.0.0.1:4173 artifacts/local-check
```

`test:browser` 默认走 SwiftShader；设置 `BROWSER_GPU_MODE=hardware` 可单独验证硬件路径。正式证据已保存，不建议为查看结果而覆盖 `artifacts/v3/`。

## Git 交付说明

本报告随新的普通 V3 Git 提交一起交付，不 amend、不 rebase、不 reset v1/v2 历史。实际提交 SHA 由提交后的 `git rev-parse HEAD` 和最终交付回复记录；报告无法在同一个提交内自引用其尚未生成的 SHA。
