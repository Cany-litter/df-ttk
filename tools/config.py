# tools/config.py
#
# tools 目录的统一配置
#
# 所有常量集中在这里：
#   - 路径常量
#   - 爬虫目标 URL
#   - 浏览器持久化目录
#   - CSS 选择器
#   - 等待时间（v3：作为"兜底超时"，实际用条件等待）
#   - 合并组（历史记录）
#
# 其他脚本通过 `from config import ...` 引用
#
# ⭐ v2 改动（根据 dfttk.com 实际 DOM 更新）：
#   - 修正 CSS 选择器（对齐截图里的真实 DOM）
#   - 新增"二次确认对话框"选择器
#
# ⭐ v3 改动（性能优化）：
#   - 等待常量语义变化：从"死等时间"改为"兜底超时"
#   - scrape_prices.py 改用 wait_for / wait_for_function
#   - 正常情况 50~200ms 返回，异常情况才等满这些值
#   - 新增 WAIT_POLL_INTERVAL（wait_for_function 的轮询间隔）
#
# ⚠️ 如果 dfttk.com 更新 DOM，需同步修改 SELECTORS

import os

# ============================================================
# 路径
# ============================================================

# 本文件所在目录（tools/）
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))

# 项目根目录（tools/ 的上一级）
PROJECT_ROOT = os.path.dirname(TOOLS_DIR)

# 数据文件
DATA_JSON = os.path.join(PROJECT_ROOT, "public", "data.json")
DATA_BAK = os.path.join(PROJECT_ROOT, "public", "data.json.bak")

# 中间产物
TASKS_JSON = os.path.join(TOOLS_DIR, "tasks.json")
SCRAPED_JSON = os.path.join(TOOLS_DIR, "scraped_prices.json")


# ============================================================
# 持久化用户数据目录
# ============================================================
#
# Playwright 默认每次 launch() 都开一个全新临时浏览器，
# cookie / localStorage / 已保存的方案在关闭后全部丢弃。
#
# 使用 launch_persistent_context(user_data_dir) 可以把浏览器数据
# 写到磁盘，下次启动时自动加载。
#
# 效果：
#   - 首次运行：需要在浏览器里登录 + 配置方案，然后按回车
#   - 后续运行：自动带上已保存的方案，直接按回车即可
#
# 想清空重来：删除整个 _browser_profile/ 目录
#   rm -rf tools/_browser_profile
#
# ⚠️ 不要同时运行两个 scrape_prices.py，会互相锁住 profile。

USER_DATA_DIR = os.path.join(TOOLS_DIR, "_browser_profile")


# ============================================================
# 爬虫配置
# ============================================================

# 目标站点
DFTTK_URL = "https://dfttk.com/firefight/builder"

# 是否无头模式（调试时保持 False，能看到浏览器）
# ⚠️ 首次运行必须 False（需要在浏览器里配置方案）
HEADLESS = False

# 浏览器窗口尺寸
VIEWPORT_WIDTH = 1440
VIEWPORT_HEIGHT = 900


# ============================================================
# 等待时间（毫秒）
# ============================================================
#
# ⭐ v3 优化：这些值现在作为"兜底超时"，实际使用条件等待。
#
#   语义变化：
#     旧版：wait_for_timeout(N)  → 死等 N 毫秒
#     新版：wait_for(state=..., timeout=N) / wait_for_function(..., timeout=N)
#           → 条件满足立即返回（通常 50~200ms）
#           → 条件不满足才等满 N 毫秒（异常情况）
#
#   实测效果（本地快环境）：
#     单条任务从 ~1.4s 降到 ~0.5s
#     100 条从 ~2.5 分钟降到 ~50 秒
#
# 如果发现抓取不稳定（找不到元素 / 抓错价），适当调大这些值。
# 推荐调法：
#   - 本地快环境：用默认值
#   - 本地慢环境：整体 ×2
#   - 网络差：整体 ×3

# 点开武器选择器 → 等搜索框出现
WAIT_AFTER_SELECTOR_CLICK = 1500

# 填入搜索词 → 等列表过滤出匹配项
WAIT_AFTER_SEARCH = 1500

# 点选武器 → 等武器切换完成（下拉框消失）
WAIT_AFTER_WEAPON_SWITCH = 2000

# 点开方案库按钮 → 等抽屉滑出 + 卡片渲染
WAIT_AFTER_LIBRARY_OPEN = 1500

# 点"载入方案" → 等弹窗出现 + 价格异步加载完成
WAIT_AFTER_LOAD = 2500

# 关闭方案库 → 等抽屉消失
WAIT_AFTER_CLOSE_LIBRARY = 800

# wait_for_function 的轮询间隔（越小越灵敏，但 CPU 占用稍高）
WAIT_POLL_INTERVAL = 50


# ============================================================
# CSS 选择器（dfttk.com）
# ============================================================
#
# ⚠️ 如果 dfttk.com 更新 DOM，这里的选择器需要同步修改。
#    修改后建议先跑一次小批量测试（手动把 tasks.json 里只留 2~3 条）。
#
# DOM 层级速查：
#
#   武器选择器：
#     .weapon-builder-weapon-selector
#       └─ .selector-trigger
#            └─ .selected-content-wrapper
#                 └─ .option-info
#                      ├─ .option-name          （如 "腾龙"）
#                      └─ .option-description   （如 "突击步枪"）
#
#   下拉框（点开后）：
#     .dropdown-menu
#       ├─ .search-container
#       │    └─ input.search-input
#       └─ .options-list
#            └─ .option-item
#                 └─ .option-info
#                      ├─ .option-name
#                      └─ .option-description
#
#   方案库按钮：
#     button.weapon-loadout-library-button
#
#   方案库抽屉：
#     aside.weapon-loadout-drawer
#       └─ .weapon-loadout-drawer-list
#            └─ article.weapon-loadout-card
#                 ├─ .weapon-loadout-card-copy
#                 │    ├─ strong              （如 "腾龙 方案 1"）
#                 │    └─ small               （如 "7 个配件 · 更新于 ..."）
#                 └─ .weapon-loadout-card-actions
#                      ├─ button.is-primary   （"载入"按钮）
#                      └─ .weapon-loadout-more
#
#   关闭按钮：
#     button.weapon-loadout-close
#
#   二次确认弹窗（点"载入"后出现）：
#     .weapon-loadout-dialog-backdrop
#       └─ .weapon-loadout-dialog
#            └─ .weapon-loadout-dialog-actions
#                 ├─ button                （"取消"）
#                 └─ button.is-primary     （"载入方案"）  ⭐ 要点的
#
#   总价：
#     .weapon-builder-total-value
#       └─ .weapon-builder-total-value-copy
#            └─ strong                    （如 "256,359"）

SELECTORS = {
    # ---------- 武器选择器 ----------
    "weapon_selector": ".weapon-builder-weapon-selector",
    "search_input": ".search-input",
    "option_item": ".option-item",
    "option_name": ".option-name",

    # ---------- 方案库 ----------
    "library_btn": "button.weapon-loadout-library-button",
    "drawer": ".weapon-loadout-drawer",
    "drawer_close_btn": "button.weapon-loadout-close",

    # ---------- 方案卡片 ----------
    "scheme_card": ".weapon-loadout-card",
    "scheme_name": ".weapon-loadout-card-copy strong",
    "load_btn": ".weapon-loadout-card-actions button.is-primary",

    # ---------- 二次确认对话框 ----------
    "dialog": ".weapon-loadout-dialog",
    "dialog_confirm_btn": ".weapon-loadout-dialog-actions button.is-primary",

    # ---------- 总价 ----------
    "price": ".weapon-builder-total-value strong",
}


# ============================================================
# 合并组（历史记录，已执行完毕）
# ============================================================
#
# ⚠️ 这些组已经合并完成（腾龙/QCQ171/QJB201 的变体已并入主武器），
#    保留此配置仅作为"知识存档"。
#
# 未来若需要重新合并变体武器，可以基于此配置写一次性脚本。
#
# 合并逻辑（历史）：
#   1. 主武器所有枪管名加"（标准）"后缀
#   2. 每个变体的枪管复制一份到主武器，加上"（高速导气）"或"（稳固导气）"后缀
#   3. 变体的 rof 差异通过新枪管的 rofMult 表达
#   4. 变体的 ranges 差异通过新枪管的 ranges 字段表达
#   5. 变体的 configs 合并到主武器，barrelId 指向新建的枪管
#   6. 删掉变体的 weapons 和 prices 条目

MERGE_GROUPS = [
    {
        "main_name": "腾龙",
        "main_id": 41,
        "variants": [
            {"id": 42, "suffix": "高速导气", "type": "high"},
            {"id": 43, "suffix": "稳固导气", "type": "stable"},
        ],
        "status": "merged",
    },
    {
        "main_name": "QCQ171",
        "main_id": 31,
        "variants": [
            {"id": 32, "suffix": "高速导气", "type": "high"},
            {"id": 33, "suffix": "稳固导气", "type": "stable"},
        ],
        "status": "merged",
    },
    {
        "main_name": "QJB201",
        "main_id": 28,
        "variants": [
            {"id": 29, "suffix": "高速导气", "type": "high"},
            {"id": 30, "suffix": "稳固导气", "type": "stable"},
        ],
        "status": "merged",
    },
]


# ============================================================
# 状态码
# ============================================================

STATUS_OK = "ok"
STATUS_NOT_FOUND = "not_found"
STATUS_ERROR = "error"