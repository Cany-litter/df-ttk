# Delta Force TTK 计算器 — 完整技术文档

> 三角洲行动武器击杀时间（TTK）模拟与对比工具

一个用于**精确计算、模拟和对比《三角洲行动》中各武器配置击杀时间**的 Web 应用。支持附件加成、分段射速、连发模式、护甲减伤、距离衰减、命中概率分布等完整战斗机制，并提供可视化图表与经济成本估算。

---

## 目录

- [一、功能特性](#一功能特性)
- [二、技术栈](#二技术栈)
- [三、快速开始](#三快速开始)
- [四、项目结构](#四项目结构)
- [五、核心概念](#五核心概念)
- [六、计算逻辑](#六计算逻辑)
- [七、逻辑链路](#七逻辑链路)
- [八、数据结构](#八数据结构)
- [九、缓存机制](#九缓存机制)
- [十、模块说明](#十模块说明)
- [十一、组件说明](#十一组件说明)
- [十二、状态管理](#十二状态管理)
- [十三、性能优化](#十三性能优化)
- [十四、常见问题](#十四常见问题)

---

## 一、功能特性

### 🎯 精确 TTK 模拟
- **蒙特卡洛模拟**：默认 20000 次模拟取平均，结果稳定可复现（固定随机种子）
- **完整战斗机制**：护甲减伤、距离衰减、命中率映射、命中部位分布
- **连发模式**：支持三连发、四连发武器，含连发间隔与连发内部射速
- **分段射速**：支持"前 N 发射速不同"的武器（如 SVCH 前 3 发 +100 射速）
- **单次模拟明细**：可展开逐发明细，查看每发的伤害计算过程

### 📊 可视化对比
- **堆叠柱状图**：TTK 分解为「无空枪射击延迟 + 平均连发间隔 + 平均空枪延迟 + 飞行延迟 + 扳机延迟」五段，每段可独立开关
- **距离-TTK 折线图**：0~100m 全距离 TTK 曲线，支持自定义起止距离分段查看
- **智能排序**：按加权平均 TTK 排序（近距离权重更高）
- **排名高亮**：Top 15% / Top 40% 视觉区分，高亮武器红线加粗

### 💰 经济成本估算
- **哈弗币消耗**：整枪损失 + 子弹消耗（KD 放大 5 倍 × 平均致死枪数 + 其他消耗）
- **颜色预警**：>60W 红色 / >30W 橙色 / 其余绿色
- **悬浮明细**：tooltip 展示整枪损失、子弹消耗、平均致死枪数等

### ⭐ 综合评分（假 TTK）
- **公式**：`假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间`
- **开镜权重可调**：ParamsPanel 中可设置（默认 40%）
- **颜色分档**：按相对排名，前 15% 绿色 / 前 40% 蓝色 / 其余橙色

### 🔧 完整数据管理
- **四类数据表**：价格配置 / 枪械数据 / 子弹数据 / 护甲头盔，全部可编辑
- **枪管编辑器**：可视化编辑枪管的所有属性（射程/衰减/倍率/分段射速/连发字段）
- **基础属性编辑器**：编辑武器名称/类型/口径/射速/初速/肉伤/甲伤/射程/衰减/倍率/连发
- **导入导出**：JSON 格式，可选是否包含缓存
- **修改追踪**：记录被修改的武器，支持增量重算

### 📱 响应式设计
- 桌面端：完整表格 + 卡片布局
- 移动端（≤768px）：自动切换为卡片布局，图表高度自适应

---

## 二、技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite |
| 图表 | ECharts |
| 状态 | 自研轻量 Store（`reactive` + `readonly`） |
| 样式 | 原生 CSS（CSS 变量 + 媒体查询） |
| 语言 | JavaScript (ES Module) |

### 环境要求
- Node.js ≥ 16
- npm / pnpm / yarn

---

## 三、快速开始

```bash
# 安装依赖
npm install

# 开发模式（默认 http://localhost:5173）
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

### 数据文件位置

应用启动时从 **`public/data.json`** 加载数据。首次运行前请确保该文件存在且格式正确。

### 入口初始化流程（`main.js`）

```js
import { getDataManager } from '@/core/DataManager'
import { getConfigCacheManager } from '@/core/ConfigCacheManager'

const dm = getDataManager()                              // 1. 创建 DataManager 单例
const cacheManager = getConfigCacheManager(dm)           // 2. 创建 ConfigCacheManager 并注入
dm.setCacheManager(cacheManager)                         // 3. 双向绑定

createApp(App).mount('#app')                            // 4. 挂载应用
```

---

## 四、项目结构

```
df-ttk/
├── public/
│   └── data.json                    # 统一数据源（武器/子弹/价格/护甲）
├── src/
│   ├── components/                  # Vue 组件
│   │   ├── AppHeader.vue            # 页头
│   │   ├── AppFooter.vue            # 页脚
│   │   ├── ParamsPanel.vue          # 参数面板 + 操作按钮
│   │   ├── WeaponTable.vue          # 枪械数据表（卡片式）
│   │   ├── ItemsPanel.vue           # 弹甲数据容器（子 Tab）
│   │   ├── BulletTable.vue          # 子弹数据表
│   │   ├── ArmorTable.vue           # 护甲/头盔数据表
│   │   ├── BarrelEditor.vue         # 枪管编辑器弹窗
│   │   ├── WeaponBaseEditor.vue     # 武器基础属性编辑器
│   │   ├── TTKChart.vue             # TTK 堆叠柱状图
│   │   ├── DistanceChart.vue        # 距离-TTK 折线图
│   │   ├── DamageDetailModal.vue    # 单次伤害模拟弹窗
│   │   └── EditableCell.vue         # 通用可编辑单元格
│   ├── core/                        # 核心计算逻辑
│   │   ├── SimulationEngine.js      # 模拟引擎
│   │   ├── BulletStrategy.js        # 子弹策略（标准/RIP）
│   │   ├── CombatUtils.js           # 伤害/护甲/命中部位工具
│   │   ├── ConfigCacheManager.js    # 缓存管理 + 插值 + 哈希
│   │   ├── DataManager.js           # 数据管理器（单例）
│   │   └── config.js                # 全局常量
│   ├── stores/                      # 状态管理
│   │   ├── dataStore.js             # 数据响应式封装
│   │   ├── paramsStore.js           # 战斗参数
│   │   └── appStore.js              # UI 状态
│   ├── utils/                       # 工具函数
│   │   ├── weaponCalc.js            # 武器当前属性计算
│   │   ├── formatters.js            # 格式化
│   │   ├── rng.js                   # 种子随机数
│   │   ├── validators.js            # 参数校验
│   │   └── performance.js           # 性能监控
│   ├── styles/
│   │   └── main.css                 # 全局样式 + CSS 变量
│   ├── App.vue                      # 主容器
│   └── main.js                      # 应用入口
├── index.html
├── package.json
└── vite.config.js
```

---

## 五、核心概念

### 5.1 射程分段与距离衰减

武器的 `ranges` 定义 4 个分段点，`decays` 定义 5 段衰减倍率：

```
[0, r1)   → decays[0]
[r1, r2)  → decays[1]
[r2, r3)  → decays[2]
[r3, r4)  → decays[3]
[r4, ∞)   → decays[4]
```

> ⚠️ 边界使用 `<` 而非 `<=`，确保分段不重叠。

**示例（AS Val）**：
```json
"ranges": [27, 54, "Infinity", "Infinity"],
"decays": [1, 0.9, 0.8, 0.8, 0.8]
```
- 0~27m：衰减 1.0
- 27~54m：衰减 0.9
- 54m+：衰减 0.8

### 5.2 伤害计算公式

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

### 5.3 命中部位

| 部位 | 键名 | 说明 |
|---|---|---|
| 头部 | `head` | 受头盔保护 |
| 胸部 | `chest` | 受护甲保护 |
| 腹部 | `stomach` | 受护甲保护 |
| 四肢 | `limbs` | **无视护甲** |

命中概率由 `hitProb` 决定（四项之和应为 1）。

### 5.4 连发模式与部位偏置

连发武器（`fireMode: 'burst'`）的特殊逻辑：

- **第一发**：完全随机选择命中部位
- **后续发**：以 `BURST_BIAS = 0.7` 的概率命中**同一部位**，否则偏移到**相邻部位**（头部↔胸部↔腹部↔四肢）
- **连发间隔**：每进入新连发周期（`shot % burstCount === 1` 且 `shot > burstCount`）插入一次 `burstInterval`
- **连发内部射速**：连发内部使用 `burstInternalROF`，忽略 `rofStages`

### 5.5 分段射速 `rofStages`

```js
// 示例：前 3 个间隔射速 +100，之后 +0
rofStages: [
  { untilShot: 3, rofAdd: 100 },
  { rofAdd: 0 }  // untilShot 缺省 = "之后所有发"
]
```

用于模拟"镀铬爆发枪机"这类前几发射速更快的配件。

**间隔归属规则**：间隔归属"起点发"。`shot=1` → 第 1→2 发之间的间隔。

### 5.6 附件合并规则

**枪管字段 > 武器字段 > null**，涉及字段：

| 字段 | 说明 |
|---|---|
| `fireMode` | 开火模式：`'auto'` / `'burst'` / `null` |
| `burstCount` | 连发数（如 3、4） |
| `burstInternalROF` | 连发内部射速 |
| `burstInterval` | 连发间隔（秒） |
| `rofStages` | 分段射速数组 |

### 5.7 初速计算

```
初速 = (原始初速 + velocityAdd) × rangeMult × 枪口mult × (1 + 精校)
```

其中 `rangeMult = 枪管射程倍率 + 枪口射程加成`。

**示例**：AS Val + VSS海啸长枪管组合 + 无枪口 + 精校9%
- 原始初速 330，rangeMult 1.3
- velocityMult = 1.3 × 1.0 × 1.09 = 1.417
- 初速 = 330 × 1.417 = 467.61 → 468

---

## 六、计算逻辑

### 6.1 TTK 分解（5 段）

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

### 6.2 加权平均 TTK

折线图排序使用**距离加权**，近距离权重更高：

```js
weight = 1.5 - (distance / 100) × 1.0
// 0m → 1.5，100m → 0.5
weightedAvg = Σ(ttk × weight) / Σ(weight)
```

### 6.3 关键点插值

折线图不计算全部 101 个距离点，只计算**关键点**：

1. `0m`
2. 各射程分段点（`r1`、`r2`、`r3`、`r4`）及其前 1m（`r-1`）
3. `100m`（终点）

其余距离通过**线性插值**得到。

**示例**：
- AK-12 `[40, 70]` → `[0, 39, 40, 69, 70, 100]`
- M700 `[Infinity, ...]` → `[0, 100]`

### 6.4 命中率映射

`getHitRateFromMap()` 的规则：

1. 排序后线性插值
2. **10m 内强制 100% 命中率**（符合游戏近战设定）
3. 超出最近点会**外推**，但被钳制在 `[0, 1]`

### 6.5 哈弗币消耗公式

```
哈弗币消耗 = 整枪价格 × (1 - 撤离率) 
           + (KD × 5 × 平均致死枪数 + 其他消耗) × 子弹单价
```

- `平均致死枪数`：所有关键点 `shots` 的平均值
- `KD × 5`：KD 放大倍数
- `其他消耗`：默认 30 发

### 6.6 综合评分（假 TTK）

```js
假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间

// 默认 aimWeight = 0.4（40%）
```

---

## 七、逻辑链路

### 7.1 应用启动链路

```
main.js
  ├── 创建 DataManager 单例
  ├── 创建 ConfigCacheManager 并注入 DataManager
  └── createApp(App).mount('#app')
        └── App.vue onMounted
              ├── dataStore.loadData()
              │     └── DataManager.loadFromJSON('./data.json')
              │           ├── fetch + validateData
              │           ├── normalizeData（规范化 ranges/bullets/armors）
              │           └── originalData = 深拷贝（用于重置）
              ├── 收集 caliberOptions
              └── setTimeout(handleCalculate, 500)
```

### 7.2 TTK 计算链路

```
用户点击「📊 计算 TTK」
  → handleCalculate()
    ├── getEnabledConfigs()          # 取所有 enabled !== false 的配置
    ├── buildArmedWeapons(configs)   # 应用附件，构建"武装后"武器
    │     └── calculateCurrentValues(weapon, barrel, muzzleId, precision)
    │           ├── 计算射程倍率 / 初速倍率
    │           ├── 计算当前射程 / 初速 / 射速 / 肉伤 / 甲伤
    │           ├── 合并部位倍率加成
    │           └── 合并连发字段 / rofStages（枪管 > 武器）
    │
    ├── 对每个武器：
    │     ├── 检查缓存（isCacheValid）
    │     │     ├── 有效 → interpolateTTK 读缓存
    │     │     └── 失效 → calculateSinglePoint 重算
    │     ├── 计算 5 段分解
    │     └── 更新进度条
    │
    ├── results.sort（按 totalTime）
    ├── appStore.setTtkResults(results)
    ├── handleDistanceChart()        # 自动触发折线图
    └── computeHavocCosts()          # 计算哈弗币消耗
```

### 7.3 折线图链路

```
handleDistanceChart()
  ├── getEnabledConfigs()
  ├── buildArmedWeapons()
  ├── appStore.showCalcProgress()
  ├── buildDistanceStats(armed, attachments)
  │     └── 对每个武器：
  │           ├── 检查缓存（config.cache.keyPoints）
  │           │     ├── 有效 → interpolateTTK 生成 101 个点
  │           │     └── 失效 → calculateSingleWeapon 重算
  │           │           ├── getKeyDistances（生成关键点）
  │           │           ├── 对每个关键点：
  │           │           │     ├── getHitRateFromMap
  │           │           │     └── calculateSinglePoint（20000 次）
  │           │           ├── interpolateTTK 生成完整数组
  │           │           └── 写入 config.cache（含 hash）
  │           ├── 计算 weightedAvg
  │           └── 更新进度条
  ├── 提取 { ttk, aim } 作为评分原始数据
  ├── appStore.setScores(scores)
  └── distanceStats.value = stats
```

### 7.4 单次模拟链路（弹窗）

```
DamageDetailModal
  → runSimulation(seed)
    ├── setSeed(seed)                # 固定种子
    ├── calculateCurrentValues()      # 应用附件
    ├── getRealBulletKey()            # 解析实际子弹
    ├── getStrategy(bulletKey, bulletData)  # 匹配子弹策略
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

### 7.5 数据修改链路

```
用户编辑单元格
  → 组件事件（如 onNameChange）
    → dataStore.updateBullet / updateWeapon / updatePriceConfig
      → DataManager.updateXXX
        ├── Object.assign（写入 this.data）
        └── markWeaponModified（追踪修改）
    → dataStore.refreshBullets / refreshWeapons / refreshPrices
      → state.xxx = [...dm.getXxx()]  # 新数组引用触发响应式
    → emit('update') 通知父组件
```

### 7.6 缓存失效链路

```
任意参数变化
  → generateParamsHash 生成的哈希不同
    → isCacheValid 返回 false
      → delete config.cache
        → 下次计算时重算
          → 写入新缓存（含新 hash）
```

---

## 八、数据结构

### 8.1 `data.json` 顶层

```json
{
  "version": "1.0",
  "updatedAt": "2026-09-06",
  "meta": { ... },
  "weapons": [...],
  "bullets": [...],
  "prices": [...],
  "armors": [...]
}
```

### 8.2 武器对象

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

### 8.3 子弹对象

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
  "isDefault": true
}
```

### 8.4 价格配置

```json
{
  "id": "#1",
  "barrelId": 1,
  "barrel": "刺客高级枪管",
  "muzzleId": 0,
  "muzzle": "无",
  "precision": 0.09,
  "aimSpeed": 296,
  "buildCode": "AS Val突击步枪-烽火地带-...",
  "price": 540000,
  "distance": [30, 50, 100],
  "hitRate": [1.0, 0.95, 0.75],
  "bullet": "",
  "enabled": true,
  "cache": {
    "keyPoints": [
      { "d": 0, "t": 263.96, "shots": 4.32, "bulletPrice": 2481 }
    ],
    "hash": "h5txuss",
    "avgBurstInterval": 0.1147,
    "cachedAt": "2026-09-14T11:59:25.327Z"
  }
}
```

### 8.5 护甲/头盔对象

```json
{
  "id": "armor_4_1789274589263",
  "type": "armor",
  "name": "MK-2战术背心",
  "level": 4,
  "value": 110,
  "price": 181666,
  "parts": "胸腹"
}
```

> `parts` 仅护甲有，可选值：`"胸部"` / `"胸腹"` / `"胸腹肩"`。

---

## 九、缓存机制

### 9.1 缓存版本

`ConfigCacheManager` 中的 `CACHE_VERSION = 7` 是缓存结构版本号。**任何影响缓存含义/结构的改动都应递增**，从而让所有旧缓存自动失效。

版本历史：
- v1：初始版本
- v2：连发字段纳入 hash
- v3：新增 `avgBurstInterval` 字段
- v4：分段射速字段纳入 hash
- v5~v7：后续迭代（护甲数据、子弹 partMult 等）

### 9.2 参数哈希

`generateParamsHash()` 生成的哈希覆盖所有影响 TTK 的参数：

| 分类 | 字段 |
|---|---|
| 版本 | `CACHE_VERSION` |
| 武器属性 | `id` / `rof` / `velocity` / `flesh` / `armor` / `ranges` / `mult` / `decays` / `triggerDelay` |
| 连发字段 | `fireMode` / `burstCount` / `burstInternalROF` / `burstInterval` |
| 分段射速 | 标准化后的 `rofStages` |
| 附件选择 | 解析后的 `barrelId` / `muzzleId` / `bulletId` |
| 战斗参数 | 护甲/头盔等级值、生命值、子弹等级 |
| 命中相关 | `hitRateMap`（排序后）/ `hitProb` |
| 其他 | 扳机延迟开关、精校值 |

**任一参数变化 → 哈希不匹配 → 缓存失效 → 自动重算。**

### 9.3 缓存有效性校验

`isCacheValid()` 除比对哈希外，还要求：

- `config.cache.keyPoints` 存在且非空
- `config.cache.hash` 存在
- `config.cache.avgBurstInterval` 字段存在（兼容旧版本 v2）

### 9.4 缓存命中流程

```
计算前
  → 读 config.cache
    → isCacheValid(weapon, config, params, attachment)
      ├── true  → interpolateTTK(keyPoints, distance)
      └── false → delete config.cache
                  → 重算
                  → generateParamsHash
                  → config.cache = { keyPoints, hash, avgBurstInterval }
```

### 9.5 关键点插值

`interpolateTTK(keyPoints, distance)`：

1. 按距离排序
2. 目标距离 ≤ 最小点 → 返回最小点 t
3. 目标距离 ≥ 最大点 → 返回最大点 t
4. 找到相邻两点，线性插值

`interpolateFullRange(keyPoints, maxDistance, step)`：
- 生成 `[0, maxDistance]` 每 `step` 一个点的完整数组

---

## 十、模块说明

### 10.1 `SimulationEngine`

核心模拟引擎（静态类）。

| 方法 | 说明 |
|---|---|
| `simulateOneTTK()` | 单次模拟（批量统计用） |
| `simulateOneTTKWithDetail()` | 记录模式（弹窗用，返回逐发明细） |
| `calculateAvgStats()` | 多次模拟求平均 |
| `calculateSinglePoint()` | 单距离点统计（`DEFAULT_SIM_COUNT` 次） |
| `getRealBulletKey()` | 解析实际使用的子弹 ID |
| `_getIntervalAfterShot()` | 计算第 N 发后的间隔（支持分段射速） |
| `_calculateShootingIntervalTotal()` | 计算整个击杀的射击间隔总和 |
| `_updateBurstInterval()` | 更新连发间隔统计 |

**`_getIntervalAfterShot` 语义**：
- `shot = 1` → 第 1→2 发之间的间隔
- 连发模式 → 用 `burstInternalROF`
- 无 `rofStages` → 全程基础射速

### 10.2 `BulletStrategy`

子弹策略工厂，按子弹 ID 匹配策略：

| 策略 | 匹配规则 | 特点 |
|---|---|---|
| `RIPBulletStrategy` | `/RIP\|CT/i` | 固定命中四肢，无视护甲 |
| `StandardBulletStrategy` | 默认 | 标准计算 |

**v4 变化**：
- 删除 `STBulletStrategy`（ST 子弹用 `partMult` 表达）
- 删除 `DoubleBulletStrategy`（双头弹走 Standard）

`getStrategy(bulletType, bulletData)`：
- 优先用 `bulletData.name` 匹配
- 回退到 `bulletType` 字符串匹配

### 10.3 `CombatUtils`

| 类 | 职责 |
|---|---|
| `DistanceDecayCalculator` | 根据距离 + `ranges`/`decays` 计算衰减 |
| `BaseDamageCalculator` | `weapon.flesh × partMult × mult × decay` |
| `ArmorDamageCalculator` | 护甲击穿/未击穿两种计算 |
| `HitPartSelector` | 随机选部位 / 连发偏置选部位 |

### 10.4 `weaponCalc.calculateCurrentValues()`

根据武器 + 枪管 + 枪口 + 精校，计算"应用附件后"的当前属性：

```
初速 = (原始初速 + velocityAdd) × rangeMult × 枪口mult × (1 + 精校)
射程 = 原始射程 × rangeMult + rangeAdd
射速 = 原始射速 × rofMult
肉伤 = 原始肉伤 + damageBonus
甲伤 = 原始甲伤 + armorDamageBonus
```

返回：`rof / velocity / ranges / decays / flesh / armor / mult / fireMode / burstCount / burstInternalROF / burstInterval / rofStages`

### 10.5 `ConfigCacheManager`

| 方法 | 说明 |
|---|---|
| `generateParamsHash()` | 生成参数哈希 |
| `isCacheValid()` | 校验缓存是否有效 |
| `checkCacheStatus()` | 结合修改标记 + 缓存有效性 |
| `interpolateTTK()` | 从关键点插值 TTK |
| `interpolateFullRange()` | 生成完整距离-TTK 数组 |
| `interpolateShots()` | 插值平均致死枪数 |
| `averageShots()` | 计算所有关键点的平均枪数 |
| `getBulletPrice()` | 获取子弹单价 |
| `calculateHavocCost()` | 计算指定距离的哈弗币消耗 |
| `calculateHavocCostAverage()` | 计算所有关键点平均的哈弗币消耗 |

### 10.6 `DataManager`（单例）

职责：
- 数据加载 / 保存 / 导入 / 导出 / 重置
- 武器、子弹、价格、枪管、护甲的增删改查
- 修改追踪（`modifiedWeaponIds`）
- 缓存读写
- 导出时排序（不影响内存数据）

**关键方法**：

| 方法 | 说明 |
|---|---|
| `loadFromJSON(url)` | 从 URL 加载数据 |
| `normalizeData(data)` | 规范化数据（Infinity/等级/partMult 等） |
| `getPriceRowsForWeapon(weaponId)` | 解析配置（含 barrelId/muzzleId 反查） |
| `getHitRateFromMap(map, distance, fallback)` | 命中率插值 |
| `addBullet / updateBullet / removeBullet` | 子弹管理 |
| `setDefaultBullet(bulletId)` | 设置默认子弹（同 caliber+level 唯一） |
| `updatePriceConfig / addPriceConfig / removePriceConfig` | 配置管理 |
| `markWeaponModified(weaponId)` | 标记修改 |
| `exportToJSON(includeCache)` | 导出（排序 + 压缩） |
| `importFromJSON(jsonStr)` | 导入 |
| `resetToOriginal()` | 重置为初始状态 |

### 10.7 `weaponCalc.js`

```js
export function calculateCurrentValues(weapon, barrel, muzzleId, precision)
```

**合并规则**：
- 枪管字段 > 武器字段 > null
- `rofStages` 深拷贝（避免修改原对象）

### 10.8 `rng.js`

```js
let currentSeed = 12345;

export function setSeed(seed) { currentSeed = seed; }
export function seededRandom() {
  currentSeed = (1664525 * currentSeed + 1013904223) % Math.pow(2, 32);
  return currentSeed / Math.pow(2, 32);
}
```

线性同余生成器（LCG），保证模拟结果可复现。

### 10.9 `config.js`

| 常量 | 值 | 说明 |
|---|---|---|
| `HIT_KEYS` | `['head','chest','stomach','limbs']` | 命中部位 |
| `CHART_CONFIG.MAX_DISTANCE` | 100 | 折线图最大距离 |
| `SIMULATION_CONFIG.DEFAULT_SIM_COUNT` | 20000 | 批量模拟次数 |
| `SIMULATION_CONFIG.DISTANCE_SIM_COUNT` | 20000 | 折线图模拟次数 |

### 10.10 `validators.js`

| 函数 | 说明 |
|---|---|
| `validateHitProb(params)` | 命中概率之和是否为 1 |
| `validateHitRateMap(str)` | 命中率映射格式校验 |
| `validateWeaponHitRates(attachments, weapons)` | 武器命中率范围 |
| `validatePageParams(params)` | 页面参数综合校验 |

### 10.11 `performance.js`

性能监控工具，用于记录应用各环节的加载耗时：

```js
perf.mark('dataLoadStart', '数据加载开始');
perf.mark('dataLoadDone', '数据加载完成');
perf.report();  // 输出报告
```

### 10.12 `formatters.js`

| 函数 | 说明 |
|---|---|
| `formatRanges(ranges)` | Infinity → ∞ |
| `formatTime(value, unit)` | 时间格式化 |
| `formatPercentage(value, total)` | 百分比 |
| `formatMultipliers(mult)` | 部位倍率字符串 |

---

## 十一、组件说明

### 11.1 主流程

```
App.vue
  ├── AppHeader              ← 页头（标题 + B站链接）
  ├── ParamsPanel            ← 参数输入 + 操作按钮
  ├── TTKChart               ← 堆叠柱状图
  ├── DistanceChart          ← 距离-TTK 折线图
  ├── 表格区域（Tab 切换）
  │     ├── WeaponTable      ← 枪械数据（主 Tab）
  │     └── ItemsPanel       ← 弹甲数据（主 Tab）
  │           ├── BulletTable    ← 子弹（子 Tab）
  │           ├── ArmorTable     ← 护甲（子 Tab）
  │           └── ArmorTable     ← 头盔（子 Tab）
  ├── BarrelEditor           ← 枪管编辑器弹窗  ├── WeaponBaseEditor       ← 基础属性编辑器弹窗
  ├── DamageDetailModal      ← 单次伤害模拟弹窗
  └── 计算进度遮罩（Teleport to body）
```

### 11.2 `App.vue` 核心方法

| 方法 | 说明 |
|---|---|
| `handleCalculate()` | 批量计算 TTK |
| `handleDistanceChart()` | 生成折线图数据 |
| `buildArmedWeapons(configs)` | 构建"武装后"武器 |
| `buildDistanceStats(armed, attachments)` | 折线图统计 |
| `calculateSingleWeapon(...)` | 单武器关键点计算 |
| `getKeyDistances(ranges, maxDistance)` | 生成关键距离点 |
| `computeHavocCosts(...)` | 哈弗币消耗计算 |
| `exportData / importData / resetData` | 数据管理 |
| `onAddWeapon / onDeleteWeapon` | 武器增删 |
| `openBarrelEditor / onBarrelSaved` | 枪管编辑 |
| `onBaseVisibleChange / onBaseSaved` | 基础属性编辑 |

### 11.3 `ParamsPanel.vue`

- **第一行**：子弹等级 / 护甲等级 / 护甲值 / 头盔等级 / 头盔值 / 生命值 / KD / 撤离率 / 其他消耗 / 开镜权重
- **第二行**：距离 / 全局命中率 / 扳机延迟开关 / 命中概率（头胸腹肢）
- **第三行**：计算 TTK / 生成折线图 / 导出数据 / 导入数据 / 重置数据

### 11.4 `WeaponTable.vue`

- **工具栏**：新增枪械 / 全部展开 / 全部收起 / 全部启用 / 全部禁用
- **武器头**：折叠按钮 + 身份 + 枪管/枪口选择 + 精校滑块 + 射速/初速/肉伤/甲伤/射程/衰减/倍率/伤害
- **秒伤行**：分段显示各距离段的 DPS
- **配置列表**：每行一个配置（勾选/ID/改枪码/枪管/枪口/命中率/开镜/价格/子弹/哈弗币/评分/操作）
- **操作按钮**：新增配置 / 编辑属性 / 编辑枪管 / 删除

### 11.5 `TTKChart.vue`

- 5 个系列（`noMissFireDelay` / `burstInterval` / `emptyDelay` / `flight` / `triggerDelay`）
- 图例可点击切换显示
- 按"可见总 TTK"排序
- 移动端自动旋转 X 轴标签

### 11.6 `DistanceChart.vue`

- ECharts 折线图
- 支持自定义分段（`segment: { start, end }`）
- 高亮武器加粗红线
- Top 15% / Top 40% 视觉区分
- 智能排序（加权平均）

### 11.7 `DamageDetailModal.vue`

- 顶部摘要 + 再来一次
- TTK 分解（飞行/射击/扳机/平均连发）
- 桌面：9 列明细表
- 移动端：每发一个紧凑块（两行制）
- 展开详情：逐发计算过程

### 11.8 `BarrelEditor.vue`

表格编辑枪管的所有属性：
- 名称 / 射程倍率 / 射程增量 / 初速增量 / 射速倍率 / 肉伤加成 / 甲伤加成 / 扳机延迟Δ
- 自定义射程 / 自定义衰减 / 部位倍率加成 / 分段射速
- 开火模式 / 连发数 / 内部射速 / 连发间隔

### 11.9 `WeaponBaseEditor.vue`

编辑武器基础属性：
- 名称 / 类型 / 口径 / 扳机延迟
- 射速 / 初速 / 肉伤 / 甲伤
- 射程 / 衰减
- 头/胸/腹/肢倍率
- 开火模式 / 连发数 / 内部射速 / 连发间隔

### 11.10 `BulletTable.vue`

- 默认（单选）/ 名称 / 口径 / 等级 / 部位肉伤 / 护甲衰减 / 穿透 / 价格 / 操作
- 单输入框逗号分隔（`1,1,1,1` / `1,1,1,1,1,0.6` / `1,1,0.75,0.5,0,0`）
- 穿透值 0~1 校验

### 11.11 `ArmorTable.vue`

- 名称 / 等级 / 防护部位（仅护甲）/ 护甲值 / 价格 / 操作
- 价格以 W 为单位显示

---

## 十二、状态管理

### 12.1 `dataStore.js`

```js
const state = reactive({
  weapons: [],
  bullets: [],
  prices: [],
  armors: [],
  isLoaded: false,
  loadingError: null
})
```

**关键方法**：
- `loadData()` — 加载数据
- `refreshWeapons()` / `refreshBullets()` / `refreshPrices()` / `refreshArmors()` — 刷新（新数组引用触发响应式）
- `getPriceRows()` / `getPriceRowsForWeapon(id)` — 获取配置
- `getWeaponById(id)` / `getBulletById(id)` / `getArmorById(id)` — 查询
- `addBullet / removeBullet / updateBullet` — 子弹管理
- `addArmor / updateArmor / removeArmor` — 护甲管理
- `addPriceConfig / removePriceConfig / updatePriceConfig` — 配置管理
- `markWeaponModified(id)` — 修改追踪
- `exportData / importData / resetData` — 数据管理

### 12.2 `paramsStore.js`

```js
const DEFAULT_PARAMS = {
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

**Getters**：
- `hitRate` — 从 `hitRateMap` + `distance` 插值

### 12.3 `appStore.js`

```js
const state = reactive({
  currentTab: 'weapon',        // 主 Tab
  currentSubTab: 'bullet',     // 子 Tab
  ttkResults: [],              // TTK 结果
  havocCosts: {},              // 哈弗币消耗
  scores: {},                  // 评分原始数据 { ttk, aim }
  isLoading: false,
  showBarrelEditor: false,
  editingWeaponId: null,
  showBaseEditor: false,
  editingBaseWeaponId: null,
  showAllWeapons: true,
  highlightWeapon: null,
  calcProgress: { visible, percent, current, total, title }
})
```

**关键方法**：
- `switchTab(tab)` / `switchSubTab(sub)` — Tab 切换
- `setTtkResults(results)` — 设置 TTK 结果
- `setHavocCosts(costs)` — 设置哈弗币消耗
- `setScores(scores)` — 设置评分数据
- `openBarrelEditor(weaponId)` / `closeBarrelEditor()` — 枪管编辑器
- `openBaseEditor(weaponId)` / `closeBaseEditor()` — 基础编辑器
- `showCalcProgress(title, total)` / `updateCalcProgress(current)` / `hideCalcProgress()` — 进度管理

---

## 十三、性能优化

### 13.1 参数哈希缓存

所有影响 TTK 的参数生成哈希，未变则直接读缓存。

**命中日志**：
```
💾 缓存命中: AS Val #3
🔄 缓存失效: 腾龙 #1 (hash 不匹配)
```

### 13.2 关键点插值

折线图只计算**关键点**（0m + 射程分段点 ±1m + 100m），其余 95+ 个距离点通过线性插值得到。

### 13.3 蒙特卡洛模拟

- `DEFAULT_SIM_COUNT = 20000`（批量计算）
- `DISTANCE_SIM_COUNT = 20000`（折线图）
- 固定种子（`INITIAL_SEED = 12345`）确保可复现

### 13.4 进度遮罩

批量计算时显示实时进度，避免用户以为卡死。

### 13.5 导出压缩

`exportToJSON()` 后处理：
- `_compressArmorData()` — 护甲数据单行化
- `_compressKeyPoints()` — keyPoints 单行化

### 13.6 移动端适配

- `window.innerWidth <= 768` 判断
- 表格切换为卡片布局
- 图表高度自适应

---

## 十四、常见问题

### Q: 修改了武器数据但 TTK 没变？

A: 检查以下几点：
1. 修改后是否点击了「📊 计算 TTK」
2. 数据是否真的写入（`DataManager.updateWeapon()` 会被调用）
3. 该武器是否在价格表中被**启用**（`enabled !== false`）

### Q: 缓存为什么没命中？

A: 参数哈希覆盖了所有影响 TTK 的字段。任何一项变化都会导致缓存失效：
- 武器属性、附件选择、子弹、护甲参数、命中率映射、精校值
- `CACHE_VERSION` 递增

可在控制台查看 `🔄 缓存失效: xxx (hash 不匹配)` 日志。

### Q: 命中率为什么会有 100%？

A: `getHitRateFromMap()` 强制在 10m 内确保 100% 命中率（符合游戏近战设定）。超出最近点会**外推**，但会被钳制在 `[0, 1]` 区间。

### Q: 连发武器的 TTK 为什么比全自动长？

A: 连发武器有 `burstInterval`（连发间隔），每进入新连发周期都要等待一次。例如三连发武器在 `burstCount=3` 时，第 4、7、10… 发之前都会插入一次 `burstInterval`。

### Q: 分段射速怎么配置？

A: 在枪管编辑器的「分段射速」列填写，格式为 `前N个间隔:+射速`，多个用逗号分隔：

- `3:+100` → 前 3 个间隔射速 +100，之后 +0
- `3:+100,6:+50` → 前 3 个间隔 +100，第 4-6 个间隔 +50，之后 +0
- 留空 → 无分段

### Q: 数据改动后如何持久化？

A: 点击「📤 导出数据」，选择是否包含缓存，会下载 `ttk_data_YYYY-MM-DD.json`。将其放到 `public/data.json` 覆盖即可。

### Q: 移动端怎么编辑数据？

A: 屏幕宽度 ≤768px 时，三张表格自动切换为**卡片布局**。点击卡片内的输入框/下拉框即可编辑。

### Q: 综合评分（假 TTK）怎么调？

A: 在 ParamsPanel 中调整「开镜权重」（默认 40%）。公式：`假TTK = 1 × 加权平均TTK + aimWeight × 开镜时间`。

### Q: 部位倍率加成怎么填？

A: 在枪管编辑器的「部位倍率加成」列填写，格式 `头,胸,腹,肢`，如 `-0.2,0,0.1,0.2`。留空表示无加成。

### Q: 护甲数据里的 `parts` 字段有什么用？

A: 用于记录护甲的防护部位（`胸部` / `胸腹` / `胸腹肩`），目前仅作展示，不影响 TTK 计算。

---

## License

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

---

## 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准