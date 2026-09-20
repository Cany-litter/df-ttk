我先把这轮所有改动梳理一遍，再输出完整 README。

## 本轮改动（v1.3.0）

| 类别 | 改动 |
|---|---|
| **数据** | `data.json` 新增 `otherItems` 数组 |
| **DataManager** | 新增 `otherItems` 相关方法 + `normalizeData` 规范化 + 导出排序 |
| **stores** | 新增 `otherItems` state + `refreshOtherItems()` + CRUD 转发 |
| **组件** | **新增 `OtherItemsTable.vue`**；`ItemsPanel.vue` 新增第 4 个子 tab |
| **文件数** | 34 → **35** |

---

````markdown
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

其他物品链路（v5）：
  OtherItemsTable.vue
    └─ dataStore.state.otherItems
         └─ DataManager 的 CRUD（addOtherItem / updateOtherItem / removeOtherItem）
              └─ 不参与 TTK 计算，仅展示
```

**关键点**：
- **`FastTTK` 是唯一计算入口**，对外只暴露 `computeTTK({ mode })`；内部按模式分发到 DP 或蒙特卡洛
- **`TTKDP.js` 是主流程引擎**（快、精确、无随机性），所有批量计算/矩阵/折线图/单枪更新都走它
- **`SimulationEngine.js` 只用于两处**：① `FastTTK` 的 `'precise'` 模式；② `DamageDetailModal` 的逐发明细记录（`simulateOneTTKWithDetail`）
- **`TTKMatrix` + `TTKIndexedDB` 是推荐侧缓存**，与主流程的 `ttkCache` 无关（后者已删除）
- **`CombatCore` 是底层**（常量 / RNG / 伤害计算器 / 子弹策略），无外部依赖
- **假想敌来源双轨**：有推荐结果时从推荐池挑（质量高、带真实 `carryCount`），无推荐结果时随机采样（回退）
- **`otherItems` 是纯展示数据**，不参与 TTK 计算、矩阵缓存、推荐

### 0.4 文件数（配额内 35 个）

| 目录 | 数量 |
|---|---|
| `src/components/` | 14 |
| `src/core/` | 8 |
| `src/stores/` | 1 |
| `src/utils/` | 1 |
| `src/styles/` | 1 |
| `src/` 根（`App.vue` + `main.js`） | 2 |
| `public/` | 1 |
| 根目录 | 7 |
| **合计** | **35** |

> **不计入配额**：`assets/`（5 个）、`.github/workflows/deploy.yml`、`collect_files.py`、`tree.py`、`verify_merge.py`、`migrate_structure.py`、`add_other_items.py`、`node_modules/`。
> 配额上限 50，当前 35，留出 15 个额度。

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
- **其他物品**：5 件（背包 / 胸挂 / 治疗 / 维修 / 其他 各 1 条示例）
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
│   ├── components/                     (14)
│   │   ├── AppLayout.vue
│   │   ├── ParamsPanel.vue
│   │   ├── TTKChart.vue
│   │   ├── DistanceChart.vue
│   │   ├── WeaponTable.vue
│   │   ├── ItemsPanel.vue
│   │   ├── BulletTable.vue
│   │   ├── ArmorTable.vue
│   │   ├── OtherItemsTable.vue         ⭐ v5 新增
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
├── migrate_structure.py                [不计配额]
└── add_other_items.py                  [不计配额]

配额内合计：1 + 14 + 8 + 1 + 1 + 1 + 2 + 7 = 35
```

### 1.2 每个文件职责

#### `src/components/`（14 个）

| 文件 | 职责 | 关键 props / emits |
|---|---|---|
| `AppLayout.vue` | 页面布局（Header + slot + Footer） | 无 props，用 `<slot />` 承载中间内容 |
| `ParamsPanel.vue` | 参数面板 + 操作按钮 | emits: `calculate` / `export-data` / `import-data` / `reset-data` |
| `TTKChart.vue` | TTK 堆叠柱状图（5 段分解） | props: `results` / `params` / `displayCount`；暴露 `resize()` |
| `DistanceChart.vue` | 距离-TTK 折线图 | props: `stats` / `distances` / `highlightWeapon` / `displayCount` / `segment`；暴露 `resize()` |
| `WeaponTable.vue` | 枪械数据表（卡片式，含秒伤、配置列表、搜索/排序/筛选） | props: `data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`；emits: `update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk` |
| `ItemsPanel.vue` | 弹甲数据容器（子 Tab：子弹 / 护甲 / 头盔 / **其他物品**） | props: `caliberOptions`；emits: `update` |
| `BulletTable.vue` | 子弹数据表 | props: `data` / `caliberOptions` / `levelOptions`；emits: `update` / `add-bullet` / `delete-bullet` |
| `ArmorTable.vue` | 护甲/头盔数据表（用 `type` 区分） | props: `data` / `type`（`'armor'` / `'helmet'`）；emits: `update` |
| **`OtherItemsTable.vue`** ⭐ | **其他物品数据表（背包 / 胸挂 / 治疗 / 维修 / 其他）** | **props: `data`；emits: `update`** |
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
| `App.vue` | 主容器：布局 + 图表 + 表格 + 弹窗 + 全局计算逻辑 + 滚动按钮 |
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
- v5 → v6：修复防御侧缓存 ID 未含 distance / hitRate 的 bug

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
- `.chart-wrapper` 的 `transition` 只过渡 `box-shadow` / `border-color`，不过渡尺寸

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

### 2.12 其他物品（v5）

**性质**：不参与 TTK 计算、矩阵缓存、推荐，**仅展示**。

**类别**（枚举）：

| category | 说明 | 示例 |
|---|---|---|
| `背包` | 容量、负重 | GA野战背包 |
| `胸挂` | 容量、格子布局 | DSA战术胸挂 |
| `治疗` | 回血、止痛、手术 | 户外医疗箱 |
| `维修` | 修复护甲/头盔/武器 | 精密护甲维修包 |
| `其他` | 兜底 | 保险箱 |

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 ID，格式 `other_${序号}` |
| `name` | string | 名称 |
| `category` | string | 类别（枚举） |
| `price` | number | 价格（哈弗币，显示时 `/ 10000` 成 W） |
| `description` | string | 说明 |
| `enabled` | boolean | 是否启用（默认 true） |

**ID 生成规则**：`other_${max(现有序号) + 1}`；如果现有 ID 都不是 `other_数字` 格式，用时间戳兜底。

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

`getHitRateFromMap()` 的规则：

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

### 3.6 综合评分（假 TTK）

```js
假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间

// 默认 aimWeight = 0.4（40%）
```

### 3.7 DP 状态机（TTKDP 核心）

`TTKDP.js` 用一个 `Map` 做记忆化，状态键：

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

App.vue onMounted
  ├── dataStore.loadData()
  │     └── DataManager.loadFromJSON('./data.json')  → { data, params }
  │           ├── fetch + validateData
  │           ├── ⭐ 提取 params（normalizeData 之前）
  │           ├── normalizeData（规范化 ranges/bullets/configs/armors/otherItems）
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
createEnemy(index, excludeIndex = -1)  ← 添加 / 重掷共用
  ├── recommendations.value 存在：
  │     ├── usedKeys = 当前假想敌的 (weaponId + configId) 集合
  │     │              （排除 excludeIndex 指向的那个）
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

> ⭐ **v4 修复**：`rerollEnemy` 不再清空 `enemies`（避免触发空状态 v-if），改为原地 `splice` 替换。

### 4.7 其他物品链路（v5）

```
OtherItemsTable.vue（展示 + 编辑）
  ├── props.data = dataStore.state.otherItems
  ├── 编辑：dm.updateOtherItem(id, updates) → refreshOtherItems() → emit('update')
  ├── 新增：unshift 临时行 → 填写 → confirmAdd → getNextOtherItemId → addOtherItem
  ├── 删除：dm.removeOtherItem(id) → refreshOtherItems()
  └── 启用/禁用：dm.updateOtherItem(id, { enabled }) → refreshOtherItems()

data.json（持久化）
  └── otherItems: [{ id, name, category, price, description, enabled }, ...]
```

**不参与**：

- TTK 计算（不调 `computeTTK`）
- 矩阵缓存（不写 IndexedDB）
- 推荐（不进 `RecEngine`）

### 4.8 数据修改链路

```
用户编辑单元格
  → 组件事件（如 onNameChange）
    → dataStore.updateBullet / updateWeapon / updatePriceConfig / updateOtherItem
      → DataManager.updateXXX
        ├── Object.assign（写入 this.data）
        └── markWeaponModified（追踪修改，仅武器相关）
    → dataStore.refreshBullets / refreshWeapons / refreshPrices / refreshOtherItems
      → dataState.xxx = [...dm.getXxx()]  # 新数组引用触发响应式
    → emit('update') 通知父组件
```

### 4.9 参数导出/导入链路（v3）

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
    → dataStore.refreshWeapons() / ... / refreshOtherItems()
    → if (params) paramsStore.updateAll(params)   // ⭐ 恢复参数
```

**启动时自动应用**：

```
App.vue onMounted
  → const { params } = await dataStore.loadData()
  → if (params) paramsStore.updateAll(params)
```

### 4.10 缓存失效链路

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
  "updatedAt": "2026-09-19",
  "meta": { ... },
  "params": { ... },       // ⭐ 可选：页面顶部参数快照
  "weapons": [...],
  "bullets": [...],
  "prices": [...],
  "armors": [...],
  "otherItems": [...]      // ⭐ v5：其他物品
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

### 5.7 其他物品对象（v5）

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

**字段**：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 唯一 ID，格式 `other_${序号}` |
| `name` | string | 名称 |
| `category` | string | 类别：`背包` / `胸挂` / `治疗` / `维修` / `其他` |
| `price` | number | 价格（哈弗币，显示时 `/ 10000` 成 W） |
| `description` | string | 说明 |
| `enabled` | boolean | 是否启用（默认 true） |

**规范化规则**（`normalizeData`）：

- `id` 缺失 → 自动生成 `other_${时间戳}_${索引}`
- `name` 缺失 → `''`
- `category` 非字符串或空 → `'其他'`
- `price` 字符串 → 转数字；负数或非数字 → `0`
- `description` 缺失 → `''`
- `enabled` 缺失 → `true`

### 5.8 IndexedDB 结构

**数据库**：`df-ttk`（`TTKIndexedDB.js`）
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

**ID 格式**（v6）：

| 类型 | 格式 |
|---|---|
| `atk_*` | `atk_{weaponId}_{configId}_{bulletId}_a{armorLv}v{armorVal}_h{helmetLv}v{helmetVal}_d{distance}_{scenarioHash}` |
| `def_*` | `def_{enemyWeaponId}_{enemyConfigId}_{enemyBulletId}_a{ourArmorLv}v{ourArmorVal}_h{ourHelmetLv}v{ourHelmetVal}_d{distance}_hr{hitRate}_{scenarioHash}` |

> ⚠️ **防御侧 ID 含 `d{distance}` 和 `hr{hitRate}`**（v6 新增）。

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
>
> ⚠️ **v5 新增**：`otherItems` 相关 CRUD

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

#### 数据获取 - 其他物品（v5）

| 方法 | 说明 |
|---|---|
| `getOtherItems(includeDisabled=false)` | 获取所有（默认过滤 `enabled === false`） |
| `getOtherItemsByCategory(category, includeDisabled=false)` | 按类别获取 |
| `getOtherItemById(id)` | 按 ID 查 |
| `getNextOtherItemId()` | 生成下一个 ID（`other_${序号}`） |
| `getOtherItemCategories()` | 返回预定义类别 `['背包', '胸挂', '治疗', '维修', '其他']` |

#### 数据更新 - 其他物品（v5）

| 方法 | 说明 |
|---|---|
| `addOtherItem(itemData)` | 新增 |
| `updateOtherItem(id, updates)` | 更新（禁止改 id） |
| `removeOtherItem(id)` | 删除 |
| `setOtherItemsEnabled(enabled, category=null)` | 批量启用/禁用 |

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

同旧版。

#### 修改追踪

同旧版。

#### 导出 / 导入 / 重置（v3 / v5 签名）

| 方法 | 说明 |
|---|---|
| `exportToJSON(extra = {})` | **`extra.params` 会被写入导出顶层 `params` 字段**；**包含 `otherItems`** |
| `exportToFile(filename = null, extra = {})` | 同上 |
| `importFromJSON(jsonStr)` | **返回 `{ data, params }`**；老文件无 `params` → `null`；**导入 `otherItems`** |
| `importFromFile(file)` | **返回 `{ data, params }`** |
| `resetToOriginal()` | 重置为初始状态（**含 `otherItems`**） |
| `hasUnsavedChanges()` | 是否有未保存修改 |
| `getStats()` | 统计信息（**新增 `otherItemCount`**） |

### 6.2 `FastTTK`（`src/core/FastTTK.js`）

**统一计算入口**。同旧版，**无签名变化**。

### 6.3 `TTKDP`（`src/core/TTKDP.js`）

**无签名变化**。

### 6.4 `TTKMatrix`（`src/core/TTKMatrix.js`）

**v6 签名**：`getDefenseTTK` / `makeDefenseId` 含 `distance` + `hitRate`。

### 6.5 `TTKIndexedDB`（`src/core/TTKIndexedDB.js`）

**无签名变化**。

### 6.6 `SimulationEngine`（`src/core/SimulationEngine.js`）

**无签名变化**。

### 6.7 `CombatCore`（`src/core/CombatCore.js`）

**无签名变化**。

### 6.8 `RecEngine`（`src/core/RecEngine.js`）

**无签名变化**（v6 修复内部实现）。

### 6.9 `stores`（`src/stores/stores.js`）

**v3 签名**：

| 方法 | 说明 |
|---|---|
| `dataStore.loadData()` | **返回 `{ params }`** |
| `dataStore.exportData(extra = {})` | **支持 `extra` 参数** |
| `dataStore.importData(jsonStr)` | **返回 `{ data, params }`** |

**v5 新增**：

| 方法 | 说明 |
|---|---|
| `dataStore.refreshOtherItems()` | **刷新 `otherItems` state** |
| `dataStore.getOtherItems(includeDisabled=false)` | 转发 |
| `dataStore.getOtherItemsByCategory(category, includeDisabled=false)` | 转发 |
| `dataStore.getOtherItemById(id)` | 转发 |
| `dataStore.getNextOtherItemId()` | 转发 |
| `dataStore.addOtherItem(itemData)` | 转发 |
| `dataStore.updateOtherItem(id, updates)` | 转发 |
| `dataStore.removeOtherItem(id)` | 转发 |
| `dataStore.setOtherItemsEnabled(enabled, category=null)` | 转发 |
| `dataStore.getOtherItemCategories()` | 转发 |

**`appStore.switchSubTab(sub)` 白名单**：`['bullet', 'armor', 'helmet', 'other']`

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
              ├── WeaponTable（含搜索/排序/筛选）
              ├── ItemsPanel
              │     ├── BulletTable
              │     ├── ArmorTable（armor / helmet）
              │     └── OtherItemsTable（v5）
              └── RecPanel

弹窗：
  ├── BarrelEditor
  ├── WeaponBaseEditor
  ├── DamageDetailModal
  └── ConfirmDialog

其他：
  └── 滚动悬浮按钮（Teleport to body）
```

### 7.2 `App.vue` 核心方法

| 方法 | 说明 |
|---|---|
| `handleCalculate()` | v3：先 handleDistanceChart → 再提取柱状图数据 → computeHavocCosts |
| `handleDistanceChart()` | 内部函数，返回 `stats` |
| `buildArmedWeapons(configs)` | 构建"武装后"武器 |
| `buildDistanceStats(armed, attachments)` | 折线图统计（101 点） |
| `computeSingleTTK(weapon, attachment, params, dm)` | 单点 TTK 计算 |
| `updateSingleWeaponTTK(weaponId, onProgress)` | 单枪更新 |
| `onUpdateWeaponTTK({ weaponId })` | 单枪更新事件处理 |
| `computeHavocCosts(enabledConfigs, dm, params)` | 哈弗币消耗 |
| `exportData()` | v3：组装 `{ params: {...} }` |
| `importData()` | v3：接收 `{ data, params }` |
| `resetData()` | 重置数据 + 清空矩阵缓存 + 清空假想敌状态 |
| `toggleExpand(which)` | v3：图表放大/还原 |
| `handleScrollBtnClick()` | v4：滚动到顶部 / 返回 |

**provide**：`showConfirm(options)` / `showAlert(message, title)`。

### 7.3 `ParamsPanel.vue`

**emits**：`calculate` / `export-data` / `import-data` / `reset-data`（**v3 删除 `distance-chart`**）。

### 7.4 `TTKChart.vue` / `DistanceChart.vue`

**暴露**：

```js
defineExpose({
  resize: () => chartInstance?.resize(),
  update: updateChart
})
```

### 7.5 `WeaponTable.vue`（v4 新增搜索/排序/筛选）

**props**：`data` / `muzzleOptions` / `getBarrelOptions` / `caliberOptions`

**emits**：`update` / `edit-barrel` / `add-weapon` / `delete-weapon` / `show-damage-detail` / `update-ttk`

**内部状态**：

| 状态 | 说明 |
|---|---|
| `searchQuery` | 搜索词（包含匹配 + 忽略大小写） |
| `filterCaliber` | 口径筛选（`'all'` 或具体口径） |
| `sortKey` | 排序 key |

**排序 key**：

| key | 说明 |
|---|---|
| `default` | 原顺序 |
| `aim_asc` / `aim_desc` | 开镜升/降 |
| `price_asc` / `price_desc` | 价格升/降 |
| `score_asc` / `score_desc` | 评分升/降 |
| `havoc_asc` / `havoc_desc` | 哈弗币升/降 |
| `ttk_asc` / `ttk_desc` | TTK 升/降 |

**排序规则**：

- 卡片级：用"最优配置"（min/max 取决于方向）
- 配置级：卡片内配置也按同一 `sortKey` 排序
- `null` 值排最后

**按钮语义**：

- 有筛选时，「全部启用/禁用/展开/收起」**只对筛选结果生效**
- 文案动态变（`✅ 启用筛选`）

### 7.6 `ItemsPanel.vue`

**props**：`caliberOptions`

**emits**：`update`

**子 Tab**：子弹 / 护甲 / 头盔 / **其他物品（v5）**

### 7.7 `OtherItemsTable.vue`（v5 新增）

**props**：`data`（`dataStore.state.otherItems`，包含禁用的）

**emits**：`update`

**列**：启用 / 名称 / 类别 / 价格 (W) / 说明 / 操作

**类别配色**：

| category | 颜色 |
|---|---|
| 背包 | 绿 |
| 胸挂 | 蓝 |
| 治疗 | 红 |
| 维修 | 橙 |
| 其他 | 灰 |

**编辑**：失焦保存（`@blur` / `@change`）

**新增**：临时行 → 填写 → 确认

### 7.8 `RecPanel.vue`

**常量**：

- `MAX_ENEMIES = 6`
- `DEFAULT_BUDGET_W = 100`
- `DEFAULT_CARRY_COUNT = 120`

**核心方法**：

| 方法 | 说明 |
|---|---|
| `runRecommend()` | 推荐主入口 |
| `createEnemy(index, excludeIndex=-1)` | 统一入口（async），优先从推荐池挑，池用尽刷新推荐池 |
| `addEnemy()` | 添加假想敌（async） |
| `rerollEnemy(index)` | 重掷假想敌（async，v4 不清空 enemies，原地替换） |
| `addAsEnemy(rec)` | 从推荐结果直接添加 |
| `pickFromRecommendations(recs, options)` | 从推荐池挑，支持 `excludeKeys` / `skipFilter` |
| `buildEnemyFromRec(rec)` | 从推荐结果组装假想敌 |
| `refreshRecommendations()` | 刷新推荐池 |

**状态**：

- `rerollingIndex`（v4）：重掷中的假想敌索引（用于按钮 loading + 卡片半透明）

**假想敌卡片颜色**：6 种（红 / 橙 / 紫 / 蓝 / 绿 / 青）

---

## 8. 常见任务（AI 改代码时先看这里）

### 8.1 加一个新武器 / 子弹 / 配件字段

同旧版。**如果影响 TTK**：递增 `MATRIX_VERSION`。

### 8.2 改伤害公式

**必须同时改两处**：

1. `CombatCore.js` 的 `BaseDamageCalculator.calculate` 或 `ArmorDamageCalculator.calculate`
2. `TTKDP.js` 的 `calcDamage`

然后递增 `MATRIX_VERSION`。

### 8.3 改连发偏置 / 分段射速语义

同旧版。

### 8.4 改缓存 key

1. 改 `TTKMatrix.js` 的 `makeAttackId` / `makeDefenseId` / `makeScenarioHash`
2. **递增 `MATRIX_VERSION`**

### 8.5 改假想敌创建逻辑

改 `RecPanel.vue` 的：

- `createEnemy`（统一入口）
- `pickFromRecommendations`（去重逻辑）
- `buildEnemyFromRec`（组装逻辑）
- `refreshRecommendations`（池刷新）

**改动要点**：

- `usedKeys` 是**实时从 `enemies.value` 算**的，不要维护持久变量
- 池用尽时**先刷新池**，再 `skipFilter: true` 挑
- `rerollEnemy` 用 `excludeIndex` 参数排除自己，**不要清空 `enemies`**（会触发空状态闪烁）

### 8.6 改参数导出/导入

涉及三个文件（**必须一起改**）：

1. `DataManager.js`
2. `stores.js`
3. `App.vue`

### 8.7 改图表布局 / 放大按钮

改 `App.vue`。

### 8.8 改假想敌上限

改 `RecPanel.vue` 的 `MAX_ENEMIES` 常量。**同时改**：

- 卡片颜色（`.enemy-card[data-index]`）需要补对应数量
- 卡片宽度（`flex: 1 1 280px`）可能需要调小

### 8.9 加一个新的「其他物品」类别（v5）

1. 改 `DataManager.js` 的：
   - `normalizeData` 里的 `VALID_CATEGORIES`（如果加了校验）
   - `getOtherItemCategories()` 返回值
   - `CATEGORY_ORDER`（导出排序）
2. 改 `OtherItemsTable.vue` 的 `categoryOptions`
3. 改 `OtherItemsTable.vue` 的 `getCategoryClass`（配色）
4. 改样式 `.category-select.cat-xxx`

### 8.10 其他物品批量导入（v5）

可以写一个 py 脚本改 `data.json` 的 `otherItems` 字段（参考 `add_other_items.py`）。

### 8.11 调试

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
- **假想敌上限 6**：推荐矩阵条目翻倍，首次推荐会明显变慢（约 2 倍时间）
- **`refreshRecommendations` 会替换 `recommendations.value`**：推荐面板（Top 3 + 表格）会一起刷新
- **`otherItems` 的 `category` 是枚举**：`背包 / 胸挂 / 治疗 / 维修 / 其他`，加新类别要改多处（见 8.9）

### 9.2 待办

- [ ] 加单元测试（当前无测试）
- [ ] 抽公共函数：把 `App.vue` 里重复的 TTK 分解 / 哈弗币公式 / 加权平均抽到 `utils/`
- [ ] 统一 `TTKDP` 与 `CombatCore` 的偏置/间隔语义
- [ ] 统一 `RecEngine._makeScenarioHash` 与 `TTKMatrix.makeScenarioHash`
- [ ] 确认 `assets/libs/` 的两个 Chart.js 文件是否可删
- [ ] 清理 `data.json` 的 `meta.note` 里重复的文案
- [ ] 考虑把假想敌 6 个的推荐分批计算（先 3 个，用户点"继续"再算后 3 个）
- [ ] 考虑把参数快照（`params`）纳入 `data.json` 的默认值
- [ ] `otherItems` 的类别可以考虑做成"用户可自定义"（当前是固定枚举）

---

## 10. 版本历史

### v1.3.0（其他物品）

**新增「其他物品」数据**：
- `data.json` 顶层新增 `otherItems` 数组
- 字段：`id` / `name` / `category` / `price` / `description` / `enabled`
- 类别枚举：**背包 / 胸挂 / 治疗 / 维修 / 其他**
- 初始 5 条示例（每个类别一条）

**DataManager**：
- 新增 3.7 节：`getOtherItems` / `getOtherItemsByCategory` / `getOtherItemById` / `getNextOtherItemId` / `addOtherItem` / `updateOtherItem` / `removeOtherItem` / `setOtherItemsEnabled` / `getOtherItemCategories`
- `normalizeData` 里新增 `otherItems` 规范化
- 导出时按 `CATEGORY_ORDER` 排序
- `getStats()` 新增 `otherItemCount`

**stores**：
- `dataStore.state.otherItems`
- `refreshOtherItems()`
- 转发 `DataManager` 的 CRUD 方法
- `appStore.switchSubTab` 白名单新增 `'other'`

**组件**：
- **新增 `OtherItemsTable.vue`**（表格 + 卡片，支持编辑/新增/删除/启用禁用）
- `ItemsPanel.vue` 新增第 4 个子 tab「🧰 其他物品」

**辅助脚本**：
- `add_other_items.py`（往 `data.json` 追加 `otherItems`）

**文件数变化**：34 → **35**

### v1.2.0（体验优化 + 假想敌质量对齐）

**布局优化**：
- 图表默认**并排**（grid 1fr 1fr），更矮（16:9 / 260px）
- 新增**放大按钮**（PC only）
- 移动端：单列，隐藏放大按钮

**计算流程合并**：
- 「计算 TTK」和「生成折线图」两个按钮**合并**为一个
- 新流程：先生成折线图（101 点）→ 从折线图数据提取柱状图数据

**参数导出/导入**：
- `DataManager.loadFromJSON` 返回 `{ data, params }`
- `exportToJSON` / `exportToFile` 支持 `extra.params`
- `importFromJSON` / `importFromFile` 返回 `{ data, params }`
- 启动时自动应用 `data.json` 里的 `params`

**假想敌质量对齐**：
- `createEnemy` 统一入口：优先从推荐池挑
- 推荐池用尽 → `refreshRecommendations`
- 去重 key：`weaponId + configId`
- 重掷时**临时排除自己**

**假想敌上限**：3 → 6

**缓存 ID 修复（v5 → v6）**：
- `makeDefenseId` 加入 `distance` + `hitRate`
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

| 目录 | v0.x | v1.0.0 | v1.1.0 | v1.2.0 | v1.3.0 |
|---|---|---|---|---|---|
| `src/components/` | 17 | 13 | 13 | 13 | 14 |
| `src/core/` | 8 | 6 | 8 | 8 | 8 |
| `src/stores/` | 3 | 1 | 1 | 1 | 1 |
| `src/utils/` | 5 | 1 | 1 | 1 | 1 |
| `src/styles/` | 1 | 1 | 1 | 1 | 1 |
| `src/` 根 | 2 | 2 | 2 | 2 | 2 |
| `public/` | 1 | 1 | 1 | 1 | 1 |
| 根目录 | 7 | 7 | 7 | 7 | 7 |
| **合计** | **44** | **32** | **34** | **34** | **35** |

### 11.2 v1.3.0 关键决策记录

**为什么叫「其他物品」而不是「消耗品」？**

- 范围更广：能覆盖背包 / 胸挂 / 治疗 / 维修等
- "消耗品"有歧义（手雷是技能不是物品）

**为什么 `category` 是固定枚举？**

- 避免用户输入不一致（"治疗" / "医疗" / "回血"）
- 固定 5 个：背包 / 胸挂 / 治疗 / 维修 / 其他

**为什么 `otherItems` 不参与 TTK 计算？**

- 它们的属性（容量、修复量）和 TTK 无关
- 不做矩阵缓存 / 推荐，避免无意义的计算

**为什么 ID 用 `other_${序号}`？**

- 和子弹 `caliber#序号` 风格类似
- 人类可读，方便手改 `data.json`

**为什么 `enabled` 字段保留？**

- 和子弹/护甲一致
- 用户可能想"暂时隐藏"某些物品（版本删了、不关心）

**为什么 `rerollEnemy` 要原地 `splice` 而不是清空？**

- 清空会触发 `v-if="enemies.length === 0"`，导致画面闪烁
- 原地替换无闪烁

### 11.3 调试脚本

| 脚本 | 说明 |
|---|---|
| `tree.py` | 生成目录树 |
| `collect_files.py` | 收集文件内容（用于 AI 上下文） |
| `verify_merge.py` | 检查旧 import 残留 |
| `migrate_structure.py` | 目录结构调整（已执行） |
| `add_other_items.py` | 往 `data.json` 追加 `otherItems`（v1.3.0） |

### 11.4 授权

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

### 11.5 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准

---

**文档版本**：1.3.0
**最后更新**：2026-09-19
**对应代码版本**：v1.3.0（其他物品）
````

## 本次 README 更新的重点

| 章节 | 更新内容 |
|---|---|
| **0.1 定位** | 补充"其他物品管理" |
| **0.3 数据流** | 新增「其他物品链路」 |
| **0.4 文件数** | 34 → **35**，`src/components/` 13 → 14 |
| **0.6 数据规模** | 补充 `otherItems` |
| **1.1 目录树** | 新增 `OtherItemsTable.vue` + `add_other_items.py` |
| **1.2 文件职责** | `OtherItemsTable.vue` 行 + `ItemsPanel.vue` 描述更新 |
| **2.12 其他物品** | **新增**（类别、字段、ID 规则） |
| **4.7 其他物品链路** | **新增** |
| **5.1 顶层** | 补充 `otherItems` |
| **5.7 其他物品对象** | **新增** |
| **6.1 DataManager** | 新增 `otherItems` 相关 API |
| **6.9 stores** | 新增 `otherItems` 转发 + `switchSubTab` 白名单 |
| **7.6 ItemsPanel** | 补充第 4 个子 tab |
| **7.7 OtherItemsTable** | **新增** |
| **8.9 / 8.10** | 新增「加新类别」/「批量导入」任务 |
| **9.1 已知限制** | 补充 `otherItems` 的 category 是枚举 |
| **9.2 待办** | 补充 category 用户自定义 |
| **10 版本历史** | **新增 v1.3.0** |
| **11.2 决策记录** | **新增**（6 条关键决策） |

**文档版本**：1.3.0
**最后更新**：2026-09-19

有其他需要调整的地方随时说。