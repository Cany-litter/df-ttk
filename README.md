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
data.json（含 weapons / bullets / prices / armors，可选 params）
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
    ├─ computeTTKMatrix()   ← TTKMatrix.js（矩阵预计算 + 增量）
    │     └─ TTKIndexedDB.js（IndexedDB 持久化）
    └─ _buildRecommendationsFromMatrix()（读回 + 组合 + 排序）

假想敌创建链路（RecPanel）：
  createEnemy()  ← 添加 / 重掷共用入口
    ├─ 有推荐结果 → pickFromRecommendations()
    │     ├─ 有未用推荐 → 随机挑一个（去重 weaponId+configId）
    │     └─ 全用过 → refreshRecommendations()
    │           ├─ 随机临时假想敌 → 跑推荐 → 新 top30
    │           └─ 从新池挑（跳过去重）
    └─ 无推荐结果 → randomEnemy()（随机采样，回退）
```

**关键点**：
- **`FastTTK` 是唯一计算入口**，对外只暴露 `computeTTK({ mode })`；内部按模式分发到 DP 或蒙特卡洛
- **`TTKDP.js` 是主流程引擎**（快、精确、无随机性），所有批量计算/矩阵/折线图/单枪更新都走它
- **`SimulationEngine.js` 只用于两处**：① `FastTTK` 的 `'precise'` 模式；② `DamageDetailModal` 的逐发明细记录（`simulateOneTTKWithDetail`）
- **`TTKMatrix` + `TTKIndexedDB` 是推荐侧缓存**，与主流程的 `ttkCache` 无关（后者已删除）
- **`CombatCore` 是底层**（常量 / RNG / 伤害计算器 / 子弹策略），无外部依赖
- **假想敌来源双轨**：有推荐结果时从推荐池挑（质量高、带真实 `carryCount`），无推荐结果时随机采样（回退）

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
- **可选 `params`**：页面顶部参数快照（KD / 撤离率 / 其他消耗 / 开镜权重 / 距离 / 命中率映射 / 命中概率 / 扳机延迟等）

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
| `ParamsPanel.vue` | 参数面板 + 操作按钮 | emits: `calculate` / `export-data` / `import-data` / `reset-data` |
| `TTKChart.vue` | TTK 堆叠柱状图（5 段分解） | props: `results` / `params` / `displayCount`；暴露 `resize()` |
| `DistanceChart.vue` | 距离-TTK 折线图 | props: `stats` / `distances` / `highlightWeapon` / `displayCount` / `segment`；暴露 `resize()` |
| `WeaponTable.vue` | 枪械数据表（卡片式，含秒伤、配置列表） | props: `data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`；emits: `update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk` |
| `ItemsPanel.vue` | 弹甲数据容器（子 Tab：子弹 / 护甲 / 头盔） | props: `caliberOptions`；emits: `update` |
| `BulletTable.vue` | 子弹数据表 | props: `data` / `caliberOptions` / `levelOptions`；emits: `update` / `add-bullet` / `delete-bullet` |
| `ArmorTable.vue` | 护甲/头盔数据表（用 `type` 区分） | props: `data` / `type`（`'armor'` / `'helmet'`）；emits: `update` |
| `BarrelEditor.vue` | 枪管编辑器弹窗 | props: `visible` / `weaponId`；emits: `update:visible` / `saved` |
| `WeaponBaseEditor.vue` | 武器基础属性编辑器弹窗 | props: `visible` / `weaponId` / `caliberOptions`；emits: `update:visible` / `saved` |
| `ConfirmDialog.vue` | 通用确认弹窗（Promise 封装） | props: `visible` / `title` / `message` / `confirmText` / `cancelText` / `confirmType` / `checkboxLabel` / `checkboxDefault`；emits: `update:visible` / `confirm` / `cancel` |
| `DamageDetailModal.vue` | 单次伤害模拟弹窗（逐发明细） | props: `visible` / `weaponId` / `configId` / `distance`；emits: `update:visible` |
| `RecPanel.vue` | 配装推荐面板（含 Top3 卡片 + 第 4~30 名表格） | 无 props |

#### `src/core/`（8 个）

| 文件 | 职责 |
|---|---|
| `CombatCore.js` | 底层核心：常量 + RNG + 4 个计算器类 + 3 个子弹策略类 |
| `DataManager.js` | 数据管理单例：加载 / 规范化 / 导入导出 / 修改追踪 / 内联 perf |
| `FastTTK.js` | **统一计算入口**：对外只暴露 `computeTTK()` / `computeTTKMatrix()` / 缓存管理 |
| `TTKDP.js` | DP 引擎：状态机 `(health, headHits, bodyHits, limbHits, burstPos, lastPart)` |
| `TTKMatrix.js` | 矩阵预计算：枚举攻击侧 × 防御侧 × 敌人，调 DP 算每条 TTK，写 IndexedDB（增量） |
| `TTKIndexedDB.js` | IndexedDB 封装（基于 idb）：get / set / delete / clear / getAllKeys / count / stats |
| `SimulationEngine.js` | 蒙特卡洛引擎：单次模拟 / 记录模式 / 批量统计 / 子弹解析 |
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

### 2.4 连发模式与部位偏置

连发武器（`fireMode: 'burst'`）的特殊逻辑：

- **第一发**：完全随机选择命中部位
- **后续发**：以 `BURST_BIAS = 0.7` 的概率命中**同一部位**，否则偏移到**相邻部位**
- **连发间隔**：每进入新连发周期（`shot % burstCount === 1` 且 `shot > burstCount`）插入一次 `burstInterval`
- **连发内部射速**：连发内部使用 `burstInternalROF`，忽略 `rofStages`

> ⚠️ **两套偏置实现存在细微差异**：
> - `CombatCore.HitPartSelector.selectWithBias()`：上下邻居各 50%（头部只连胸、四肢只连腹，用边界钳制）
> - `TTKDP.applyBurstBias()`：头/胸/腹/肢用硬编码 `adjMap`
> 修改偏置逻辑时需**同时改两处**。

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

### 2.8 两种计算模式（FastTTK）

| 模式 | 引擎 | 耗时 | 精度 | 用途 |
|---|---|---|---|---|
| `'fast'`（默认） | `TTKDP.js` | < 10ms | < 0.01% | 主流程：批量计算 / 折线图 / 单枪更新 / 推荐矩阵 |
| `'precise'` | `SimulationEngine.js` | ~700ms | ~1% | 验证 / 用户要求精确 |

### 2.9 矩阵版本号（`MATRIX_VERSION`）

`TTKMatrix.js` 定义 `MATRIX_VERSION = 6`，参与 `scenarioHash` 计算。**修改伤害公式 / 缓存 key 结构 / 命中率逻辑时，必须递增它**。

**版本历史**：

- v1 → v2：修复 DP 连发间隔重复计算 bug
- v2 → v3：修复 DP 分段射速边界 bug
- v3 → v4：修复 RecEngine 未按名字反查 barrelId 的 bug
- v4 → v5：修复攻击侧命中率用错假想敌的 bug
- **v5 → v6：修复防御侧缓存 ID 未含 distance / hitRate 的 bug**

### 2.10 图表布局（v3）

PC 端两个图表默认**并排**（grid 1fr 1fr），更矮（16:9 / 260px）；点击「🔍 放大」按钮后：

- 该图表铺满整行（`.charts-area.has-expanded` 切单列）
- 另一个图表 `v-show` 隐藏
- 高度恢复 2:1 / 420px
- ECharts 容器尺寸变化后由 `App.vue` 调 `resize()`

**关键实现**：

- `.charts-area` 用动态 class `has-expanded` 切换 `grid-template-columns: 1fr`
- **不能只靠 `v-show`**：grid 仍按 2 列排，剩下的图表只占一半宽
- `toggleExpand` 里 `nextTick + setTimeout(300)` 两次调 `resize()`
- `.chart-wrapper` 的 `transition` 只过渡 `box-shadow` / `border-color`，不过渡尺寸（避免 ECharts 读中间值）

移动端：单列，隐藏放大按钮，高度统一 260px。

### 2.11 假想敌创建（v3）

**两个来源**：

1. **有推荐结果** → 从推荐池挑（topN + rest，共 30 个）
   - 去重 key：`weaponId + configId`
   - 池用尽 → 刷新推荐池（随机临时假想敌 → 跑推荐 → 新 top30）→ 从新池挑（跳过去重）
   - 保留真实 `carryCount`
2. **无推荐结果** → 随机采样（100 次采样，取成本最高的前 30% 随机挑）
   - `carryCount` 固定 120

**入口**：

- `addEnemy()`（➕ 添加假想敌）：调 `createEnemy`
- `rerollEnemy(index)`（🎲 重掷）：临时排除自己，调 `createEnemy`
- `addAsEnemy(rec)`（推荐卡片「➕ 添加为假想敌」）：直接 `buildEnemyFromRec`

**假想敌上限**：`MAX_ENEMIES = 6`

**卡片颜色**：6 种（红 / 橙 / 紫 / 蓝 / 绿 / 青），按 `data-index` 区分。

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

### 3.3 距离点算法（关键点 + 插值）

**关键点算法（`getKeyDistances`）**：

- 端点：0 / 100
- 命中率节点：`config.distance[i] ± 1`
- 射程衰减节点：`weapon.ranges[i] ± 1`（有限值）

**插值（`interpolateKeyPoints`）**：关键点之间用线性插值，生成 101 个点。

### 3.4 命中率映射

`getHitRateFromMap()` 的规则：

1. 排序后线性插值
2. **10m 内强制 100% 命中率**（符合游戏近战设定）
3. 超出最近点会**外推**，但被钳制在 `[0, 1]`

### 3.5 哈弗币消耗公式

```
哈弗币消耗 = 整枪价格 × (1 - 撤离率)
           + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
```

- `平均致死枪数`：**关键点**的 `shots` 平均值（不是 101 点全量）
- `KD × 5`：KD 放大倍数
- `其他消耗`：默认 30 发

> ⚠️ `computeHavocCosts` 用「关键点平均」，和柱状图/折线图用的 101 点加权平均**不一样**。

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

App.vue onMounted
  ├── dataStore.loadData()
  │     └── DataManager.loadFromJSON('./data.json')  → { data, params }
  │           ├── fetch + validateData
  │           ├── ⭐ 提取 params（normalizeData 之前）
  │           ├── normalizeData（规范化 ranges/bullets/configs/armors）
  │           └── originalData = 深拷贝（用于重置）
  ├── ⭐ params 非空 → paramsStore.updateAll(params)
  ├── 收集 caliberOptions
  └── setTimeout(handleCalculate, 500)
```

### 4.2 TTK 计算链路（全局，v3：先折线图 → 再提取柱状图）

```
用户点击「📊 计算 TTK」
  → ParamsPanel emit('calculate')
  → App.vue handleCalculate()
    ├── appStore.setGlobalCalculating(true)
    ├── getEnabledConfigs()
    │
    ├── ① handleDistanceChart()
    │     ├── buildArmedWeapons()
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

**关键**：柱状图数据**不再单独算**，而是从折线图数据（101 点）里**直接提取** `params.distance` 那个点。保证两个图表数据一致。

### 4.3 折线图链路

```
handleDistanceChart()（内部函数）
  ├── getEnabledConfigs()
  ├── buildArmedWeapons()
  ├── buildDistanceStats(armed, attachments)
  │     └── 对每个武器：
  │           ├── getKeyDistances(weapon, config)
  │           ├── 逐关键点调 computeSingleTTK
  │           ├── interpolateKeyPoints → 101 点
  │           ├── weightedAvg
  │           └── appStore.updateCalcProgress(idx + 1)
  ├── 提取 { ttk, aim } 作为 scores
  ├── appStore.setScores(scores)
  └── 返回 stats
```

### 4.4 单次模拟链路（弹窗）

```
DamageDetailModal
  → runSimulation(seed)
    ├── setSeed(seed)
    ├── calculateCurrentValues()
    ├── SimulationEngine.getRealBulletKey()
    ├── BulletStrategyFactory.getStrategy(bulletKey, bulletData)
    └── SimulationEngine.simulateOneTTKWithDetail()
```

> ⚠️ 此路径**不走 `FastTTK`**，直接调 `SimulationEngine`。

### 4.5 推荐链路（RecEngine + TTKMatrix）

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
        ├── computeTTKMatrix()
        │     └── TTKMatrix.buildAllMatrix()
        └── _buildRecommendationsFromMatrix()
```

### 4.6 假想敌创建链路（v3）

```
createEnemy(index)  ← 添加 / 重掷共用
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
  → 组件事件（如 onNameChange）
    → dataStore.updateBullet / updateWeapon / updatePriceConfig
      → DataManager.updateXXX
        ├── Object.assign（写入 this.data）
        └── markWeaponModified（追踪修改）
    → dataStore.refreshBullets / refreshWeapons / refreshPrices
      → dataState.xxx = [...dm.getXxx()]  # 新数组引用触发响应式
    → emit('update') 通知父组件
```

### 4.8 参数导出/导入链路（v3）

**导出**：

```
ParamsPanel 「📤 导出数据」
  → App.vue exportData()
    → showConfirm
    → dataStore.exportData({ params: { ...paramsStore.state } })
      → dm.exportToFile(null, extra)
        → dm.exportToJSON(extra)
          → output = { ...serialized, params }   // ⭐ 含参数
```

**导入**：

```
ParamsPanel 「📥 导入数据」
  → App.vue importData()
    → showConfirm
    → FileReader
    → dataStore.importData(jsonStr)  → { data, params }
    → dataStore.refreshWeapons() / ...
    → if (params) paramsStore.updateAll(params)   // ⭐ 恢复参数
```

**启动时自动应用**：

```
App.vue onMounted
  → const { params } = await dataStore.loadData()
  → if (params) paramsStore.updateAll(params)
```

### 4.9 缓存失效链路

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
  → App.vue resetData() 里调 clearMatrix()
    → IndexedDB 清空
```

> ⚠️ **防御侧 ID 含 distance + hitRate**（v6 修复），改距离会正确失效。

---

## 5. 数据结构（data.json）

### 5.1 顶层

```json
{
  "version": "1.0",
  "updatedAt": "2026-09-18",
  "meta": { ... },
  "params": { ... },     // ⭐ 可选：页面顶部参数快照
  "weapons": [...],
  "bullets": [...],
  "prices": [...],
  "armors": [...]
}
```

> ⚠️ **不再有 `ttkCache` 顶层字段**。旧版导出的 JSON 里可能残留，导入时 `normalizeData` 会删除它。

### 5.2 `params`（v3 新增，可选）

```json
"params": {
  "bulletLevel": 4,
  "armorLevel": 4,
  "armorValue": 110,
  "helmetLevel": 4,
  "helmetValue": 48,
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
- **部分覆盖**：`paramsStore.updateAll(params)` 是 `Object.assign`，只覆盖 `params` 里出现的字段
- **导出时包含**：点「📤 导出数据」会写入当前 `paramsStore.state`

### 5.3 武器对象

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

### 5.4 子弹对象

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

### 5.5 价格配置

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

### 5.6 护甲/头盔对象

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

### 5.7 IndexedDB 结构

**数据库**：`df-ttk`（`TTKIndexedDB.js`）
**版本**：`2`
**ObjectStore**：

1. `ttk-matrix`（keyPath: `id`）— TTK 矩阵
2. `rec-panel-state`（keyPath: `id`）— 配装面板状态（假想敌 + 预算）

**`ttk-matrix` 记录结构**：

```js
{
  id: string,          // 唯一 ID
  ttk: number,         // TTK（ms）
  shots: number,       // 期望射击数
  hits: number,        // 期望命中数
  meta: object,        // 附加信息
  cachedAt: number,
}
```

**ID 格式**（v6）：

| 类型 | 格式 |
|---|---|
| `atk_*` | `atk_{weaponId}_{configId}_{bulletId}_a{armorLv}v{armorVal}_h{helmetLv}v{helmetVal}_d{distance}_{scenarioHash}` |
| `def_*` | `def_{enemyWeaponId}_{enemyConfigId}_{enemyBulletId}_a{ourArmorLv}v{ourArmorVal}_h{ourHelmetLv}v{ourHelmetVal}_d{distance}_hr{hitRate}_{scenarioHash}` |

> ⚠️ **防御侧 ID 含 `d{distance}` 和 `hr{hitRate}`**（v6 新增）。

**`rec-panel-state` 记录结构**：

```js
{
  id: 'default',       // 固定单条
  version: 1,          // 数据结构版本号
  enemies: Array,      // 假想敌列表（最多 6 个）
  budget: number,      // 全局预算（万）
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
→ simpleHash() → 36 进制短码
```

**批量写入**：`BATCH_SIZE = 200`。

**`MATRIX_VERSION = 6`**。

---

## 6. 模块 API 速查

### 6.1 `DataManager`（`src/core/DataManager.js`）

单例：`getDataManager()`。

> ⚠️ **v3 签名变更**：
> - `loadFromJSON` 返回 `{ data, params }`
> - `exportToJSON` / `exportToFile` 支持 `extra` 参数
> - `importFromJSON` / `importFromFile` 返回 `{ data, params }`

#### 数据加载

| 方法 | 说明 |
|---|---|
| `loadFromJSON(url)` | **返回 `{ data, params }`**；`params` 来自 `data.json` 顶层 `params` 字段 |
| `validateData(data)` | 校验格式 |
| `normalizeData(data)` | 规范化（**丢弃 `params` 等未知字段**） |

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
| `getBulletByCaliberAndLevel(caliber, level, includeDisabled=false)` | 按口径+等级查 |
| `getBulletsByCaliber(caliber, includeDisabled=false)` | 按口径查 |
| `getNextBulletId(caliber)` | 生成下一个子弹 ID |
| `getBulletDisplay(bullet)` | 显示字符串 |
| `getDefaultBullet(caliber, level)` | 默认子弹 |
| `getBulletRows()` | 子弹行 |
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
| `getMuzzleBonuses(muzzleId)` | 枪口加成 |
| `getMuzzleNames()` | 枪口名列表 |

#### 数据获取 - 价格

| 方法 | 说明 |
|---|---|
| `getPrices()` | 全部价格配置 |
| `getPriceByWeaponId(weaponId)` | 按武器 ID 查 |
| `getPriceRowsForWeapon(weaponId)` | 解析配置 |
| `getPriceRows()` | 全部解析后的配置行 |
| `getHitRateForDistance(...)` | 命中率（单武器） |
| `getHitRateFromMap(hitRateMap, distance, fallback)` | 命中率（通用） |
| `getNextConfigId(weaponId)` | 生成下一个配置 ID |

#### 数据更新（武器 / 子弹 / 护甲 / 价格）

同旧版（`updateWeapon` / `updateBullet` / `updateArmor` / `updatePriceConfig` 等）。

#### 修改追踪

同旧版（`markWeaponModified` / `isWeaponModified` / `clearAllModified` 等）。

#### 导出 / 导入 / 重置（v3 签名）

| 方法 | 说明 |
|---|---|
| `exportToJSON(extra = {})` | **`extra.params` 会被写入导出顶层 `params` 字段** |
| `exportToFile(filename = null, extra = {})` | 同上 |
| `importFromJSON(jsonStr)` | **返回 `{ data, params }`**；老文件无 `params` → `null` |
| `importFromFile(file)` | **返回 `{ data, params }`** |
| `resetToOriginal()` | 重置为初始状态 |
| `hasUnsavedChanges()` | 是否有未保存修改 |
| `getStats()` | 统计信息 |

### 6.2 `FastTTK`（`src/core/FastTTK.js`）

**统一计算入口**。同旧版，**无签名变化**。

| 方法 | 说明 |
|---|---|
| `computeTTK(options)` | 单次 TTK（async），按 `options.mode` 分发 |
| `computeTTKFast(options)` | 同步版，强制走 DP |
| `computeTTKPrecise(options)` | async，走蒙特卡洛 |
| `computeTTKMatrix(options)` | 转发到 `TTKMatrix.buildAllMatrix` |
| `queryAttackTTK(options)` | 转发到 `TTKMatrix.getAttackTTK` |
| `queryDefenseTTK(options)` | 转发到 `TTKMatrix.getDefenseTTK` |
| `queryMatrixStats()` | 转发到 `TTKMatrix.getMatrixStats` |
| `clearMatrix()` | 转发到 `TTKMatrix.clearMatrixCache` |
| `getModeDescription(mode)` | 模式中文描述 |
| `getDefaultMode()` | 返回 `'fast'` |

### 6.3 `TTKDP`（`src/core/TTKDP.js`）

DP 引擎，纯函数，无状态。

| 导出 | 说明 |
|---|---|
| `computeTTKWithDP(options)` | 主入口，返回 `{ ttk, shots, hits, debug }` |

**常量**：
- `PART_HEAD = 0` / `PART_CHEST = 1` / `PART_STOMACH = 2` / `PART_LIMBS = 3`
- `MAX_STATES = 3_000_000`

### 6.4 `TTKMatrix`（`src/core/TTKMatrix.js`）

矩阵预计算 + IndexedDB 持久化。**v6 签名变化见下**。

| 方法 | 说明 |
|---|---|
| `buildAllMatrix({...})` | 构建完整矩阵 |
| `buildAttackMatrix({...})` | 只构建攻击侧 |
| `buildDefenseMatrix({...})` | 只构建防御侧 |
| `getAttackTTK({...})` | 查攻击侧 TTK |
| **`getDefenseTTK({...})`** | 查防御侧 TTK，**v6 新增 `distance` + `hitRate` 参数** |
| `getMatrixStats()` | 转发到 IndexedDB 统计 |
| `clearMatrixCache()` | 转发到 IndexedDB 清空 |
| `makeAttackId({...})` | 生成攻击侧 ID |
| **`makeDefenseId({...})`** | 生成防御侧 ID，**v6 新增 `distance` + `hitRate` 参数** |
| `makeScenarioHash(scenario)` | 场景哈希 |
| `getDebugEntry(id)` | 读 debug 记录 |
| `clearDebugMap()` | 清空 debug Map |

**常量**：
- `MATRIX_VERSION = 6`
- `BATCH_SIZE = 200`

### 6.5 `TTKIndexedDB`（`src/core/TTKIndexedDB.js`）

IndexedDB 封装。**无签名变化**。

| 方法 | 说明 |
|---|---|
| `getMatrixEntry(id)` | 读单条 |
| `setMatrixEntry(id, data)` | 写单条 |
| `setMatrixEntries(entries)` | 批量写 |
| `deleteMatrixEntry(id)` | 删单条 |
| `clearMatrix()` | 清空全部 |
| `getAllMatrixIds()` / `getAllMatrixEntries()` / `getMatrixCount()` / `getMatrixStats()` | 统计 |
| **`saveRecPanelState(state)`** | 保存配装面板状态 |
| **`loadRecPanelState()`** | 读取配装面板状态 |
| **`clearRecPanelState()`** | 清空配装面板状态 |
| `requestPersistentStorage()` / `closeDB()` | 工具 |

**常量**：
- `DB_NAME = 'df-ttk'`
- `DB_VERSION = 2`
- `STORE_NAME = 'ttk-matrix'`
- `REC_PANEL_STORE_NAME = 'rec-panel-state'`

### 6.6 `SimulationEngine`（`src/core/SimulationEngine.js`）

蒙特卡洛引擎。**无签名变化**。

### 6.7 `CombatCore`（`src/core/CombatCore.js`）

**无签名变化**。

### 6.8 `RecEngine`（`src/core/RecEngine.js`）

单例：`getRecEngine(dataManager)`。

| 方法 | 说明 |
|---|---|
| `recommend(input, options)` | 执行推荐，返回 `{ recommendations, log, _debug }` |
| `exportResult(result, input, options)` | 导出推荐结果 JSON |
| `printResult(result)` | 控制台打印结果 |

**v6 修复**：`_buildRecommendationsFromMatrix` 里查防御侧时必须传 `distance` + `hitRate`（与 `TTKMatrix.buildDefenseMatrix` 一致）。

### 6.9 `stores`（`src/stores/stores.js`）

**v3 签名变化**：

| 方法 | 说明 |
|---|---|
| `dataStore.loadData()` | **返回 `{ params }`**；`dm.isLoaded === true` 时返回 `{ params: null }` |
| `dataStore.exportData(extra = {})` | **支持 `extra` 参数**（透传给 `dm.exportToFile`） |
| `dataStore.importData(jsonStr)` | **返回 `{ data, params }`**（透传 `dm.importFromJSON`） |
| 其他 | 同旧版 |

**`paramsStore`**：

| 成员 | 说明 |
|---|---|
| `state` | readonly state |
| `hitRate` | getter |
| `update(key, value)` / `updateAll(newParams)` | 更新 |
| `updateHitRateMap(raw)` | 解析命中率字符串 |
| `reset()` | 重置为默认 |

**`appStore`**：同旧版。

### 6.10 `weaponCalc`（`src/utils/weaponCalc.js`）

**无签名变化**。

---

## 7. 组件 API 速查

### 7.1 主流程

```
App.vue
  └── AppLayout
        ├── ParamsPanel（emits: calculate / export-data / import-data / reset-data）
        ├── charts-area
        │     ├── TTKChart（ref=barChartRef，含放大按钮）
        │     └── DistanceChart（ref=lineChartRef，含放大按钮）
        └── 表格区（Tab）
              ├── WeaponTable
              ├── ItemsPanel
              │     ├── BulletTable
              │     └── ArmorTable（armor / helmet）
              └── RecPanel

弹窗：
  ├── BarrelEditor
  ├── WeaponBaseEditor
  ├── DamageDetailModal
  └── ConfirmDialog
```

### 7.2 `App.vue` 核心方法

| 方法 | 说明 |
|---|---|
| `handleCalculate()` | **v3：先 handleDistanceChart → 再提取柱状图数据 → computeHavocCosts** |
| `handleDistanceChart()` | **内部函数，返回 `stats`** |
| `buildArmedWeapons(configs)` | 构建"武装后"武器 |
| `buildDistanceStats(armed, attachments)` | 折线图统计（101 点） |
| `computeSingleTTK(weapon, attachment, params, dm)` | 单点 TTK 计算 |
| `updateSingleWeaponTTK(weaponId, onProgress)` | 单枪更新 |
| `onUpdateWeaponTTK({ weaponId })` | 单枪更新事件处理 |
| `computeHavocCosts(enabledConfigs, dm, params)` | 哈弗币消耗 |
| `exportData()` | **v3：组装 `{ params: {...} }` 传给 `dataStore.exportData`** |
| `importData()` | **v3：接收 `{ data, params }`，`params` 非空时写 `paramsStore`** |
| `resetData()` | 重置数据 + 清空矩阵缓存 + 清空假想敌状态 |
| `toggleExpand(which)` | **v3 新增：图表放大/还原** |

**provide**：`showConfirm(options)` / `showAlert(message, title)`。

### 7.3 `ParamsPanel.vue`

**emits**：`calculate` / `export-data` / `import-data` / `reset-data`（**v3 删除 `distance-chart`**）。

### 7.4 `TTKChart.vue` / `DistanceChart.vue`

**新增 `defineExpose`**：

```js
defineExpose({
  resize: () => chartInstance?.resize(),
  update: updateChart
})
```

### 7.5 `RecPanel.vue`

**依赖**：`dataStore` / `paramsStore`。

**常量**（v3）：

- `MAX_ENEMIES = 6`（**从 3 改为 6**）
- `DEFAULT_BUDGET_W = 100`
- `DEFAULT_CARRY_COUNT = 120`

**核心方法**：

| 方法 | 说明 |
|---|---|
| `runRecommend()` | 推荐主入口 |
| `createEnemy(index)` | **v3：统一入口（async）**，优先从推荐池挑，池用尽刷新推荐池 |
| `addEnemy()` | 添加假想敌（async） |
| `rerollEnemy(index)` | 重掷假想敌（async，临时排除自己） |
| `addAsEnemy(rec)` | 从推荐结果直接添加 |
| `pickFromRecommendations(recs, options)` | **v3：从推荐池挑，支持 `excludeKeys` / `skipFilter`** |
| `buildEnemyFromRec(rec)` | **v3 新增：从推荐结果组装假想敌** |
| `refreshRecommendations()` | **v3 新增：刷新推荐池** |

**假想敌卡片颜色**：6 种（红 / 橙 / 紫 / 蓝 / 绿 / 青）。

**卡片宽度**：自适应 `flex: 1 1 280px; max-width: 340px`。

---

## 8. 常见任务（AI 改代码时先看这里）

### 8.1 加一个新武器 / 子弹 / 配件字段

同旧版。

**如果影响 TTK**：递增 `TTKMatrix.js` 的 `MATRIX_VERSION`。

### 8.2 改伤害公式

**必须同时改两处**：

1. `CombatCore.js` 的 `BaseDamageCalculator.calculate` 或 `ArmorDamageCalculator.calculate`
2. `TTKDP.js` 的 `calcDamage`

然后递增 `MATRIX_VERSION`（v6 → v7）。

### 8.3 改连发偏置 / 分段射速语义

同旧版。

### 8.4 改缓存 key

1. 改 `TTKMatrix.js` 的 `makeAttackId` / `makeDefenseId` / `makeScenarioHash`
2. 改 `RecEngine.js` 的 `_makeScenarioHash`（转发，无需改）
3. **递增 `MATRIX_VERSION`**

> ⚠️ **v6 教训**：`makeDefenseId` 曾漏了 `distance` / `hitRate`，导致改距离后命中旧缓存。

### 8.5 改假想敌创建逻辑

改 `RecPanel.vue` 的：

- `createEnemy`（统一入口）
- `pickFromRecommendations`（去重逻辑）
- `buildEnemyFromRec`（组装逻辑）
- `refreshRecommendations`（池刷新）

**改动要点**：

- `usedKeys` 是**实时从 `enemies.value` 算**的，不要维护持久变量
- 池用尽时**先刷新池**，再 `skipFilter: true` 挑
- `rerollEnemy` 要**临时排除自己**

### 8.6 改参数导出/导入

涉及三个文件（**必须一起改**）：

1. `DataManager.js`：`exportToJSON(extra)` / `importFromJSON` 返回值
2. `stores.js`：`dataStore.exportData(extra)` / `dataStore.importData`
3. `App.vue`：`exportData()` 组装 / `importData()` 应用

### 8.7 改图表布局 / 放大按钮

改 `App.vue`：

- `.charts-area` 的 `grid-template-columns` 和 `.has-expanded`
- `.chart-wrapper` 的 `transition`
- `.charts-area .chart-wrapper:not(.is-expanded) .chart-container` 的高度覆盖
- `toggleExpand` 的 `resize()` 时机

**注意事项**：

- `.charts-area` 的 `<style>` **非 scoped**（全局），可覆盖子组件 `.chart-container`
- `resize()` 要在**过渡结束后**再调（`setTimeout(300)`）

### 8.8 改假想敌上限

改 `RecPanel.vue` 的 `MAX_ENEMIES` 常量。**所有引用它的地方自动跟着变**。

**同时改**：

- 卡片颜色（`.enemy-card[data-index]`）需要补对应数量
- 卡片宽度（`flex: 1 1 280px`）可能需要调小

### 8.9 加一个新 Tab / 图表 / 护甲

同旧版。

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
- **IndexedDB 累积**：推荐侧矩阵缓存跨会话累积，长时间不清理会变大
- **两套偏置/间隔实现**：`CombatCore.HitPartSelector.selectWithBias` 与 `TTKDP.applyBurstBias`；`SimulationEngine._getIntervalAfterShot` 与 `TTKDP.getShotIntervalMs`
- **两份 scenarioHash 实现**：`RecEngine._makeScenarioHash` 与 `TTKMatrix.makeScenarioHash`
- **`App.vue` 逻辑重复**：`computeHavocCosts` / `updateSingleWeaponTTK` / `buildDistanceStats` 里各有一份 TTK 分解 + 哈弗币公式的副本
- **`assets/libs/` 里的 Chart.js**：疑似死资源（项目用 ECharts），未确认
- **⭐ 假想敌上限 6**：推荐矩阵条目翻倍，首次推荐会明显变慢（约 2 倍时间）
- **⭐ `refreshRecommendations` 会替换 `recommendations.value`**：推荐面板（Top 3 + 表格）会一起刷新

### 9.2 待办

- [ ] 加单元测试（当前无测试）
- [ ] 抽公共函数：把 `App.vue` 里重复的 TTK 分解 / 哈弗币公式 / 加权平均抽到 `utils/`
- [ ] 统一 `TTKDP` 与 `CombatCore` 的偏置/间隔语义
- [ ] 统一 `RecEngine._makeScenarioHash` 与 `TTKMatrix.makeScenarioHash`
- [ ] 确认 `assets/libs/` 的两个 Chart.js 文件是否可删
- [ ] 清理 `data.json` 的 `meta.note` 里重复的文案
- [ ] **考虑把假想敌 6 个的推荐分批计算**（先 3 个，用户点"继续"再算后 3 个）
- [ ] **考虑把参数快照（`params`）纳入 `data.json` 的默认值**，首次启动就带一套自定义参数

---

## 10. 版本历史

### v1.2.0（体验优化 + 假想敌质量对齐）

**布局优化**：
- 图表默认**并排**（grid 1fr 1fr），更矮（16:9 / 260px）
- 新增**放大按钮**（PC only）：点击后图表铺满整行，另一个隐藏
- 放大时高度恢复 2:1 / 420px
- 移动端：单列，隐藏放大按钮

**计算流程合并**：
- 「计算 TTK」和「生成折线图」两个按钮**合并**为一个
- 新流程：**先生成折线图（101 点）→ 从折线图数据提取柱状图数据**（params.distance 那个点）
- 柱状图和折线图数据**天然一致**

**参数导出/导入**：
- `DataManager.loadFromJSON` 返回 `{ data, params }`
- `DataManager.exportToJSON` / `exportToFile` 支持 `extra.params`
- `DataManager.importFromJSON` / `importFromFile` 返回 `{ data, params }`
- `dataStore.loadData()` 返回 `{ params }`
- `dataStore.exportData(extra)` / `dataStore.importData` 透传
- **启动时自动应用** `data.json` 里的 `params`
- **导出时包含** `params` 快照

**假想敌质量对齐**：
- `createEnemy` 统一入口：优先从推荐池挑（质量高，真实 `carryCount`）
- 推荐池用尽 → `refreshRecommendations`（随机临时假想敌 → 跑推荐 → 新 top30）
- 去重 key：`weaponId + configId`
- 重掷时**临时排除自己**

**假想敌上限**：
- `MAX_ENEMIES = 3` → `6`
- 卡片颜色：3 种 → **6 种**（红 / 橙 / 紫 / 蓝 / 绿 / 青）
- 卡片宽度：固定 320px → **自适应**（280~340px）

**缓存 ID 修复（v5 → v6）**：
- `makeDefenseId` 加入 `distance` + `hitRate`
- **修复**：改假想敌距离后，防御侧命中旧缓存，TTK 用错距离
- `MATRIX_VERSION` 5 → 6

**文件数变化**：不变（34 个）

### v1.1.0（计算架构迁移）

同旧版。

### v1.0.0（合并重构后）

同旧版。

### v0.x（重构前）

同旧版。

---

## 11. 附录

### 11.1 文件数预算

| 目录 | v0.x | v1.0.0 | v1.1.0 | v1.2.0 |
|---|---|---|---|---|
| `src/components/` | 17 | 13 | 13 | 13 |
| `src/core/` | 8 | 6 | 8 | 8 |
| `src/stores/` | 3 | 1 | 1 | 1 |
| `src/utils/` | 5 | 1 | 1 | 1 |
| `src/styles/` | 1 | 1 | 1 | 1 |
| `src/` 根 | 2 | 2 | 2 | 2 |
| `public/` | 1 | 1 | 1 | 1 |
| 根目录 | 7 | 7 | 7 | 7 |
| **合计** | **44** | **32** | **34** | **34** |

### 11.2 v1.2.0 关键决策记录

**为什么 `loadFromJSON` 返回 `{ data, params }`？**

- 与 `importFromJSON` 对齐，语义一致
- `normalizeData` 会丢弃未知字段（含 `params`），所以必须在 `normalizeData` 之前提取

**为什么 `createEnemy` 优先从推荐池挑？**

- 首次推荐的假想敌来自推荐池（高质量，真实 `carryCount`）
- 手动添加/重掷曾用纯随机采样（低质量，固定 120 发）
- 统一为「有推荐池就用推荐池」，对齐质量

**为什么推荐池用尽要刷新？**

- 推荐池 = top30，最多 30 个不重复的武器配置
- 用户反复重掷超过 30 次 → 全部用过 → 需要新池
- 刷新 = 随机临时假想敌 → 跑推荐 → 新 top30

**为什么 `MAX_ENEMIES` 从 3 改到 6？**

- 界面空间允许
- 6 种卡片颜色区分
- 代价：推荐矩阵条目翻倍，首次推荐变慢

**为什么不用 `:has()` 而用 `.has-expanded` 动态 class？**

- `:has()` 兼容性（Chrome 105+ / Safari 15.4+ / Firefox 121+）
- 动态 class 兼容所有现代浏览器

**为什么 `resize()` 用 `setTimeout(300)` 而不是 `transitionend`？**

- `transitionend` 可能因快速切换不触发
- `setTimeout(300)` 简单可靠（0.25s 过渡 + 50ms 缓冲）

### 11.3 调试脚本

| 脚本 | 说明 |
|---|---|
| `tree.py` | 生成目录树 |
| `collect_files.py` | 收集文件内容（用于 AI 上下文） |
| `verify_merge.py` | 检查旧 import 残留 |
| `migrate_structure.py` | 目录结构调整（已执行） |

### 11.4 授权

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

### 11.5 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准

---

**文档版本**：1.2.0
**最后更新**：2026-09-18
**对应代码版本**：v1.2.0（布局优化 + 参数导入导出 + 假想敌质量对齐）
````

## 本次 README 更新的重点

| 章节 | 更新内容 |
|---|---|
| **0.3 数据流** | 新增「假想敌创建链路」 |
| **0.6 数据规模** | 补充「可选 `params`」 |
| **2.9 `MATRIX_VERSION`** | `5` → `6`，补充 v6 说明 |
| **2.10 图表布局** | **新增**（放大按钮 + 单列切换） |
| **2.11 假想敌创建** | **新增**（双轨来源 + 推荐池刷新 + MAX_ENEMIES=6） |
| **4.2 TTK 计算链路** | 更新为「先折线图 → 再提取柱状图」 |
| **4.6 假想敌创建链路** | **新增** |
| **4.8 参数导出/导入** | **新增** |
| **4.9 缓存失效** | 补充防御侧 ID 含 distance + hitRate |
| **5.1 顶层** | 补充 `params` 字段 |
| **5.2 `params`** | **新增** |
| **5.7 IndexedDB** | ID 格式更新（含 `hr`）；`DB_VERSION = 2` |
| **6.1 DataManager** | `loadFromJSON` / `exportToJSON` / `importFromJSON` 新签名 |
| **6.4 TTKMatrix** | `makeDefenseId` / `getDefenseTTK` 新签名 |
| **6.9 stores** | `loadData` / `exportData` / `importData` 新签名 |
| **7.2 App.vue** | `handleCalculate` / `handleDistanceChart` / `exportData` / `importData` / `toggleExpand` 更新 |
| **7.5 RecPanel** | 补充 `createEnemy` / `pickFromRecommendations` / `buildEnemyFromRec` / `refreshRecommendations` / `MAX_ENEMIES = 6` |
| **8.4 ~ 8.8** | 补充假想敌、参数、图表、上限的常见任务 |
| **9.1 已知限制** | 补充假想敌 6 个、`refreshRecommendations` 替换池 |
| **9.2 待办** | 补充分批计算、`params` 默认值 |
| **10 版本历史** | **新增 v1.2.0** |
| **11.2 决策记录** | **新增**（6 条关键决策） |

**文档版本**：1.2.0
**最后更新**：2026-09-18

有其他需要调整的地方随时说。