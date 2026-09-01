# V4 第一阶段视觉/性能证据清单

固定模型对象：`7e5ea916a115dcef1bf3ba467a31b78c6206c612`。本目录只新增 V4 证据，没有覆盖外部测评证据。

## 本轮新增

- `baseline-manifest.json`：V3 实测基线、证据边界和进入实现前冻结的 V4 不退化阈值。
- `audit-report.md`：独立只读审查结论及逐项缺陷分析。
- `run-log.txt`：命令、退出结果、工具版本和边界。
- `fixed-v3/fixed-state-results.json`：9 个确定性画面状态；1280×720、DPR 1、暂停、曲轴显示 `000.0°`、Intel Arc D3D11 WebGL2、应用控制台事件 0。SHA-256 `429fc350fd473e55112d8379fe7f85c7a57edb6743f3cbd835f742f7ebb747b5`。
- `fixed-v3/*.png`：实体四机位、曲柄剖切、配气 X-Ray、流体开/关和装配分解，共 9 张同状态截图。
- `live-acceptance/acceptance-report.json`：现有正式浏览器验收脚本在硬件 GPU 路径的现场结果；通过。SHA-256 `40027420ae8ccaa4c6d0713ca4c3838692e70454bcbf5d0eaf9e2e1611d2d132`。
- `live-acceptance/*.png`：三模式、六机位、流体、分解、零件选择、桌面和窄屏抽屉，共 18 张功能截图。
- `representative-montage.png`：同状态实体轴测/曲柄剖切/配气 X-Ray 并排图。SHA-256 `67e445658c15486362d7ffe717711e0befd6b089cabd8fb491bca23e1aa5767b`。

## 只读引用的既有外部证据

- `artifacts/external-eval/performance/A-PERFORMANCE-AUDIT.md`：Lighthouse、Web Vitals、scene-ready 和持续 WebGL 汇总。SHA-256 `a335a973f0fcfdc81bcd486fd75fe41771e57450510fa4726c19b3007820d5c0`。
- `artifacts/external-eval/performance/a-scorecard.json`：全部 A 类原始统计。SHA-256 `6de641d51b6bb29d558e85403161a3c869dedbc32d9e0dd52e34ca19e9977c79`。
- `artifacts/external-eval/performance/lighthouse/`：桌面/移动冷缓存各 5 次有效 JSON/HTML，以及 4 个排除尝试。
- `artifacts/external-eval/performance/web-vitals/`：桌面/移动各 5 次实验室交互和 scene-ready 原始结果。
- `artifacts/external-eval/performance/webgl/intel-arc/`：3 次持续硬件 WebGL；不与软件路径合并。
- `artifacts/external-eval/performance/webgl/swiftshader/`：3 次 SwiftShader 兼容性/性能；不代表普通硬件。
- `artifacts/external-eval/performance/spector/solid-isometric/attempt-04/capture.json`：101,402,774 bytes，1,418 条命令/268 draw；SHA-256 `5aaf39c158fe81f7b48b3f11d93a203e7ca0ac357cb0bfdb8a8b781706354f55`。
- `artifacts/external-eval/performance/spector/section-crank/attempt-04/capture.json`：100,541,712 bytes，1,446 条命令/267 draw；SHA-256 `f3ba320cf42c51c950406c02cdf76be737b43d57cdd85fa38e49c675b9306eb3`。
- `artifacts/external-eval/performance/spector/xray-valvetrain/attempt-04/capture.json`：88,897,654 bytes，1,590 条命令/265 draw；SHA-256 `251a283ce818a89ed8f6eb927c4d465bfff3ab062d82ae082354481585db5084`。

外部大型测量证据完好，故第一阶段没有重复运行 5+5 Lighthouse、6 次持续 WebGL 或 Spector。
