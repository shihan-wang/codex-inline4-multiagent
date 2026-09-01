# 构建与浏览器验收报告

## 验收环境与方法

- 日期：2026-08-30（Asia/Shanghai）
- 生产构建：TypeScript 5.9 + Vite 7.3.6
- 浏览器：本机 Microsoft Edge Headless，WebGL 2.0
- 无头渲染器：ANGLE / Vulkan / SwiftShader（软件 WebGL，用于受限桌面环境中的稳定复现）
- 视口：1280×720 桌面；390×844 窄屏
- 自动化：`scripts/browser-acceptance.mjs`，直接使用 Chrome DevTools Protocol，无额外浏览器测试依赖
- 产物：`artifacts/browser/acceptance-report.json` 及桌面实体/X-Ray/剖切、窄屏 PNG

## 第 1 轮：初始生产构建与实际画面（未通过）

### 构建

- `npm run build`：成功，无 TypeScript 错误。
- 输出：JavaScript 592.01 kB（gzip 156.22 kB），CSS 10.29 kB（gzip 3.12 kB）。
- Vite 有单一性能提示：主 JavaScript chunk 超过 500 kB；对单页 Three.js 演示不是立即阻断，但后续可拆分或调整加载策略。

### 浏览器结果

| 项目 | 结果 | 证据/备注 |
|---|---|---|
| 页面与 WebGL 2.0 初始化 | 部分通过 | canvas 为 1280×720；SwiftShader WebGL 2.0 上下文可用 |
| 3D 场景可见 | **失败（P0）** | 实体、X-Ray、剖切截图均为黑色空场景 |
| 动画与遥测推进 | **失败（P0）** | 曲轴读数保持 000°，FPS 显示为 `—` |
| 无页面异常 | **失败（P0）** | `CatmullRomCurve3.getPoint/getPointAt → FlowPath.update → scene.update → EngineApp.animate` 抛 `Cannot read properties of undefined (reading 'x')` |
| 暂停/继续 | 事件通过，动画不可验 | 按钮文案切为 PAUSED，暂停期间读数保持；因场景更新已中断，不能证明恢复动画 |
| 转速/负载 | UI 通过 | 自动设置为 1800 rpm / 75%，标签同步 |
| 实体/X-Ray/剖切 | UI 通过，视觉失败 | 三个按钮均正确激活，但空 canvas 无法验证材质与剖切效果 |
| 六个相机预设/复位 | 事件通过，视觉不可验 | 六个预设均可触发 active 状态 |
| 标签/流动/分解切换 | UI 通过 | checkbox 状态正常翻转并恢复 |
| 零件拾取与检查器 | 未通过 | 空场景无法命中零件 |
| 控制台干净 | **失败（P1）** | 两次 `THREE.Material: parameter 'blending' has value of undefined.` |
| 离线资源 | **失败（P1）** | Google Fonts 请求在受限网络中失败；另有一个 404（推断为未提供 favicon，需网络事件 URL 复测确认） |

页面异常的源码候选位置为 `src/scene/effects.ts` 的 `FlowPath.update()` 内 `curve.getPointAt()`。首个动画 update 即中止，所以本轮测得约 120 rAF/s 只反映无头浏览器刷新调度，不代表 3D 渲染性能，不能作为性能通过依据。

### 实际画面检查

- 桌面 1280×720：左右状态面板、顶部状态栏和底部相机栏完整可见，信息层级清楚；中央 3D 区完全为空。
- 390×844：左右面板在 182–198 px 区间发生约 16 px 水平重叠，占满几乎全部画面；即使修复 3D，窄屏也缺少有效观察区域。底部只保留部分相机按钮，未产生页面级滚动。
- 三个观察模式截图除按钮 active 状态外无可见差异，原因是场景未绘制。

## 待复测项

修复 FlowPath 页面异常后必须完整重跑：

1. 验证曲轴角/FPS持续变化，并重新测量实际场景 120 帧的均值与 P95 帧时。
2. 对比实体、X-Ray、剖切三张截图，确认材质透明度和内部机构可见性确实不同。
3. 检查暂停后曲轴不动、恢复后继续；检查六个相机预设带来可见构图变化。
4. 在 canvas 上执行轨迹球旋转、滚轮缩放、右键平移和零件点击，确认检查器显示双语元数据。
5. 复查 390×844 响应式布局，至少为 3D 观察保留有效区域，且控件不重叠。
6. 清除应用自身 console/page errors；区分 Edge 运行环境日志与页面日志。

## 第 2 轮：FlowPath 与离线资源修复后（功能通过，仍有性能/构图问题）

### 修复确认

- `npm run build` 再次成功：JavaScript 592.15 kB（gzip 156.27 kB），CSS 10.13 kB（gzip 3.04 kB）。仍只有主 chunk 超过 500 kB 的提示。
- 使用独立严格端口 `14276` 重启生产 preview，避免复用其他代理的旧服务。
- 1280×720 与 390×844 均为 WebGL 2.0，实际画面中发动机可见且动画连续。
- 页面自身 `consoleMessages=[]`、`pageExceptions=[]`、`logEntries=[]`；外部 Google Fonts 和 favicon 错误均已消失。Edge 自身的注册表/位置/账户诊断不属于网页错误。
- 曲轴角、冲程、水温和油压持续变化；首轮 P0 已关闭。

### 实际交互

| 项目 | 结果 | 验证方式 |
|---|---|---|
| 暂停/继续 | 通过 | 暂停前后角度保持 420°，按钮变为 PAUSED；恢复后角度继续推进 |
| 转速/负载 | 通过 | 调至 1800 rpm / 75%，UI立即同步 |
| 实体/X-Ray/剖切 | 基本通过 | 三个 active 状态正确，截图有明确材质/裁切差异 |
| 六个相机预设/复位 | 事件通过 | 所有按钮均激活并调用相机；具体构图见下方问题 |
| 标签/流动/分解 | 通过 | 三个开关均可切换并恢复 |
| 自由旋转 | 通过 | 左键拖动后全部投影标签坐标变化 |
| 缩放 | 通过 | 滚轮后投影标签坐标再次变化 |
| 平移 | 通过 | 右键拖动后投影标签坐标再次变化 |
| 零件拾取 | 通过 | 点击命中“排气歧管 / Exhaust manifold”，检查器显示材料、制造、功能、参数和实时状态共 5 项 |

### 性能数据

SwiftShader 软件 WebGL 的两次 120 帧采样：

- 6.69 FPS，P95 166.7 ms，最大 175 ms；
- 4.49 FPS，P95 250 ms，最大 433.3 ms。

第二次采样时约 588–644 个 DOM 节点、JavaScript heap 约 7.6–10.0 MB。页面 FPS 面板实际显示约 7–9。该环境无法稳定启动硬件 GPU 进程，因此数据是受限软件光栅化的下界，不能直接推断普通独显/集显浏览器帧率；但在本次可用浏览器路径中未达到目标 30 FPS，仍需在交付限制中明确。

### 第二轮画面审查发现

1. **相机专用预设构图不够准确（P1）**：`desktop-crank.png` 主要呈现外部排气下管、油底壳和飞轮，曲轴运动链没有成为画面主体；`desktop-valvetrain.png` 主要呈现气缸盖和涡轮外观，凸轮/气门/弹簧仍被罩体遮挡。按钮功能存在，但没有充分完成“曲轴”和“燃烧室”观察目的。
2. **剖切辨识度不足（P1）**：`desktop-section.png` 中大面积浅色铸件接近过曝，裁切断面边缘碎杂；曲轴—连杆—活塞链不够清楚。X-Ray 的透明变化明显，但同样受高亮白色表面影响。
3. **窄屏可用但观察区不足（P1）**：390×844 的左右面板已从首轮约 16 px 重叠修复为 6 px 间隙，控件无裁切、无页面滚动；然而两栏共占 374 px，模型仅能从面板背后边缘看到，无法有效交互观察。若项目只面向桌面可列为限制；若声称移动端适配则仍不通过。
4. **生产包可优化（P2）**：单一主 chunk 592 kB；对首次加载影响有限但可通过 Three.js/应用拆分改善。

### 第二轮证据

- `artifacts/browser/acceptance-report.json`
- `artifacts/browser/desktop-solid.png`
- `artifacts/browser/desktop-xray.png`
- `artifacts/browser/desktop-section.png`
- `artifacts/browser/desktop-crank.png`
- `artifacts/browser/desktop-valvetrain.png`
- `artifacts/browser/narrow-390x844.png`

结论：稳定性和核心 DOM/指针交互已通过；硬件 GPU 性能未能在当前受限环境内验证。相机专用预设、剖切视觉和窄屏模型观察区仍是可见质量问题，建议修复后进行最终一轮截图复验。

## 第 3 轮：最终整合复验

- `npm test`：2 个测试文件、14/14 通过；新增流线反复采样回归测试。
- `npm run build`：通过，TypeScript 0 错误；JS 592.87 kB（gzip 156.48 kB），CSS 10.19 kB（gzip 3.05 kB）。
- Edge/SwiftShader 生产页：`consoleMessages=[]`、`pageExceptions=[]`、`logEntries=[]`。
- 1280×720 和 390×844 均为 WebGL2，canvas 与视口尺寸一致，页面无水平/垂直溢出；窄屏两面板为 184 px，中间有 6 px 间距。
- 暂停期间曲轴保持 180°；恢复、1800 rpm、75% 负载、三观察模式、六相机、三切换全部通过。
- 左拖旋转、滚轮缩放、右拖平移均被自动化确认；拾取“排气歧管 / Exhaust manifold”，检查器得到 5 类字段。
- 曲轴与燃烧室预设现在自动联动剖切/X-Ray；最终曲轴镜头再调整到剖切观察侧。

最终软件光栅化 120 帧采样为 4.38 FPS、P95 250 ms、约 683 WebGL draw calls/帧；这是无硬件 GPU 的 CPU SwiftShader 下界。JS heap 约 10.2 MB，DOM 522 节点。当前环境无法给出硬件 GPU 的可比帧率，生产包也仍有单 chunk 超过 500 kB 的非阻塞提示。

最终证据保存在 `artifacts/final/`，其中包含验收 JSON 和桌面实体、X-Ray、剖切、曲轴、配气机构及窄屏截图。
