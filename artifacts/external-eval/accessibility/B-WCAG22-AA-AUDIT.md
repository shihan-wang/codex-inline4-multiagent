# B 类独立无障碍评估：axe-core 与 WCAG 2.2 AA

## 结论

本工作流按冻结协议对固定目标 `v3-model-final`（剥离值 `7e5ea916a115dcef1bf3ba467a31b78c6206c612`）执行。评估器位于提交 `38c00417812fa87ca76b520c17c978a14cbd8ad2`；有效运行的开始与结束 `git diff --exit-code v3-model-final -- src` 均为 0，因此被测源码与固定目标一致。

**B 类最终分数：待完成，不发布 `/20`。** 已完成的五个维度合计 **4/17**；真实 NVDA 操作者测试为 **待完成（/3）**。不得把 4/17 线性放大，也不得据此发布 100 分外部总分。

本次结果**不能证明 WCAG 2.2 AA 通过**。不仅 NVDA 尚未实测，现有证据还确认了键盘零件检查器、焦点可见性、200% 文本缩放和可编程模式状态等核心失败；axe 的 `color-contrast` 结果全部为 incomplete，不能按零违规解释为通过。

## 运行有效性与环境

| 运行 | 裁决 | 说明 |
|---|---|---|
| 完整批次 `run-01` | 无效，保留 | 九状态和脚本证据已写出，但 Windows 锁定 Crashpad 文件，评估器清理抛出 EBUSY 并以 1 退出；依据协议第 7 节不计分，不覆盖原始证据。 |
| 完整批次 `run-02` | 有效、计分 | 9/9 状态完成，退出码 0，开始/结束源码差异均为空。 |
| 手动辅助复核 `recheck-01` | 有效、保留 | 环境记录退出码 0。 |
| 手动辅助复核 `recheck-02` | 有效、最终裁决依据 | 使用可信键盘事件复核控制激活，退出码 0；其结果取代完整批次中由早期注入方式造成的“按钮未变化”假阴性。 |

- 页面：`http://127.0.0.1:16320/`
- 浏览器：真实 Microsoft Edge；自动 `--version` 查询因已有实例锁失败，未臆测版本号。
- axe-core：4.10.3；Node.js：v24.14.0；Windows 11 x64。
- 实际渲染器：`ANGLE (Intel, Intel(R) Arc(TM) Graphics, Direct3D11)`，WebGL2 硬件路径。
- 有效批次时间：2026-08-31 03:00:47Z–03:02:16Z。

## 九状态 axe 自动扫描

`run-02` 每个状态均保存完整 `axe-result.json`、辅助功能树、状态元数据和截图。下表中的 incomplete 不计作 axe violation，但必须保留为未判定项。

| 状态 | viewport | critical | serious 违规 | 其他违规 | `color-contrast` incomplete | 其他 serious incomplete |
|---|---:|---:|---|---|---:|---|
| 桌面实体 | 1280×720 | 0 | 0 | `landmark-unique` moderate ×1 | 91 | `aria-prohibited-attr` ×1 |
| 桌面 X-Ray | 1280×720 | 0 | 0 | `landmark-unique` moderate ×1 | 91 | `aria-prohibited-attr` ×1 |
| 桌面剖切 | 1280×720 | 0 | 0 | `landmark-unique` moderate ×1 | 91 | `aria-prohibited-attr` ×1 |
| 桌面已选择 | 1280×720 | 0 | `scrollable-region-focusable` ×1 | `landmark-unique` moderate ×1 | 100 | `aria-prohibited-attr` ×1 |
| 桌面暂停 | 1280×720 | 0 | 0 | `landmark-unique` moderate ×1 | 90 | `aria-prohibited-attr` ×1 |
| 桌面装配分解 | 1280×720 | 0 | 0 | `landmark-unique` moderate ×1 | 91 | `aria-prohibited-attr` ×1 |
| 窄屏初始 | 390×844 | 0 | 0 | 0 | 30 | `aria-prohibited-attr` ×1 |
| 窄屏左抽屉 | 390×844 | 0 | 0 | 0 | 52 | `aria-prohibited-attr` ×1 |
| 窄屏右抽屉 | 390×844 | 0 | 0 | 0 | 60 | `aria-prohibited-attr` ×1 |

自动结果汇总：0 个 critical 规则种类、1 个 serious 规则种类，因此协议固定子分为 **4/6**。唯一 serious violation 是已选择状态中的 `#telemetry-panel`：它在出现零件详情后可滚动，但本身不可聚焦且没有可聚焦后代（axe 对应 WCAG 2.1.1/2.1.3）。六个桌面状态还各有一个 `landmark-unique` moderate 最佳实践问题：两个隐式 complementary landmark 缺少唯一名称。

所有九状态中的 `.scene-viewport` 都产生 `aria-prohibited-attr` serious incomplete：普通 `div` 使用 `aria-label="柴油机三维视图"`，但没有显式支持该名称的有效 role。此项不是已确认 violation，但在真人辅助技术验证前不能判为通过。

## 浏览器辅助检查（非真人辅助技术测试）

### 名称、角色、状态

- 桌面 17 个、窄屏初始/右抽屉 10 个、窄屏左抽屉 19 个可操作元素均有非空可访问名称；原生按钮、滑杆和复选框角色可读。
- 两个滑杆暴露当前值；三个复选框的 `checked` 与视觉状态同步；左右抽屉 `aria-expanded` 与开闭状态同步。
- 暂停按钮的名称会从 `暂停 / Pause` 同步变为 `运行 / Run`，可推断当前运行状态。
- 三个核心观察模式只以 `.is-active` 呈现当前项，`aria-pressed`/等效选中状态均为 `null`。六个机位也只有视觉 active class；虽然机位不属于本维度协议明列的状态项，这仍是附加缺口。

由于核心模式组的当前状态不能被程序化读取，命中“核心控制失败”，固定子分为 **0/3**。

### 键盘与焦点

可信键盘复核确认可完成：暂停、X-Ray/剖切/实体三模式、六个机位、复位、三个开关及左右抽屉。实体和轴测在测试开始时已激活，因此重复激活“不变化”是预期，不是失败。顺序遍历覆盖画布、按钮、滑杆、模式、开关、机位和复位，未发现焦点陷阱。

核心失败有两项：

1. 画布虽有 `tabindex=0`，但没有任何可聚焦零件；对画布发送 Enter、Space、Tab 后零件检查器仍无选择，`keyboardReachable=false`。
2. 浏览器默认焦点轮廓为约 1 px `rgb(16,16,16)`，在深色背景上几乎不可见；实际截图中当前 X-Ray 按钮的键盘焦点难以辨认。

零件检查器属于协议明列核心任务，因此固定子分为 **0/3**。

### 对比度

axe 在九状态中均报告 `color-contrast` 0 violation，**同时也均为 0 pass 且有 30–100 个 incomplete 节点**，原因是透明层、渐变或 WebGL 背景无法自动解析。故“零违规”不能当作对比度通过。

脚本辅助的浏览器 computed-style 抽查覆盖普通文本、标签、活动模式、活动机位、抽屉、顶部指标与面板标题。大部分采样比值高于 4.5:1，但交互提示小字约为 **3.59:1**；焦点轮廓在深色背景上也不可清楚辨认。该算法只能解析 DOM 祖先的实色背景，不能代替渐变/WebGL 背景上的人工逐项测量。

由于焦点样式失败且 axe 对 30–100 个节点未能判定，固定子分为 **0/2**。

### 200% 文本缩放与 400%/320 CSS px 回流

- 200% 文本缩放：文档无整体横向或纵向溢出，核心控件仍存在于 DOM；但实际截图确认顶部实时工况标签/数值严重重叠，底部机位文字换行并被压缩，构成核心内容丢失。
- 640 CSS px（1280 px 视口等效 200% 浏览器缩放）：无文档级横向溢出，左抽屉打开后核心控制可达。
- 320 CSS px：初始、左右抽屉状态均无文档级横向溢出，抽屉可达；底部机位轨道需内部横向滚动，品牌和滑杆标签还记录到约 4 px 的小幅垂直裁切。

尽管窄屏整体回流基本成立，200% 文本缩放造成核心遥测与机位内容重叠，固定子分为 **0/3**。

### NVDA

**待完成（/3）**。本次没有真实 NVDA 操作者，未模拟、未代填。浏览器辅助功能树和自动名称检查不等价于 NVDA 操作测试，也不能用于推断此分。

## B 类固定计分

| 维度 | 分值 | 得分 | 依据 |
|---|---:|---:|---|
| axe critical/serious | 6 | **4** | 0 critical；1 种 serious 规则。 |
| 名称/角色/状态 | 3 | **0** | 三个核心观察模式没有可编程当前状态。 |
| 对比度 | 2 | **0** | 全状态大量 incomplete；交互提示约 3.59:1；焦点不可清楚辨认。 |
| 键盘与焦点 | 3 | **0** | 零件检查器核心任务不可由键盘完成，且焦点近乎不可见。 |
| 缩放与回流 | 3 | **0** | 200% 文本缩放造成核心工况与机位内容重叠。 |
| NVDA | 3 | **待完成** | 无真实操作者。 |
| **已测小计** | **17** | **4/17** | 不线性放大。 |
| **B 类最终** | **20** | **待完成** | NVDA 缺失，不能发布 `/20`。 |

## 缺陷与风险排序

| ID | 严重度 | 问题与用户影响 | 证据 | 修复验收 |
|---|---|---|---|---|
| A11Y-01 | P1 | 零件检查器完全依赖鼠标/触控命中，键盘用户无法选择核心机械零件（WCAG 2.1.1）。 | `manual/recheck-02/keyboard-focus.json` 的 `inspectorKeyboard.keyboardReachable=false`。 | 仅键盘可在语义零件列表或画布等效控件中选择零件，检查器同步更新；真实 Edge 复验。 |
| A11Y-02 | P1 | 200% 文本缩放后实时工况和机位文字重叠，核心信息难读（WCAG 1.4.4/1.4.10）。 | `manual/run-02/text-resize-200.png`、`resize-reflow.json`。 | 200% 文本缩放截图中各指标无重叠/裁切，所有核心控制仍可达。 |
| A11Y-03 | P1 | 实体/X-Ray/剖切的当前模式只靠视觉样式表达，辅助技术无法读取选中状态（WCAG 4.1.2）。 | `axe/desktop-solid/run-02/state-metadata.json` 中三模式 `pressed:null`，仅 `active` class 变化。 | 使用 `aria-pressed` 或单选语义，三模式切换后仅一项被读为选中。 |
| A11Y-04 | P1 | 1 px 深色默认焦点轮廓在深色界面上几乎不可见（WCAG 2.4.7/2.4.11）。 | `manual/recheck-02/keyboard-tab-focus-xray.png` 与 `keyboard-focus.json`。 | 所有键盘焦点具有清晰、高对比的自定义指示，覆盖画布、滑杆、模式、机位、抽屉。 |
| A11Y-05 | P1 | 选择零件后右侧详情区可滚动却不能聚焦，键盘用户可能无法滚动查看全部内容。 | `desktop-selected/run-02/axe-result.json`：`scrollable-region-focusable` serious，目标 `#telemetry-panel`。 | 选中长详情后，滚动区自身可聚焦或包含可聚焦后代，axe 该规则归零并做键盘滚动复验。 |
| A11Y-06 | P2 | 交互提示小字约 3.59:1；大量透明/渐变文字尚未完成可靠对比度判定（WCAG 1.4.3）。 | `manual/recheck-02/contrast-samples.json`；九状态 `color-contrast` incomplete 30–100。 | 使用最终合成背景逐项测量常规文本、标签、抽屉和状态；普通文本 ≥4.5:1，大文本 ≥3:1。 |
| A11Y-07 | P2 | 三维视图容器的可访问名称使用在无支持 role 的普通 `div` 上，语义支持不确定（WCAG 4.1.2）。 | 九状态 `aria-prohibited-attr` serious incomplete，目标 `.scene-viewport`。 | 使用适合的 landmark/region 语义并关联标题，axe 不再 incomplete，NVDA 实读清楚。 |
| A11Y-08 | P3 | 两个 complementary landmark 缺少唯一名称，地标导航时难区分。 | 六个桌面状态 `landmark-unique` moderate。 | 为控制面板和实时工况区提供唯一可访问名称，axe 规则归零。 |

## 自动项、辅助人工项与未测项边界

- **axe 自动项：** 九状态 violations、incomplete、passes；只用于协议 axe 维度和问题线索。
- **浏览器脚本/截图辅助项：** 可信键盘事件、焦点样式、DOM 名称/状态、computed-style 对比度近似、200% 文本缩放和 320 CSS px 回流。它们不是屏幕阅读器真人测试。
- **必须由真人完成：** NVDA 的页面标题、运行状态、滑杆、模式、机位、开关、抽屉、零件检查器和动态状态朗读，当前全部保持“待完成”。
- **未作出的结论：** 未宣布 WCAG 2.2 AA 通过，未发布 B/20，未计算或缩放外部总分。

## 关键证据索引

- 有效批次汇总：`artifacts/external-eval/accessibility/accessibility-run-02-summary.json`
- 环境与源码固定性：`artifacts/external-eval/environment/accessibility-run-02.json`
- 无效批次说明：`artifacts/external-eval/environment/accessibility-run-01.json`
- 九状态原始证据：`artifacts/external-eval/accessibility/axe/<state>/run-02/`
- 键盘/焦点最终复核：`artifacts/external-eval/accessibility/manual/recheck-02/`
- 缩放/回流：`artifacts/external-eval/accessibility/manual/run-02/resize-reflow.json` 及同目录截图
- 本报告机器可读计分：`artifacts/external-eval/accessibility/b-scorecard.json`

