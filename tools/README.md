# `tools/README.md` 完整代码

```markdown
# tools/ — 数据维护工具

从 [dfttk.com](https://dfttk.com) 抓取武器价格，更新到 `public/data.json`。

> 这是**开发者工具**，不是给终端用户使用的。终端用户直接打开项目首页即可。

---

## 目录结构

```
tools/
├── config.py              # 常量配置（URL / 选择器 / 路径 / 浏览器目录）
├── extract_tasks.py       # 阶段1：data.json → tasks.json
├── scrape_prices.py       # 阶段2：tasks.json → scraped_prices.json
├── merge_prices.py        # 阶段3：scraped_prices.json → data.json
├── renumber_configs.py    # 工具：重新编号武器配置（#1 #2 #3...）
├── requirements.txt       # 依赖清单
├── README.md              # 本文档
├── .gitignore             # 忽略临时产物
│
├── tasks.json             # 中间产物（脚本生成，不提交 git）
├── scraped_prices.json    # 中间产物（脚本生成，不提交 git）
└── _browser_profile/      # Playwright 持久化数据（脚本生成，不提交 git）
```

---

## 环境准备

```bash
# 1. 安装 Python 依赖
pip install -r requirements.txt

# 2. 安装 Playwright 浏览器（只需一次）
playwright install chromium
```

> ⚠️ Playwright 首次安装会下载约 150MB 的 Chromium，请耐心等待。

---

## 三阶段工作流

```
   public/data.json
         │
         │  ① python extract_tasks.py
         ▼
   tools/tasks.json
         │
         │  ② python scrape_prices.py
         ▼
   tools/scraped_prices.json
         │
         │  ③ python merge_prices.py
         ▼
   public/data.json（已更新）
   public/data.json.bak（自动备份）
```

**为什么分三个阶段？**
- 每步都有明确的 JSON 中间产物，可中断、可人肉检查、可重跑
- 抓取阶段最容易失败（网络 / DOM 变化），单独跑不污染数据文件
- 合并阶段是**唯一会修改 `data.json` 的步骤**，且自动备份

---

## 阶段1：提取任务

```bash
cd tools
python extract_tasks.py
```

**做什么**：从 `public/data.json` 里读出所有**启用**的武器配置，生成待抓取清单 `tasks.json`。

**输出示例**（`tasks.json`）：

```json
[
  {
    "weaponId": 41,
    "weaponName": "腾龙",
    "configId": "#1",
    "schemeIndex": 1,
    "barrel": "新式蛟龙战术长枪管",
    "muzzle": "先进/轻语/勇火",
    "oldPrice": 440000,
    "enabled": true
  }
]
```

**关键字段**：
- `schemeIndex`：dfttk.com 上方案卡片的编号（从 `configId` 的 `#N` 提取）
- `oldPrice`：当前 `data.json` 里的价格（用于合并时对比）
- 只有 `enabled !== false` 的配置会被提取

---

## 阶段2：抓取价格

```bash
python scrape_prices.py
```

**做什么**：启动 Playwright 浏览器，逐个任务抓取 dfttk.com 上的最新价格。

### 首次运行流程

1. **启动浏览器**（非无头模式，能看到页面）
2. **自动打开** `https://dfttk.com/firefight/builder`
3. **暂停，等待你操作**：
   - 登录 dfttk.com（如果需要）
   - 切换到"烽火地带"模式
   - **确保方案库里能看到你的方案**
4. **回终端按回车** → 开始自动抓取
5. **抓完自动保存** → `scraped_prices.json`

### 后续运行流程

1. 浏览器打开，**自动带上已保存的方案**（不用重新配置）
2. 直接按回车 → 开始抓取

### 中断与续跑

**Ctrl+C 优雅中断**：

按一次 → 保存结果 + 关浏览器
再按一次 → 强制退出

```
^C
⚠️ 收到中断信号（Ctrl+C），正在保存已抓结果...
   （再按一次 Ctrl+C 可强制退出）

💾 已保存结果到: .../scraped_prices.json
⚠️ 运行被中断
   本次会话：成功 12，失败 0
   累计结果：成功 12，未找到 0，错误 0

💡 恢复方法：
   重新运行  python scrape_prices.py --resume
```

**断点续跑**：

```bash
python scrape_prices.py --resume
```

自动跳过已成功的任务，只抓剩下的部分。

**其他中断方式**：
- 直接关闭浏览器窗口
- 主循环中 Ctrl+Z（Windows）/ Ctrl+D（Linux/Mac）

无论哪种方式，`finally` 块都会保证结果被保存、浏览器被关闭。

### 命令行参数

```bash
# 从头开始抓（默认）
python scrape_prices.py

# 从第 10 条开始抓（调试用）
python scrape_prices.py --start 10

# 自动跳过已成功的（续跑）
python scrape_prices.py --resume

# 每抓 10 条保存一次（默认 5）
python scrape_prices.py --save-every 10

# 连续失败 10 次才暂停（默认 5，0 = 不暂停）
python scrape_prices.py --max-consecutive-fail 10

# 组合使用
python scrape_prices.py --resume --save-every 3 --max-consecutive-fail 3
```

### 输出示例（`scraped_prices.json`）

```json
[
  {
    "weaponId": 41,
    "weaponName": "腾龙",
    "configId": "#1",
    "newPrice": 445000,
    "status": "ok",
    "error": null
  }
]
```

**状态码**：

| 状态 | 含义 | 合并阶段 |
|---|---|---|
| `ok` | 抓取成功 | 会更新价格 |
| `not_found` | 找不到对应方案卡片 | 跳过 |
| `error` | 抓取出错（超时 / 网络等） | 跳过 |

> ⚠️ 抓取速度约 **1.4 秒/任务**。100 个任务 ≈ 2.5 分钟。

### 连续失败保护

如果连续失败（`not_found` 或 `error`）达到阈值（默认 5 次），脚本会：

1. 自动保存当前结果
2. 暂停并询问：`输入 c 继续，其他键中断`
3. 如果选 `c` → 重置失败计数，继续
4. 否则 → 中断退出

**为什么加这个**：避免你不在电脑前时，脚本一路失败跑完 100 条。

---

## 阶段3：合并结果

```bash
python merge_prices.py
```

**做什么**：把 `scraped_prices.json` 里的新价格合并回 `public/data.json`。

**安全措施**：
- ✅ 只处理 `status === "ok"` 的条目
- ✅ 自动备份 `data.json` → `data.json.bak`
- ✅ 同时生成时间戳备份 `data.json.bak.YYYYMMDD_HHMMSS.bak`
- ✅ 打印每条配置的 `旧价 → 新价（差值）`
- ✅ 自动更新顶层 `updatedAt`

**输出示例**：

```
============================================================
价格更新明细
============================================================
  ✅ 腾龙 #1:   440000 →   445000 (+5000)
  ✅ 腾龙 #2:   240000 →   238000 (-2000)
  ❌ AK-12 #1: 在 data.json 里找不到
============================================================
✅ 完成：更新 2 个，跳过 0 个，未找到 1 个
```

---

## 完整流程示例

```bash
cd tools

# 1. 提取任务（只含启用的配置）
python extract_tasks.py

# 2. 抓取价格（首次需在浏览器里配置方案）
python scrape_prices.py

#   中途可按 Ctrl+C 中断，之后：
#   python scrape_prices.py --resume

# 3. 检查抓取结果（可选）
#    打开 scraped_prices.json 看有没有大量 error / not_found

# 4. 合并到 data.json
python merge_prices.py

# 5. 打开前端刷新，确认价格已更新
```

---

## 工具脚本

### `renumber_configs.py` — 重新编号武器配置

```bash
python renumber_configs.py
```

**用途**：把每个武器的 `configs` 从 `#1` 开始**连续重编号**。

**场景**：
- 手动删除过某些配置 → 编号出现空洞（`#1 #2 #5 #7`）
- 手动添加过配置 → 编号跳号（`#1 #2 #10`）

**示例**：
```
重编号前: #1, #2, #5, #7
重编号后: #1, #2, #3, #4
```

**注意**：
- **不改变配置顺序**（保持原顺序，只改 `id`）
- 每个武器独立编号（都从 `#1` 开始）
- 会**自动备份** `data.json`
- 重编号后前端需要**重新计算 TTK / 评分**（key 变了）

---

## 首次运行配置

### 1. 准备项目数据

确保 `public/data.json` 存在，且已配置好你的武器方案。

### 2. 提取任务

```bash
cd tools
python extract_tasks.py
```

### 3. 首次抓取

```bash
python scrape_prices.py
```

**浏览器打开后**：

1. **登录 dfttk.com**（如果方案需要账号）
2. **切换到"烽火地带"**
3. **确保方案库里有你的方案**
   - 如果方案不在，先在 dfttk.com 里**创建 / 导入 / 保存**方案
4. **回终端按回车**

**首次运行后，浏览器数据会被保存到 `tools/_browser_profile/`**：
- 下次运行会自动带上
- 不用重新登录 / 重新配方案

**想清空重来**：

```bash
rm -rf tools/_browser_profile
```

下次运行会重新创建（需要重新配置）。

---

## 常见问题

### Q1: 抓取到一半崩了，能续跑吗？

**能**。重跑：

```bash
python scrape_prices.py --resume
```

会自动跳过 `scraped_prices.json` 里已经 `status = "ok"` 的任务。

### Q2: 中断脚本会丢结果吗？

**不会**。脚本在以下时机保存结果：
- 每抓 5 条（可配置）
- Ctrl+C 中断时
- 正常结束时
- 连续失败暂停时

### Q3: 为什么每次打开浏览器都没有我之前的方案？

**原因**：Playwright 默认用临时 profile，关闭后数据就丢了。

**解决**：`scrape_prices.py` 已使用**持久化 profile**（`launch_persistent_context`），数据会保存到 `tools/_browser_profile/`。

**第一次**：需要在浏览器里配置方案 → 按回车
**后续**：自动带方案 → 直接按回车

如果**每次都要重新配**，检查：
- `tools/_browser_profile/` 目录是否被创建
- 是否在用旧版 `scrape_prices.py`（用了 `launch()` 而不是 `launch_persistent_context()`）

### Q4: dfttk.com 改版了，脚本失效怎么办？

打开 `config.py`，根据新的 DOM 更新 `SELECTORS` 字典。

**定位方法**：
1. 浏览器打开 dfttk.com
2. F12 → Elements
3. 找到对应的元素，右键 → Copy → Copy selector
4. 更新 `config.py` 里 `SELECTORS` 的对应项

### Q5: 抓取时一直找不到"XX 方案 N"

**原因**：本地 `configId` 和 dfttk.com 的方案编号不对齐。

**排查**：
1. 打开 dfttk.com，切换到该武器
2. 打开方案库，看看方案卡片叫什么名字
3. 对比 `tasks.json` 里的 `schemeIndex`
4. 如果不对齐：
   - 修改 `data.json` 里的 `configId`
   - 或调整 `extract_tasks.py` 的提取逻辑

### Q6: 想只测试 1~2 个配置

手动编辑 `tools/tasks.json`，只保留 1~2 条，然后跑 `scrape_prices.py`。

或者用 `--start` 参数：

```bash
python scrape_prices.py --start 5
```

### Q7: 备份文件太多，磁盘占用大

`data.json.bak.*.bak` 是时间戳版本，可以定期清理：

```bash
# Linux/Mac：只保留最近 5 个
ls -t public/data.json.bak.*.bak | tail -n +6 | xargs rm

# Windows PowerShell：
Get-ChildItem public\data.json.bak.*.bak | Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 | Remove-Item
```

### Q8: 合并时提示"找不到武器/配置"

**原因**：`scraped_prices.json` 里的 `weaponId` / `configId` 和当前 `data.json` 不匹配。

**可能情况**：
- 抓取后又改了 `data.json` 的配置编号 → `configId` 对不上
- 抓取的武器已被删除 → `weaponId` 不存在

**解决**：重新跑 `extract_tasks.py` + `scrape_prices.py`。

### Q9: 可以用无头模式吗？

可以。修改 `config.py` 里 `HEADLESS = True`。

**但**：无头模式下首次运行**没法手动配置方案**。所以：
- **首次运行**：`HEADLESS = False`（配置方案）
- **后续运行**：可以改成 `True`（后台抓取）

---

## 常量速查（config.py）

| 常量 | 说明 |
|---|---|
| `DFTTK_URL` | 目标站点 URL |
| `HEADLESS` | 是否无头模式（调试时 `False`）|
| `USER_DATA_DIR` | Playwright 持久化 profile 目录 |
| `SELECTORS` | 所有 CSS 选择器 |
| `DATA_JSON` | 本地数据文件路径 |
| `DATA_BAK` | 备份文件路径 |
| `TASKS_JSON` | 任务清单路径 |
| `SCRAPED_JSON` | 抓取结果路径 |
| `STATUS_OK` / `STATUS_NOT_FOUND` / `STATUS_ERROR` | 状态码常量 |
| `WAIT_AFTER_*` | 各操作后的等待时间 |
| `MERGE_GROUPS` | 变体武器合并配置（**历史存档**）|

---

## 关于 MERGE_GROUPS

`config.py` 里的 `MERGE_GROUPS` 是一段**历史记录**：
- 早期项目里，腾龙 / QCQ171 / QJB201 各有 3 个独立武器条目（标准 / 高导 / 稳固）
- 后来重构为**一个武器 + 多个枪管**（用 `rofMult` 和 `ranges` 区分）
- 合并脚本已执行完毕，**数据已完成合并**

**保留此配置的用途**：
- 知识存档，说明"哪些武器曾经历变体合并"
- 未来若需重新合并，可基于此配置写一次性脚本

---

## 已删除的脚本

以下脚本是**项目早期**的临时需求，现已删除：

| 脚本 | 删除原因 |
|---|---|
| `sort_armors.py` | 护甲排序已由前端 `DataManager._sortArmorsForExport` 完成 |
| `sort_configs_by_price.py` | 配置排序已由前端展示层完成 |
| `renumber_configs.py` | ~~已删除~~（**恢复**：见"工具脚本"一节）|
| `updata.py`（旧名 `merge_weapons.py`）| 变体武器合并已完成，是一次性脚本 |

---

## 后续可选增强

- [ ] 抓取支持**多 tab 并发**（加速）
- [ ] 抓取失败自动**重试 N 次**
- [ ] 合并阶段加 **dry-run 模式**（只打印不写入）
- [ ] 抓取结果加 **导出 CSV**（便于人工核对）
- [ ] 数据校验脚本 `validate.py`（检查 `data.json` 合法性）

---

## 相关文件

- `../public/data.json` — 最终数据源（前端读取）
- `../src/core/DataManager.js` — 前端数据管理（含排序 / 重编号逻辑）
- `../README.md` — 项目总文档
```

---

## 文档要点总结

| 章节 | 面向 | 内容 |
|---|---|---|
| **目录结构** | 新用户 | 文件清单 |
| **环境准备** | 新用户 | 依赖安装 |
| **三阶段工作流** | 理解设计 | 流程图 |
| **阶段1/2/3 详解** | 日常使用 | 输入输出 + 示例 |
| **完整流程示例** | 快速上手 | 复制粘贴级别 |
| **工具脚本** | `renumber_configs.py` | 独立一节 |
| **首次运行配置** | 新用户 | 手把手 |
| **常见问题（9 个）** | 遇到问题时 | 排查 + 绕过方案 |
| **常量速查** | 改配置时 | 表格一览 |
| **MERGE_GROUPS 说明** | 维护者 | 背景知识 |
| **已删除的脚本** | 维护者 | 决策记录 |
| **后续增强** | 规划 | 待办清单 |

---

## 与上一版的差异

| 改动 | 说明 |
|---|---|
| 目录结构 | 加回 `renumber_configs.py` |
| **新增"工具脚本"章节** | 说明 `renumber_configs.py` |
| **中断与续跑** | 详细说明 Ctrl+C 的行为 |
| **命令行参数** | 列出所有参数 |
| **首次运行配置** | 手把手章节 |
| **常见问题** | 从 6 个扩展到 9 个 |
| **Q3 持久化说明** | 详细解释为什么不会再丢方案 |
| **Q9 无头模式** | 说明两种模式的取舍 |
| **已删除脚本** | 更正 `renumber_configs.py` 的状态 |
| **后续增强** | 更新待办清单 |

---

**所有 5 个文件都完成了**：

| # | 文件 | 状态 |
|---|---|---|
| 1 | `tools/config.py` | ✅ |
| 2 | `tools/scrape_prices.py` | ✅ |
| 3 | `tools/.gitignore` | ✅ |
| 4 | `tools/README.md` | ✅（本文） |
| 5 | `tools/extract_tasks.py` | ✅（前面已给） |
| 6 | `tools/merge_prices.py` | ✅（前面已给） |
| 7 | `tools/renumber_configs.py` | ✅（前面已给） |

**下一步**：跑一遍完整流程验证：

```bash
cd tools
python extract_tasks.py      # 提取任务
python scrape_prices.py      # 抓取（首次配置方案）
python merge_prices.py       # 合并结果
```

**有报错随时贴给我。**