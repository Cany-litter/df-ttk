# Delta Force TTK 计算器

> 三角洲行动武器击杀时间（TTK）模拟与对比工具

一个用于**精确计算、模拟和对比《三角洲行动》中各武器配置击杀时间**的 Web 应用。支持附件加成、分段射速、连发模式、护甲减伤、距离衰减、命中概率分布等完整战斗机制，并提供可视化图表与经济成本估算。

---

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [核心概念](#核心概念)
- [计算逻辑](#计算逻辑)
- [数据结构](#数据结构)
- [缓存机制](#缓存机制)
- [模块说明](#模块说明)
- [组件说明](#组件说明)
- [常见问题](#常见问题)

---

## 功能特性

### 🎯 精确 TTK 模拟
- **蒙特卡洛模拟**：默认 20000 次模拟取平均，结果稳定可复现（固定随机种子）
- **完整战斗机制**：护甲减伤、距离衰减、命中率映射、命中部位分布
- **连发模式**：支持三连发、四连发武器，含连发间隔与连发内部射速
- **分段射速**：支持"前 N 发射速不同"的武器（如 SVCH 前 3 发 +100 射速）

### 📊 可视化对比
- **堆叠柱状图**：TTK 分解为「无空枪射击延迟 + 平均连发间隔 + 平均空枪延迟 + 飞行延迟 + 扳机延迟」五段
- **距离-TTK 折线图**：0~100m 全距离 TTK 曲线，支持 0-50m / 50-100m 分段查看
- **智能排序**：按加权平均 TTK 排序（近距离权重更高）
- **排名高亮**：Top 15% / Top 40% 视觉区分

### 💰 经济成本估算
- **哈弗币消耗**：整枪损失 + 子弹消耗（KD 放大 5 倍 × 平均致死枪数 + 其他消耗）
- **颜色预警**：>60W 红色 / >30W 橙色 / 其余绿色

### 🔧 完整数据管理
- **三类数据表**：价格配置 / 枪械数据 / 子弹数据，全部可编辑
- **枪管编辑器**：可视化编辑枪管的所有属性（射程/衰减/倍率/分段射速/连发字段）
- **导入导出**：JSON 格式，可选是否包含缓存
- **修改追踪**：记录被修改的武器，支持增量重算

### 📱 响应式设计
- 桌面端：完整表格布局
- 移动端（≤768px）：自动切换为卡片布局

### ⚡ 性能优化
- **参数哈希缓存**：所有影响 TTK 的参数生成哈希，未变则直接读缓存
- **关键点插值**：只计算射程分段点 + 每 10m 一个关键点，其余插值
- **进度遮罩**：批量计算时显示实时进度

---

## 技术栈

| 类别 | 技术 |
|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） |
| 构建 | Vite |
| 图表 | ECharts |
| 状态 | 自研轻量 Store（`reactive` + `readonly`） |
| 样式 | 原生 CSS（CSS 变量 + 媒体查询） |
| 语言 | JavaScript (ES Module) |

---

## 快速开始

### 环境要求
- Node.js ≥ 16
- npm / pnpm / yarn

### 安装与运行

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

---

## 项目结构

```
df-ttk/
├── public/
│   └── data.json                    # 统一数据源（武器/子弹/价格）
├── src/
│   ├── components/                  # Vue 组件
│   │   ├── AppHeader.vue            # 页头
│   │   ├── AppFooter.vue            # 页脚
│   │   ├── ParamsPanel.vue          # 参数面板 + 操作按钮
│   │   ├── PriceTable.vue           # 价格配置表
│   │   ├── WeaponTable.vue          # 枪械数据表
│   │   ├── BulletTable.vue          # 子弹数据表
│   │   ├── BarrelEditor.vue         # 枪管编辑器弹窗
│   │   ├── TTKChart.vue             # TTK 堆叠柱状图
│   │   ├── DistanceChart.vue        # 距离-TTK 折线图
│   │   ├── DamageDetailModal.vue    # 单次伤害模拟弹窗
│   │   └── EditableCell.vue         # 通用可编辑单元格
│   ├── core/                        # 核心计算逻辑
│   │   ├── SimulationEngine.js      # 模拟引擎
│   │   ├── BulletStrategy.js        # 子弹策略（标准/RIP/双头/ST）
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

## 核心概念

### 1. 射程分段与距离衰减

武器的 `ranges` 定义 4 个分段点，`decays` 定义 5 段衰减倍率：

```
[0, r1)   → decays[0]
[r1, r2)  → decays[1]
[r2, r3)  → decays[2]
[r3, r4)  → decays[3]
[r4, ∞)   → decays[4]
```

> 边界使用 `<` 而非 `<=`，确保分段不重叠。

### 2. 伤害计算公式

```
纯肉伤 = 武器肉伤 × 子弹base × 部位倍率 × 距离衰减
穿透伤害 = 纯肉伤 × 穿透率(pen)
护甲伤害 = 武器甲伤 × 护甲倍率(armorMult)

若护甲伤害 ≥ 当前护甲值：
    护甲被击穿 → frac = 当前护甲值 / 护甲伤害
    最终伤害 = frac × 穿透伤害 + (1 - frac) × 纯肉伤
否则：
    最终伤害 = 穿透伤害
```

### 3. 命中部位

| 部位 | 键名 | 说明 |
|---|---|---|
| 头部 | `head` | 受头盔保护 |
| 胸部 | `chest` | 受护甲保护 |
| 腹部 | `stomach` | 受护甲保护 |
| 四肢 | `limbs` | **无视护甲** |

命中概率由 `hitProb` 决定（四项之和应为 1）。

### 4. 连发模式与部位偏置

连发武器（`fireMode: 'burst'`）的特殊逻辑：

- **第一发**：完全随机选择命中部位
- **后续发**：以 `BURST_BIAS = 0.7` 的概率命中**同一部位**，否则偏移到**相邻部位**
- **连发间隔**：每进入新连发周期（`shot % burstCount === 1`）插入一次 `burstInterval`

### 5. 分段射速 `rofStages`

```js
// 示例：前 3 个间隔射速 +100，之后 +0
rofStages: [
  { untilShot: 3, rofAdd: 100 },
  { rofAdd: 0 }  // untilShot 缺省 = "之后所有发"
]
```

用于模拟"镀铬爆发枪机"这类前几发射速更快的配件。

### 6. 附件合并规则

**枪管字段 > 武器字段 > null**，涉及字段：
- 连发：`fireMode` / `burstCount` / `burstInternalROF` / `burstInterval`
- 分段射速：`rofStages`

---

## 计算逻辑

### TTK 分解（5 段）

柱状图将总 TTK 拆分为：

| 分段 | 说明 |
|---|---|
| `flight` | 飞行延迟 = 距离 / 初速 |
| `triggerDelay` | 扳机延迟（可开关） |
| `burstInterval` | 平均连发间隔 |
| `noMissFireDelay` | 无空枪射击延迟（理论射击间隔） |
| `emptyDelay` | 平均空枪延迟（未命中带来的额外时间） |

其中后两者按固定比例拆分剩余时间：

```
remaining = totalTime - (flight + triggerDelay + burstInterval)
noMissFireDelay = remaining × (0.5 / 0.7)
emptyDelay      = remaining × (0.2 / 0.7)
```

### 加权平均 TTK

折线图排序使用**距离加权**，近距离权重更高：

```js
weight = 1.5 - (distance / 100) × 1.0
// 0m → 1.5，100m → 0.5
weightedAvg = Σ(ttk × weight) / Σ(weight)
```

### 关键点插值

折线图不计算全部 101 个距离点，只计算**关键点**：

1. `0m`
2. 各射程分段点（`r1`、`r2`、`r3`、`r4`）及其前 1m（`r-1`）
3. 每 10m 一个点（10、20、…、100）

其余距离通过**线性插值**得到。

---

## 数据结构

### `data.json` 顶层

```json
{
  "version": "1.0",
  "updatedAt": "2026-09-06",
  "meta": { ... },
  "weapons": [...],
  "bullets": [...],
  "prices": [...]
}
```

### 武器对象

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

### 子弹对象

```json
{
  "id": "4.6x30_4",
  "caliber": "4.6x30mm",
  "level": 4,
  "base": 1,
  "price": 1400,
  "armorData": {
    "1": { "armorMult": 1, "pen": 1 },
    "2": { "armorMult": 1, "pen": 1 },
    "3": { "armorMult": 1, "pen": 0.75 },
    "4": { "armorMult": 1, "pen": 0.5 },
    "5": { "armorMult": 1, "pen": 0 },
    "6": { "armorMult": 0.6, "pen": 0 }
  },
  "stMult": { "head": 1, "chest": 1, "stomach": 0.72, "limbs": 0.72 }
}
```

> `level` 支持数字（1-5）和特殊字符串（`RIP` / `M61` / `ST4` / `CT` / `AP` 等）。

### 价格配置

```json
{
  "id": "#1",
  "barrelId": 1,
  "barrel": "刺客高级枪管",
  "muzzleId": 0,
  "muzzle": "无",
  "buildCode": "AS Val突击步枪-烽火地带-...",
  "price": 640000,
  "distance": [30, 50, 100],
  "hitRate": [1.0, 0.8, 0.5],
  "bullet": "9x39_5",
  "enabled": true,
  "cache": {
    "keyPoints": [{ "d": 0, "t": 336.67, "shots": 6.45, "bulletPrice": 1800 }],
    "hash": "hpqbl4h",
    "avgBurstInterval": 0,
    "cachedAt": "2026-09-11T04:54:08.755Z"
  }
}
```

---

## 缓存机制

### 缓存版本

`ConfigCacheManager` 中的 `CACHE_VERSION` 是缓存结构版本号。**任何影响缓存含义/结构的改动都应递增**，从而让所有旧缓存自动失效。

版本历史：
- v1：初始版本
- v2：连发字段纳入 hash
- v3：新增 `avgBurstInterval` 字段
- v4：分段射速字段纳入 hash

### 参数哈希

`generateParamsHash()` 生成的哈希覆盖所有影响 TTK 的参数：

- 缓存版本号
- 武器属性（rof / velocity / flesh / armor / ranges / mult / decays / triggerDelay）
- 连发字段（fireMode / burstCount / burstInternalROF / burstInterval）
- 分段射速（标准化后的 rofStages）
- 解析后的 barrelId / muzzleId / bulletId
- 战斗参数（护甲/头盔等级值、生命值）
- 命中率映射、命中概率分布
- 扳机延迟开关、精校值

**任一参数变化 → 哈希不匹配 → 缓存失效 → 自动重算。**

### 缓存有效性校验

`isCacheValid()` 除比对哈希外，还要求：

- `config.cache.keyPoints` 存在且非空
- `config.cache.hash` 存在
- `config.cache.avgBurstInterval` 字段存在（兼容旧版本）

---

## 模块说明

### `SimulationEngine`

核心模拟引擎（静态类）。

| 方法 | 说明 |
|---|---|
| `simulateOneTTK()` | 单次模拟（批量统计用） |
| `simulateOneTTKWithDetail()` | 记录模式（弹窗用，返回逐发明细） |
| `calculateAvgStats()` | 多次模拟求平均 |
| `calculateSinglePoint()` | 单距离点统计 |
| `getRealBulletKey()` | 解析实际使用的子弹 ID |
| `_getIntervalAfterShot()` | 计算第 N 发后的间隔（支持分段射速） |

### `BulletStrategy`

子弹策略工厂，按子弹 ID 匹配策略：

| 策略 | 匹配规则 | 特点 |
|---|---|---|
| `RIPBulletStrategy` | `/RIP\|CT/i` | 固定命中四肢，无视护甲 |
| `DoubleBulletStrategy` | `=== 'Double'` | 肉伤固定 74，甲伤固定 11 |
| `STBulletStrategy` | `/ST\d?/i` | 头胸 1.25×，腹肢 0.9×（可被 `stMult` 覆盖） |
| `StandardBulletStrategy` | 默认 | 标准计算 |

### `weaponCalc.calculateCurrentValues()`

根据武器 + 枪管 + 枪口 + 精校，计算"应用附件后"的当前属性：

```
初速 = (原始初速 + velocityAdd) × rangeMult × 枪口mult × (1 + 精校)
射程 = 原始射程 × rangeMult + rangeAdd
射速 = 原始射速 × rofMult
肉伤 = 原始肉伤 + damageBonus
甲伤 = 原始甲伤 + armorDamageBonus
```

### `ConfigCacheManager`

| 方法 | 说明 |
|---|---|
| `generateParamsHash()` | 生成参数哈希 |
| `isCacheValid()` | 校验缓存是否有效 |
| `interpolateTTK()` | 从关键点插值 TTK |
| `interpolateFullRange()` | 生成完整距离-TTK 数组 |
| `interpolateShots()` | 插值平均致死枪数 |
| `calculateHavocCost()` | 计算哈弗币消耗 |

### `DataManager`（单例）

职责：
- 数据加载 / 保存 / 导入 / 导出 / 重置
- 武器、子弹、价格、枪管的增删改查
- 修改追踪（`modifiedWeaponIds`）
- 缓存读写
- 导出时排序（不影响内存数据）

---

## 组件说明

### 主流程

```
App.vue
  ├── AppHeader
  ├── ParamsPanel        ← 参数输入 + 操作按钮
  ├── TTKChart           ← 堆叠柱状图
  ├── DistanceChart      ← 距离-TTK 折线图
  ├── 表格区域（Tab 切换）
  │     ├── PriceTable
  │     ├── WeaponTable
  │     └── BulletTable
  ├── DamageDetailModal  ← 单次伤害模拟弹窗
  ├── BarrelEditor       ← 枪管编辑器弹窗
  └── 计算进度遮罩
```

### 计算触发流程

```
用户点击「📊 计算 TTK」
  → handleCalculate()
    → getEnabledConfigs()          # 取启用配置
    → buildArmedWeapons()          # 应用附件，构建"武装后"武器
    → 对每个武器：
        ├── 缓存有效 → 插值读缓存
        └── 缓存失效 → calculateSinglePoint() 重算
    → 计算哈弗币消耗
    → 更新 appStore.ttkResults
    → 自动触发 handleDistanceChart()
```

---

## 常见问题

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

---

## License

本项目遵循仓库中的 [LICENSE](./LICENSE) 文件。

---

## 致谢

- 数据来源：游戏内实测与社区整理
- 作者：[殘雲碎夢](https://space.bilibili.com/128602631)
- 声明：数据仅供参考，以游戏内实际表现为准