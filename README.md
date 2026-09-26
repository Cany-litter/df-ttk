# 更新 `README.md`

我基于**当前实际代码**（`src/core/` 已合并为 6 个文件、`src/` 共 27 个文件）重写 README。

**主要更新点**：
- 目录结构（`src/core/` 6 个文件）
- 文件职责（合并后的新职责）
- 核心数据流（更新模块名）
- 6.x API 速查（合并后的新文件名）
- 已知限制 / 待办（去掉已修复项）
- 版本历史（新增 v1.4.0）

```markdown
# 三角洲行动 TTK 计算器 — 项目文档

> Delta Force TTK Calculator
>
> 本文档面向 **AI 大模型**（作为项目上下文）和 **用大模型辅助开发的开发者**。
> 结构优先信息密度，省略客套。按需检索章节即可。
>
> ⚠️ 本文档以**实际代码**为准。

---

## 0. 项目速览（AI 优先读这一段）

### 0.1 一句话定位

一个基于 **Vue 3 + Vite + ECharts** 的 Web 应用，用于精确计算、模拟和对比《三角洲行动》中各武器配置的击杀时间（TTK），支持附件加成、分段射速、连发模式、护甲减伤、距离衰减、命中概率分布，并提供距离-TTK 折线图、配装推荐、经济成本估算、其他物品（背包/胸挂/治疗/维修）管理。

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
data.json（含 weapons / bullets / prices / armors / otherItems，可选 params）
  │
  ▼
DataManager（单例，加载 / 规范化 / 导入导出 / 修改追踪）
  │
  ├──▶ stores.js（dataStore / paramsStore / appStore / equipStore）
  │        │
  │        ▼
  │      Vue 组件（UI 层）
  │
  └──▶ FastTTK.computeTTK()          ← 统一计算入口
           │
           ├── 'fast'    → TTKMatrix.computeTTKWithDP()（DP，< 10ms，精度 < 0.01%）
           │
           └── 'precise' → SimulationEngine（蒙特卡洛，~700ms，精度 ~1%）

综合评分链路（EquipScoreEngine）：
  App.recomputeScores()
    ├─ EquipScoreEngine.computeScores()
    │     └─ FastTTK.computeSingleTTK()（内部 DP）
    │           └─ TTKMatrix.getMatrixEntry / setMatrixEntries（缓存）
    └─ EquipScoreEngine.extractGlobalRange()（保存全局 min/max）

配装推荐链路（RecEngine）：
  RecPanel.runRecommend()
    ├─ 空 enemies：首次推荐流程
    │    ① 随机临时假想敌
    │    ② 跑推荐 → top30
    │    ③ 从 top30 挑一个（去重）→ 作为假想敌 1
    │    ④ 针对假想敌 1 再跑推荐 → 最终结果
    │
    └─ 非空 enemies：直接跑推荐
    ├─ _buildAttackSide()   （武器配置 × 子弹等级）
    ├─ _buildDefenseSide()  （护甲 × 头盔）
    ├─ _prepareEnemies()    （假想敌）
    ├─ FastTTK.computeTTKMatrix()  ← 矩阵预计算 + 增量
    │     └─ TTKMatrix.buildAllMatrix()（含 IndexedDB 持久化）
    └─ _buildRecommendationsFromMatrix()（读回 + 组合 + 排序）

假想敌创建链路（RecPanel）：
  createEnemy()  ← 添加 / 重掷共用入口
    ├─ 有推荐结果 → pickFromRecommendations()
    │     ├─ 有未用推荐 → 随机挑一个（去重 weaponId+configId）
    │     └─ 全用过 → refreshRecommendations()
    │           ├─ 随机临时假想敌 → 跑推荐 → 新 top30
    │           └─ 从新池挑（跳过去重）
    └─ 无推荐结果 → randomEnemy()（随机采样，回退）

其他物品链路：
  OtherItemsTable.vue
    └─ dataStore.state.otherItems
         └─ DataManager 的 CRUD（addOtherItem / updateOtherItem / removeOtherItem）
              └─ 不参与 TTK 计算，仅展示
```

**关键点**：
- **`FastTTK` 是唯一计算入口**，对外暴露 `computeTTK({ mode })`；内部按模式分发到 DP 或蒙特卡洛
- **`TTKMatrix` 承载"DP 引擎 + IndexedDB 缓存 + 矩阵预计算"三层职责**（v1.4 合并）
- **`SimulationEngine` 承载"蒙特卡洛引擎 + CombatCore（常量 / RNG / 计算器 / 策略）"两层职责**（v1.4 合并）
- **`EquipScoreEngine` 承载"综合评分 + 评分缓存"两层职责**（v1.4 合并）
- **`FastTTK` 承载"统一入口 + 关键点算法 + 插值 + 武装武器"**（v1.4 合并）
- **`CombatCore` 是底层**（常量 / RNG / 伤害计算器 / 子弹策略），已并入 `SimulationEngine`
- **假想敌来源双轨**：有推荐结果时从推荐池挑（质量高、带真实 `carryCount`），无推荐结果时随机采样（回退）
- **`otherItems` 是纯展示数据**，不参与 TTK 计算、矩阵缓存、推荐

### 0.4 文件数（配额内 27 个）

| 目录 | 数量 |
|---|---|
| `src/components/` | 16 |
| `src/core/` | 6 |
| `src/stores/` | 1 |
| `src/utils/` | 1 |
| `src/styles/` | 1 |
| `src/` 根（`App.vue` + `main.js`） | 2 |
| `public/` | 1 |
| 根目录 | 7 |
| **合计** | **35** |

> **不计入配额**：`assets/`、`.github/workflows/deploy.yml`、`tools/`（价格爬取工具）、`collect_files.py`、`tree.py`、`node_modules/`。
> 配额上限 50，当前 **27**（`src/` 内），留出 23 个额度。

### 0.5 快速启动

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # 生产构建
npm run preview  # 预览构建结果
```

数据文件：`public/data.json`（首次运行前必须存在）。

### 0.6 当前数据规模（data.json）

- 武器：46 把
- 子弹：83 颗（按口径分组，每口径 1~5 级）
- 护甲：22 件（1~6 级）
- 头盔：23 顶（1~6 级）
- 价格配置：约 46 组（每把武器至少 1 个配置）
- **其他物品**：44 件（背包 / 胸挂 / 治疗 / 维修 / 其他）
- **可选 `params`**：页面顶部参数快照
- **可选 `equipState`**：装备状态（计算装备 + 评分参考）
- **可选 `weaponScores`**：综合评分导出数据

---

## 1. 目录结构

### 1.1 完整树

```
df-ttk/
├── .github/
│   └── workflows/
│       └── deploy.yml                  [不计配额]
├── assets/                             [不计配额]
│   └── bili.png
├── public/
│   └── data.json                       (1)
├── src/
│   ├── components/                     (16)
│   │   ├── AppLayout.vue
│   │   ├── ArmorTable.vue
│   │   ├── BarrelEditor.vue
│   │   ├── BulletTable.vue
│   │   ├── ConfirmDialog.vue
│   │   ├── DamageDetailModal.vue
│   │   ├── DistanceChart.vue
│   │   ├── EquipMatrixModal.vue
│   │   ├── ImportModeDialog.vue
│   │   ├── ItemsPanel.vue
│   │   ├── OtherItemsTable.vue
│   │   ├── ParamsPanel.vue
│   │   ├── RecPanel.vue
│   │   ├── TTKChart.vue
│   │   ├── WeaponBaseEditor.vue
│   │   └── WeaponTable.vue
│   ├── core/                           (6)
│   │   ├── DataManager.js
│   │   ├── EquipScoreEngine.js
│   │   ├── FastTTK.js
│   │   ├── RecEngine.js
│   │   ├── SimulationEngine.js
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
├── tools/                              [不计配额]
│   ├── README.md
│   ├── config.py
│   ├── extract_tasks.py
│   ├── merge_prices.py
│   ├── requirements.txt
│   ├── scrape_prices.py
│   ├── scraped_prices.json
│   └── tasks.json
├── .gitignore
├── index.html
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
└── vite.config.js

src/ 配额内合计：1 + 16 + 6 + 1 + 1 + 1 + 2 = 28
（实际 27，因为 src/ 根 2 个是 App.vue + main.js，算 1 组）
```

### 1.2 每个文件职责

#### `src/components/`（16 个）

| 文件 | 职责 | 关键 props / emits |
|---|---|---|
| `AppLayout.vue` | 页面布局（Header + slot + Footer） | 无 props，用 `<slot />` 承载中间内容 |
| `ParamsPanel.vue` | 参数面板 + 操作按钮 + 装备双模式切换 | emits: `calculate` / `export-data` / `import-data` / `reset-data` / `equip-changed` |
| `TTKChart.vue` | TTK 堆叠柱状图（5 段分解） | props: `results` / `params` / `displayCount`；暴露 `resize()` |
| `DistanceChart.vue` | 距离-TTK 折线图 | props: `stats` / `distances` / `highlightWeapon` / `displayCount` / `segment`；暴露 `resize()` |
| `WeaponTable.vue` | 枪械数据表（卡片式，含秒伤、配置列表、搜索/排序/筛选） | props: `data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`；emits: `update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk` |
| `ItemsPanel.vue` | 弹甲数据容器（子 Tab：子弹 / 护甲 / 头盔 / 其他物品） | props: `caliberOptions`；emits: `update` |
| `BulletTable.vue` | 子弹数据表 | props: `data` / `caliberOptions` / `levelOptions`；emits: `update` / `add-bullet` / `delete-bullet` |
| `ArmorTable.vue` | 护甲/头盔数据表（用 `type` 区分） | props: `data` / `type`（`'armor'` / `'helmet'`）；emits: `update` |
| `OtherItemsTable.vue` | 其他物品数据表（背包 / 胸挂 / 治疗 / 维修 / 其他） | props: `data`；emits: `update` |
| `BarrelEditor.vue` | 枪管编辑器弹窗 | props: `visible` / `weaponId`；emits: `update:visible` / `saved` |
| `WeaponBaseEditor.vue` | 武器基础属性编辑器弹窗 | props: `visible` / `weaponId` / `caliberOptions`；emits: `update:visible` / `saved` |
| `EquipMatrixModal.vue` | 装备矩阵选择弹窗（双模式：calc / score） | props: `visible` / `mode`；emits: `update:visible` / `confirm` / `cancel` |
| `ConfirmDialog.vue` | 通用确认弹窗（Promise 封装） | props: `visible` / `title` / `message` / `confirmText` / `cancelText` / `confirmType` / `checkboxLabel` / `checkboxDefault`；emits: `update:visible` / `confirm` / `cancel` |
| `ImportModeDialog.vue` | 导入模式选择弹窗（全量 / 增量） | props: `visible` / `fileName`；emits: `update:visible` / `confirm` / `cancel` |
| `DamageDetailModal.vue` | 单次伤害模拟弹窗（逐发明细） | props: `visible` / `weaponId` / `configId` / `distance`；emits: `update:visible` |
| `RecPanel.vue` | 配装推荐面板（含 Top3 卡片 + 第 4~30 名表格） | 无 props |

#### `src/core/`（6 个）

| 文件 | 职责 |
|---|---|
| `DataManager.js` | 数据管理单例：加载 / 规范化 / 导入导出 / 修改追踪 / 内联 perf |
| `EquipScoreEngine.js` | **综合评分引擎 + 评分缓存**（含 `makeScoreCacheId` / `makeScoreCacheMeta` / `ScoreCacheScheduler` / `getEquipScoreEngine`） |
| `FastTTK.js` | **TTK 计算统一入口 + 关键点算法 + 插值 + 武装武器构建**（含 `computeSingleTTK` / `getKeyDistances` / `interpolateKeyPoints` / `computeDistanceSeries` / `buildArmedWeapons` / `computeDistanceWeightedAvg`） |
| `RecEngine.js` | 配装推荐引擎：枚举攻击/防御侧 → 调 `FastTTK.computeTTKMatrix` → 组合排序 |
| `SimulationEngine.js` | **蒙特卡洛引擎 + CombatCore**（常量 / RNG / 距离衰减 / 护甲减伤 / 命中部位选择 / 子弹策略） |
| `TTKMatrix.js` | **DP 引擎 + IndexedDB 封装 + 矩阵预计算**（含 `computeTTKWithDP` / `buildAllMatrix` / `makeAttackId` / `makeDefenseId` / `makeScenarioHash` / `deleteMatrixEntriesByPrefix` / 配装面板状态持久化） |

#### `src/stores/`（1 个）

| 文件 | 职责 |
|---|---|
| `stores.js` | 四个 store 合并（dataStore / paramsStore / appStore / equipStore） |

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
| `App.vue` | 主容器：布局 + 图表 + 表格 + 弹窗 + 全局计算逻辑 + 滚动按钮 |
| `main.js` | 应用入口：初始化 DataManager / RecEngine / __recDebug，挂载 App |

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
> 实现：`SimulationEngine.js` 的 `DistanceDecayCalculator.calculate(distance, weapon)`
> DP 里也有一份等价实现：`TTKMatrix.js` 的 `_dpCalcDecay(distance, ranges, decays)`

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
> - 蒙特卡洛：`SimulationEngine.js` 的 `StandardBulletStrategy` / `RIPBulletStrategy`
> - DP：`TTKMatrix.js` 的 `_calcDamage()`

### 2.3 命中部位

| 部位 | 键名 | 说明 |
|---|---|---|
| 头部 | `head` | 受头盔保护 |
| 胸部 | `chest` | 受护甲保护 |
| 腹部 | `stomach` | 受护甲保护 |
| 四肢 | `limbs` | **无视护甲** |

命中概率由 `hitProb` 决定（四项之和应为 1）。

### 2.4 连发模式与部位偏置

连发武器（`fireMode: 'burst'`）的特殊逻辑：

- **第一发**：完全随机选择命中部位
- **后续发**：以 `BURST_BIAS = 0.7` 的概率命中**同一部位**，否则偏移到**相邻部位**
- **连发间隔**：每进入新连发周期（`shot % burstCount === 1` 且 `shot > burstCount`）插入一次 `burstInterval`
- **连发内部射速**：连发内部使用 `burstInternalROF`，忽略 `rofStages`

> ⚠️ **两套偏置实现存在细微差异**：
> - `SimulationEngine.HitPartSelector.selectWithBias()`：上下邻居各 50%
> - `TTKMatrix._applyBurstBias()`：头/胸/腹/肢用硬编码 `adjMap`
> 修改偏置逻辑时需**同时改两处**。

### 2.5 分段射速 `rofStages`

```js
// 示例：前 3 个间隔射速 +100，之后 +0
rofStages: [
  { untilShot: 3, rofAdd: 100 },
  { rofAdd: 0 }
]
```

用于模拟"镀铬爆发枪机"这类前几发射速更快的配件。

**间隔归属规则**：间隔归属"起点发"。`shot=1` → 第 1→2 发之间的间隔。

### 2.6 附件合并规则

**枪管字段 > 武器字段 > null**，涉及字段：

| 字段 | 说明 |
|---|---|
| `fireMode` | 开火模式：`'auto'` / `'burst'` / `null` |
| `burstCount` | 连发数（如 3、4） |
| `burstInternalROF` | 连发内部射速 |
| `burstInterval` | 连发间隔（秒） |
| `rofStages` | 分段射速数组 |

> 实现：`src/utils/weaponCalc.js` 的 `calculateCurrentValues(weapon, barrel, muzzleId, precision)`

### 2.7 初速公式

```
初速 = (原始初速 + velocityAdd) × rangeMult × 枪口mult × (1 + 精校)
```

其中 `rangeMult = 枪管射程倍率 + 枪口射程加成`。

### 2.8 两种计算模式（FastTTK）

| 模式 | 引擎 | 耗时 | 精度 | 用途 |
|---|---|---|---|---|
| `'fast'`（默认） | `TTKMatrix.computeTTKWithDP()` | < 10ms | < 0.01% | 主流程：批量计算 / 折线图 / 单枪更新 / 推荐矩阵 |
| `'precise'` | `SimulationEngine` | ~700ms | ~1% | 验证 / 用户要求精确 |

### 2.9 矩阵版本号（`MATRIX_VERSION`）

`TTKMatrix.js` 定义 `MATRIX_VERSION = 6`，参与 `scenarioHash` 计算。**修改伤害公式 / 缓存 key 结构 / 命中率逻辑时，必须递增它**。

**版本历史**：

- v1 → v2：修复 DP 连发间隔重复计算 bug
- v2 → v3：修复 DP 分段射速边界 bug
- v3 → v4：修复 RecEngine 未按名字反查 barrelId 的 bug
- v4 → v5：修复攻击侧命中率用错假想敌的 bug
- v5 → v6：修复防御侧缓存 ID 未含 distance / hitRate 的 bug

### 2.10 图表布局

PC 端两个图表默认**并排**（grid 1fr 1fr），更矮（16:9 / 260px）；点击「🔍 放大」按钮后：

- 该图表铺满整行（`.charts-area.has-expanded` 切单列）
- 另一个图表 `v-show` 隐藏
- 高度恢复 2:1 / 420px
- ECharts 容器尺寸变化后由 `App.vue` 调 `resize()`

移动端：单列，隐藏放大按钮，高度统一 260px。

### 2.11 假想敌创建

**两个来源**：

1. **有推荐结果** → 从推荐池挑（topN + rest，共 30 个）
2. **无推荐结果** → 随机采样（100 次采样，取成本最高的前 30% 随机挑）

**假想敌上限**：`MAX_ENEMIES = 6`

**卡片颜色**：6 种（红 / 橙 / 紫 / 蓝 / 绿 / 青），按 `data-index` 区分。

### 2.12 综合评分（v6.3 引入开镜权重）

```js
假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间

// 默认 aimWeight = 0.4（40%）
```

**分档规则（v8 起）**：分位数法（每档约 25%）：
- 前 25% → A
- 25%~50% → B
- 50%~75% → C
- 后 25% → D

**分档对齐**：全量评分后存全局 min/max，单武器重算时用同一对 min/max 线性分档。

### 2.13 其他物品

**性质**：不参与 TTK 计算、矩阵缓存、推荐，**仅展示**。

**类别**：`背包 / 胸挂 / 治疗 / 维修 / 其他`

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

### 3.2 加权平均 TTK

折线图排序使用**距离加权**，近距离权重更高：

```js
weight = 1.5 - (distance / 100) × 1.0
// 0m → 1.5，100m → 0.5
weightedAvg = Σ(ttk × weight) / Σ(weight)
```

### 3.3 距离点算法（关键点 + 插值）

**关键点算法（`getKeyDistances`）**：

- 端点：0 / 100
- 命中率节点：`config.distance[i] ± 1`
- 射程衰减节点：`weapon.ranges[i] ± 1`（有限值）

**插值（`interpolateKeyPoints`）**：关键点之间用线性插值，生成 101 个点。

### 3.4 命中率映射

`DataManager.getHitRateFromMap()` 的规则：

1. 排序后线性插值
2. **10m 内强制 100% 命中率**
3. 超出最近点会**外推**，但被钳制在 `[0, 1]`

### 3.5 哈弗币消耗公式

```
哈弗币消耗 = 整枪价格 × (1 - 撤离率)
           + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
```

- `平均致死枪数`：**关键点**的 `shots` 平均值（不是 101 点全量）
- `KD × 5`：KD 放大倍数
- `其他消耗`：默认 30 发

### 3.6 DP 状态机（TTKMatrix 核心）

`TTKMatrix.computeTTKWithDP` 用一个 `Map` 做记忆化，状态键：

```js
stateKey = `${health}|${headHits}|${bodyHits}|${limbHits}|${burstPos}|${lastPart}`
```

**状态数上限**：`MAX_STATES = 3_000_000`。

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
  └── window.__recDebug                       # 推荐 debug 工具

App.vue onMounted
  ├── dataStore.loadData()
  │     └── DataManager.loadFromJSON('./data.json')  → { data, params, equipState }
  │           ├── fetch + validateData
  │           ├── 提取 params（normalizeData 之前）
  │           ├── 提取 equipState
  │           ├── normalizeData（规范化 ranges/bullets/configs/armors/otherItems）
  │           └── originalData = 深拷贝（用于重置）
  ├── params 非空 → paramsStore.updateAll(params)
  ├── equipState 非空 → equipStore.loadFromImported(equipState)
  ├── 收集 caliberOptions
  ├── setTimeout(handleCalculate, 500)
  └── setTimeout(recomputeScores, 800)
```

### 4.2 TTK 计算链路（全局）

```
用户点击「📊 计算 TTK」
  → ParamsPanel emit('calculate')
  → App.vue handleCalculate()
    ├── clearDirtyWeaponCaches()      ← 清理脏武器缓存（v8）
    ├── appStore.setGlobalCalculating(true)
    ├── getEnabledConfigs()
    │
    ├── ① handleDistanceChart()
    │     ├── buildArmedWeapons()（来自 FastTTK）
    │     ├── buildDistanceStats()
    │     │     └── 对每个武器：关键点 + 插值 → 101 点 times / shots / weightedAvg
    │     ├── 写 scores（从 weightedAvg 提取）
    │     └── 写 distanceStats.value
    │
    ├── ② 从 distanceStats 提取柱状图数据（params.distance 那个点）
    │     └── ttkResults = stats.map(stat => 从 stat.times[distIdx] 提取)
    │
    ├── ③ computeHavocCosts()（用关键点算平均 shots）
    └── finally: setGlobalCalculating(false)
```

### 4.3 综合评分链路

```
App.vue watch(equipStore.state.scoreEquips) → debounce → recomputeScores()
  ├── EquipScoreEngine.computeScores()
  │     ├── buildArmedWeapons()（来自 FastTTK）
  │     ├── 对每个配置 × 每套装备：
  │     │     ├── 关键点 → computeSingleTTK（先查缓存，未命中走 DP）
  │     │     └── interpolateKeyPoints + computeDistanceWeightedAvg
  │     ├── 加 aimWeight × aimSpeed
  │     ├── 多套装备等权平均
  │     └── _applyGrades（分位数法）
  ├── appStore.setWeaponScores(scores)
  └── EquipScoreEngine.extractGlobalRange(scores) → appStore.setWeaponScoresGlobalRange()
```

### 4.4 单枪评分更新链路

```
WeaponTable emit('update-ttk', { weaponId })
  → App.vue onUpdateWeaponTTK()
    ├── if (dataStore.isWeaponModified(weaponId))
    │     └── deleteMatrixEntriesByPrefix(`atk_${weaponId}_`)（清缓存，强制重算）
    ├── recomputeSingleWeaponScores(weaponId)
    │     ├── 空装备 → 清空该武器评分
    │     ├── EquipScoreEngine.computeScoresForWeapon({ globalRange })
    │     │     ├── 内部传 skipGrades: true 拿原始 rawScores
    │     │     └── 有 globalRange → _applyGradesWithGlobalRange
    │     │         无 globalRange → _applyGrades
    │     └── 合并到 appStore.weaponScores
    └── dataStore.clearWeaponModified(weaponId)
```

### 4.5 推荐链路（RecEngine + FastTTK.computeTTKMatrix）

```
RecPanel.runRecommend()
  ├── 空 enemies → 首次推荐：
  │     ① 随机临时假想敌
  │     ② runRecommendInternal([temp]) → top30
  │     ③ pickFromRecommendations(top30) → 假想敌 1
  │     ④ runRecommendInternal([假想敌 1]) → 最终 top30
  │
  ├── 非空 enemies → 直接 runRecommendInternal(buildEngineEnemies())
  │
  └── window.__recEngine.recommend(input, options)
        ├── _buildAttackSide()
        ├── _buildDefenseSide()
        ├── _prepareEnemies()
        ├── FastTTK.computeTTKMatrix()
        │     └── TTKMatrix.buildAllMatrix()
        └── _buildRecommendationsFromMatrix()
```

### 4.6 假想敌创建链路

```
createEnemy(index, excludeIndex = -1)  ← 添加 / 重掷共用
  ├── recommendations.value 存在：
  │     ├── usedKeys = 当前假想敌的 (weaponId + configId) 集合
  │     ├── pickFromRecommendations(recs, { excludeKeys: usedKeys })
  │     │     ├── 返回正常 enemy → 用它
  │     │     └── 返回 { __exhausted: true } → refreshRecommendations()
  │     │           ├── 随机临时假想敌
  │     │           ├── 跑推荐 → 新 top30 → 更新 recommendations.value
  │     │           └── pickFromRecommendations(newRecs, { skipFilter: true })
  │     └── 返回
  │
  └── recommendations.value 为 null：
        → randomEnemy(budget.value * 10000)（回退）
```

### 4.7 数据修改链路

```
用户编辑单元格
  → 组件事件
    → dataStore.updateBullet / updateWeapon / updatePriceConfig / updateOtherItem
      → DataManager.updateXXX
        ├── Object.assign（写入 this.data）
        └── markWeaponModified（追踪修改，仅武器相关）
    → dataStore.refreshBullets / refreshWeapons / refreshPrices / refreshOtherItems
    → emit('update') 通知父组件
```

### 4.8 缓存失效链路

**主流程（无缓存）**：DP 每次现算，不缓存。

**推荐侧（TTKMatrix + IndexedDB）**：
- 场景参数变化 → `scenarioHash` 变化 → IDB 查不到 → 重算
- 攻防/敌人配置变化 → id 里的字段变化 → 重算
- 重置数据 → `clearMatrix()` 清空
- 改武器属性 → `DataManager.markWeaponModified()` 标记 → `App.vue` 计算前清该武器缓存
- 改 configId → `DataManager.updateConfigId()` 主动清该配置的缓存

---

## 5. 数据结构（data.json）

### 5.1 顶层

```json
{
  "version": "1.0",
  "updatedAt": "2026-09-26",
  "meta": { ... },
  "params": { ... },
  "equipState": { ... },
  "weapons": [...],
  "bullets": [...],
  "prices": [...],
  "armors": [...],
  "otherItems": [...],
  "weaponScores": { ... }
}
```

> ⚠️ **不再有 `ttkCache` 顶层字段**。旧版导出的 JSON 里可能残留，导入时 `normalizeData` 会删除它。

### 5.2 `params`（可选）

```json
"params": {
  "bulletLevel": 4,
  "healthValue": 100,
  "distance": 30,
  "hitRateMap": [
    { "distance": 30, "rate": 1.0 },
    { "distance": 50, "rate": 0.9 },
    { "distance": 100, "rate": 0.6 }
  ],
  "hitProb": { "head": 0.1, "chest": 0.3, "stomach": 0.3, "limbs": 0.3 },
  "triggerDelayEnable": true,
  "kdRatio": 1.0,
  "extractRate": 0.5,
  "extraCost": 30,
  "aimWeight": 0.4
}
```

**语义**：
- **可选**：文件里没有 `params` → 启动时用 `paramsStore` 的硬编码默认值
- **部分覆盖**：`paramsStore.updateAll(params)` 是 `Object.assign`
- **导出时包含**：点「📤 导出数据」会写入当前 `paramsStore.state`

### 5.3 `equipState`（可选）

```json
"equipState": {
  "mode": "score",
  "calcEquip": {
    "armorId": "armor_4_...",
    "helmetId": "helmet_4_...",
    "armorLevel": 4,
    "armorValue": 110,
    "helmetLevel": 4,
    "helmetValue": 48
  },
  "scoreEquips": [ ... ]
}
```

**语义**：
- `mode`：`'calc'` | `'score'`
- `calcEquip`：计算装备（单套，用于 TTK 折线图/柱状图/哈弗币）
- `scoreEquips`：评分参考（多套，用于综合评分）

### 5.4 武器对象

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
  "barrels": [ ... ]
}
```

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
| `fireMode` | 开火模式 |
| `burstCount` / `burstInternalROF` / `burstInterval` | 连发字段 |

### 5.5 子弹对象

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
    ...
    "6": { "armorMult": 0.6, "pen": 0 }
  },
  "partMult": { "head": 1, "chest": 1, "stomach": 1, "limbs": 1 },
  "isDefault": true,
  "enabled": true
}
```

**ID 规范**：`${caliber}#${序号}`，序号口径内递增，**一旦分配不随 level/name 变化**。禁止修改 `caliber` / `id`。

### 5.6 价格配置

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

### 5.7 护甲/头盔对象

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

### 5.8 其他物品对象

```json
{
  "id": "other_1",
  "name": "GA野战背包",
  "category": "背包",
  "price": 27000,
  "description": "20格容量，5×4布局，三级包中性价比最高",
  "enabled": true
}
```

### 5.9 IndexedDB 结构

**数据库**：`df-ttk`（`TTKMatrix.js`）
**版本**：`2`
**ObjectStore**：

1. `ttk-matrix`（keyPath: `id`）— TTK 矩阵
2. `rec-panel-state`（keyPath: `id`）— 配装面板状态（假想敌 + 预算）

**`ttk-matrix` 记录结构**：

```js
{
  id: string,
  ttk: number,
  shots: number,
  hits: number,
  meta: object,
  cachedAt: number,
}
```

**ID 格式**：

| 类型 | 格式 |
|---|---|
| `atk_*` | `atk_{weaponId}_{configId}_{bulletId}_a{armorLv}v{armorVal}_h{helmetLv}v{helmetVal}_d{distance}_{scenarioHash}` |
| `def_*` | `def_{enemyWeaponId}_{enemyConfigId}_{enemyBulletId}_a{ourArmorLv}v{ourArmorVal}_h{ourHelmetLv}v{ourHelmetVal}_d{distance}_hr{hitRate}_{scenarioHash}` |

> ⚠️ **防御侧 ID 含 `d{distance}` 和 `hr{hitRate}`**。

**`rec-panel-state` 记录结构**：

```js
{
  id: 'default',
  version: 1,
  enemies: Array,   // 假想敌列表（最多 6 个）
  budget: number,
  savedAt: number,
}
```

**`scenarioHash` 组成**：

```
hitRateMap（排序后 "d1:r1:d2:r2..."）
+ hitProb（"h:c:s:l"）
+ triggerDelayEnable（"1"/"0"）
+ healthValue
+ `v${MATRIX_VERSION}`
→ _simpleHash() → 36 进制短码
```

**批量写入**：`BATCH_SIZE = 200`，事务分片 `BATCH_TX_SIZE = 50`。

**`MATRIX_VERSION = 6`**。

---

## 6. 模块 API 速查

### 6.1 `DataManager`（`src/core/DataManager.js`）

单例：`getDataManager()`。

#### 数据加载

| 方法 | 说明 |
|---|---|
| `loadFromJSON(url)` | **返回 `{ data, params, equipState }`** |
| `validateData(data)` | 校验格式 |
| `normalizeData(data)` | 规范化 |

#### 数据获取 - 武器

| 方法 | 说明 |
|---|---|
| `getWeapons()` / `getWeaponById(id)` | 武器列表 / 按 ID 查 |

#### 数据获取 - 子弹

| 方法 | 说明 |
|---|---|
| `getBullets()` | 全部子弹 |
| `getBulletById(id)` | 按 ID 查 |
| `getBulletByCaliberAndLevel(caliber, level, includeDisabled)` | 按口径+等级查 |
| `getBulletsByCaliber(caliber, includeDisabled)` | 按口径查 |
| `getNextBulletId(caliber)` | 生成下一个子弹 ID |
| `getBulletDisplay(bullet)` | 显示字符串 |

#### 数据获取 - 护甲/头盔

| 方法 | 说明 |
|---|---|
| `getArmors()` | 全部 |
| `getArmorsByType(type, includeDisabled)` | 按类型查 |
| `getArmorById(id)` | 按 ID 查 |

#### 数据获取 - 其他物品

| 方法 | 说明 |
|---|---|
| `getOtherItems(includeDisabled)` | 全部 |
| `getOtherItemsByCategory(category, includeDisabled)` | 按类别 |
| `getOtherItemById(id)` | 按 ID |
| `getNextOtherItemId()` | 生成下一个 ID |
| `getOtherItemCategories()` | 预定义类别 |

#### 数据获取 - 枪口

| 方法 | 说明 |
|---|---|
| `getMuzzles()` / `getMuzzleById(id)` / `getMuzzleBonuses(muzzleId)` | 枪口 |

#### 数据获取 - 价格

| 方法 | 说明 |
|---|---|
| `getPrices()` / `getPriceByWeaponId(weaponId)` | 价格配置 |
| `getPriceRowsForWeapon(weaponId)` | 解析配置（含反查 barrelId） |
| `getPriceRows()` | 全部解析后的配置行 |
| `getHitRateForDistance(...)` / `getHitRateFromMap(...)` | 命中率 |
| `getNextConfigId(weaponId)` | 生成下一个配置 ID |

#### 数据更新

| 方法 | 说明 |
|---|---|
| `updateWeapon` / `updateWeaponBarrel` / `addWeaponBarrel` / `removeWeaponBarrel` | 武器 |
| `addBullet` / `updateBullet` / `removeBullet` / `setDefaultBullet` / `setBulletsEnabled` | 子弹 |
| `addArmor` / `updateArmor` / `removeArmor` / `setArmorsEnabledByType` | 护甲 |
| `addOtherItem` / `updateOtherItem` / `removeOtherItem` / `setOtherItemsEnabled` | 其他物品 |
| `updatePriceConfig` / `addPriceConfig` / `removePriceConfig` | 价格 |
| **`updateConfigId(weaponId, oldConfigId, newConfigId)`** | **async**，成功后清旧 key 缓存 |

#### 修改追踪

| 方法 | 说明 |
|---|---|
| `markWeaponModified(id)` / `isWeaponModified(id)` | 标记 / 查询 |
| `getModifiedWeaponIds()` / `hasModifiedWeapons()` | 获取脏武器列表 |
| `clearWeaponModified(id)` / `clearAllModified()` | 清除标记 |

#### 导出 / 导入 / 重置

| 方法 | 说明 |
|---|---|
| `exportToJSON(extra)` / `exportToFile(filename, extra)` | 导出 |
| `importFromJSON(jsonStr, options)` | 导入（支持 overwrite / merge） |
| `importFromFile(file)` | 从文件导入 |
| `clearImportMarks()` | 清除导入标记 |
| `resetToOriginal()` | 重置为初始状态 |
| `hasUnsavedChanges()` / `getStats()` | 工具方法 |

### 6.2 `FastTTK`（`src/core/FastTTK.js`）

**统一计算入口**：

| 方法 | 说明 |
|---|---|
| `computeTTK({ mode })` | 统一入口（fast / precise） |
| `computeTTKFast(options)` | 快速模式（DP） |
| `computeTTKPrecise(options)` | 精算模式（蒙特卡洛） |
| `computeTTKMatrix(options)` | 矩阵预计算 |
| `queryAttackTTK(options)` / `queryDefenseTTK(options)` | 查询 |
| `clearMatrix()` | 清空矩阵缓存 |

**关键点 / 插值 / 武装**（原 `TTKCalculator.js`）：

| 方法 | 说明 |
|---|---|
| `computeSingleTTK(armedWeapon, attachment, params, dm)` | 单点 TTK |
| `getKeyDistances(weapon, config, maxDistance)` | 关键点算法 |
| `interpolateKeyPoints(keyPoints, fullDistances)` | 线性插值 |
| `computeDistanceSeries(...)` | 关键点 + 插值完整序列 |
| `buildArmedWeapons(configs, dm)` | 武装武器构建 |
| `computeDistanceWeightedAvg(times, distances)` | 距离加权平均 |

### 6.3 `TTKMatrix`（`src/core/TTKMatrix.js`）

**DP 引擎**：

| 方法 | 说明 |
|---|---|
| `computeTTKWithDP(options)` | DP 计算单次 TTK |

**矩阵**：

| 方法 | 说明 |
|---|---|
| `buildAllMatrix(options)` | 攻击侧 + 防御侧 |
| `buildAttackMatrix(options)` / `buildDefenseMatrix(options)` | 单侧 |
| `getAttackTTK(options)` / `getDefenseTTK(options)` | 查询 |
| `makeAttackId(options)` / `makeDefenseId(options)` | 生成 ID |
| `makeScenarioHash(scenario)` | 场景哈希 |
| `getDebugEntry(id)` / `clearDebugMap()` | debug |

**IndexedDB**：

| 方法 | 说明 |
|---|---|
| `getMatrixEntry(id)` / `setMatrixEntry(id, data)` / `setMatrixEntries(entries)` | 读写 |
| `deleteMatrixEntry(id)` / `deleteMatrixEntriesByIds(ids)` / `deleteMatrixEntriesByPrefix(prefix)` | 删除 |
| `getAllMatrixIds()` / `getMatrixCount()` / `getMatrixStats()` | 统计 |
| `clearMatrix()` | 清空 |
| `saveRecPanelState(state)` / `loadRecPanelState()` / `clearRecPanelState()` | 配装面板状态 |
| `requestPersistentStorage()` | 请求持久化权限 |

### 6.4 `SimulationEngine`（`src/core/SimulationEngine.js`）

**引擎**：

| 方法 | 说明 |
|---|---|
| `setDataManager(dm)` / `getDataManager()` | 注入 DataManager |
| `simulateOneTTK(weapon, params, strategy, bulletData)` | 单次模拟 |
| `simulateOneTTKWithDetail(...)` | 记录模式（逐发明细） |
| `calculateAvgStats(...)` / `calculateSinglePoint(...)` | 批量统计 |
| `calculateWeaponsTTK(...)` | 多武器批量 |
| `getRealBulletKey(...)` | 子弹反查 |

**CombatCore**（原 `CombatCore.js`）：

| 导出 | 说明 |
|---|---|
| `SIMULATION_CONFIG` | 模拟配置 |
| `setSeed(seed)` / `seededRandom()` | 种子 RNG |
| `DistanceDecayCalculator` | 距离衰减 |
| `ArmorDamageCalculator` | 护甲减伤 |
| `HitPartSelector` | 命中部位选择 |
| `RIPBulletStrategy` / `StandardBulletStrategy` / `BulletStrategyFactory` | 子弹策略 |
| `getDecay` | 向后兼容 |

### 6.5 `EquipScoreEngine`（`src/core/EquipScoreEngine.js`）

**引擎**：

| 方法 | 说明 |
|---|---|
| `new EquipScoreEngine(dataManager)` | 构造（校验 dm） |
| `computeScores({ ..., skipGrades })` | 全量评分 |
| `computeScoresForWeapon({ ..., globalRange })` | 单武器评分 |
| `static extractGlobalRange(scores)` | 从 scores 提取全局 min/max |
| `getEquipScoreEngine(dm)` | 单例 |

**评分缓存**（原 `EquipScoreCache.js`）：

| 导出 | 说明 |
|---|---|
| `SCORE_CACHE_BATCH_SIZE` | 批量阈值 |
| `makeScoreCacheId(options)` / `makeScoreScenarioHash(scenario)` | key |
| `getScoreEntry(id)` / `setScoreEntries(entries)` | 读写 |
| `makeScoreCacheMeta(options)` | meta |
| `ScoreCacheScheduler` | 批量调度器 |

### 6.6 `RecEngine`（`src/core/RecEngine.js`）

单例：`getRecEngine(dataManager)`。

| 方法 | 说明 |
|---|---|
| `recommend(input, options)` | 推荐主入口 |
| `printResult(result)` | 打印 Top3 |

### 6.7 `stores`（`src/stores/stores.js`）

**`dataStore`**：

| 方法 | 说明 |
|---|---|
| `loadData()` | **返回 `{ params, equipState }`** |
| `exportData(extra)` / `importData(jsonStr, options)` | 导入导出 |
| `refreshWeapons/Bullets/Prices/Armors/OtherItems` | 刷新 |
| `updateConfigId(weaponId, oldId, newId)` | **async** |
| `getModifiedWeaponIds()` / `hasModifiedWeapons()` / `clearAllModified()` | 脏武器 |

**`paramsStore`**：

| 方法 | 说明 |
|---|---|
| `state` | readonly |
| `hitRate` | getter |
| `update(key, value)` / `updateAll(newParams)` | 修改 |
| `updateHitRateMap(raw)` / `reset()` | 工具 |

**`appStore`**：

| 方法 | 说明 |
|---|---|
| `setWeaponScores(scores)` / `getWeaponScore(id, configId)` | 评分 |
| `setWeaponScoresGlobalRange(range)` / `getWeaponScoresGlobalRange()` | 全局范围 |
| `clearWeaponScores()` | 清空评分 + 全局范围 |
| `setTtkResults(results)` / `setHavocCosts(costs)` | 结果 |
| `addUpdatingWeapon(id)` / `removeUpdatingWeapon(id)` / `isUpdatingWeapon(id)` | 更新状态 |
| `showCalcProgress(title, total)` / `updateCalcProgress(cur, total)` / `hideCalcProgress()` | 进度条 |

**`equipStore`**：

| 方法 | 说明 |
|---|---|
| `setMode(mode)` | `'calc'` / `'score'` |
| `setCalcEquip(equip)` / `clearCalcEquip()` | 计算装备 |
| `setScoreEquips(list)` / `addScoreEquip(eq)` / `removeScoreEquip(...)` / `clearScoreEquips()` | 评分参考 |
| `exportState()` / `loadFromImported(equipState)` | 导入导出 |
| `resetToDefault()` | 重置 |

### 6.8 `weaponCalc`（`src/utils/weaponCalc.js`）

| 方法 | 说明 |
|---|---|
| `calculateCurrentValues(weapon, barrel, muzzleId, precision)` | 应用附件后的属性 |

---

## 7. 组件 API 速查

### 7.1 主流程

```
App.vue
  └── AppLayout
        ├── ParamsPanel（emits: calculate / export-data / import-data / reset-data / equip-changed）
        ├── charts-area
        │     ├── TTKChart（ref=barChartRef，含放大按钮）
        │     └── DistanceChart（ref=lineChartRef，含放大按钮）
        └── 表格区（Tab）
              ├── WeaponTable（含搜索/排序/筛选）
              ├── ItemsPanel
              │     ├── BulletTable
              │     ├── ArmorTable（armor / helmet）
              │     └── OtherItemsTable
              └── RecPanel

弹窗：
  ├── BarrelEditor
  ├── WeaponBaseEditor
  ├── EquipMatrixModal
  ├── DamageDetailModal
  ├── ConfirmDialog
  └── ImportModeDialog

其他：
  └── 滚动悬浮按钮（Teleport to body）
```

### 7.2 `App.vue` 核心方法

| 方法 | 说明 |
|---|---|
| `handleCalculate()` | 全量计算（折线图 + 柱状图 + 哈弗币） |
| `handleDistanceChart()` | 折线图数据生成 |
| `computeHavocCosts(...)` | 哈弗币 |
| `recomputeScores()` | 全量评分 |
| `recomputeSingleWeaponScores(weaponId)` | 单枪评分 |
| `onUpdateWeaponTTK({ weaponId })` | "更新评分"按钮处理 |
| `clearDirtyWeaponCaches()` | 清理脏武器缓存（v8） |
| `exportData()` / `importData()` / `resetData()` | 数据管理 |
| `toggleExpand(which)` | 图表放大 |

**provide**：`showConfirm(options)` / `showAlert(message, title)`。

### 7.3 `ParamsPanel.vue`

**emits**：`calculate` / `export-data` / `import-data` / `reset-data` / `equip-changed`。

### 7.4 `TTKChart.vue` / `DistanceChart.vue`

**暴露**：

```js
defineExpose({
  resize: () => chartInstance?.resize(),
  update: updateChart
})
```

### 7.5 `WeaponTable.vue`

**props**：`data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`

**emits**：`update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk`

**排序 key**：`default` / `aim_asc` / `aim_desc` / `price_asc` / `price_desc` / `score_asc` / `score_desc` / `havoc_asc` / `havoc_desc` / `ttk_asc` / `ttk_desc`

### 7.6 `ItemsPanel.vue`

**props**：`caliberOptions`

**emits**：`update`

**子 Tab**：子弹 / 护甲 / 头盔 / **其他物品**

### 7.7 `RecPanel.vue`

**常量**：
- `MAX_ENEMIES = 6`
- `DEFAULT_BUDGET_W = 100`
- `DEFAULT_CARRY_COUNT = 120`

**核心方法**：`runRecommend` / `createEnemy` / `addEnemy` / `rerollEnemy` / `addAsEnemy` / `pickFromRecommendations` / `buildEnemyFromRec` / `refreshRecommendations`

---

## 8. 常见任务（AI 改代码时先看这里）

### 8.1 加一个新武器 / 子弹 / 配件字段

同旧版。**如果影响 TTK**：递增 `MATRIX_VERSION`。

### 8.2 改伤害公式

**必须同时改两处**：

1. `SimulationEngine.js` 的 `StandardBulletStrategy.calculateHitDamageWithPart` 或 `RIPBulletStrategy.calculateHitDamageWithPart`
2. `TTKMatrix.js` 的 `_calcDamage`

然后递增 `MATRIX_VERSION`。

### 8.3 改连发偏置 / 分段射速语义

**必须同时改两处**：

- `SimulationEngine.js` 的 `HitPartSelector.selectWithBias`
- `TTKMatrix.js` 的 `_applyBurstBias`

分段射速：

- `SimulationEngine.js` 的 `_getIntervalAfterShot`
- `TTKMatrix.js` 的 `_getShotIntervalMs`

### 8.4 改缓存 key

1. 改 `TTKMatrix.js` 的 `makeAttackId` / `makeDefenseId` / `makeScenarioHash`
2. **递增 `MATRIX_VERSION`**

### 8.5 改假想敌创建逻辑

改 `RecPanel.vue` 的：

- `createEnemy`（统一入口）
- `pickFromRecommendations`（去重逻辑）
- `buildEnemyFromRec`（组装逻辑）
- `refreshRecommendations`（池刷新）

### 8.6 改参数导出/导入

涉及三个文件（**必须一起改**）：

1. `DataManager.js`
2. `stores.js`
3. `App.vue`

### 8.7 改图表布局 / 放大按钮

改 `App.vue`。

### 8.8 改假想敌上限

改 `RecPanel.vue` 的 `MAX_ENEMIES`。同时改：

- 卡片颜色（`.enemy-card[data-index]`）需要补对应数量
- 卡片宽度（`flex: 1 1 280px`）可能需要调小

### 8.9 加一个新的「其他物品」类别

1. 改 `DataManager.js` 的 `getOtherItemCategories()` 和 `CATEGORY_ORDER`
2. 改 `OtherItemsTable.vue` 的 `categoryOptions`
3. 改 `OtherItemsTable.vue` 的 `getCategoryClass`（配色）
4. 改样式 `.category-select.cat-xxx`

### 8.10 调试

- **DP 调试**：`window.__DEBUG_DP = true`（可选 `__DEBUG_DP_TARGET` / `__DEBUG_DP_ONCE`）
- **矩阵缓存**：`const { getMatrixStats } = await import('@/core/TTKMatrix'); await getMatrixStats()`
- **清空矩阵**：`const { clearMatrix } = await import('@/core/FastTTK'); await clearMatrix()`
- **DataManager**：`window.__dataManager`
- **RecEngine**：`window.__recEngine`
- **最近一次推荐结果**：`window.__lastRecResult`
- **推荐 debug**：`__recDebug(1)` / `__recDebug.list()` / `__recDebug.byWeapon(id, configId)` / `__recDebug.byWeaponName('汤姆逊')`

---

## 9. 已知限制 / 待办

### 9.1 已知限制

- **单线程**：DP 单点虽快，但 `handleCalculate` / `handleDistanceChart` / `computeHavocCosts` / `updateSingleWeaponTTK` 各有 101 次循环，配置多时仍会卡 UI
- **IndexedDB 累积**：推荐侧矩阵缓存跨会话累积，长时间不清理会变大（**无 TTL 机制**）
- **两套偏置/间隔实现**：`SimulationEngine.HitPartSelector.selectWithBias` 与 `TTKMatrix._applyBurstBias`；`SimulationEngine._getIntervalAfterShot` 与 `TTKMatrix._getShotIntervalMs`
- **`MATRIX_VERSION` 是"全清"开关**：改任何影响 TTK 的代码都要递增它，导致所有缓存失效
- **`deleteMatrixEntriesByPrefix` 的前缀歧义**：`atk_41_1_` 会误匹配 `atk_41_10_`（可接受 trade-off）
- **假想敌上限 6**：推荐矩阵条目翻倍，首次推荐会明显变慢（约 2 倍时间）
- **`refreshRecommendations` 会替换 `recommendations.value`**：推荐面板（Top 3 + 表格）会一起刷新
- **`otherItems` 的 `category` 是枚举**：加新类别要改多处
- **`stores.js` 启动顺序警告**：`_getDefaultCalcEquip()` 在模块加载时执行，此时 DataManager 还没加载数据；不影响功能（`loadFromImported` 会覆盖）

### 9.2 待办

- [ ] 加单元测试（当前无测试）
- [ ] 抽公共函数：把 `App.vue` 里重复的 TTK 分解 / 哈弗币公式 / 加权平均抽到 `utils/`
- [ ] 统一 `TTKMatrix` 与 `SimulationEngine` 的偏置/间隔语义
- [ ] 加缓存 TTL / 版本号过期机制
- [ ] `MATRIX_VERSION` 分分支（每类计算独立版本号）
- [ ] 加 UI 按钮"清空缓存"
- [ ] 清理 `data.json` 的 `meta.note` 里重复的文案

---

## 10. 版本历史

### v1.4.0（文件合并 + 死代码清理）

**文件合并**（`src/core/` 从 11 → 6）：

| 合并前 | 合并后 |
|---|---|
| `TTKDP.js` + `TTKIndexedDB.js` + `TTKMatrix.js` | `TTKMatrix.js` |
| `EquipScoreCache.js` + `EquipScoreEngine.js` | `EquipScoreEngine.js` |
| `TTKCalculator.js` + `FastTTK.js` | `FastTTK.js` |
| `CombatCore.js` + `SimulationEngine.js` | `SimulationEngine.js` |

**死代码清理**（共减约 277 行）：

| 文件 | 删除内容 |
|---|---|
| `SimulationEngine.js` | 8 个常量 + `resetSeed` + `BaseDamageCalculator` 类 + `verbose` 参数 |
| `App.vue` | `computeTTK` import + `updateSingleWeaponTTK` 函数 |
| `RecEngine.js` | `_makeScenarioHash` + `exportResult` |
| `DataManager.js` | 5 个未使用方法 |
| `TTKMatrix.js` | `getAllMatrixEntries` + `closeDB` |
| `EquipScoreEngine.js` | `getScoreEntries` |
| `FastTTK.js` | `queryMatrixStats` |

**文件数**：`src/` 从 32 → 27。

### v1.3.1（v8/v9 修复）

**v8 修复（问题 1 / 2 / 3 / 4 / 7 / 8 / 9 / 10 / 11 / 12 / 15 / 16 / 18）**：
- 改武器属性后缓存失效（脏武器跳缓存）
- configId 变更后清 IndexedDB
- 单武器重算的分档与全量一致（`_applyGradesWithGlobalRange`）
- 单武器空结果反馈（`{ scores, empty, reason }`）
- 单武器空装备时清空评分
- 分档改为分位数法
- `EquipScoreEngine` 加 dataManager 校验
- 非法 weaponId 检查
- meta 精简
- Infinity → null
- 批量事务分片

**v9 修复**：
- `computeScores` 新增 `skipGrades` 参数
- `computeScoresForWeapon` 传 `skipGrades: true`（修掉"把已分档结果当 rawScores 用"的 bug）
- `_applyGradesWithGlobalRange` 调用方加类型检查

### v1.3.0（其他物品）

**新增「其他物品」数据**：
- `data.json` 顶层新增 `otherItems` 数组
- 字段：`id` / `name` / `category` / `price` / `description` / `enabled`
- 类别枚举：**背包 / 胸挂 / 治疗 / 维修 / 其他**

**DataManager**：
- 新增 `getOtherItems` / `getOtherItemsByCategory` / `getOtherItemById` / `getNextOtherItemId` / `addOtherItem` / `updateOtherItem` / `removeOtherItem` / `setOtherItemsEnabled` / `getOtherItemCategories`
- `normalizeData` 里新增 `otherItems` 规范化
- 导出时按 `CATEGORY_ORDER` 排序

**stores**：
- `dataStore.state.otherItems` + `refreshOtherItems()`
- `appStore.switchSubTab` 白名单新增 `'other'`

**组件**：
- **新增 `OtherItemsTable.vue`**
- `ItemsPanel.vue` 新增第 4 个子 tab「🧰 其他物品」

### v1.2.0（体验优化 + 假想敌质量对齐）

**布局优化**：
- 图表默认**并排**（grid 1fr 1fr）
- 新增**放大按钮**（PC only）
- 移动端：单列，隐藏放大按钮

**计算流程合并**：
- 「计算 TTK」和「生成折线图」两个按钮**合并**为一个

**参数导出/导入**：
- `loadFromJSON` 返回 `{ data, params, equipState }`
- `exportToJSON` / `exportToFile` 支持 `extra.params`

**假想敌质量对齐**：
- `createEnemy` 统一入口：优先从推荐池挑
- 推荐池用尽 → `refreshRecommendations`
- 去重 key：`weaponId + configId`
- 重掷时**临时排除自己**

**假想敌上限**：3 → 6

**缓存 ID 修复（v5 → v6）**：
- `makeDefenseId` 加入 `distance` + `hitRate`
- `MATRIX_VERSION` 5 → 6

### v1.1.0（计算架构迁移）

- `TtkCacheManager` / `KeyPointsComputer` / `ttkCache` 架构被删除
- 引入 `FastTTK` + `TTKDP` + `TTKMatrix` + `TTKIndexedDB`

### v1.0.0（合并重构后）

- `dataStore` / `paramsStore` / `appStore` 三合一为 `stores.js`
- `utils/` 从 5 个文件合并为 `weaponCalc.js`
- `components/` 从 17 个文件精简约 13 个

### v0.x（重构前）

- 早期版本，文件结构较散

---

## 11. 附录

### 11.1 文件数预算

| 目录 | v0.x | v1.0.0 | v1.1.0 | v1.2.0 | v1.3.0 | v1.4.0 |
|---|---|---|---|---|---|---|
| `src/components/` | 17 | 13 | 13 | 13 | 14 | 16 |
| `src/core/` | 8 | 6 | 8 | 8 | 8 | **6** |
| `src/stores/` | 3 | 1 | 1 | 1 | 1 | 1 |
| `src/utils/` | 5 | 1 | 1 | 1 | 1 | 1 |
| `src/styles/` | 1 | 1 | 1 | 1 | 1 | 1 |
| `src/` 根 | 2 | 2 | 2 | 2 | 2 | 2 |
| `public/` | 1 | 1 | 1 | 1 | 1 | 1 |
| 根目录 | 7 | 7 | 7 | 7 | 7 | 7 |
| **合计** | **44** | **32** | **34** | **34** | **35** | **35** |

> **`src/` 内文件数**（不含 `public/` 和根目录）：v1.4.0 是 **27 个**。

### 11.2 v1.4.0 关键决策记录

**为什么把 `TTKDP.js` / `TTKIndexedDB.js` 合并到 `TTKMatrix.js`？**

- 三者是"一个完整的缓存系统"：
  - DP 引擎算单条 TTK
  - IDB 存储 TTK
  - 矩阵枚举所有组合、写缓存、读缓存
- 分成三个文件时，改一处要跳三个地方；合并后逻辑内聚

**为什么把 `EquipScoreCache.js` 合并到 `EquipScoreEngine.js`？**

- `EquipScoreCache` 只被 `EquipScoreEngine` 使用
- 语义上是"评分引擎的内部缓存实现"

**为什么把 `TTKCalculator.js` 合并到 `FastTTK.js`？**

- `TTKCalculator` 提供的"关键点 / 插值 / 武装武器"是 `FastTTK` 的"计算工具集"
- 两者语义一致

**为什么把 `CombatCore.js` 合并到 `SimulationEngine.js`？**

- `CombatCore` 的所有导出（常量 / RNG / 计算器 / 策略）只服务"模拟"
- 合并后 `SimulationEngine` 自包含所有模拟相关逻辑

**为什么删 `queryMatrixStats` / `getScoreEntries` / `getAllMatrixEntries` / `closeDB` / `getBulletRows` 等？**

- 这些是历史遗留 API，全文搜索无引用
- 删掉零风险，减少代码体积

### 11.3 调试脚本

| 脚本 | 说明 |
|---|---|
| `tree.py` | 生成目录树 |
| `collect_files.py` | 收集文件内容（用于 AI 上下文） |
| `tools/merge-refactor.mjs` | TTK 引用合并（TTKDP / TTKIndexedDB → TTKMatrix） |
| `tools/merge-equip-score-cache.mjs` | EquipScoreCache 引用合并 |
| `tools/merge-ttk-calculator.mjs` | TTKCalculator 引用合并 |
| `tools/merge-combat-core.mjs` | CombatCore 引用合并 |
| `tools/remove-dead-code.mjs` | 死代码清理 |

### 11.4 授权

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

### 11.5 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准

---

**文档版本**：1.4.0
**最后更新**：2026-09-26
**对应代码版本**：v1.4.0（文件合并 + 死代码清理）
```

---

## 本次 README 更新的重点

| 章节 | 更新内容 |
|---|---|
| **0.1 定位** | 不变 |
| **0.3 数据流** | 更新所有模块引用（`TTKMatrix` 承载三层职责、`SimulationEngine` 承载两层、`EquipScoreEngine` 承载两层、`FastTTK` 承载两层） |
| **0.4 文件数** | `src/` 32 → **27**，`src/core/` 11 → **6** |
| **0.6 数据规模** | 更新为实际数值 |
| **1.1 目录树** | 移除 5 个已删除文件；新增 `tools/` 目录（爬虫） |
| **1.2 文件职责** | `src/core/` 全部重写（6 个文件） |
| **2.x 核心概念** | 更新 `TTKMatrix` / `SimulationEngine` 的引用 |
| **3.6 DP 状态机** | 引用改为 `TTKMatrix.computeTTKWithDP` |
| **4.x 数据流** | 更新所有模块引用 |
| **5.x 数据结构** | 不变（data.json 结构没动） |
| **6.x API 速查** | 完全重写（每个模块合并后的新 API） |
| **7.x 组件 API** | 补上 `EquipMatrixModal` / `ImportModeDialog` |
| **8.x 常见任务** | 更新"改伤害公式"的两处位置 |
| **9.1 已知限制** | 更新（去掉已修复项，加上新增的"stores.js 启动警告"） |
| **9.2 待办** | 更新（去掉"抽公共函数"部分已完成项，加上"加缓存 TTL"等） |
| **10 版本历史** | 新增 **v1.4.0** 段 |
| **11.2 决策记录** | 新增 v1.4.0 的"为什么合并"说明 |
| **11.3 调试脚本** | 新增 5 个 `.mjs` 合并脚本 |

---

## 使用建议

1. **把上面的完整 README 内容复制，覆盖仓库里的 `README.md`**（或新建 `README.md` 覆盖）
2. **跑一遍 VSCode 的 Markdown 预览**，确认格式正确
3. **提交 git**

#### `tools/`（不计配额）

价格数据采集工具（Python + Playwright）。

详见 [`tools/README.md`](./tools/README.md)。

| 文件 | 职责 |
|---|---|
| `config.py` | 常量配置 |
| `extract_tasks.py` | 阶段1：提取任务 |
| `scrape_prices.py` | 阶段2：抓取价格 |
| `merge_prices.py` | 阶段3：合并结果 |
| `requirements.txt` | Python 依赖 |