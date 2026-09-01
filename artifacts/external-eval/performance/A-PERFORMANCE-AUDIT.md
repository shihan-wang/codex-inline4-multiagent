# External evaluation A 类性能汇总

固定对象：`7e5ea916a115dcef1bf3ba467a31b78c6206c612`；协议提交：`38c00417812fa87ca76b520c17c978a14cbd8ad2`。

A 类得分：**19.5/25**。Spector 单帧由独立视觉代理执行，不混入持续 WebGL。

## 环境与有效性

- Windows 10 Home China 25H2 build 26200.9168 x64；Intel Core Ultra 9 185H，22 逻辑处理器。
- Microsoft Edge 152.0.4191.53；Node 24.14.0；npm 11.9.0；Lighthouse 12.8.2；web-vitals 5.3.0。
- 硬件 renderer：`ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)`。
- 软件 renderer：`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`。
- 有效运行：Lighthouse 桌面 5 + 移动 5；Web Vitals 桌面 5 + 移动 5；Intel Arc 3；SwiftShader 3。
- 无效运行：Lighthouse 4 个（3 个报告生成后清理 EPERM；1 个诊断中断且无报告）；全部原样保留且没有进入计分。Web Vitals/WebGL 无无效运行。

## Lighthouse 冷缓存

- 桌面 Performance：78, 77, 92, 82, 92；中位 82，最小 77，最大 92，得 1.5/3。
- 移动 Performance：42, 87, 57, 76, 88；中位 76，最小 42，最大 88，得 2/4。
- 桌面 LCP ms：470.3, 853, 626.7, 770.1, 631.5；中位 631.5，最小 470.3，最大 853，得 2/2。
- 移动 LCP ms：5968.5, 3127.7, 3458, 4209.5, 3062.3；中位 3458，最小 3062.3，最大 5968.5，得 1/2。
- 桌面 CLS：0.000031, 0.000085, 0.000031, 0.000085, 0.000031；中位 0.000031，最小 0.000031，最大 0.000085，得 1/1。
- 移动 CLS：0, 0, 0, 0, 0；中位 0，最小 0，最大 0，得 1/1。
- 桌面 TBT ms：534, 465, 232, 395, 228；中位 395，最小 228，最大 534。移动 TBT ms：782, 0, 2860, 0, 0；中位 0，最小 0，最大 2860。这些数值仅称为 TBT。
- 固定顺序 10 次全部有效；另保留 4 个无效尝试目录。

## Web Vitals 与 scene-ready

- scene-ready 桌面 ms：996.1, 281.2, 156.7, 173.5, 1334.1；中位 281.2，最小 156.7，最大 1334.1，得 2/2。
- scene-ready 移动 ms：212.8, 382.8, 207.7, 431.9, 956.8；中位 382.8，最小 207.7，最大 956.8，得 2/2。
- 独立 LCP 桌面 ms：1800, 1220, 976, 1080, 1284；中位 1220，最小 976，最大 1800；移动 ms：928, 2088, 912, 1132, 1656；中位 1132，最小 912，最大 2088。
- 独立 CLS 桌面：0.000045, 0.000045, 0.000045, 0.000045, 0.00004；中位 0.000045，最小 0.00004，最大 0.000045；移动：0, 0, 0, 0, 0；中位 0，最小 0，最大 0。
- web-vitals 脚本 INP 桌面 ms：464, 552, 504, 480, 448；中位 480，最小 448，最大 552；移动 ms：32, 72, 32, 32, 24；中位 32，最小 24，最大 72。这是实验室脚本交互，不是现场 p75。
- 50 个有效 Event Timing 交互分组：p75 32 ms，范围 16–552 ms，得 3/3。
- 50 个 event-to-next-paint：p75 20.4 ms，范围 11.7–550.1 ms。

## 持续 WebGL

- Intel Arc run-01：3601 帧 / 30 s，120.03 FPS，p50/p95/p99/max 8.3/8.4/8.5/8.8 ms，267 draws/frame，错误 0，context lost 0。
- Intel Arc run-02：3601 帧 / 30 s，120.02 FPS，p50/p95/p99/max 8.3/8.4/8.5/8.8 ms，267 draws/frame，错误 0，context lost 0。
- Intel Arc run-03：3602 帧 / 30.01 s，120.03 FPS，p50/p95/p99/max 8.3/8.4/8.5/8.6 ms，267 draws/frame，错误 0，context lost 0。
- 硬件得 3/3。
- SwiftShader run-01：600 帧 / 323.62 s，1.854 FPS，p50/p95/p99/max 633.3/916.7/1058.4/1241.6 ms，266.56 draws/frame，错误 0，context lost 0。
- SwiftShader run-02：600 帧 / 234.66 s，2.557 FPS，p50/p95/p99/max 600/716.7/750/783.3 ms，267.55 draws/frame，错误 0，context lost 0。
- SwiftShader run-03：600 帧 / 253.18 s，2.37 FPS，p50/p95/p99/max 600/700.1/783.3/1916.6 ms，266.79 draws/frame，错误 0，context lost 0。
- SwiftShader 功能通过但 p95 >150 ms，得 1/2；不得代表普通电脑硬件帧率。

## 未测/边界

- 本汇总不包含 Spector 捕获；该项由独立视觉代理负责。
- 未采集真实现场 Web Vitals p75；实验室脚本值不可冒充现场数据。
- 持续 WebGL 原始文件保留每次统计与 heap snapshot，但没有保留逐帧 delta 数组；报告以三次逐运行 p95 和保守最大值作阈值判定。
