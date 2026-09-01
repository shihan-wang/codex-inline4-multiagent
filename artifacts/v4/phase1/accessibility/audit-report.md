# V4 第一阶段无障碍只读审查

## 审查结论

固定被测模型为 `v3-model-final`（`7e5ea916a115dcef1bf3ba467a31b78c6206c612`），评估分支起点为 `eccde839811d6991b9583f3c4fd6c08918ec64c1`。本轮在 `http://127.0.0.1:16420/` 上使用真实 Microsoft Edge、WebGL2 和 Intel Arc D3D11 独立复现；开始和结束的 `git diff --exit-code v3-model-final -- src` 均为空。

**当前不建议无障碍方向放行。** 没有 P0，但确认 5 个 P1：零件检查核心任务无法用键盘完成、200% 文本放大造成核心内容重叠、模式和机位的当前状态没有程序化表达、焦点指示不可清楚辨认、已选零件时右侧滚动区域不可聚焦。另有 3 个 P2：交互提示对比度不足、三维视口容器使用不受支持的 ARIA 名称、两个 complementary landmark 无唯一名称。

NVDA 没有真实操作者参与，严格标为**待真人完成**。axe 的自动结果、浏览器脚本辅助检查、代理查看截图和真人屏幕阅读器测试在下文分开记录。

## 环境与方法

- 时间：2026-08-31 21:48–21:53（Asia/Shanghai）。
- 页面：生产构建预览，独占端口 `16420`；CDP 端口 `16421`、`16422`。
- 浏览器：Microsoft Edge 文件版本 `152.0.4191.53`。
- Node.js：`v24.14.0`；axe-core：`4.10.3`。
- 渲染器：`ANGLE (Intel, Intel(R) Arc(TM) Graphics, Direct3D11)`，WebGL2 硬件路径。
- 自动状态：桌面实体、X-Ray、剖切、已选择零件、暂停、装配分解；窄屏初始、左抽屉、右抽屉，共 9 个。
- 自动项：完整 axe JSON、辅助功能树、DOM 状态、截图。
- 浏览器辅助项：可信 CDP 键盘激活、18 步 Tab 顺序、computed-style 对比度近似、200% 文本放大、640 CSS px 的 200% 缩放等效条件、320 CSS px 回流。
- 代理视觉核查：实际打开本轮 `text-resize-200.png`、窄屏左右抽屉截图和键盘焦点截图；它不等价于真人 NVDA 或真实用户研究。

主批次内的早期键盘注入对普通按钮出现假阴性，因此不用于最终键盘裁决；最终裁决采用独立 `manual-recheck` 的可信键盘事件结果。两组原始结果均保留，未隐藏差异。

## axe 自动结果

9/9 状态有效，0 个 critical 规则种类，1 个 serious 规则种类。桌面已选择状态的 `#telemetry-panel` 命中 `scrollable-region-focusable` serious：零件详情使面板可滚动，但面板本身及其后代均不可聚焦。

| 状态 | violations | serious | `color-contrast` incomplete | 其他 incomplete |
|---|---|---|---:|---|
| 桌面实体 | `landmark-unique` | 0 | 91 | `aria-prohibited-attr` |
| 桌面 X-Ray | `landmark-unique` | 0 | 91 | `aria-prohibited-attr` |
| 桌面剖切 | `landmark-unique` | 0 | 91 | `aria-prohibited-attr` |
| 桌面已选择 | `landmark-unique`, `scrollable-region-focusable` | 1 | 100 | `aria-prohibited-attr` |
| 桌面暂停 | `landmark-unique` | 0 | 90 | `aria-prohibited-attr` |
| 桌面装配分解 | `landmark-unique` | 0 | 91 | `aria-prohibited-attr` |
| 窄屏初始 | 0 | 0 | 30 | `aria-prohibited-attr` |
| 窄屏左抽屉 | 0 | 0 | 52 | `aria-prohibited-attr` |
| 窄屏右抽屉 | 0 | 0 | 60 | `aria-prohibited-attr` |

`color-contrast` 在所有状态均是 0 violation、0 pass，并存在 30–100 个 incomplete 节点；不能据此声称对比度通过。`.scene-viewport` 是无有效 role 的普通 `div`，却使用 `aria-label`，因此全状态产生 `aria-prohibited-attr` serious incomplete。

## 浏览器辅助检查结果

### 通过或部分通过

- 暂停、三种模式、六个机位、复位、三个开关及窄屏左右抽屉都能由可信键盘事件激活；没有发现焦点陷阱。
- 三个原生 checkbox 的 `checked` 与视觉状态同步，窄屏抽屉的 `aria-expanded` 与开闭同步。
- 两个 range 控件暴露当前值，暂停按钮的可访问名称随运行/暂停切换。
- 320 CSS px 的初始、左右抽屉状态均无文档级横向溢出；底部机位栏采用有意的内部横向滚动。
- 实体、X-Ray、剖切、选择、暂停、分解和窄屏抽屉均成功呈现，没有页面异常。

### 确认失败

- 画布有 `tabindex=0`，但不存在任何可聚焦的零件控件；在画布上使用 Enter、Space、Tab 后，检查器仍未选择零件。`focusablePartControls=0`、`keyboardReachable=false`。
- 模式和六个机位只用 `.is-active` 表示当前项，`aria-pressed` 或等效单选状态均为 `null`。暂停状态虽然能从变化后的名称推断，但也没有显式 pressed/state 语义。
- 画布显式 `outline:none`；按钮通常只显示约 1 px 的深色浏览器默认轮廓；透明 checkbox 本身不可见且没有把 `:focus-visible` 映射到可见开关外观。本轮焦点截图中 X-Ray 按钮的键盘焦点无法可靠辨认。
- 200% 文本放大截图显示顶部遥测、右侧仪表值/标签和底部机位文字发生阻断性重叠或压缩；单纯“文档没有横向溢出”不能抵消这一失败。
- 交互提示是 8 px 常规文本，computed-style 近似对比度约 `3.5903:1`，低于常规文本 4.5:1 目标。
- 两个桌面 `aside` 都是 complementary landmark，均无唯一可访问名称；axe 在六个桌面状态稳定复现 `landmark-unique`。

## 缺陷清单与验收

| ID | 严重度 | 实际证据 | 用户可见影响 | 预计收益 | 成本 | 风险 | 可验证验收方法 | 放行 |
|---|---|---|---|---|---|---|---|---|
| V4-A11Y-01 | P1 | `manual-recheck/keyboard-focus.json`：`focusablePartControls=0`、`keyboardReachable=false` | 键盘用户不能完成“选择零件并阅读材料/工艺/状态”的核心任务 | 很高 | 中–高 | 语义列表与 3D 选中状态可能失同步；额外 UI 可能挤占画面 | 仅键盘进入语义零件导航，选择至少 8 类主要零件，检查器与 3D 高亮同步；无需鼠标 | 拒绝 |
| V4-A11Y-02 | P1 | `text-resize-200.png`；右侧仪表与底部机位明显重叠 | 200% 文本缩放下核心工况和相机控制难以辨读 | 很高 | 中 | 响应式布局改变可能压缩 3D 视口 | 1280×720 下运行时文本 200% 截图无核心文本重叠/裁切；640 CSS px 等效缩放时左右面板与核心控制可达 | 拒绝 |
| V4-A11Y-03 | P1 | 九状态 `state-metadata.json`：模式/机位 `pressed=null`，只有 `active` class | 辅助技术无法读取当前观察模式和机位 | 高 | 低 | 更新遗漏会造成 ARIA 与画面状态不一致 | 三模式和六机位切换后各组恰有一个 `aria-pressed=true`，其余为 false；复位同步更新 | 拒绝 |
| V4-A11Y-04 | P1 | `keyboard-tab-focus-xray.png` 与 computed styles：按钮约 1 px 深色默认轮廓；canvas `outline:none` | 键盘用户难以知道当前焦点位置 | 高 | 低 | 过强焦点样式影响视觉；不能只处理按钮而遗漏 slider/checkbox/canvas | 对 canvas、按钮、range、checkbox、抽屉控件逐一截图；每项都有 ≥2 px、高对比、无遮挡的 `:focus-visible` 指示 | 拒绝 |
| V4-A11Y-05 | P1 | `desktop-selected/run-01/axe-result.json`：`scrollable-region-focusable` serious，目标 `#telemetry-panel` | 详情变长时键盘用户无法可靠滚动到全部参数 | 高 | 低 | 增加一个 Tab 停靠点 | 选择长详情后面板可聚焦且有名称；PageDown/方向键能滚动；该 axe 规则归零 | 拒绝 |
| V4-A11Y-06 | P2 | `contrast-samples.json`：`.interaction-hint span` 约 `3.5903:1`；全状态 30–100 个对比度 incomplete | 小号操作提示可读性不足，透明/渐变文字仍缺可靠证明 | 中 | 低 | 提亮可能打破视觉层级 | 在最终合成背景上逐项测量；常规文本 ≥4.5:1，大文本 ≥3:1；保留人工核查表 | 有条件拒绝 |
| V4-A11Y-07 | P2 | 全状态 `aria-prohibited-attr` incomplete：`.scene-viewport` 是无 role 的 `div` 却有 `aria-label` | 三维区域名称在辅助技术中支持不确定 | 中 | 低 | 滥用 `role=application` 反而破坏常规导航 | 使用有效且最小的 region/关联标题语义；axe 不再 incomplete；真实 NVDA 后续确认区域名称 | 有条件拒绝 |
| V4-A11Y-08 | P2 | 六个桌面状态稳定出现 `landmark-unique` moderate | 地标导航时无法区分控制区与实时工况区 | 中 | 低 | 名称重复或与标题不一致 | 两个 `aside` 获得不同且可见标题关联的名称；axe `landmark-unique` 归零 | 有条件拒绝 |

## 建议修改边界

- `src/ui/dashboard.ts`：模式/机位/暂停状态语义、左右 landmark 名称、滚动区焦点和名称、键盘零件入口及状态同步。
- `src/style.css`：全控件 `:focus-visible`、200% 文本缩放和窄屏回流、提示文字对比度。
- `src/main.ts`：为 `.scene-viewport` 提供有效 role/标题关联，避免无 role `div` 的禁止 ARIA 属性。
- `src/scene/index.ts` 与 `src/app.ts`：仅当采用 3D 场景与语义零件导航双向同步时，增加按语义 ID 选择/高亮的窄接口；不得把随机空间键命中当作键盘可访问方案。
- 测试/评估脚本：增加状态唯一性、键盘零件任务、焦点截图、200% 文本缩放、滚动面板 PageDown 和负向 ARIA 状态不同步夹具。

## 明确不建议在本轮实施

- 不用 `role=application` 粗暴包住整个页面；其键盘模式会给屏幕阅读器带来额外风险，除非真人 NVDA 证据证明必要。
- 不把 WebGL 网格逐三角形暴露给辅助技术；应暴露稳定的语义零件集合。
- 不因 axe 没报对比度 violation 就删除人工对比度核查。
- 不模拟或代填 NVDA 通过；动态遥测是否需要 live region 也应由真人 NVDA 任务验证后裁决，避免持续朗读造成噪声。
- 不为了消除 200% 重叠而隐藏核心工况、模式或机位；应重排、换行或让局部容器可控滚动。

## 待真人完成

真实 NVDA 操作者仍需验证：页面与区域标题、运行/暂停、range 当前值、三模式与六机位当前状态、三个开关、窄屏抽屉、零件语义导航、检查器更新和动态工况朗读策略。本审查不发布 WCAG 2.2 AA 通过结论，也不把代理检查称为真人可用性测试。

## 审查者最终建议

第一阶段结论为**整改后复验**。V4 至少应修复 V4-A11Y-01 至 05，并对 06 至 08 完成或提供实证化不实施理由。自动复验需再次覆盖相同 9 状态；独立最终审查需实际执行键盘零件任务、200% 文本放大和可见焦点检查。
