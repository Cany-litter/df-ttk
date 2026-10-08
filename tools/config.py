# tools/config.py
#
# tools 目录的统一配置
#
# 所有常量集中在这里：
#   - 路径常量
#   - 爬虫目标 URL
#   - 浏览器持久化目录
#   - CSS 选择器
#   - 等待时间
#   - 合并组（历史记录）
#
# ⭐ v6 重构：
#   - 删除 _cache/ 相关常量（不再用中间产物）
#   - 每个 update_*.py 一步到位：读 data.json → 抓 → 写 data.json
#
# 注意：recoil 脚本的输出目录 RECOIL_OUTPUT_DIR 不是缓存，
#       是最终产物（后坐力结果 + 截图），保留。

import os

# ============================================================
# 路径
# ============================================================

# 本文件所在目录（tools/）
TOOLS_DIR = os.path.dirname(os.path.abspath(__file__))

# 项目根目录
PROJECT_ROOT = os.path.dirname(TOOLS_DIR)

# 数据文件
DATA_JSON = os.path.join(PROJECT_ROOT, "public", "data.json")
DATA_BAK = os.path.join(PROJECT_ROOT, "public", "data.json.bak")

# 后坐力结果目录（不是缓存，是最终产物）
RECOIL_OUTPUT_DIR = os.path.join(TOOLS_DIR, "recoil_results")


# ============================================================
# 持久化用户数据目录
# ============================================================

USER_DATA_DIR = os.path.join(TOOLS_DIR, "_browser_profile")


# ============================================================
# 爬虫配置（武器价格 - dfttk.com）
# ============================================================

DFTTK_URL = "https://dfttk.com/firefight/builder"

HEADLESS = False

VIEWPORT_WIDTH = 1440
VIEWPORT_HEIGHT = 1000


# ============================================================
# 爬虫配置（子弹价格 - orzice.com）
# ============================================================

ORZICE_AMMO_URL = "https://orzice.com/v/ammo"
ORZICE_AMMO_PARAMS = "a=ammo&top=2-2&p={page}&grade=-1&n="
ORZICE_AMMO_TOTAL_PAGES = 9
ORZICE_HEADLESS = False


# ============================================================
# 等待时间（毫秒） - 武器价格（dfttk.com）
# ============================================================

WAIT_AFTER_SELECTOR_CLICK = 1500
WAIT_AFTER_SEARCH = 1500
WAIT_AFTER_WEAPON_SWITCH = 2000
WAIT_AFTER_LIBRARY_OPEN = 1500
WAIT_AFTER_LOAD = 2500
WAIT_AFTER_CLOSE_LIBRARY = 800
WAIT_POLL_INTERVAL = 50


# ============================================================
# 等待时间（毫秒） - 子弹价格（orzice.com）
# ============================================================

WAIT_AFTER_AMMO_PAGE_LOAD = 5000
WAIT_AFTER_AMMO_PAGE_NAV = 800


# ============================================================
# CSS 选择器（dfttk.com） - 武器价格
# ============================================================

SELECTORS = {
    "weapon_selector": ".weapon-builder-weapon-selector",
    "search_input": ".search-input",
    "option_item": ".option-item",
    "option_name": ".option-name",

    "library_btn": "button.weapon-loadout-library-button",
    "drawer": ".weapon-loadout-drawer",
    "drawer_close_btn": "button.weapon-loadout-close",

    "scheme_card": ".weapon-loadout-card",
    "scheme_name": ".weapon-loadout-card-copy strong",
    "load_btn": ".weapon-loadout-card-actions button.is-primary",

    "dialog": ".weapon-loadout-dialog",
    "dialog_confirm_btn": ".weapon-loadout-dialog-actions button.is-primary",

    "price": ".weapon-builder-total-value strong",
}


# ============================================================
# CSS 选择器（orzice.com） - 子弹价格
# ============================================================

AMMO_SELECTORS = {
    "table": "table.ui-table",
    "row": "table.ui-table tbody tr",
    "name": ".ui-item-main .ui-tname",
    "price": ".ui-cell-gold .ui-num",
}


# ============================================================
# 合并组（历史记录，已执行完毕）
# ============================================================

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