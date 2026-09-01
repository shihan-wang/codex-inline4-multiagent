# V4 无障碍第一阶段证据清单

## 本轮新证据

- `reproduction/accessibility/accessibility-run-01-summary.json`：9 状态汇总、键盘辅助结果、对比度样本、200% 文本放大与回流结果。
- `reproduction/environment/accessibility-run-01.json`：固定提交、源码差异、工具、操作系统、CPU、渲染器和内部退出码。
- `reproduction/logs/accessibility-run-01.log`：完整批次时间线，内部退出码 0。
- `reproduction/accessibility/axe/<state>/run-01/axe-result.json`：9 份 axe-core 4.10.3 原始结果。
- `reproduction/accessibility/axe/<state>/run-01/ax-tree.json`：9 份浏览器辅助功能树。
- `reproduction/accessibility/axe/<state>/run-01/state-metadata.json`：9 份可操作元素、角色、名称、状态、renderer 与布局元数据。
- `reproduction/accessibility/axe/<state>/run-01/screenshot.png`：9 张对应状态截图。
- `reproduction/accessibility/manual/run-01/keyboard-focus.json`：主批次键盘与焦点探针；其普通按钮激活含已知假阴性，不作为最终裁决。
- `reproduction/accessibility/manual/run-01/text-resize-200.png`：1280×720、运行时语义文字 200% 截图；SHA-256 `1B69D2646DBF4A0220F54E8C0DE0BBC696B9D46A130F97B4DD67AE6245D96FB8`。
- `reproduction/accessibility/manual/run-01/zoom-equivalent-200-initial.png` 与 `zoom-equivalent-200-left.png`：640 CSS px 等效 200% 缩放。
- `reproduction/accessibility/manual/run-01/reflow-320-*.png`：320 CSS px 初始、左抽屉、右抽屉回流截图。
- `reproduction/accessibility/manual/run-01/resize-reflow.json`：文档溢出、可达控件和文字裁切辅助数据。
- `reproduction/accessibility/manual/run-01/contrast-samples.json`：computed-style 对比度近似；不能替代最终合成背景的真人核查。
- `manual-recheck/keyboard-focus.json`：最终可信键盘激活、18 步 Tab、零件检查器键盘可达性结论。
- `manual-recheck/keyboard-tab-focus-xray.png`：X-Ray 按钮聚焦截图；SHA-256 `914849FA3D41C831326A8D49AC4C5939B7E16BEE6B61FF2F2726960E75C11A3C`。
- `manual-recheck/contrast-samples.json`：桌面及窄屏左抽屉 computed-style 样本。
- `manual-recheck/environment.json`、`manual-recheck/run.log`：可信复核环境、源码固定性与退出码 0。
- `commands-and-exits.json`：实际命令用途、退出码、主动停止预览服务的边界说明与工具版本。
- `summary.json`：机器可读裁决。
- `audit-report.md`：分级缺陷、收益/成本/风险、验收法和建议修改边界。

## 证据边界

- 自动证据只能说明 axe 规则与浏览器状态，不直接证明 WCAG 2.2 AA 全面通过。
- 对比度工具对透明、渐变和 WebGL 背景存在 30–100 个 incomplete 节点；约 3.59:1 是 computed-style 近似值。
- 200% 文本重叠由本轮实际截图确认，但查看者是审查代理，不是预注册真人参与者。
- NVDA 没有真实操作者，证据为“待完成”，没有生成任何通过记录或分数。
- 本轮没有修改 `src/`、`docs/`、测试配置、既有 `artifacts/external-eval/` 或 Git 历史。
