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
├── requirements.txt       # 依赖清单
├── README.md              # 本文档
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

`requirements.txt` 里应该至少包含：

```
playwright
```

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
    "muzzle": "无",
    "oldPrice": 280000,
    "enabled": true
  }
]
```

**关键字段**：

- `schemeIndex`：dfttk.com 上方案卡片的编号（从 `configId` 的 `#N` 提取）
- `oldPrice`：当前 `data.json` 里的价格（用于合并时对比）
- 只有 `enabled !== false` 的配置会被提取

**跳过规则**：

- 无 `weaponId` 的条目 → 跳过
- 无 `id` 的配置 → 跳过
- **`configId` 里提取不到 `#数字`** → 跳过（避免爬虫拼出"方案 None"）
- **`enabled === false`** → 跳过（v2.1 起）

**输出统计**（末尾会打印）：

```
✅ 已提取 45 个任务
   跳过（无 weaponId）: 0
   跳过（无 configId）: 0
   跳过（无 schemeIndex）: 0
   跳过（已禁用）: 4

共 43 把武器

前 5 条示例:
  腾龙 #1 (方案 1) 枪管=新式蛟龙战术长枪管 枪口=无 旧价=280000
  ...
```

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
   本次会话：成功 12，跳过 0，失败 0
   累计结果：成功 12，跳过 0，失败 0

💡 恢复方法：
   重新运行  python scrape_prices.py --resume
```

**断点续跑**：

```bash
python scrape_prices.py --resume
```

自动跳过 `scraped_prices.json` 里已经 `status = "ok"` 的任务。

**其他中断方式**：

- 直接关闭浏览器窗口
- 主循环中 Ctrl+Z（Windows）/ Ctrl+D（Linux/Mac）

无论哪种方式，`finally` 块都会保证结果被保存、浏览器被关闭。

### 命令行参数

```bash
# 从头开始抓（默认）
python scrape_prices.py

# 从第 10 条任务开始抓（0-based，调试用）
python scrape_prices.py --start 10

# 自动跳过已成功的（续跑）
python scrape_prices.py --resume

# 每抓 10 条自动保存一次（默认 5）
python scrape_prices.py --save-every 10

# 连续失败 10 次才暂停（默认 5，0 = 不暂停）
python scrape_prices.py --max-consecutive-fail 10

# 打印详细调试日志
python scrape_prices.py --debug

# 组合使用
python scrape_prices.py --resume --save-every 3 --max-consecutive-fail 3
```

| 参数 | 默认 | 说明 |
|---|---|---|
| `--start N` | 0 | 从第 N 条任务开始（0-based） |
| `--resume` | 关 | 自动跳过已成功抓过的 |
| `--save-every N` | 5 | 每抓 N 条自动保存一次 |
| `--max-consecutive-fail N` | 5 | 连续失败 N 次暂停（0 = 不暂停） |
| `--debug` | 关 | 打印 `[debug]` 日志 |

### 输出示例（`scraped_prices.json`）

```json
[
  {
    "weaponId": 41,
    "weaponName": "腾龙",
    "configId": "#1",
    "newPrice": 244411,
    "status": "ok",
    "error": null
  }
]
```

**状态码**：

| 状态 | 含义 | 合并阶段 |
|---|---|---|
| `ok` | 抓取成功 | 会更新价格 |
| `not_found` | 找不到对应方案卡片（正常跳过） | 跳过 |
| `error` | 抓取出错（超时 / 网络等） | 跳过 |

> ⚠️ 抓取速度约 **0.5 秒/任务**（v4 起条件等待优化）。45 个任务 ≈ 25 秒。

### 连续失败保护

如果连续失败（`not_found` 或 `error`）达到阈值（默认 5 次），脚本会：

1. 自动保存当前结果
2. 暂停并询问：`输入 c 继续，其他键中断（Ctrl+C 也行）`
3. 如果选 `c` → 重置失败计数，继续
4. 否则 → 中断退出

**为什么加这个**：避免你不在电脑前时，脚本一路失败跑完所有任务。

### 性能优化（v4）

`WAIT_AFTER_*` 常量（在 `config.py` 里）现在是**兜底超时**，不是"死等"：

- 旧版：`wait_for_timeout(N)` → 死等 N 毫秒
- 新版：`wait_for(state=..., timeout=N)` / `wait_for_function(..., timeout=N)`
  - 条件满足立即返回（通常 50~200ms）
  - 条件不满足才等满 N 毫秒（异常情况）

实测：单条任务从 ~1.4s 降到 ~0.5s。

**如果抓取不稳定**（找不到元素 / 抓错价），适当调大 `config.py` 里的 `WAIT_AFTER_*` 值：

- 本地快环境：用默认值
- 本地慢环境：整体 ×2
- 网络差：整体 ×3

---

## 阶段3：合并结果

```bash
python merge_prices.py
```

**做什么**：把 `scraped_prices.json` 里的新价格合并回 `public/data.json`。

**安全措施**：

- ✅ 只处理 `status === "ok"` 的条目
- ✅ 自动备份 `data.json` → `data.json.bak`（覆盖）
- ✅ 同时生成时间戳备份 `data.json.bak.YYYYMMDD_HHMMSS.bak`（保留历史）
- ✅ 打印每条配置的 `旧价 → 新价（差值）`
- ✅ 自动更新顶层 `updatedAt`
- ✅ **价格规整到整万**（`281635 → 280000`）

**价格规整说明**：

抓取到的原始价格（如 `281635`）会先**规整到最接近的整万**（如 `280000`）再写入。

- 规整规则：`round(price / 10000) * 10000`
- 打印时会显示 `[抓取 281635 → 规整 280000]`

**输出示例**：

```
读取抓取结果: .../scraped_prices.json
读取数据文件: .../public/data.json
✅ 已备份原文件到: .../public/data.json.bak
✅ 已备份时间戳版本: .../public/data.json.bak.20260926_101720.bak

======================================================================
价格更新明细
======================================================================
  ✅ 腾龙 #1:    280000 →   240000 (-40000)  [抓取 244411 → 规整 240000]
  ✅ AK12 #1:    230000 →   200000 (-30000)  [抓取 201560 → 规整 200000]
  ✅ AKM #1:     300000 →   260000 (-40000)  [抓取 261297 → 规整 260000]
  ...
  ❌ XXX #1: 在 data.json 里找不到

📅 updatedAt: 2026-09-17 → 2026-09-26

======================================================================
✅ 完成：更新 36 个，跳过 0 个，未找到 0 个
   💰 其中 30 个价格被规整到整万
   数据文件: .../public/data.json
   备份文件: .../public/data.json.bak
======================================================================
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
# Linux / Mac
rm -rf tools/_browser_profile

# Windows PowerShell
Remove-Item tools/_browser_profile -Recurse -Force
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
- 是否有两个 `scrape_prices.py` 同时在跑（会互相锁 profile）

### Q4: dfttk.com 改版了，脚本失效怎么办？

打开 `config.py`，根据新的 DOM 更新 `SELECTORS` 字典。

**定位方法**：

1. 浏览器打开 dfttk.com
2. F12 → Elements
3. 找到对应的元素，右键 → Copy → Copy selector
4. 更新 `config.py` 里 `SELECTORS` 的对应项

`config.py` 里已经用注释列出了 DOM 层级速查，改动时对照着看。

### Q5: 抓取时一直找不到"XX 方案 N"

**原因**：本地 `configId` 和 dfttk.com 的方案编号不对齐。

**排查**：

1. 打开 dfttk.com，切换到该武器
2. 打开方案库，看看方案卡片叫什么名字
3. 对比 `tasks.json` 里的 `schemeIndex`
4. 如果不对齐：
   - 修改 `data.json` 里的 `configId`
   - 或调整 `extract_tasks.py` 的提取逻辑

**补充**：`extract_tasks.py` 已经做了"提取不到 `#数字` 就跳过"的处理，避免爬到"方案 None"。

### Q6: 想只测试 1~2 个配置

**方法 A**：用 `--start` 参数

```bash
python scrape_prices.py --start 5
```

**方法 B**：手动编辑 `tools/tasks.json`，只保留 1~2 条，然后跑 `scrape_prices.py`。

### Q7: 备份文件太多，磁盘占用大

`data.json.bak.*.bak` 是时间戳版本，可以定期清理：

```bash
# Linux / Mac：只保留最近 5 个
ls -t public/data.json.bak.*.bak | tail -n +6 | xargs rm

# Windows PowerShell：只保留最近 5 个
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

### Q10: 抓取速度太慢，怎么优化？

**v4 起已优化**：
- 从"死等"改为"条件等待"
- 正常情况 50~200ms 返回，异常才等满超时
- 单条任务从 ~1.4s 降到 ~0.5s

**如果还是慢**：

1. 检查网络（dfttk.com 响应速度）
2. 调小 `config.py` 里的 `WAIT_POLL_INTERVAL`（默认 50ms）
3. 参考"后续可选增强"里的"多 tab 并发"

### Q11: 抓到的价格有小数 / 异常大 / 异常小

**检查顺序**：

1. 打开 `scraped_prices.json`，看 `newPrice` 原始值
2. 如果原始值异常 → 是抓取问题（DOM 变化 / 选择器失效）
3. 如果原始值正常但合并不对 → 检查 `merge_prices.py` 的 `round_to_wan`

**注意**：`merge_prices.py` 会把价格规整到**整万**。如果抓的是 `5000` 这种小价格，规整后会是 `0` 或 `10000`。这个规则针对"武器整枪价格"设计（都是几十万级别的），不适用于子弹价格（那个不走这个脚本）。

### Q12: 为什么 `updatedAt` 每次都变？

`merge_prices.py` 在**每次成功运行后**都会把顶层 `updatedAt` 设为**当天日期**（`YYYY-MM-DD`）。

如果只想更新价格不想改日期，手动改 `merge_prices.py` 或跳过这行。

---

## 常量速查（config.py）

| 常量 | 说明 |
|---|---|
| `TOOLS_DIR` | 本文件目录（`tools/`） |
| `PROJECT_ROOT` | 项目根目录 |
| `DATA_JSON` | `public/data.json` |
| `DATA_BAK` | `public/data.json.bak` |
| `TASKS_JSON` | `tools/tasks.json` |
| `SCRAPED_JSON` | `tools/scraped_prices.json` |
| `USER_DATA_DIR` | Playwright 持久化 profile 目录 |
| `DFTTK_URL` | 目标站点 URL |
| `HEADLESS` | 是否无头模式（默认 `False`） |
| `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` | 浏览器窗口尺寸 |
| `SELECTORS` | 所有 CSS 选择器 |
| `WAIT_AFTER_*` | 各操作的"兜底超时"（毫秒） |
| `WAIT_POLL_INTERVAL` | `wait_for_function` 的轮询间隔（毫秒） |
| `MERGE_GROUPS` | 变体武器合并配置（历史存档） |
| `STATUS_OK` | `"ok"` |
| `STATUS_NOT_FOUND` | `"not_found"` |
| `STATUS_ERROR` | `"error"` |

---

## 关于 MERGE_GROUPS

`config.py` 里的 `MERGE_GROUPS` 是一段**历史记录**：

- 早期项目里，腾龙 / QCQ171 / QJB201 各有 3 个独立武器条目（标准 / 高导 / 稳固）
- 后来重构为**一个武器 + 多个枪管**（用 `rofMult` 和 `ranges` 区分）
- 合并脚本已执行完毕，**数据已完成合并**
- 每个 group 的 `status` 都是 `"merged"`

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
| `updata.py`（旧名 `merge_weapons.py`）| 变体武器合并已完成，是一次性脚本 |

> 如果你需要"重新编号武器配置"（`#1 #2 #5 #7` → `#1 #2 #3 #4`），
> 可以临时写一个一次性脚本，或者手动在 `data.json` 里改。
> **前端不做自动重编号**（因为会破坏已有缓存 key）。

---

## 后续可选增强

- [ ] 抓取支持**多 tab 并发**（加速）
- [ ] 抓取失败自动**重试 N 次**
- [ ] 合并阶段加 **dry-run 模式**（只打印不写入）
- [ ] 抓取结果加 **导出 CSV**（便于人工核对）
- [ ] 数据校验脚本 `validate.py`（检查 `data.json` 合法性）
- [ ] `.gitignore` 补充（忽略 `tasks.json` / `scraped_prices.json` / `_browser_profile/`）

---

## 相关文件

- `../public/data.json` — 最终数据源（前端读取）
- `../src/core/DataManager.js` — 前端数据管理（含排序逻辑）
- `../README.md` — 项目总文档