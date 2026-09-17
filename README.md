```markdown
# 三角洲行动 TTK 计算器 — 项目文档

> Delta Force TTK Calculator
>
> 本文档面向 **AI 大模型**（作为项目上下文）和 **用大模型辅助开发的开发者**。
> 结构优先信息密度，省略客套。按需检索章节即可。
>
> ⚠️ 本文档以**实际代码**为准。旧版 `TtkCacheManager` / `KeyPointsComputer` / `ttkCache`
> 架构已被 `FastTTK` + `TTKDP` + `TTKMatrix` + `TTKIndexedDB` 取代。

---

## 0. 项目速览（AI 优先读这一段）

### 0.1 一句话定位

一个基于 **Vue 3 + Vite + ECharts** 的 Web 应用，用于精确计算、模拟和对比《三角洲行动》中各武器配置的击杀时间（TTK），支持附件加成、分段射速、连发模式、护甲减伤、距离衰减、命中概率分布，并提供距离-TTK 折线图、配装推荐、经济成本估算。

### 0.2 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite |
| 图表 | ECharts |
| 持久化 | IndexedDB（`idb` 库） |
| 状态 | 自研轻量 Store（`reactive` + `readonly`） |
| 样式 | 原生 CSS（CSS 变量 + 媒体查询） |
| 语言 | JavaScript (ES Module) |
| 环境 | Node.js ≥ 16，npm / pnpm / yarn |

### 0.3 核心数据流（一张图）

```
data.json
  │
  ▼
DataManager（单例，加载 / 规范化 / 导入导出 / 修改追踪）
  │
  ├──▶ stores.js（dataStore / paramsStore / appStore）
  │        │
  │        ▼
  │      Vue 组件（UI 层）
  │
  └──▶ FastTTK.computeTTK()          ← 统一计算入口
           │
           ├── 'fast'    → TTKDP.js            （动态规划，< 10ms，精度 < 0.01%）
           │
           └── 'precise' → SimulationEngine.js （蒙特卡洛，~700ms，精度 ~1%）

配装推荐链路（RecEngine）：
  RecEngine.recommend()
    ├─ _buildAttackSide()   （武器配置 × 子弹等级）
    ├─ _buildDefenseSide()  （护甲 × 头盔）
    ├─ _prepareEnemies()    （假想敌）
    ├─ computeTTKMatrix()   ← TTKMatrix.js（矩阵预计算 + 增量）
    │     └─ TTKIndexedDB.js（IndexedDB 持久化）
    └─ _buildRecommendationsFromMatrix()（读回 + 组合 + 排序）
```

**关键点**：
- **`FastTTK` 是唯一计算入口**，对外只暴露 `computeTTK({ mode })`；内部按模式分发到 DP 或蒙特卡洛
- **`TTKDP.js` 是主流程引擎**（快、精确、无随机性），所有批量计算/矩阵/折线图/单枪更新都走它
- **`SimulationEngine.js` 只用于两处**：① `FastTTK` 的 `'precise'` 模式；② `DamageDetailModal` 的逐发明细记录（`simulateOneTTKWithDetail`）
- **`TTKMatrix` + `TTKIndexedDB` 是推荐侧缓存**，与主流程的 `ttkCache` 无关（后者已删除）
- **`CombatCore` 是底层**（常量 / RNG / 伤害计算器 / 子弹策略），无外部依赖

### 0.4 文件数（配额内 34 个）

| 目录 | 数量 |
|---|---|
| `src/components/` | 13 |
| `src/core/` | 8 |
| `src/stores/` | 1 |
| `src/utils/` | 1 |
| `src/styles/` | 1 |
| `src/` 根（`App.vue` + `main.js`） | 2 |
| `public/` | 1 |
| 根目录 | 7 |
| **合计** | **34** |

> **不计入配额**：`assets/`（5 个）、`.github/workflows/deploy.yml`、`collect_files.py`、`tree.py`、`verify_merge.py`、`migrate_structure.py`、`node_modules/`。
> 配额上限 50，当前 34，留出 16 个额度。

### 0.5 快速启动

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建
npm run preview  # 预览构建结果
```

数据文件：`public/data.json`（首次运行前必须存在）。

### 0.6 当前数据规模（data.json）

- 武器：50 把
- 子弹：80+ 颗（按口径分组，每口径 1~5 级）
- 护甲：20 件（1~6 级）
- 头盔：24 顶（1~6 级）
- 价格配置：约 50 组（每把武器至少 1 个配置）

---

## 1. 目录结构

### 1.1 完整树

```
df-ttk/
├── .github/
│   └── workflows/
│       └── deploy.yml                  [不计配额]
├── assets/                             [不计配额]
│   ├── libs/
│   │   ├── chart.umd.min.js
│   │   └── chartjs-plugin-datalabels.min.js
│   ├── Version.txt
│   ├── bili.png
│   └── ss.avif
├── public/
│   └── data.json                       (1)
├── src/
│   ├── components/                     (13)
│   │   ├── AppLayout.vue
│   │   ├── ParamsPanel.vue
│   │   ├── TTKChart.vue
│   │   ├── DistanceChart.vue
│   │   ├── WeaponTable.vue
│   │   ├── ItemsPanel.vue
│   │   ├── BulletTable.vue
│   │   ├── ArmorTable.vue
│   │   ├── BarrelEditor.vue
│   │   ├── WeaponBaseEditor.vue
│   │   ├── ConfirmDialog.vue
│   │   ├── DamageDetailModal.vue
│   │   └── RecPanel.vue
│   ├── core/                           (8)
│   │   ├── CombatCore.js
│   │   ├── DataManager.js
│   │   ├── FastTTK.js
│   │   ├── RecEngine.js
│   │   ├── SimulationEngine.js
│   │   ├── TTKDP.js
│   │   ├── TTKIndexedDB.js
│   │   └── TTKMatrix.js
│   ├── stores/                         (1)
│   │   └── stores.js
│   ├── styles/                         (1)
│   │   └── main.css
│   ├── utils/                          (1)
│   │   └── weaponCalc.js
│   ├── App.vue
│   └── main.js
│                                       (2)
├── .gitignore
├── index.html
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── vite.config.js
│                                       (7)
├── collect_files.py                    [不计配额]
├── tree.py                             [不计配额]
├── verify_merge.py                     [不计配额]
└── migrate_structure.py                [不计配额]

配额内合计：1 + 13 + 8 + 1 + 1 + 1 + 2 + 7 = 34
```

### 1.2 每个文件职责

#### `src/components/`（13 个）

| 文件 | 职责 | 关键 props / emits |
|---|---|---|
| `AppLayout.vue` | 页面布局（Header + slot + Footer） | 无 props，用 `<slot />` 承载中间内容 |
| `ParamsPanel.vue` | 参数面板 + 操作按钮 | emits: `calculate` / `distance-chart` / `export-data` / `import-data` / `reset-data` |
| `TTKChart.vue` | TTK 堆叠柱状图（5 段分解） | props: `results` / `params` / `displayCount` |
| `DistanceChart.vue` | 距离-TTK 折线图 | props: `stats` / `distances` / `highlightWeapon` / `displayCount` / `segment` |
| `WeaponTable.vue` | 枪械数据表（卡片式，含秒伤、配置列表） | props: `data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`；emits: `update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk` |
| `ItemsPanel.vue` | 弹甲数据容器（子 Tab：子弹 / 护甲 / 头盔） | props: `caliberOptions`；emits: `update` |
| `BulletTable.vue` | 子弹数据表 | props: `data` / `caliberOptions` / `levelOptions`；emits: `update` / `add-bullet` / `delete-bullet` |
| `ArmorTable.vue` | 护甲/头盔数据表（用 `type` 区分） | props: `data` / `type`（`'armor'` / `'helmet'`）；emits: `update` |
| `BarrelEditor.vue` | 枪管编辑器弹窗 | props: `visible` / `weaponId`；emits: `update:visible` / `saved` |
| `WeaponBaseEditor.vue` | 武器基础属性编辑器弹窗 | props: `visible` / `weaponId` / `caliberOptions`；emits: `update:visible` / `saved` |
| `ConfirmDialog.vue` | 通用确认弹窗（Promise 封装） | props: `visible` / `title` / `message` / `confirmText` / `cancelText` / `confirmType` / `checkboxLabel` / `checkboxDefault`；emits: `update:visible` / `confirm` / `cancel` |
| `DamageDetailModal.vue` | 单次伤害模拟弹窗（逐发明细） | props: `visible` / `weaponId` / `configId` / `distance`；emits: `update:visible` |
| `RecPanel.vue` | 配装推荐面板（含 Top3 卡片 + 第 4~10 名表格） | 无 props |

#### `src/core/`（8 个）

| 文件 | 职责 |
|---|---|
| `CombatCore.js` | 底层核心：常量 + RNG + 4 个计算器类 + 3 个子弹策略类（合并自 config / rng / CombatUtils / BulletStrategy） |
| `DataManager.js` | 数据管理单例：加载 / 规范化 / 导入导出 / 修改追踪 / 内联 perf |
| `FastTTK.js` | **统一计算入口**：对外只暴露 `computeTTK()` / `computeTTKMatrix()` / 缓存管理，内部按 `mode` 分发到 DP 或蒙特卡洛 |
| `TTKDP.js` | DP 引擎：状态机 `(health, headHits, bodyHits, limbHits, burstPos, lastPart)`，算期望射击数/命中数/时间 |
| `TTKMatrix.js` | 矩阵预计算：枚举攻击侧 × 防御侧 × 敌人，调 DP 算每条 TTK，写 IndexedDB（增量） |
| `TTKIndexedDB.js` | IndexedDB 封装（基于 idb）：get / set / delete / clear / getAllKeys / count / stats |
| `SimulationEngine.js` | 蒙特卡洛引擎：单次模拟 / 记录模式 / 批量统计 / 子弹解析（**只用于精算 + 弹窗**） |
| `RecEngine.js` | 配装推荐引擎：枚举攻击/防御侧 → 调 `computeTTKMatrix` → 组合排序 |

#### `src/stores/`（1 个）

| 文件 | 职责 |
|---|---|
| `stores.js` | 三个 store 合并（dataStore / paramsStore / appStore） |

#### `src/utils/`（1 个）

| 文件 | 职责 |
|---|---|
| `weaponCalc.js` | 武器当前属性计算（应用枪管/枪口/精校） |

#### `src/styles/`（1 个）

| 文件 | 职责 |
|---|---|
| `main.css` | 全局样式 + CSS 变量 + 移动端基础适配 |

#### `src/` 根（2 个）

| 文件 | 职责 |
|---|---|
| `App.vue` | 主容器：布局 + 图表 + 表格 + 弹窗 + 全局计算逻辑 |
| `main.js` | 应用入口：初始化 DataManager / RecEngine，挂载 App |

---

## 2. 核心概念

### 2.1 射程分段与距离衰减

武器的 `ranges` 定义 4 个分段点，`decays` 定义 5 段衰减倍率：

```
[0, r1)   → decays[0]
[r1, r2)  → decays[1]
[r2, r3)  → decays[2]
[r3, r4)  → decays[3]
[r4, ∞)   → decays[4]
```

> ⚠️ 边界使用 `<` 而非 `<=`，确保分段不重叠。
> 实现：`CombatCore.js` 的 `DistanceDecayCalculator.calculate(distance, weapon)`
> DP 里也有一份等价实现：`TTKDP.js` 的 `calcDecay(distance, ranges, decays)`

**示例（AS Val）**：
```json
"ranges": [27, 54, "Infinity", "Infinity"],
"decays": [1, 0.9, 0.8, 0.8, 0.8]
```
- 0~27m：衰减 1.0
- 27~54m：衰减 0.9
- 54m+：衰减 0.8

### 2.2 伤害计算公式

```
基础肉伤 = 武器肉伤 × 子弹partMult[部位] × 武器mult[部位]
纯伤害   = 基础肉伤 × 距离衰减
穿透伤害 = 纯伤害 × 穿透率(pen)
护甲伤害 = 武器甲伤 × 护甲倍率(armorMult)

若护甲伤害 ≥ 当前护甲值：
    护甲被击穿 → frac = 当前护甲值 / 护甲伤害
    最终伤害 = frac × 穿透伤害 + (1 - frac) × 纯伤害
    剩余护甲 = 0
否则：
    最终伤害 = 穿透伤害
    剩余护甲 = 当前护甲值 - 护甲伤害
```

> 实现：
> - 蒙特卡洛：`CombatCore.js` 的 `BaseDamageCalculator` / `ArmorDamageCalculator`
> - DP：`TTKDP.js` 的 `calcDamage()`（等价但用「累积甲伤」表达）

### 2.3 命中部位

| 部位 | 键名 | 说明 |
|---|---|---|
| 头部 | `head` | 受头盔保护 |
| 胸部 | `chest` | 受护甲保护 |
| 腹部 | `stomach` | 受护甲保护 |
| 四肢 | `limbs` | **无视护甲** |

命中概率由 `hitProb` 决定（四项之和应为 1）。
> 实现：`CombatCore.js` 的 `HitPartSelector.select(hitProb)`
> DP：`TTKDP.js` 的 `runDP()` 内部对 `hitProb` 归一化后按概率分支

### 2.4 连发模式与部位偏置

连发武器（`fireMode: 'burst'`）的特殊逻辑：

- **第一发**：完全随机选择命中部位
- **后续发**：以 `BURST_BIAS = 0.7` 的概率命中**同一部位**，否则偏移到**相邻部位**
- **连发间隔**：每进入新连发周期（`shot % burstCount === 1` 且 `shot > burstCount`）插入一次 `burstInterval`
- **连发内部射速**：连发内部使用 `burstInternalROF`，忽略 `rofStages`

> ⚠️ **两套偏置实现存在细微差异**：
> - `CombatCore.HitPartSelector.selectWithBias()`：上下邻居各 50%（头部只连胸、四肢只连腹，用边界钳制）
> - `TTKDP.applyBurstBias()`：头/胸/腹/肢用硬编码 `adjMap`，头只连胸、胸连头+腹、腹连胸+肢、肢只连腹
> 二者对"相邻部位"的定义基本等价，但不是同一份代码。修改偏置逻辑时需**同时改两处**。

> 实现：
> - 蒙特卡洛：`SimulationEngine.js` 的 `simulateOneTTK` / `simulateOneTTKWithDetail`
> - DP：`TTKDP.js` 的 `applyBurstBias()` + `runDP()` 内部 `burstPos` 状态

### 2.5 分段射速 `rofStages`

```js
// 示例：前 3 个间隔射速 +100，之后 +0
rofStages: [
  { untilShot: 3, rofAdd: 100 },
  { rofAdd: 0 }  // untilShot 缺省 = "之后所有发"
]
```

用于模拟"镀铬爆发枪机"这类前几发射速更快的配件。

**间隔归属规则**：间隔归属"起点发"。`shot=1` → 第 1→2 发之间的间隔。

> ⚠️ **DP 与蒙特卡洛对 `untilShot` 的语义解读不同**：
> - `SimulationEngine._getIntervalAfterShot`：`shot <= stage.untilShot` 命中该阶段（第 `shot` 发之后的间隔）
> - `TTKDP.getShotIntervalMs`：`shotIndex < stage.untilShot` 命中该阶段（`shotIndex` 从 0 开始）
> 二者边界差 1，实际使用中需注意。**修改时两处都要改。**

> 实现：`SimulationEngine.js` 的 `_getIntervalAfterShot` / `TTKDP.js` 的 `getShotIntervalMs`

### 2.6 附件合并规则

**枪管字段 > 武器字段 > null**，涉及字段：

| 字段 | 说明 |
|---|---|
| `fireMode` | 开火模式：`'auto'` / `'burst'` / `null` |
| `burstCount` | 连发数（如 3、4） |
| `burstInternalROF` | 连发内部射速 |
| `burstInterval` | 连发间隔（秒） |
| `rofStages` | 分段射速数组 |

> 实现：`utils/weaponCalc.js` 的 `calculateCurrentValues(weapon, barrel, muzzleId, precision)`

### 2.7 初速公式

```
初速 = (原始初速 + velocityAdd) × rangeMult × 枪口mult × (1 + 精校)
```

其中 `rangeMult = 枪管射程倍率 + 枪口射程加成`。

**示例**：AS Val + VSS海啸长枪管组合 + 无枪口 + 精校9%
- 原始初速 330，rangeMult 1.3
- velocityMult = 1.3 × 1.0 × 1.09 = 1.417
- 初速 = 330 × 1.417 = 467.61 → 468

**示例**：AS Val + 刺客高级枪管（velocityAdd: 120）+ 无枪口 + 精校9%
- 原始初速 330，rangeMult 1.0，velocityAdd 120
- velocityMult = 1.0 × 1.0 × 1.09 = 1.09
- 初速 = (330 + 120) × 1.09 = 490.5 → 491

### 2.8 两种计算模式（FastTTK）

| 模式 | 引擎 | 耗时 | 精度 | 用途 |
|---|---|---|---|---|
| `'fast'`（默认） | `TTKDP.js` | < 10ms | < 0.01% | 主流程：批量计算 / 折线图 / 单枪更新 / 推荐矩阵 |
| `'precise'` | `SimulationEngine.js` | ~700ms | ~1% | 验证 / 用户要求精确 |

> `FastTTK.computeTTK({ mode })` 按 `mode` 分发。
> **默认走 `'fast'`**，全项目只有 `DamageDetailModal` 显式走蒙特卡洛（但它直接调 `SimulationEngine`，不走 `FastTTK`）。

### 2.9 矩阵版本号（`MATRIX_VERSION`）

`TTKMatrix.js` 定义 `MATRIX_VERSION = 1`，参与 `scenarioHash` 计算。**修改伤害公式 / 缓存 key 结构 / 命中率逻辑时，必须递增它**，否则 IndexedDB 里的旧缓存会被错误复用。

> 对比旧架构：旧版 `TtkCacheManager` 有 `CACHE_VERSION`，随 `ttkCache` 一起被删除。

---

## 3. 计算逻辑

### 3.1 TTK 分解（5 段）

柱状图将总 TTK 拆分为：

| 分段 | 说明 |
|---|---|
| `flight` | 飞行延迟 = 距离 / 初速 |
| `triggerDelay` | 扳机延迟（可开关） |
| `burstInterval` | 平均连发间隔 |
| `noMissFireDelay` | 无空枪射击延迟（理论射击间隔） |
| `emptyDelay` | 平均空枪延迟（未命中带来的额外时间） |

后两者按固定比例拆分剩余时间：

```
nonShotPart = flight + triggerDelay + burstInterval
remaining   = totalTime - nonShotPart
noMissFireDelay = remaining × (0.5 / 0.7)
emptyDelay      = remaining × (0.2 / 0.7)
```

> 实现：`App.vue` 的 `handleCalculate`（以及 `onUpdateWeaponTTK` 里同一套公式的副本）

### 3.2 加权平均 TTK

折线图排序使用**距离加权**，近距离权重更高：

```js
weight = 1.5 - (distance / 100) × 1.0
// 0m → 1.5，100m → 0.5
weightedAvg = Σ(ttk × weight) / Σ(weight)
```

> 实现：`App.vue` 的 `buildDistanceStats`（以及 `updateSingleWeaponTTK` 里同一套公式的副本）

### 3.3 关键点 vs 全量距离点（架构变化说明）

- **旧架构**：只算"关键点"（0m / 各分段点 / 分段点前 1m / 100m），其余用 `TtkCacheManager.interpolateTTK` 线性插值
- **新架构**：`App.vue` 的 `distances = [0, 1, 2, ..., 100]`（101 个点），**逐点调 `computeSingleTTK`**（走 DP），不再插值

> 因为 DP 单点 < 10ms，全量 101 点也在可接受范围内。
> 代价：`handleCalculate` / `handleDistanceChart` / `computeHavocCosts` / `updateSingleWeaponTTK` 里各有一个 101 次循环，逻辑重复度高。

### 3.4 命中率映射

`getHitRateFromMap()` 的规则：

1. 排序后线性插值
2. **10m 内强制 100% 命中率**（符合游戏近战设定）
3. 超出最近点会**外推**，但被钳制在 `[0, 1]`

> 实现：`DataManager.js` 的 `getHitRateFromMap(hitRateMap, distance, fallback)`

### 3.5 哈弗币消耗公式

```
哈弗币消耗 = 整枪价格 × (1 - 撤离率) 
           + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
```

- `平均致死枪数`：所有距离点 `shots` 的平均值（101 个点全算）
- `KD × 5`：KD 放大倍数
- `其他消耗`：默认 30 发

> 实现：`App.vue` 的 `computeHavocCosts`（全量）和 `onUpdateWeaponTTK`（单枪，同一套公式的副本）

### 3.6 综合评分（假 TTK）

```js
假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间

// 默认 aimWeight = 0.4（40%）
```

> 实现：`WeaponTable.vue` 的 `rowsWithCurrent` 计算属性

### 3.7 DP 状态机（TTKDP 核心）

`TTKDP.js` 用一个 `Map` 做记忆化，状态键：

```js
stateKey = `${health}|${headHits}|${bodyHits}|${limbHits}|${burstPos}|${lastPart}`
```

- `health`：剩余血量（浮点）
- `headHits` / `bodyHits` / `limbHits`：各部位累积命中数（用于算累积甲伤）
- `burstPos`：连发周期内的位置（0 ~ burstCount-1）
- `lastPart`：上一发命中部位（连发偏置用）

**递推**：对 4 个部位分别算伤害 → 递归 → 概率加权求和。

**初始条件的特殊性**：第一发的期望时间公式与后续不同：
```js
if (isFirstShot) {
  expectedTime = (1 - p) * currentIntervalMs / p   // 减去第一发不用等的间隔
} else {
  expectedTime = currentIntervalMs / p
}
```

**状态数上限**：`MAX_STATES = 3_000_000`，超了直接抛异常。

**调试开关**（通过 `window` 控制）：
```js
window.__DEBUG_DP = true              // 打开调试
window.__DEBUG_DP_TARGET = 'MK4'      // 只输出武器名包含 MK4 的日志
window.__DEBUG_DP_ONCE = true         // 每个武器只输出一次
```

---

## 4. 数据流

### 4.1 应用启动链路

```
main.js
  ├── getDataManager()                        # 创建 DataManager 单例
  ├── window.__dataManager
  ├── createApp(App).mount('#app')
  └── getRecEngine(dm)                        # 创建 RecEngine
      └── window.__recEngine

App.vue onMounted
  ├── dataStore.loadData()
  │     └── DataManager.loadFromJSON('./data.json')
  │           ├── fetch + validateData
  │           ├── normalizeData（规范化 ranges/bullets/configs/armors）
  │           └── originalData = 深拷贝（用于重置）
  ├── 收集 caliberOptions
  └── setTimeout(handleCalculate, 500)
```

> ⚠️ 不再初始化 `TtkCacheManager`（已删除）。矩阵缓存由 `TTKMatrix` 内部惰性打开 IndexedDB。

### 4.2 TTK 计算链路（全局）

```
用户点击「📊 计算 TTK」
  → ParamsPanel emit('calculate')
  → App.vue handleCalculate()
    ├── appStore.setGlobalCalculating(true)
    ├── getEnabledConfigs()                   # 取所有 enabled !== false 的配置
    ├── buildArmedWeapons(configs)            # 应用附件，构建"武装后"武器
    │     └── calculateCurrentValues(weapon, barrel, muzzleId, precision)
    │
    ├── 对每个配置：
    │     ├── computeSingleTTK(weapon, attachment, params, dm)
    │     │     ├── SimulationEngine.getRealBulletKey()   # 解析实际子弹
    │     │     ├── dm.getHitRateFromMap()                # 解析命中率
    │     │     └── computeTTK({ mode: 'fast' })          # ← FastTTK
    │     │           └── TTKDP.computeTTKWithDP()
    │     ├── 计算 5 段分解
    │     └── appStore.updateCalcProgress(i + 1)
    │
    ├── results.sort((a, b) => a.totalTime - b.totalTime)
    ├── appStore.setTtkResults(results)
    ├── await handleDistanceChart()           # 自动触发折线图
    └── computeHavocCosts(...)                # 计算哈弗币消耗
```

### 4.3 折线图链路

```
handleDistanceChart()
  ├── getEnabledConfigs()
  ├── buildArmedWeapons()
  ├── appStore.showCalcProgress()
  ├── buildDistanceStats(armed, attachments)
  │     └── 对每个武器：
  │           ├── 对 101 个距离点逐个 computeSingleTTK()    # ← 全量，不插值
  │           ├── 计算 weightedAvg
  │           └── appStore.updateCalcProgress(idx + 1)
  ├── 提取 { ttk, aim } 作为评分原始数据
  ├── appStore.setScores(scores)
  └── distanceStats.value = stats
```

### 4.4 单次模拟链路（弹窗）

```
DamageDetailModal
  → runSimulation(seed)
    ├── setSeed(seed)                        # 固定种子（来自 CombatCore）
    ├── calculateCurrentValues()              # 应用附件
    ├── SimulationEngine.getRealBulletKey()   # 解析实际子弹
    ├── BulletStrategyFactory.getStrategy(bulletKey, bulletData)
    └── SimulationEngine.simulateOneTTKWithDetail()
          ├── 初始化 health / armorState
          ├── 主循环（while health > 0）：
          │     ├── 判断连发间隔 burstGapBefore
          │     ├── 计算射击间隔 shotIntervalBefore
          │     ├── 命中率判断（seededRandom）
          │     ├── 部位选择（连发偏置）
          │     ├── calculateHitDamageWithPart（collectDebug=true）
          │     └── 记录 step
          └── 返回 { steps, totalTime, shots, hits, ... }
```

> ⚠️ 此路径**不走 `FastTTK`**，直接调 `SimulationEngine`，因为需要逐发明细（DP 无法给出"这一发的伤害"）。

### 4.5 推荐链路（RecEngine + TTKMatrix）

```
RecPanel.runRecommend()
  → window.__recEngine.recommend(input, options)
    ├── _buildAttackSide()      # 枚举：武器 × 配置 × 子弹等级
    ├── _buildDefenseSide()     # 枚举：护甲 × 头盔
    ├── _prepareEnemies()       # 假想敌（含 _enemyArmed）
    │
    ├── computeTTKMatrix({ attacks, defenses, enemies, scenario, ... })
    │     └── TTKMatrix.buildAllMatrix()
    │           ├── buildAttackMatrix()   # 每个 (attack, enemy) → attackTTK
    │           │     ├── getMatrixEntry(id)  # 查 IndexedDB
    │           │     └── 未命中 → computeTTKWithDP() → setMatrixEntries()
    │           └── buildDefenseMatrix()  # 每个 (defense, enemy) → defenseTTK
    │
    └── _buildRecommendationsFromMatrix()
          ├── queryAttackTTK()   # 从 IndexedDB 读回
          ├── queryDefenseTTK()
          ├── 组合 + 预算过滤 + 比值排序
          └── 返回 { topN, rest, allCount }
```

### 4.6 数据修改链路

```
用户编辑单元格
  → 组件事件（如 onNameChange）
    → dataStore.updateBullet / updateWeapon / updatePriceConfig
      → DataManager.updateXXX
        ├── Object.assign（写入 this.data）
        └── markWeaponModified（追踪修改）
    → dataStore.refreshBullets / refreshWeapons / refreshPrices
      → dataState.xxx = [...dm.getXxx()]  # 新数组引用触发响应式
    → emit('update') 通知父组件
```

### 4.7 缓存失效链路

**主流程（无缓存）**：DP 每次现算，不缓存。

**推荐侧（TTKMatrix + IndexedDB）**：
```
场景参数变化（hitRateMap / hitProb / triggerDelayEnable / healthValue）
  → scenarioHash 变化
    → makeAttackId / makeDefenseId 变化
      → IndexedDB 查不到 → 重算 → 写入新 key

攻防/敌人配置变化
  → id 里的 weaponId / configId / bulletId / armor / helmet / distance 变化
    → IndexedDB 查不到 → 重算

重置数据
  → App.vue resetData() 里调 clearMatrix()（来自 FastTTK）
    → IndexedDB 清空
```

> ⚠️ 注意：`TTKMatrix` 里的 `_makeScenarioHash`（RecEngine）和 `makeScenarioHash`（TTKMatrix）是**两份独立实现**，必须保持一致，否则查不到缓存。修改时**两处都要改**。

---

## 5. 数据结构（data.json）

### 5.1 顶层

```json
{
  "version": "1.0",
  "updatedAt": "2026-09-17",
  "meta": {
    "description": "Delta Force TTK 计算器 - 统一数据源",
    "note": "...",
    "updatedAt": "2026-09-17"
  },
  "weapons": [...],
  "bullets": [...],
  "prices": [...],
  "armors": [...]
}
```

> ⚠️ **不再有 `ttkCache` 顶层字段**。旧版导出的 JSON 里可能残留，导入时 `normalizeData` 会删除它。

### 5.2 武器对象

```json
{
  "id": 5,
  "name": "AS Val",
  "type": "步枪",
  "allowedBullet": "9x39mm",
  "ranges": [27, 54, "Infinity", "Infinity"],
  "decays": [1, 0.9, 0.8, 0.8, 0.8],
  "velocity": 330,
  "flesh": 28,
  "armor": 44,
  "rof": 972,
  "triggerDelay": 0,
  "mult": { "head": 1.9, "chest": 1, "stomach": 0.9, "limbs": 0.4 },
  "barrels": [
    {
      "name": "刺客高级枪管",
      "rangeMult": 1,
      "velocityAdd": 120,
      "rofMult": 0.7,
      "damageBonus": 9,
      "armorDamageBonus": 4,
      "partMultAdd": { "head": -0.2, "stomach": 0.1, "limbs": 0.2 },
      "fireMode": "burst",
      "burstCount": 4,
      "burstInternalROF": 845,
      "burstInterval": 0.14
    }
  ]
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | number | 唯一 ID |
| `name` | string | 武器名 |
| `type` | string | 类型（步枪 / 冲锋枪 / 轻机枪 / 精确射手步枪 / 手枪） |
| `allowedBullet` | string | 口径（如 `"9x39mm"`） |
| `ranges` | array | 4 个分段点（`Infinity` 表示无限） |
| `decays` | array | 5 段衰减倍率 |
| `velocity` | number | 初速（m/s） |
| `flesh` | number | 肉伤 |
| `armor` | number | 甲伤 |
| `rof` | number | 射速（RPM） |
| `triggerDelay` | number | 扳机延迟（ms） |
| `mult` | object | 部位倍率（head / chest / stomach / limbs） |
| `barrels` | array | 枪管列表 |

**枪管字段**（全部可选，缺省用武器字段）：

| 字段 | 说明 |
|---|---|
| `name` | 枪管名 |
| `rangeMult` | 射程倍率 |
| `rangeAdd` | 射程增量 |
| `velocityAdd` | 初速增量 |
| `rofMult` | 射速倍率 |
| `damageBonus` | 肉伤加成 |
| `armorDamageBonus` | 甲伤加成 |
| `triggerDelayDelta` | 扳机延迟增量 |
| `ranges` | 自定义射程（覆盖武器） |
| `decays` | 自定义衰减（覆盖武器） |
| `partMultAdd` | 部位倍率加成 |
| `rofStages` | 分段射速 |
| `fireMode` | 开火模式（`'auto'` / `'burst'`） |
| `burstCount` | 连发数 |
| `burstInternalROF` | 连发内部射速 |
| `burstInterval` | 连发间隔（秒） |

### 5.3 子弹对象

```json
{
  "id": "5.56x45mm#5",
  "caliber": "5.56x45mm",
  "name": "M995",
  "level": 5,
  "armorMult": 1,
  "pen": 1,
  "price": 5317,
  "armorData": {
    "1": { "armorMult": 1, "pen": 1 },
    "2": { "armorMult": 1, "pen": 1 },
    "3": { "armorMult": 1, "pen": 1 },
    "4": { "armorMult": 1, "pen": 0.75 },
    "5": { "armorMult": 1, "pen": 0.5 },
    "6": { "armorMult": 0.6, "pen": 0 }
  },
  "partMult": { "head": 1, "chest": 1, "stomach": 1, "limbs": 1 },
  "isDefault": true,
  "enabled": true
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 ID，格式 `${caliber}#${序号}` |
| `caliber` | string | 口径 |
| `name` | string | 子弹名 |
| `level` | number | 等级（1~5） |
| `armorData` | object | 各护甲等级穿透/倍率（key 是等级 `1`~`6`） |
| `partMult` | object | 部位肉伤倍率 |
| `isDefault` | boolean | 同 caliber+level 唯一 |
| `enabled` | boolean | 是否启用 |

**ID 规范**：`${caliber}#${序号}`，序号口径内递增，**一旦分配不随 level/name 变化**。禁止修改 `caliber` / `id`。

### 5.4 价格配置

```json
{
  "weaponId": 41,
  "weaponName": "腾龙",
  "configs": [
    {
      "id": "#1",
      "barrelId": 0,
      "barrel": "新式蛟龙战术长枪管",
      "muzzleId": 2,
      "muzzle": "先进/轻语/勇火",
      "precision": 0.09,
      "aimSpeed": 349,
      "buildCode": "腾龙突击步枪-烽火地带-6L9JKS005506E7BV9G8G5",
      "price": 440000,
      "distance": [30, 50, 100],
      "hitRate": [1, 0.9, 0.7],
      "bullet": "",
      "enabled": true
    }
  ]
}
```

**配置字段**：

| 字段 | 说明 |
|---|---|
| `id` | 配置 ID（`#1` / `#2` / ...） |
| `barrelId` | 枪管索引（`-1` = 无） |
| `muzzleId` | 枪口 ID（`0` = 无） |
| `precision` | 精校值（-0.09 ~ 0.09） |
| `aimSpeed` | 开镜时间（ms），影响评分不影响 TTK |
| `buildCode` | 改枪码 |
| `price` | 整枪价格（哈弗币） |
| `distance` | 命中率映射的距离点 |
| `hitRate` | 命中率映射的命中率 |
| `bullet` | 显式指定的子弹 ID（空 = 用全局等级） |
| `enabled` | 是否启用 |

### 5.5 护甲/头盔对象

```json
{
  "id": "armor_4_1789274589263",
  "type": "armor",
  "name": "MK-2战术背心",
  "level": 4,
  "value": 110,
  "price": 181666,
  "parts": "胸腹",
  "enabled": true
}
```

**字段说明**：

| 字段 | 说明 |
|---|---|
| `id` | 唯一 ID（`armor_*` / `helmet_*`） |
| `type` | `'armor'` / `'helmet'` |
| `name` | 名称 |
| `level` | 等级（1~6） |
| `value` | 护甲值 / 头盔值 |
| `price` | 价格（哈弗币） |
| `parts` | 防护部位（仅护甲，`'胸部'` / `'胸腹'` / `'胸腹肩'`） |
| `enabled` | 是否启用 |

### 5.6 IndexedDB 结构（替代旧 ttkCache）

**数据库**：`df-ttk`（`TTKIndexedDB.js`）
**版本**：`1`
**ObjectStore**：`ttk-matrix`（keyPath: `id`）

**记录结构**：

```js
{
  id: string,          // 唯一 ID，如 "atk_41_1_5.8x42mm#3_a4v110_h4v48_d30_<scenarioHash>"
  ttk: number,         // TTK（ms）
  shots: number,       // 期望射击数
  hits: number,        // 期望命中数
  meta: object,        // 附加信息（type / weaponId / bulletId / enemyName / distance / scenarioHash / matrixVersion ...）
  cachedAt: number,    // 缓存时间戳（ms）
}
```

**ID 格式**（`TTKMatrix.js`）：

| 类型 | 格式 | 示例 |
|---|---|---|
| `atk_*` | `atk_{weaponId}_{configId}_{bulletId}_a{armorLevel}v{armorValue}_h{helmetLevel}v{helmetValue}_d{round(distance)}_{scenarioHash}` | `atk_41_1_5.8x42mm#3_a4v110_h4v48_d30_1x8y2z` |
| `def_*` | `def_{enemyWeaponId}_{enemyConfigId}_{enemyBulletId}_a{ourArmorLevel}v{ourArmorValue}_h{ourHelmetLevel}v{ourHelmetValue}_{scenarioHash}` | `def_1_1_5.45x39mm#4_a5v95_h5v50_1x8y2z` |

**`scenarioHash` 组成**（`TTKMatrix.makeScenarioHash`）：
```
hitRateMap（排序后 "d1:r1:d2:r2..."）
+ hitProb（"h:c:s:l"）
+ triggerDelayEnable（"1"/"0"）
+ healthValue
+ `v${MATRIX_VERSION}`
→ simpleHash() → 36 进制短码
```

> ⚠️ `RecEngine._makeScenarioHash` 是**另一份独立实现**，必须和 `TTKMatrix.makeScenarioHash` 保持一致。

**批量写入**：`BATCH_SIZE = 200`，每 200 条写一次。

**`MATRIX_VERSION = 1`**（`TTKMatrix.js` 模块常量）：改伤害公式 / 缓存 key / 场景参数时递增，旧缓存自动失效。

**工具 API**（`TTKIndexedDB.js`）：
- `getMatrixEntry(id)` / `setMatrixEntry(id, data)` / `setMatrixEntries(entries)`
- `deleteMatrixEntry(id)` / `clearMatrix()`
- `getAllMatrixIds()` / `getAllMatrixEntries()` / `getMatrixCount()`
- `getMatrixStats()` → `{ count, sizeKB, sizeMB }`
- `requestPersistentStorage()` / `closeDB()`

---

## 6. 模块 API 速查

### 6.1 `DataManager`（`src/core/DataManager.js`）

单例：`getDataManager()`。

> ⚠️ 旧版的 `setTtkCacheManager` / `getTtkCache` / `setTtkCache` / `getTtkCacheStats` **已全部删除**（随 `ttkCache` 一起）。

#### 数据加载

| 方法 | 说明 |
|---|---|
| `loadFromJSON(url)` | 从 URL 加载，返回 `this.data` |
| `validateData(data)` | 校验格式 |
| `normalizeData(data)` | 规范化（ranges / bullets / configs / armors / 删除旧 ttkCache） |

#### 数据获取 - 武器

| 方法 | 说明 |
|---|---|
| `getWeapons()` | 全部武器 |
| `getWeaponById(id)` | 按 ID 查武器 |

#### 数据获取 - 子弹

| 方法 | 说明 |
|---|---|
| `getBullets()` | 全部子弹 |
| `getEnabledBullets()` | 启用的子弹 |
| `getBulletById(id)` | 按 ID 查 |
| `getBulletByCaliberAndLevel(caliber, level, includeDisabled=false)` | 按口径+等级查（默认过滤禁用） |
| `getBulletsByCaliber(caliber, includeDisabled=false)` | 按口径查（默认过滤禁用） |
| `getNextBulletId(caliber)` | 生成下一个子弹 ID |
| `getBulletDisplay(bullet)` | 显示字符串（`"caliber Lv.X name"`） |
| `getDefaultBullet(caliber, level)` | 默认子弹 |
| `getBulletRows()` | 子弹行（用于表格） |
| `findBulletIdByDisplay(bulletDisplay)` | 从显示字符串反查 ID |

#### 数据获取 - 护甲/头盔

| 方法 | 说明 |
|---|---|
| `getArmors()` | 全部护甲/头盔 |
| `getArmorsByType(type, includeDisabled=false)` | 按类型查 |
| `getEnabledArmors()` | 启用的护甲/头盔 |
| `getArmorById(id)` | 按 ID 查 |

#### 数据获取 - 枪口

| 方法 | 说明 |
|---|---|
| `getMuzzles()` | 全部枪口 |
| `getMuzzleById(id)` | 按 ID 查 |
| `getMuzzleBonuses(muzzleId)` | 枪口加成 `{ rangeMult, velocityMult }` |
| `getMuzzleNames()` | 枪口名列表 |

#### 数据获取 - 价格

| 方法 | 说明 |
|---|---|
| `getPrices()` | 全部价格配置 |
| `getPriceByWeaponId(weaponId)` | 按武器 ID 查 |
| `getPriceRowsForWeapon(weaponId)` | 解析配置（含 barrelId/muzzleId 反查） |
| `getPriceRows()` | 全部解析后的配置行 |
| `getHitRateForDistance(weaponId, configId, distance, fallback)` | 命中率（单武器） |
| `getHitRateFromMap(hitRateMap, distance, fallback)` | 命中率（通用，含 10m 内 100%） |
| `getNextConfigId(weaponId)` | 生成下一个配置 ID |

#### 工具方法 - 枪管

| 方法 | 说明 |
|---|---|
| `findBarrelIdByName(weaponId, barrelName)` | 按名查枪管索引 |
| `findBestBarrelIndex(weaponId)` | 找最佳枪管索引 |
| `findBestBarrelName(weaponId)` | 找最佳枪管名 |

#### 数据更新 - 武器

| 方法 | 说明 |
|---|---|
| `updateWeapon(weaponId, updates)` | 更新武器（标记修改） |
| `updateWeaponBarrel(weaponId, barrelIndex, updates)` | 更新枪管 |
| `addWeaponBarrel(weaponId, barrelData)` | 新增枪管 |
| `removeWeaponBarrel(weaponId, barrelIndex)` | 删除枪管 |

#### 数据更新 - 子弹

| 方法 | 说明 |
|---|---|
| `addBullet(bulletData)` | 新增子弹 |
| `updateBullet(bulletId, updates)` | 更新子弹（禁止改 caliber / id / isDefault） |
| `removeBullet(bulletId)` | 删除子弹 |
| `setDefaultBullet(bulletId)` | 设置默认子弹 |
| `setBulletsEnabled(enabled, caliber=null)` | 批量启用/禁用 |

#### 数据更新 - 护甲

| 方法 | 说明 |
|---|---|
| `addArmor(armorData)` | 新增护甲 |
| `updateArmor(id, updates)` | 更新护甲 |
| `removeArmor(id)` | 删除护甲 |
| `setArmorsEnabledByType(type, enabled)` | 批量启用/禁用 |

#### 数据更新 - 价格

| 方法 | 说明 |
|---|---|
| `updatePriceConfig(weaponId, configId, updates)` | 更新配置 |
| `addPriceConfig(weaponId, configData)` | 新增配置 |
| `removePriceConfig(weaponId, configId)` | 删除配置（每武器至少保留 1 个） |

#### 修改追踪

| 方法 | 说明 |
|---|---|
| `markWeaponModified(weaponId)` | 标记修改 |
| `markWeaponsModified(weaponIds)` | 批量标记 |
| `markWeaponsByBullet(bulletId)` | 按子弹标记 |
| `isWeaponModified(weaponId)` | 查是否修改 |
| `getModifiedWeaponIds()` | 全部修改的武器 ID |
| `clearWeaponModified(weaponId)` | 清除单个 |
| `clearAllModified()` | 清除全部 |

#### 导出 / 导入 / 重置

| 方法 | 说明 |
|---|---|
| `exportToJSON(includeCache=true)` | 导出 JSON 字符串（排序 + 压缩，`includeCache` 参数保留兼容但无实际作用） |
| `exportToFile(filename=null, includeCache=true)` | 导出文件 |
| `importFromJSON(jsonStr)` | 从 JSON 字符串导入 |
| `importFromFile(file)` | 从文件导入（返回 Promise） |
| `resetToOriginal()` | 重置为初始状态 |
| `hasUnsavedChanges()` | 是否有未保存修改 |
| `getStats()` | 统计信息 |

### 6.2 `FastTTK`（`src/core/FastTTK.js`）

**统一计算入口**。全项目对外只用这几个函数。

| 方法 | 说明 |
|---|---|
| `computeTTK(options)` | **单次 TTK**（async）。按 `options.mode`（`'fast'` / `'precise'`）分发，默认 `'fast'` |
| `computeTTKFast(options)` | 同步版，强制走 DP |
| `computeTTKPrecise(options)` | async，走蒙特卡洛（动态 `import SimulationEngine`，避免循环依赖） |
| `computeTTKMatrix(options)` | 转发到 `TTKMatrix.buildAllMatrix` |
| `queryAttackTTK(options)` | 转发到 `TTKMatrix.getAttackTTK` |
| `queryDefenseTTK(options)` | 转发到 `TTKMatrix.getDefenseTTK` |
| `queryMatrixStats()` | 转发到 `TTKMatrix.getMatrixStats` |
| `clearMatrix()` | 转发到 `TTKMatrix.clearMatrixCache` |
| `getModeDescription(mode)` | 模式中文描述 |
| `getDefaultMode()` | 返回 `'fast'` |

**`computeTTK` 参数**：
```js
{
  weapon,               // 应用附件后的武器
  bulletData,           // 子弹对象
  defender: {           // 防御侧
    armorLevel, armorValue, helmetLevel, helmetValue
  },
  scenario: {           // 场景
    hitRate, hitProb, triggerDelayEnable, healthValue
  },
  distance,             // 距离
  mode,                 // 'fast' | 'precise'（默认 'fast'）
  strategy,             // 精算模式必传：子弹策略
}
```

**`computeTTK` 返回值**：
```js
{
  ttk: number,          // TTK（ms）
  shots: number,        // 期望射击数
  hits: number,         // 期望命中数
  mode: 'fast' | 'precise',
  debug?: object,       // 快速模式含 debug
}
```

### 6.3 `TTKDP`（`src/core/TTKDP.js`）

DP 引擎，纯函数，无状态。

| 导出 | 说明 |
|---|---|
| `computeTTKWithDP(options)` | 主入口，返回 `{ ttk, shots, hits, debug }` |

**`computeTTKWithDP` 参数**：
```js
{
  weapon,        // 应用附件后的武器（含 _current）
  bulletData,    // 子弹数据（含 partMult / armorData）
  defender: { armorLevel, armorValue, helmetLevel, helmetValue },
  scenario: { hitRate, hitProb, triggerDelayEnable, healthValue },
  distance,
}
```

**内部辅助函数**（不导出）：
- `stateKey(state)` — 状态键
- `getShotIntervalMs({ shotIndex, isBurstMode, burstInternalROF, rof, rofStages })` — 间隔计算
- `calcDamage({ hitPart, pureDamage, pen, armorValue, cumulativeArmorDamage, armorDamage })` — 伤害计算
- `applyBurstBias(lastPart, biasStrength=0.7)` — 连发偏置
- `calcDecay(distance, ranges, decays)` — 距离衰减

**常量**：
- `PART_HEAD = 0` / `PART_CHEST = 1` / `PART_STOMACH = 2` / `PART_LIMBS = 3`
- `MAX_STATES = 3_000_000`

### 6.4 `TTKMatrix`（`src/core/TTKMatrix.js`）

矩阵预计算 + IndexedDB 持久化。

| 方法 | 说明 |
|---|---|
| `buildAllMatrix({ attacks, defenses, enemies, scenario, dataManager, onProgress, signal })` | 构建完整矩阵（攻击侧 + 防御侧），返回统计信息 |
| `buildAttackMatrix({ attacks, enemies, scenario, scenarioHash, dataManager, onProgress, signal })` | 只构建攻击侧 |
| `buildDefenseMatrix({ defenses, enemies, scenario, scenarioHash, dataManager, onProgress, signal })` | 只构建防御侧 |
| `getAttackTTK({ weaponId, configId, bulletId, enemy, scenarioHash })` | 查攻击侧 TTK |
| `getDefenseTTK({ enemyWeaponId, enemyConfigId, enemyBulletId, ourArmorLevel, ourArmorValue, ourHelmetLevel, ourHelmetValue, scenarioHash })` | 查防御侧 TTK |
| `getMatrixStats()` | 转发到 IndexedDB 统计 |
| `clearMatrixCache()` | 转发到 IndexedDB 清空 |

**常量**：
- `MATRIX_VERSION = 1`
- `BATCH_SIZE = 200`

**内部函数**（不导出）：
- `makeAttackId({ weaponId, configId, bulletId, enemy, scenarioHash })`
- `makeDefenseId({ ... })`
- `makeScenarioHash(scenario)`
- `simpleHash(str)`

### 6.5 `TTKIndexedDB`（`src/core/TTKIndexedDB.js`）

IndexedDB 封装。

| 方法 | 说明 |
|---|---|
| `getMatrixEntry(id)` | 读单条 |
| `setMatrixEntry(id, data)` | 写单条 |
| `setMatrixEntries(entries)` | 批量写（事务内） |
| `deleteMatrixEntry(id)` | 删单条 |
| `clearMatrix()` | 清空全部 |
| `getAllMatrixIds()` | 全部 ID |
| `getAllMatrixEntries()` | 全部记录（慎用） |
| `getMatrixCount()` | 记录数 |
| `getMatrixStats()` | `{ count, sizeKB, sizeMB }` |
| `requestPersistentStorage()` | 请求持久化权限 |
| `closeDB()` | 关闭连接 |

**常量**：
- `DB_NAME = 'df-ttk'`
- `DB_VERSION = 1`
- `STORE_NAME = 'ttk-matrix'`

### 6.6 `SimulationEngine`（`src/core/SimulationEngine.js`）

蒙特卡洛引擎。**只用于精算 + 弹窗**，主流程不走它。

| 方法 | 说明 |
|---|---|
| `setDataManager(dm)` / `getDataManager()` | 注入/获取 DataManager |
| `simulateOneTTK(weapon, params, strategy, bulletData, verbose=false)` | 单次模拟（返回 `{ time, shots, hits, burstIntervalTime }`） |
| `simulateOneTTKWithDetail(weapon, params, strategy, bulletData)` | 记录模式（返回 `{ steps, totalTime, ... }`） |
| `calculateAvgStats(weapon, params, times, strategy, bulletData)` | 多次模拟求平均 |
| `calculateSinglePoint(weapon, params, times, strategy, bulletData)` | 单距离点统计 |
| `calculateWeaponsTTK(weapons, attachments, params, dm)` | 批量计算 |
| `getRealBulletKey(selectedBulletType, weapon, params, dm)` | 解析实际子弹 ID |
| `_getIntervalAfterShot(weapon, shot, isBurstMode)` | 内部：某发之后的间隔 |
| `_calculateShootingIntervalTotal(...)` | 内部：总射击间隔 |
| `_updateBurstInterval(...)` | 内部：更新连发统计 |

**导出**：`export const getDecay = DistanceDecayCalculator.calculate`。

### 6.7 `CombatCore`（`src/core/CombatCore.js`）

**常量**：

| 导出 | 说明 |
|---|---|
| `HIT_KEYS` | `['head', 'chest', 'stomach', 'limbs']` |
| `HIT_PROB_TOLERANCE` | `1e-6` |
| `CHART_CONFIG` | `{ MAX_DISTANCE: 100, CUTOFF_DISTANCE: 35, TOP_WEAPONS_COUNT: 10, PADDING_TOP: 40 }` |
| `SIMULATION_CONFIG` | `{ DEFAULT_SIM_COUNT: 20000, DISTANCE_SIM_COUNT: 20000 }` |
| `MUZZLE_PRECISION_BONUS` | `1.09` |
| `TIME_UNITS` | `{ SECONDS_TO_MS: 1000, MINUTES_TO_SECONDS: 60 }` |
| `CHART_COLORS` | 5 段颜色 |
| `RANK_COLORS` | 排名变化颜色 |

**RNG**：

| 导出 | 说明 |
|---|---|
| `setSeed(seed)` | 设置种子 |
| `resetSeed()` | 重置为 12345 |
| `seededRandom()` | LCG 随机数 |

**计算器**：

| 导出 | 说明 |
|---|---|
| `DistanceDecayCalculator.calculate(distance, weapon)` | 距离衰减 |
| `BaseDamageCalculator.calculate(weapon, bulletData, hitPart, decay)` | 基础肉伤 |
| `ArmorDamageCalculator.calculate(pureDamage, penDamage, armorDamage, armorValue, debug=false)` | 护甲减伤 |
| `HitPartSelector.select(hitProb)` | 随机选部位 |
| `HitPartSelector.selectWithBias(referencePart, hitProb, biasStrength=0.7)` | 连发偏置选部位 |

**策略**：

| 导出 | 说明 |
|---|---|
| `RIPBulletStrategy.calculateHitDamage(...)` / `calculateHitDamageWithPart(...)` | RIP 策略（固定四肢） |
| `StandardBulletStrategy.calculateHitDamage(...)` / `calculateHitDamageWithPart(...)` | 标准策略 |
| `BulletStrategyFactory.getStrategy(bulletType, bulletData=null)` | 工厂（`RIP\|CT` → RIP，其他 → Standard） |

### 6.8 `RecEngine`（`src/core/RecEngine.js`）

单例：`getRecEngine(dataManager)`。

| 方法 | 说明 |
|---|---|
| `recommend(input, options)` | 执行推荐，返回 `{ recommendations, log }` |
| `exportResult(result, input, options)` | 导出推荐结果 JSON |
| `printResult(result)` | 控制台打印结果 |

`recommend` 的 `input`：

```js
{
  budget,       // 采购成本上限（万）
  enemies,      // 1~3 个假想敌
  params,       // 全局参数
  kdRatio,      // KD（默认 1.0）
  extraCost     // 其他消耗发数（默认 30）
}
```

`options`：

```js
{
  recordLog,    // 是否记录日志（默认 true）
  onProgress,   // (current, total, phase) => void
  signal        // { cancelled: boolean }
}
```

**关键点**：
- `_buildRecommendationsFromMatrix` 从 IndexedDB 读回 TTK，**不再用 `computeKeyPoints`**（已删除）
- `_makeScenarioHash` 必须与 `TTKMatrix.makeScenarioHash` 保持一致
- 预算口径：`总成本 = 枪价 + 甲价 + 头价 + 子弹单价 × 携带数量`，其中 `携带数量 = (KD × 5 × avgShots + extraCost) × 2`
- 评分：`比值_i = 生存TTK_i / 进攻TTK_i`，`综合比值 = min(所有敌人的比值_i)`

### 6.9 `stores`（`src/stores/stores.js`）

三个 store 合并导出：

| 导出 | state 可写性 | 说明 |
|---|---|---|
| `dataStore` | `reactive`（**可写**） | 武器/子弹/价格/护甲 + 修改追踪 |
| `paramsStore` | `readonly` | 战斗参数 |
| `appStore` | `readonly` | UI 状态 |

**`dataStore` 关键方法**：

| 方法 | 说明 |
|---|---|
| `loadData()` | 加载数据 |
| `refreshWeapons()` / `refreshBullets()` / `refreshPrices()` / `refreshArmors()` | 刷新（新数组引用触发响应式） |
| `getPriceRows()` / `getPriceRowsForWeapon(weaponId)` | 获取配置 |
| `getWeaponById(id)` / `getBulletById(id)` / `getArmorById(id)` | 查询 |
| `getDataManager()` | 获取 DataManager 单例 |
| `markWeaponModified(weaponId)` / `clearWeaponModified(weaponId)` / `isWeaponModified(weaponId)` | 修改追踪（带 `modifiedVersion`） |
| `exportData(includeCache=true)` / `importData(jsonStr)` / `resetData()` | 数据管理 |

**`paramsStore`**：

| 成员 | 说明 |
|---|---|
| `state` | readonly state |
| `hitRate` | getter，从 `hitRateMap` + `distance` 插值 |
| `update(key, value)` | 更新单个 |
| `updateAll(newParams)` | 批量更新 |
| `updateHitRateMap(raw)` | 解析命中率字符串 |
| `reset()` | 重置为默认 |

**`paramsStore` 默认参数**：

```js
{
  bulletLevel: 4,
  armorLevel: 4,
  armorValue: 110,
  helmetLevel: 4,
  helmetValue: 48,
  healthValue: 100,
  distance: 30,
  hitRateMap: [
    { distance: 30, rate: 1.0 },
    { distance: 50, rate: 0.9 },
    { distance: 100, rate: 0.6 }
  ],
  hitProb: { head: 0.1, chest: 0.3, stomach: 0.3, limbs: 0.3 },
  triggerDelayEnable: true,
  kdRatio: 1.0,
  extractRate: 0.5,
  extraCost: 30,
  aimWeight: 0.4
}
```

**`appStore` 关键方法**：

| 方法 | 说明 |
|---|---|
| `switchTab(tab)` / `switchSubTab(sub)` | Tab 切换 |
| `setTtkResults(results)` / `setHavocCosts(costs)` / `setScores(scores)` | 设置结果 |
| `setGlobalCalculating(bool)` | 全局计算中 |
| `addUpdatingWeapon(id)` / `removeUpdatingWeapon(id)` / `isUpdatingWeapon(id)` | 单枪更新状态 |
| `openBarrelEditor(weaponId)` / `closeBarrelEditor()` | 枪管编辑器 |
| `openBaseEditor(weaponId)` / `closeBaseEditor()` | 基础编辑器 |
| `showCalcProgress(title, total)` / `updateCalcProgress(current)` / `hideCalcProgress()` | 进度管理 |

**`appStore` state 关键字段**：

```js
{
  currentTab: 'weapon',        // 'weapon' | 'items' | 'rec'
  currentSubTab: 'bullet',     // 'bullet' | 'armor' | 'helmet'
  ttkResults: [],
  havocCosts: {},
  scores: {},                  // { "weaponId_configId": { ttk, aim } }
  isLoading: false,
  isGlobalCalculating: false,
  updatingWeaponIds: [],
  showBarrelEditor: false,
  editingWeaponId: null,
  showBaseEditor: false,
  editingBaseWeaponId: null,
  showAllWeapons: true,
  highlightWeapon: null,
  calcProgress: { visible, percent, current, total, title }
}
```

### 6.10 `weaponCalc`（`src/utils/weaponCalc.js`）

| 导出 | 说明 |
|---|---|
| `calculateCurrentValues(weapon, barrel, muzzleId, precision)` | 计算应用附件后的当前属性 |

返回：

```js
{
  rof,               // 当前射速
  velocity,          // 当前初速
  ranges,            // 当前射程数组
  decays,            // 当前衰减数组
  flesh,             // 当前肉伤
  armor,             // 当前甲伤
  mult,              // 当前部位倍率对象（2 位小数）
  fireMode,          // 'auto' | 'burst' | null
  burstCount,        // 连发数
  burstInternalROF,  // 连发内射速
  burstInterval,     // 连发间隔（秒）
  rofStages          // 分段射速：[{ untilShot, rofAdd }, ...] 或 null
}
```

---

## 7. 组件 API 速查

### 7.1 主流程

```
App.vue
  └── AppLayout（Header + slot + Footer）
        ├── ParamsPanel
        ├── TTKChart
        ├── DistanceChart
        └── 表格区（Tab）
              ├── WeaponTable
              ├── ItemsPanel
              │     ├── BulletTable
              │     └── ArmorTable（armor / helmet）
              └── RecPanel
                    └── （内联的 Top3 卡片 + 第 4~10 名表格）

弹窗（在 AppLayout 外）：
  ├── BarrelEditor
  ├── WeaponBaseEditor
  ├── DamageDetailModal
  └── ConfirmDialog
```

### 7.2 `App.vue` 核心方法

| 方法 | 说明 |
|---|---|
| `handleCalculate()` | 批量计算 TTK |
| `handleDistanceChart()` | 生成折线图数据 |
| `buildArmedWeapons(configs)` | 构建"武装后"武器 |
| `buildDistanceStats(armed, attachments)` | 折线图统计 |
| `computeSingleTTK(weapon, attachment, params, dm)` | **单点 TTK 计算**（走 `FastTTK.computeTTK({ mode: 'fast' })`） |
| `updateSingleWeaponTTK(weaponId, onProgress)` | 单枪更新（全配置 + 101 距离点） |
| `onUpdateWeaponTTK({ weaponId })` | 单枪更新事件处理 |
| `computeHavocCosts(enabledConfigs, dm, params)` | 哈弗币消耗计算 |
| `exportData` / `importData` / `resetData` | 数据管理（`resetData` 会调 `clearMatrix()`） |
| `onAddWeapon` / `onDeleteWeapon` | 武器增删 |
| `openBarrelEditor` / `onBarrelSaved` | 枪管编辑 |
| `onBaseVisibleChange` / `onBaseSaved` | 基础属性编辑 |

**provide**：`showConfirm(options)` / `showAlert(message, title)`（Promise 封装，基于 `ConfirmDialog`）。

### 7.3 `ParamsPanel.vue`

**emits**：`calculate` / `distance-chart` / `export-data` / `import-data` / `reset-data`。

**依赖 store**：`paramsStore` / `appStore`。

**布局**：

- 第一行：子弹等级 / 护甲等级 / 护甲值 / 头盔等级 / 头盔值 / 生命值 / KD / 撤离率 / 其他消耗 / 开镜权重
- 第二行：距离 / 全局命中率 / 扳机延迟开关 / 命中概率（头胸腹肢）
- 第三行：计算 TTK / 生成折线图 / 导出数据 / 导入数据 / 重置数据

**互斥禁用**：全局计算中 / 单枪更新中 → 按钮禁用。

### 7.4 `WeaponTable.vue`

**props**：`data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`。

**emits**：`update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk`。

**依赖 store**：`dataStore` / `appStore` / `paramsStore`。

**工具栏**：新增枪械 / 全部展开 / 全部收起 / 全部启用 / 全部禁用。

**武器头**：折叠 + 名称 + 类型 + 口径 + 枪管 + 枪口 + 精校 + 射速 + 初速 + 肉伤 + 甲伤 + 射程 + 衰减 + 倍率 + 伤害。

**秒伤行**：分段显示各距离段的 DPS（头/胸/腹/肢/甲）。

**配置列表**：每行一个配置（勾选 / ID / 改枪码 / 枪管 / 枪口 / 命中率 / 开镜 / 价格 / 子弹 / 哈弗币 / 评分 / 操作）。

**操作按钮**：更新 TTK（脏标记）/ 新增配置 / 编辑属性 / 编辑枪管 / 删除。

### 7.5 `TTKChart.vue`

**props**：`results` / `params` / `displayCount`。

5 个系列：`noMissFireDelay` / `burstInterval` / `emptyDelay` / `flight` / `triggerDelay`。

图例可点击切换显示，按"可见总 TTK"排序，移动端自动旋转 X 轴标签。

### 7.6 `DistanceChart.vue`

**props**：`stats` / `distances` / `highlightWeapon` / `displayCount` / `segment`。

**`segment`**：`{ start, end }`（默认 `{ start: 0, end: 100 }`）。

高亮武器加粗红线，Top 15% / Top 40% 视觉区分，智能排序（加权平均）。

### 7.7 `DamageDetailModal.vue`

**props**：`visible` / `weaponId` / `configId` / `distance`。

**emits**：`update:visible`。

**依赖**：`dataStore` / `paramsStore` / `SimulationEngine` / `BulletStrategyFactory` / `setSeed` / `calculateCurrentValues`。

> ⚠️ 此组件**不走 `FastTTK`**，直接调 `SimulationEngine.simulateOneTTKWithDetail`，因为需要逐发明细。

**顶部**：摘要 + 「🎲 再来一次」+ TTK 分解。

**桌面**：9 列明细表（发数 / 间隔 / 命中 / 部位 / 最终伤害 / 剩余血量 / 护甲 / 头盔 / 详情）。

**移动端**：每发一个紧凑块（两行制）。

**展开详情**：逐发计算过程。

### 7.8 `BarrelEditor.vue`

**props**：`visible` / `weaponId`。

**emits**：`update:visible` / `saved`。

**依赖**：`dataStore`。

表格编辑枪管所有属性：名称 / 射程倍率 / 射程增量 / 初速增量 / 射速倍率 / 肉伤加成 / 甲伤加成 / 扳机延迟Δ / 自定义射程 / 自定义衰减 / 部位倍率加成 / 分段射速 / 开火模式 / 连发数 / 内部射速 / 连发间隔。

### 7.9 `WeaponBaseEditor.vue`

**props**：`visible` / `weaponId` / `caliberOptions`。

**emits**：`update:visible` / `saved`。

**依赖**：`dataStore`。

5 行 Grid：名称/类型/口径/扳机 → 射速/初速/肉伤/甲伤 → 射程/衰减 → 头/胸/腹/肢 → 模式/连发数/内部射速/连发间隔。

### 7.10 `BulletTable.vue`

**props**：`data` / `caliberOptions` / `levelOptions`。

**emits**：`update` / `add-bullet` / `delete-bullet`。

**依赖**：`dataStore`。

列：启用 / 默认 / 名称 / 口径 / 等级 / 部位肉伤 / 护甲衰减 / 穿透 / 价格 / 操作。

**单输入框逗号分隔**：`1,1,1,1` / `1,1,1,1,1,0.6` / `1,1,0.75,0.5,0,0`。穿透值 0~1 校验。

### 7.11 `ArmorTable.vue`

**props**：`data` / `type`（`'armor'` / `'helmet'`）。

**emits**：`update`。

**依赖**：`dataStore`。

列：启用 / 名称 / 等级 / 防护部位（仅护甲）/ 护甲值 / 价格（W 单位）/ 操作。

### 7.12 `RecPanel.vue`

**依赖**：`dataStore` / `paramsStore`。

**假想敌配置**：1~3 个敌人，每个有武器 / 配置 / 子弹 / 护甲 / 头盔 / 距离。

**预算**：`budget`（W 哈弗币）。

**推荐按钮**：`🔍 开始推荐` → 进度遮罩 → 显示 Top 3 卡片 + 第 4~10 名表格。

**推荐引擎**：`window.__recEngine`。

### 7.13 `ItemsPanel.vue`

**props**：`caliberOptions`。

**emits**：`update`。

**依赖**：`dataStore` / `appStore`。

子 Tab：子弹 / 护甲 / 头盔。

### 7.14 `ConfirmDialog.vue`

**props**：`visible` / `title` / `message` / `confirmText` / `cancelText` / `confirmType`（`'primary'` / `'danger'` / `'warning'`）/ `checkboxLabel` / `checkboxDefault`。

**emits**：`update:visible` / `confirm` / `cancel`。

### 7.15 `AppLayout.vue`

**props**：无。

**slot**：默认 slot 承载中间内容。

**结构**：`<header>` + `<slot />` + `<footer>`。

---

## 8. 常见任务（AI 改代码时先看这里）

### 8.1 加一个新武器

1. 在 `public/data.json` 的 `weapons` 数组加一条（参考 `5.2 武器对象`）
2. 在 `prices` 数组加对应配置（参考 `5.4 价格配置`）
3. 重新 `npm run dev`，`DataManager.normalizeData` 会自动规范化
4. 不用改任何代码

### 8.2 加一个新子弹

1. 在 `public/data.json` 的 `bullets` 数组加一条（参考 `5.3 子弹对象`）
2. `id` 格式：`${caliber}#${序号}`，序号在口径内递增
3. `isDefault` 同 caliber+level 唯一
4. 不用改任何代码

### 8.3 加一个新配件字段

1. 在 `public/data.json` 的 `weapons[].barrels[]` 或 `weapons[]` 加字段
2. 在 `utils/weaponCalc.js` 的 `calculateCurrentValues` 里处理合并规则（枪管 > 武器）
3. 在 `SimulationEngine.js` 里使用该字段（如果影响模拟）
4. 在 `TTKDP.js` 里使用该字段（如果影响 DP）
5. **如果影响 TTK**：递增 `TTKMatrix.js` 的 `MATRIX_VERSION`（让推荐侧旧缓存失效）

### 8.4 改伤害公式

**必须同时改两处**：

1. `CombatCore.js` 的 `BaseDamageCalculator.calculate` 或 `ArmorDamageCalculator.calculate`（蒙特卡洛 + 弹窗用）
2. `TTKDP.js` 的 `calcDamage`（DP 用）

然后：
3. **递增 `TTKMatrix.js` 的 `MATRIX_VERSION`**（让推荐侧旧缓存失效）

### 8.5 改连发偏置

**必须同时改两处**：

1. `CombatCore.js` 的 `HitPartSelector.selectWithBias`（蒙特卡洛 + 弹窗用）
2. `TTKDP.js` 的 `applyBurstBias`（DP 用）

然后递增 `MATRIX_VERSION`。

### 8.6 改分段射速语义

**必须同时改两处**：

1. `SimulationEngine.js` 的 `_getIntervalAfterShot`
2. `TTKDP.js` 的 `getShotIntervalMs`

然后递增 `MATRIX_VERSION`。

### 8.7 改缓存 key

1. 改 `TTKMatrix.js` 的 `makeAttackId` / `makeDefenseId` / `makeScenarioHash`
2. **同时改 `RecEngine.js` 的 `_makeScenarioHash`**（两份实现必须一致）
3. **递增 `MATRIX_VERSION`**

### 8.8 加一个新图表

1. 新建组件 `src/components/XxxChart.vue`
2. 在 `App.vue` 里 import 并挂载
3. 如果涉及新的数据流，加对应的 `buildXxxData` 方法

### 8.9 加一个新 Tab

1. 在 `appStore` 的 `switchTab` 白名单里加新 tab
2. 在 `App.vue` 的 `.table-tabs` 里加按钮
3. 在 `App.vue` 的 `.tab-content` 里加 `v-show` 面板
4. 新建对应组件

### 8.10 改推荐算法

1. 改 `RecEngine.js` 的 `_buildRecommendationsFromMatrix`
2. 如果改成本口径，改 `_buildAttackSide`
3. 如果改评分，改 `_buildRecommendationsFromMatrix` 里的 `minRatio` 逻辑

### 8.11 加一个新护甲/头盔

1. 在 `public/data.json` 的 `armors` 数组加一条
2. `type` 为 `'armor'` 或 `'helmet'`
3. 不用改任何代码

### 8.12 调试

- **DP 调试**：控制台设置 `window.__DEBUG_DP = true`（可选 `window.__DEBUG_DP_TARGET = '武器名'`、`window.__DEBUG_DP_ONCE = true`）
- **矩阵缓存**：控制台 `await window.__dataManager.getStats()` / 或直接调 `TTKIndexedDB` 的 `getMatrixStats()`
- **清空矩阵**：控制台 `const { clearMatrix } = await import('/src/core/FastTTK.js'); await clearMatrix()`
- **DataManager**：`window.__dataManager`
- **RecEngine**：`window.__recEngine`
- **最近一次推荐结果**：`window.__lastRecResult`

---

## 9. 已知限制 / 待办

### 9.1 已知限制

- **单线程**：DP 单点虽快，但 `handleCalculate` / `handleDistanceChart` / `computeHavocCosts` / `updateSingleWeaponTTK` 各有 101 次循环 + 每次 `await setTimeout(0)` 让出主线程，配置多时仍会卡 UI
  - 缓解：进度遮罩 + `await new Promise(resolve => setTimeout(resolve, 0))` 让出主线程
  - 未来：可改 Web Worker
- **IndexedDB 累积**：推荐侧矩阵缓存跨会话累积，长时间不清理会变大
  - 缓解：`resetData()` 会调 `clearMatrix()`
  - 未来：可加 LRU 淘汰
- **两套偏置/间隔实现**：`CombatCore.HitPartSelector.selectWithBias` 与 `TTKDP.applyBurstBias`；`SimulationEngine._getIntervalAfterShot` 与 `TTKDP.getShotIntervalMs` —— 改动时需同步两处
- **两份 scenarioHash 实现**：`RecEngine._makeScenarioHash` 与 `TTKMatrix.makeScenarioHash` —— 必须保持一致
- **`App.vue` 逻辑重复**：`computeHavocCosts` / `updateSingleWeaponTTK` / `buildDistanceStats` 里各有一份 101 距离点循环 + TTK 分解 + 哈弗币公式的副本
- **`assets/libs/` 里的 Chart.js**：疑似死资源（项目用 ECharts），未确认

### 9.2 待办

- [ ] 加单元测试（当前无测试）
- [ ] 抽公共函数：把 `App.vue` 里重复的 TTK 分解 / 哈弗币公式 / 加权平均抽到 `utils/`
- [ ] 统一 `TTKDP` 与 `CombatCore` 的偏置/间隔语义（消除两套实现）
- [ ] 统一 `RecEngine._makeScenarioHash` 与 `TTKMatrix.makeScenarioHash`
- [ ] 确认 `assets/libs/` 的两个 Chart.js 文件是否可删
- [ ] 清理 `data.json` 的 `meta.note` 里重复的"bullets 已按截图更新"文案

---

## 10. 版本历史

### v1.1.0（计算架构迁移）

**架构迁移**：
- 删除 `TtkCacheManager.js` / `KeyPointsComputer.js` / 顶层 `ttkCache`
- 新增 `FastTTK.js`（统一计算入口，按 `mode` 分发）
- 新增 `TTKDP.js`（DP 引擎，替代插值关键点方案）
- 新增 `TTKMatrix.js`（矩阵预计算 + 增量）
- 新增 `TTKIndexedDB.js`（IndexedDB 持久化，替代 `ttkCache`）
- `RecEngine` 改为走 `computeTTKMatrix`
- 折线图/单枪更新改为逐点 DP（不再插值关键点）

**文件数变化**：32 → 34

**无 UI 功能变化**。

### v1.0.0（合并重构后）

**文件合并**：
- `AppHeader.vue` + `AppFooter.vue` → `AppLayout.vue`
- `CombatUtils.js` + `BulletStrategy.js` + `config.js` + `utils/rng.js` → `CombatCore.js`
- `dataStore.js` + `paramsStore.js` + `appStore.js` → `stores.js`
- `RecCard.vue` + `RecTable.vue` → 内联到 `RecPanel.vue`
- `utils/performance.js` → 内联到 `DataManager.js`

**删除死代码**：
- `EditableCell.vue`（无引用）
- `utils/formatters.js`（无引用）
- `utils/validators.js`（无引用）

**文件数变化**：46 → 32（配额内）

**无功能变化**。

### v0.x（重构前）

- 文件数 46
- 含 `ConfigCacheManager.js`（已被 `TtkCacheManager.js` 取代，后又整体删除）

---

## 11. 附录

### 11.1 文件数预算

| 目录 | v0.x | v1.0.0 | v1.1.0 |
|---|---|---|---|
| `src/components/` | 17 | 13 | 13 |
| `src/core/` | 8 | 6 | 8 |
| `src/stores/` | 3 | 1 | 1 |
| `src/utils/` | 5 | 1 | 1 |
| `src/styles/` | 1 | 1 | 1 |
| `src/` 根 | 2 | 2 | 2 |
| `public/` | 1 | 1 | 1 |
| 根目录 | 7 | 7 | 7 |
| **合计** | **44** | **32** | **34** |

> 注：v0.x 的 44 是去掉 `EditableCell.vue` / `add_enabled_field.py` / `migrate-bullet-v2.js` 后的数字。

### 11.2 合并/迁移历史（供后续会话参考）

| 阶段 | 操作 | 结果 |
|---|---|---|
| 1 | 删除 14 个旧文件，新建 3 个空文件 | 目录结构调整 |
| 2 | 填充 `stores.js` | 三 store 合并 |
| 3 | 填充 `CombatCore.js` | 四文件合并 |
| 4 | 填充 `AppLayout.vue` | Header/Footer 合并 |
| 5 | 改 `App.vue` | import + 模板结构调整 |
| 6 | 改 `SimulationEngine.js` | import 改 |
| 7 | 改 `KeyPointsComputer.js` | import 改 |
| 8 | 改 `DataManager.js` | 内联 perf |
| 9-15 | 改 `ParamsPanel.vue` / `WeaponTable.vue` / `ItemsPanel.vue` / `BulletTable.vue` / `ArmorTable.vue` / `BarrelEditor.vue` / `WeaponBaseEditor.vue` / `DamageDetailModal.vue` | import 改 |
| 16 | 改 `RecPanel.vue` | import 改 + 内联 `RecCard` / `RecTable` |
| 17 | **v1.1.0**：删除 `TtkCacheManager` / `KeyPointsComputer`，新增 `FastTTK` / `TTKDP` / `TTKMatrix` / `TTKIndexedDB`，`RecEngine` 改走矩阵 | 计算架构迁移 |

### 11.3 调试脚本

| 脚本 | 说明 |
|---|---|
| `tree.py` | 生成目录树 |
| `collect_files.py` | 收集文件内容（用于 AI 上下文） |
| `verify_merge.py` | 检查旧 import 残留 |
| `migrate_structure.py` | 目录结构调整（已执行，可留作参考） |

### 11.4 授权

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

### 11.5 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准

---

**文档版本**：1.1.0
**最后更新**：2026-09-17
**对应代码版本**：计算架构迁移后（配额内 34 个文件）
```