# tools/_common.py
#
# 公共工具：所有 update_*.py / collect_*.py 共用
#
# 内容：
#   - JSON 读写
#   - 类型兜底
#   - 备份
#   - 日志
#   - Playwright 启动
#   - Playwright 常用交互（切枪/方案库/载方案）
#   - 读 builder 页属性（开镜时间 / 呼吸晃动 / 屏息时长 / 屏息减免
#                       / 后坐力 / 稳定性）
#   - 信号处理
#
# ⭐ 优化（快速版交互）：
#   1. switch_weapon：fill 后先短等 300ms → 查 exact.count()
#      → 不行再 wait_for_function（避免正常情况等满 1s）
#   2. open_library：合并"抽屉可见 + 卡片渲染"成一次 wait_for_function
#   3. load_scheme：删掉"等价格变化"（切枪时 dfttk 会自动载入上次方案，
#      载入同一套时价格不变，等下去纯浪费），改成点确认后短缓冲 150ms

import json
import os
import re
import shutil
import signal
import sys
from datetime import datetime

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from config import (
    DATA_JSON,
    DATA_BAK,
    USER_DATA_DIR,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    HEADLESS,
    SELECTORS,
    WAIT_AFTER_SELECTOR_CLICK,
    WAIT_AFTER_SEARCH,
    WAIT_AFTER_WEAPON_SWITCH,
    WAIT_AFTER_LIBRARY_OPEN,
    WAIT_AFTER_LOAD,
    WAIT_AFTER_CLOSE_LIBRARY,
    WAIT_POLL_INTERVAL,
)


# ============================================================
# 快速版：本地覆盖的短超时 / 短缓冲
# ============================================================

T_SEARCH_BUFFER = 300
T_LOAD_BUFFER = 150
T_LIBRARY_TOTAL = 1200


# ============================================================
# builder 页属性读取相关
# ============================================================

LASER_TOGGLE_SELECTOR = "button.weapon-builder-laser-toggle"
SUBSTAT_ROW_SELECTOR = ".weapon-builder-substat-row"
AFTER_LASER_TOGGLE_WAIT = 500
T_SUBSTAT_READ_RETRY = 3
SUBSTAT_READ_INTERVAL_MS = 200


# ============================================================
# 调试日志
# ============================================================

_DEBUG = False
_INTERRUPTED = False


def set_debug(enabled):
    global _DEBUG
    _DEBUG = enabled


def dlog(msg):
    if _DEBUG:
        print(f"      [debug] {msg}")


def is_interrupted():
    return _INTERRUPTED


def _signal_handler(signum, frame):
    global _INTERRUPTED
    if _INTERRUPTED:
        print("\n\n⚠️ 强制退出...")
        sys.exit(1)
    _INTERRUPTED = True
    print("\n\n⚠️ 收到中断信号（Ctrl+C），正在保存已抓结果...")
    print("   （再按一次 Ctrl+C 可强制退出）\n")


def install_signal_handler():
    signal.signal(signal.SIGINT, _signal_handler)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _signal_handler)


# ============================================================
# JSON 读写
# ============================================================

def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            return default
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON 解析失败: {path}\n{e}")


def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 类型兜底
# ============================================================

def safe_int(value, default=0):
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def safe_str(value, default=""):
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


# ============================================================
# 备份 data.json
# ============================================================

def backup_data_json():
    shutil.copy2(DATA_JSON, DATA_BAK)
    print(f"✅ 已备份原文件到: {DATA_BAK}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped = f"{DATA_BAK}.{ts}.bak"
    shutil.copy2(DATA_JSON, timestamped)
    print(f"✅ 已备份时间戳版本: {timestamped}")


# ============================================================
# Playwright 启动
# ============================================================

def launch_browser(headless=None, fullscreen=True):
    if headless is None:
        headless = HEADLESS

    os.makedirs(USER_DATA_DIR, exist_ok=True)

    pw = sync_playwright().start()

    launch_args = ["--disable-blink-features=AutomationControlled"]

    if fullscreen:
        launch_args.append("--start-maximized")
        context = pw.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=headless,
            viewport=None,
            no_viewport=True,
            args=launch_args,
        )
    else:
        context = pw.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=headless,
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            args=launch_args,
        )

    page = context.pages[0] if context.pages else context.new_page()
    return pw, context, page


def close_browser(pw, context):
    try:
        context.close()
    except Exception:
        pass
    try:
        pw.stop()
    except Exception:
        pass


def profile_exists():
    if not os.path.isdir(USER_DATA_DIR):
        return False
    try:
        return len(os.listdir(USER_DATA_DIR)) > 0
    except Exception:
        return False


# ============================================================
# Playwright 交互（dfttk 武器方案）
# ============================================================

def switch_weapon(page, weapon_name):
    dlog(f"switch_weapon: {weapon_name}")

    page.locator(SELECTORS["weapon_selector"]).click()
    page.locator(SELECTORS["search_input"]).wait_for(
        state="visible", timeout=WAIT_AFTER_SELECTOR_CLICK
    )

    search = page.locator(SELECTORS["search_input"])
    search.fill(weapon_name)

    page.wait_for_timeout(T_SEARCH_BUFFER)

    escaped = json.dumps(weapon_name, ensure_ascii=False)
    exact_selector = f'{SELECTORS["option_name"]}:text-is({escaped})'
    exact_option = page.locator(SELECTORS["option_item"]).filter(
        has=page.locator(exact_selector)
    ).first

    if exact_option.count() == 0:
        try:
            page.wait_for_function(
                """(name) => {
                    const items = document.querySelectorAll('.option-item');
                    for (const item of items) {
                        const nameEl = item.querySelector('.option-name');
                        if (nameEl && nameEl.innerText.trim() === name)
                            return true;
                    }
                    return false;
                }""",
                arg=weapon_name,
                timeout=WAIT_AFTER_SEARCH,
                polling=WAIT_POLL_INTERVAL,
            )
        except PlaywrightTimeout:
            dlog(f"搜索 '{weapon_name}' 精确匹配超时，尝试回退")

    if exact_option.count() > 0:
        dlog(f"精确匹配: {weapon_name}")
        exact_option.click()
    else:
        dlog(f"未找到精确匹配 '{weapon_name}'，回退子串匹配")
        option = page.locator(SELECTORS["option_item"]).filter(
            has=page.locator(SELECTORS["option_name"], has_text=weapon_name)
        ).first
        option.click()

    try:
        page.locator(SELECTORS["search_input"]).wait_for(
            state="hidden", timeout=WAIT_AFTER_WEAPON_SWITCH
        )
    except PlaywrightTimeout:
        dlog(f"武器切换 '{weapon_name}' 超时（下拉框未消失）")


def open_library(page):
    dlog("open_library")

    drawer = page.locator(SELECTORS["drawer"])
    if drawer.count() > 0 and drawer.is_visible():
        dlog("抽屉已打开，跳过")
        return

    page.locator(SELECTORS["library_btn"]).click()

    try:
        page.wait_for_function(
            """() => {
                const drawer = document.querySelector(
                    '.weapon-loadout-drawer');
                if (!drawer) return false;
                if (drawer.offsetParent === null) return false;
                const hasCard = drawer.querySelector(
                    '.weapon-loadout-card');
                const hasEmpty = drawer.innerText.includes(
                    '还没有保存方案');
                return hasCard || hasEmpty;
            }""",
            timeout=T_LIBRARY_TOTAL,
            polling=WAIT_POLL_INTERVAL,
        )
        dlog("抽屉已打开 + 卡片已渲染")
    except PlaywrightTimeout:
        dlog("打开方案库超时（抽屉或卡片未就绪）")


def close_library(page, max_retry=2):
    dlog("close_library")

    for attempt in range(max_retry):
        try:
            drawer = page.locator(SELECTORS["drawer"])
            if drawer.count() == 0:
                return True
            if not drawer.is_visible():
                return True

            page.keyboard.press("Escape")
            try:
                drawer.wait_for(state="hidden", timeout=WAIT_AFTER_CLOSE_LIBRARY)
                dlog(f"Escape 关闭成功 (attempt={attempt+1})")
                return True
            except PlaywrightTimeout:
                dlog(f"Escape 未关闭 (attempt={attempt+1})")

            close_btn = page.locator(SELECTORS["drawer_close_btn"]).first
            if close_btn.count() > 0:
                try:
                    close_btn.click(force=True, timeout=1000)
                    drawer.wait_for(state="hidden", timeout=WAIT_AFTER_CLOSE_LIBRARY)
                    dlog(f"按钮关闭成功 (attempt={attempt+1})")
                    return True
                except PlaywrightTimeout:
                    dlog(f"按钮未关闭 (attempt={attempt+1})")
        except Exception as e:
            dlog(f"close_library 异常: {e}")

    return False


def load_scheme(page, task):
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]
    scheme_text = f"{weapon_name} 方案 {scheme_index}"

    escaped = json.dumps(scheme_text, ensure_ascii=False)
    scheme_name_selector = f'{SELECTORS["scheme_name"]}:text-is({escaped})'

    card = page.locator(SELECTORS["scheme_card"]).filter(
        has=page.locator(scheme_name_selector)
    ).first

    try:
        card.wait_for(state="attached", timeout=WAIT_AFTER_SEARCH)
    except PlaywrightTimeout:
        return False

    card.locator(SELECTORS["load_btn"]).click()

    dialog_btn = page.locator(SELECTORS["dialog_confirm_btn"])
    try:
        dialog_btn.wait_for(state="visible", timeout=WAIT_AFTER_LOAD)
        dialog_btn.click()
    except PlaywrightTimeout:
        pass

    page.wait_for_timeout(T_LOAD_BUFFER)
    return True


# ============================================================
# 读 builder 页属性
# ============================================================

def ensure_laser_on(page):
    try:
        result = page.evaluate("""(sel) => {
            const btn = document.querySelector(sel);
            if (!btn) return 'no_button';
            const txt = (btn.innerText || '').trim();
            if (txt.includes('关闭')) {
                btn.click();
                return 'clicked';
            }
            return 'already_on';
        }""", LASER_TOGGLE_SELECTOR)
        return result or 'error'
    except Exception:
        return 'error'


def _read_substat_raw(page, label_text,
                      retries=T_SUBSTAT_READ_RETRY,
                      interval_ms=SUBSTAT_READ_INTERVAL_MS):
    for _ in range(retries):
        try:
            val = page.evaluate("""(label) => {
                const rows = document.querySelectorAll(
                    '.weapon-builder-substat-row');
                for (const row of rows) {
                    const span = row.querySelector('span');
                    if (!span) continue;
                    if (span.innerText.trim() !== label) continue;
                    const strong = row.querySelector(
                        '.weapon-builder-substat-value strong');
                    if (!strong) continue;
                    return strong.innerText.trim();
                }
                return null;
            }""", label_text)
            if val is not None:
                return val
        except Exception:
            pass
        page.wait_for_timeout(interval_ms)
    return None


def _strip_unit(raw, kind='float'):
    if raw is None:
        return None
    m = re.search(r'-?\d+(?:\.\d+)?', str(raw))
    if not m:
        return None
    try:
        if kind == 'int':
            return int(float(m.group(0)))
        return float(m.group(0))
    except ValueError:
        return None


def read_substat(page, label_text, kind='float'):
    raw = _read_substat_raw(page, label_text)
    return _strip_unit(raw, kind)


def read_aim_speed(page):
    raw = _read_substat_raw(page, "开镜时间")
    return _strip_unit(raw, 'int')


def read_breath_sway(page):
    raw = _read_substat_raw(page, "呼吸晃动范围")
    return _strip_unit(raw, 'float')


def read_breath_hold_duration(page):
    raw = _read_substat_raw(page, "屏息时长")
    return _strip_unit(raw, 'float')


def read_breath_hold_reduction(page):
    raw = _read_substat_raw(page, "屏息状态后坐力减免")
    return _strip_unit(raw, 'float')


# ⭐ 新增：后坐力 / 稳定性（配置级）
def read_recoil_vertical_auto(page):
    raw = _read_substat_raw(page, "全自动垂直后坐力")
    return _strip_unit(raw, 'float')


def read_recoil_horizontal_auto(page):
    raw = _read_substat_raw(page, "全自动水平后坐力")
    return _strip_unit(raw, 'float')


def read_recoil_vertical_burst(page):
    raw = _read_substat_raw(page, "单点/连发垂直后坐力")
    return _strip_unit(raw, 'float')


def read_recoil_horizontal_burst(page):
    raw = _read_substat_raw(page, "单点/连发水平后坐力")
    return _strip_unit(raw, 'float')


def read_stability_multiplier(page):
    raw = _read_substat_raw(page, "开火时武器稳定性")
    return _strip_unit(raw, 'float')


def read_all_substats(page):
    return {
        # 原有 4 个
        "aimSpeed":              read_aim_speed(page),
        "breathSway":            read_breath_sway(page),
        "breathHoldDuration":    read_breath_hold_duration(page),
        "breathHoldReduction":   read_breath_hold_reduction(page),
        # ⭐ 新增 5 个：后坐力 / 稳定性
        "recoilVerticalAuto":    read_recoil_vertical_auto(page),
        "recoilHorizontalAuto":  read_recoil_horizontal_auto(page),
        "recoilVerticalBurst":   read_recoil_vertical_burst(page),
        "recoilHorizontalBurst": read_recoil_horizontal_burst(page),
        "stabilityMultiplier":   read_stability_multiplier(page),
    }


def read_all_substats_with_laser(page):
    laser_state = ensure_laser_on(page)
    if laser_state == "clicked":
        page.wait_for_timeout(AFTER_LASER_TOGGLE_WAIT)
    substats = read_all_substats(page)
    return substats, laser_state


def read_aim_speed_with_laser(page):
    laser_state = ensure_laser_on(page)
    if laser_state == "clicked":
        page.wait_for_timeout(AFTER_LASER_TOGGLE_WAIT)
    aim_speed = read_aim_speed(page)
    return aim_speed, laser_state