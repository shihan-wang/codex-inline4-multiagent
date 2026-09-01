# 机械研究与运动学基准

本文记录该网页所采用的机械关系、资料交叉核对和建模参数。它描述的是一台具有代表性的现代小型工业直列四缸直喷增压柴油机，不宣称复刻某一量产机型。几何与事件均保留在 `src/data/engineSpec.ts`，运动学在 `src/engine/kinematics.ts`。

## 资料来源与交叉核对

1. **滑块—曲柄精确几何**
   - [Colorado State University：Slider Crank Model](https://www.engr.colostate.edu/~allan/thermo/page2/page2.html) 明确给出缸径、行程、曲柄半径、连杆长度与曲轴转角的关系，并定义 TDC 为 0°、BDC 为 180°。
   - [Shigley, *Theory of Machines and Mechanisms*（公开扫描，第 55 页附近）](https://ndl.ethernet.edu.et/bitstream/123456789/88001/17/Theory%20of%20Machines%20and%20Mechanisms_%20Shigley.pdf) 用闭环方程给出连杆投影中的精确平方根项。
   - **结论**：不得用纯正弦近似活塞。以曲轴轴线为原点、TDC 为 `theta = 0`：

     `y_p = r cos(theta) + sqrt(l^2 - r^2 sin^2(theta))`

     `z_c = r sin(theta)`，`y_c = r cos(theta)`，连杆绕 +X 的角度为

     `alpha = atan2(-z_c, y_p - y_c)`。

     实现逐角度检查 `(y_p-y_c)^2 + z_c^2 = l^2`，并检查 TDC/BDC 差为 `2r`。

2. **四冲程、曲柄相位与点火次序**
   - [Benha University 工程课程：Firing order](https://bu.edu.eg/portal/uploads/Engineering,%20Shoubra/Mechanical%20Engineering/2511/crs-14012/Files/Firing%20order.pdf) 说明直列四缸四个曲柄销在同一平面且两组相差 180°，并列出 1-3-4-2；柴油机的 firing 对应燃油喷射顺序。
   - [Yanmar 4MP107 官方规格](https://www.yanmar.com/in/about/company/yebisu/4mp107/) 独立印证：直列四缸、四冲程、点火顺序 1-3-4-2，并给出水冷、涡轮中冷、强制润滑等系统配置。
   - **结论**：曲柄销为 `1/4 = 0°`、`2/3 = 180°`；在 720°循环中按 1、3、4、2 分别于全局 0°、180°、360°、540°到达做功上止点。因此某缸局部循环角为 `(全局曲轴角 - 该缸点火相位) mod 720°`。

3. **凸轮轴速比**
   - [SUSTech 学术仓储中的发动机综述，第 2.4.3 节](https://repository.sustech.edu/bitstream/handle/123456789/19902/chapter%202.pdf?isAllowed=y&sequence=4) 说明四冲程发动机凸轮轴以发动机一半转速旋转；同一资料也说明缸体冷却水道、曲轴/活塞常用材料及涡轮由排气驱动压气机的关系。
   - [ERIC 美国职业教育资料（Valve Mechanism and Gear Train）](https://files.eric.ed.gov/fulltext/ED220629.pdf) 独立指出四冲程凸轮轴为曲轴一半转速，每只气门在曲轴两转中开闭一次。
   - **结论**：`camAngle = crankAngle / 2`，不可按同速旋转。

4. **实际柴油机气门与喷油时序**
   - [ASRA College 机械工程手册，柴油机实际配气相位实验](https://www.asracollege.edu.in/wp-content/uploads/2018/04/HANDBOOKME3RD.pdf) 给出范围：进气开 10–25° BTDC、进气关 25–50° ABDC、排气开 30–50° BBDC、排气关 10–15° ATDC，喷油始于 5–10° BTDC、止于 15–25° ATDC。
   - [SLIET Thermal Engineering 课程资料：柴油机理论/实际配气图](https://mech.sliet.ac.in/files/2025/03/Thermal-Engg_PCME203.pdf) 的示意值与上述区间相符。
   - [美国交通部轻型车用柴油动力研究报告](https://rosap.ntl.bts.gov/view/dot/10310/dot_10310_DS1.pdf) 记录某研究机进气凸轮行程 8 mm、排气凸轮 9 mm，为可视化最大升程提供量级核对。
   - **采用值**：进气开 15° BTDC / 关 40° ABDC，排气开 45° BBDC / 关 15° ATDC，形成约 30° 气门重叠；喷油为 10° BTDC 至 20° ATDC；最大可视升程 8/9 mm。归一化升程使用 `sin²` 平滑包络，开闭端点均为零且斜率连续。这是实时展示曲线，不是精密凸轮加速度设计。

5. **代表性尺寸、压缩比与燃油系统**
   - [Yanmar 4TNV86CT 官方规格](https://www.yanmar.com/in/engine/products/diesel/v_watercooled/4tnv86ct/)：4 缸、86 × 90 mm、2.091 L、2400–3000 rpm、直喷、共轨、涡轮增压。网页据此采用 `bore=86 mm`、`stroke=90 mm`、`r=45 mm`、`rated=3000 rpm`。
   - [Yanmar 4MP107 官方规格](https://www.yanmar.com/in/about/company/yebisu/4mp107/) 给出较大型四缸柴油机压缩比 18.5:1；[Benha University 课程资料](https://bu.edu.eg/portal/uploads/Engineering,%20Shoubra/Mechanical%20Engineering/2511/crs-14012/Files/Firing%20order.pdf) 给出压燃机常见 12–24:1 范围。
   - [Nissan M9R 官方技术页](https://www.nissan-global.com/EN/INNOVATION/TECHNOLOGY/ARCHIVE/M9R/) 给出现代柴油机 1600 bar 共轨及可变几何涡轮技术。
   - **采用值**：压缩比 17.5:1、共轨压力 1600 bar；连杆中心距 150 mm（`l/r=3.33`）和 100 mm 缸心距为适合程序化装配的明确工程假设，不冒充厂商尺寸。

6. **运行状态量级**
   - [Cummins 维护资料](https://mart.cummins.com/imagelibrary/data/assetfiles/0057141.pdf) 给出某工业柴油机检查范围：冷却液 70–107°C、油压需高于 69 kPa。
   - [Cummins ISX15 快速参考](https://mart.cummins.com/imagelibrary/data/assetfiles/0032933.pdf) 给出热机油压 241–276 kPa（约 2.41–2.76 bar）及正常冷却液 180–220°F（约 82–104°C）。
   - **采用值**：界面标称水温 88°C、标称油压 4.2 bar（怠速 1.4 bar）；状态随转速/负载平滑变化，仅是有物理量级的展示值，不是 ECU 或热力学预测器。这里的名义油压略高于上述重型机热机量级，适合作为小型高速机中等转速的视觉仪表值，但不是特定机型维修限值。

## 720°循环定义

本项目约定每缸 `cycleAngleDeg = 0` 是压缩末端/做功开始的点火上止点：

| 局部曲轴角 | 冲程 | 活塞主运动 | 主要事件 |
|---:|---|---|---|
| 0–180° | 做功 / power | TDC → BDC | 喷油跨越 0°，早期燃烧衰减 |
| 180–360° | 排气 / exhaust | BDC → TDC | 排气阀已提前开启 |
| 360–540° | 进气 / intake | TDC → BDC | TDC 附近短暂气门重叠 |
| 540–720° | 压缩 / compression | BDC → TDC | 末端开始喷油 |

全局曲轴 0° 时各缸分别为：1 做功、2 排气、3 压缩、4 进气。每前进 180°，下一做功缸依次为 3、4、2。

## 实现边界与可视化简化

- `pistonY` 是相对曲轴轴线的**腕销中心高度**，不是活塞顶高度；场景需另加活塞冠部几何偏置。
- `rodAngle` 是连杆本地 +Y 轴绕世界 +X 的有符号角。正向曲轴第一象限中曲柄销 `Z>0`，连杆角为负。
- 进排气升程和燃烧强度是 0–1 的视觉驱动量；场景用各自最大升程或粒子数量换算。
- 没有求解缸压、扭矩波动、喷雾液滴、气体动力学、轴系扭振、二阶惯性平衡和热传导；这些属于本实时教育仿真的已知范围外内容。
