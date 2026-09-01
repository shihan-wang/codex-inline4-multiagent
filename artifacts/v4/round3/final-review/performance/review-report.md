# V4 Round-3 独立视觉、性能与浏览器复验

复验者：`v4_round3_perf_reviewer`。本代理未参与 V4 实现；本轮只读产品源码，仅在本目录新增证据。复验输入是当前未提交的 V4 Round-3 候选，基线 HEAD 为 `eccde839811d6991b9583f3c4fd6c08918ec64c1`，`src/` 差异对象哈希为 `9661b3da8a93dd07d7f8a480798408770de1efa9`。

## 结论

**GO / 建议视觉、性能与浏览器方向放行。** 没有 P0/P1，也未发现 Round-3 几何修正引入可见退化、交互失效或硬件性能门失败。Intel Arc 正式持续门全部通过；SwiftShader 功能与稳定性通过但仍只称为兼容路径；当前生产包的正向浏览器验收通过，应用控制台、页面异常、浏览器日志错误和 WebGL context loss 均为 0。

本结论不能替代机械几何、无障碍或真人评审结论。NVDA、真人盲评和完整 5+5 冷缓存 Lighthouse 不在本轮受影响复验范围内。

## 输入与工具

- 单独生产构建目录：`production-dist-verified/`；Vite 7.3.6、Node 24.14.0，21 modules，退出码 0。
- 构建资源：JS 615,939 bytes / gzip 162.81 kB；CSS 13,829 bytes / gzip 3.91 kB。Vite 的 500 kB advisory 保留。
- 浏览器：Microsoft Edge 152.0.4191.53，真实 WebGL2。
- 唯一页面端口：16541；调试端口：19541–19544。页面服务器 PID 22012 已在复验结束后停止。
- 旧 Spector、Lighthouse、Blender、Trimesh、721 点扫描、旧持续 WebGL 和旧完整浏览器套件均未重跑或覆盖。
- 首次 `npx vite build` 已生成 `production-dist/`，但外层命令未返回有效退出状态；两个仅属于该调用的 Node 进程已精确停止。为获得可审计退出码，随后用 Vite 直接入口构建到全新 `production-dist-verified/`，退出码 0。两份目录均保留，正式测量只使用后者。

## 实际测量

### 持续 WebGL（renderer 严格分开）

| 路径 | renderer | 帧/持续时间 | 平均 FPS | p95 | draw/frame | 应用/页面/日志错误 | context loss | 判定 |
|---|---|---:|---:|---:|---:|---:|---:|---|
| Intel Arc | Intel Arc D3D11 | 3,601 / 30.0007 s | 120.031 | 8.4 ms | 269.000 | 0 | 0 | 通过 ≥110 FPS、≤10 ms、≤282 draw 门 |
| SwiftShader | SwiftShader Vulkan | 600 / 49.6615 s | 12.082 | 91.6 ms | 269.0067 | 0 | 0 | 功能与稳定性通过；仅兼容性，不称为流畅 |

Intel 与 SwiftShader 没有混合求平均。原始结果 SHA-256：

- Intel：`f6ffd7c4b43617c2febfa3f8394407db05d0c196481cb7bbb091a61b3dffb866`
- SwiftShader：`8970630570dcd76a7389d50964305dc2052a21170d9d69994608273392665352`

相对上一次独立 V4 硬件持续结果，draw/frame 从 268.0003 到 269.000，增加 0.373%；FPS 从 119.997 到 120.031，p95 均为 8.4 ms。正向验收的短采样 draw/frame 从 270.2333 到 271.25，增加 0.376%。变化远低于冻结的 282 draw 门和 5% Spector 触发线。

### 当前 Round-3 正向浏览器验收

`scripts/browser-acceptance.mjs` 只执行一次，Intel Arc D3D11 WebGL2，退出码 0；报告 SHA-256 `b70558edc767fdedd7bcdfaa8ec261f44265d3a7ad60166937ab47acce5c5776`。

| 检查 | 实际结果 |
|---|---|
| 桌面布局 | 1280×720，无水平/垂直文档溢出 |
| 窄屏布局 | 390×844，无水平/垂直文档溢出；左右抽屉与六个相机入口可用 |
| 三种观察模式 | 实体、X-Ray、剖切全部激活成功 |
| 六个相机 | 轴测、前视、侧视、顶视、曲柄连杆、配气/燃烧全部激活成功 |
| 状态与开关 | 暂停保持、1200→1800 rpm、负载 75%、标签/流体/分解开关全部通过 |
| 相机交互 | 旋转、缩放、平移均产生投影变化 |
| 零件检查 | 指针选中排气歧管，检查器 5 字段完整 |
| 性能短样本 | 120 FPS、p95 8.4 ms、271.25 draw/frame |
| 异常 | console error 0、page exception 0、browser log error 0 |

固定画面脚本另用真实 Tab 序列到达 `#semantic-part-select`，再以 ArrowDown/Enter 选择 `engine-block`；检查器显示“气缸体”且有 5 个字段。该脚本不是第二次完整浏览器套件，只补足固定画面与键盘零件选择证据。

### V3 / V4 同状态视觉复核

V3 基线位于 `artifacts/v4/phase1/visual-performance/fixed-v3/`；V4 Round-3 位于 `fixed-visual/`。四张桌面比较图均为 1280×720、DPR 1、Intel Arc D3D11 WebGL2、`ENGINE PAUSED`、`000.0°`；窄屏为 390×844。状态文件 SHA-256 为 `135adc2c24152fb8f6c3203b4f2f3bb869c0ea8160bdc8181e87fbf7e22459c6`，固定捕获错误事件 0。

审查判断：

- 实体轴测保留 V3 的总体轮廓、材质层级、灯光与标签可读性；右侧新增键盘零件选择器没有遮挡主要视区。
- 曲柄剖切中开式缸体、下部定位结构、曲轴、连杆和活塞链条比 V3 更易分辨；Round-3 缸套/曲柄间隙修正没有通过隐藏或缩小动件取得结果。
- 配气 X-Ray 保留双凸轮、气门弹簧、燃烧室与四缸空间关系；没有可见法线闪烁或新遮挡。
- 分解轴测完整纳入气门室罩、缸盖、缸体、飞轮与油底壳，未恢复 V3 顶部裁切问题。
- 390×844 窄屏画面无文档溢出，主要模型、标签和底部六机位轨仍可用。

固定截图 SHA-256：

- 实体轴测：`dcfc893a521822ae23ede3c1ffb0c75eab286a29f53e38ba05ba39d288e2ca25`
- 曲柄剖切：`80682dc342e99a6e990412d03b2785cdedce95ceea80a1a1c79ca71dcb4dfed6`
- 配气 X-Ray：`b26f104f76f337a85a7c0a2e3b40411a5e769c846805995e5c523c49fa115649`
- 分解轴测：`9740275f71119ddd0ed22cf508a52fb59acce6fc157ec8fe23c3a43ca9d7740d`
- 窄屏：`a75d18dd0b66cc9a942050e4aabc4d3e11481f1d50f755127f1b53732f02434d`

## Spector 重跑裁决

**未触发。** Round-3 改动是几何约束与实体结构修正，没有改动材质、renderer、tone mapping、shadow 或 shader/program 管线；正式持续 draw 增加 0.373%，正向验收 draw 增加 0.376%，远低于预登记的 5% 触发线。因此保留已有 Spector 捕获，不重复生成约 90–100 MB 的单帧命令证据。这是按规则作出的审查判断，不是宣称 V4 已重新捕获 Spector。

## 缺陷分级

### P0：0

无。

### P1：0

无。硬件门、浏览器交互、控制台和 context 稳定性全部通过。

### P2：2（均有放行理由）

1. **SwiftShader 非流畅**：实测 12.082 FPS、p95 91.6 ms。它满足功能兼容和零错误边界，但不能代表普通电脑体验；Intel Arc 数据独立达到 120 FPS 级，故不通过降低硬件画质来刷软件帧率。
2. **完整移动冷缓存启动性能仍沿用 V3 已知债务**：本轮只受 Round-3 几何数量变化影响，未触发完整 5+5 Lighthouse 重跑。JS 相对旧 V4 包增加约 1.8 kB，但没有新的冷缓存分布可以证明改善或恶化；该项目继续明确保留，不能推断已经修复。

### P3：1

- Vite 主 JS 615.94 kB 仍超过 500 kB advisory；gzip 162.81 kB。该警告不是运行失败，未来应由启动剖析驱动拆包。

## 边界：实测、判断、推断与未测

- **实测**：两条 renderer 分离的持续 WebGL、一次正向浏览器套件、五个固定画面、键盘零件选择、资源大小、错误与 context loss。
- **审查判断**：无视觉回归；Spector 未触发；本方向 GO。
- **推断**：约 0.37% draw 增量和约 1.8 kB JS 增量不足以显示显著渲染管线回退；该推断不替代 Lighthouse/Spector 实测。
- **未测/待真人**：V4 完整 5+5 冷缓存 Lighthouse、V4 现场 INP p75、未触发的 V4 Spector、真人 NVDA、真人盲评。

## 最终建议

视觉、性能与浏览器方向 **GO**。没有 P0/P1，也没有仍然可行且高收益、低风险的视觉或硬件性能修正。全局 V4 放行仍以独立几何、无障碍和最终工程验证共同通过为前提。
