# tools/test_recoil.py
#
# 全枪械后坐力测试（从 data.json 读任务）
#
# 两种模式：
#
# 1) 默认模式（打压枪测试）
#    30m：
#      1. 裸弹道
#      2. 平滑压枪
#      3. 平滑压枪 + 反馈拉枪 + 呼吸 + σ   ← 打 3 次，取平均
#    50m：反馈轮 ×3（阈值 4.5）
#    100m：反馈轮 ×3（阈值 4.0）
#    输出：_hit_rate.json（含 hitRate）
#
# 2) --aim-speed-only（只补开镜速度）
#    每把枪：切枪 → 载方案 → 确保镭射开启 → 读开镜时间
#    不压枪、不截图
#    输出：合并 aimSpeed 到 _hit_rate.json
#          （若 _hit_rate.json 不存在，则新建，只含 aimSpeed）
#
# ⭐ 测试弹容统一为 TEST_ROUNDS=30；实际弹容不足 30 时用实际弹容。
# ⭐ 排除：weaponId 在 EXCLUDE_WEAPON_IDS（默认 {50} = Marlin杠杆步枪）。
# ⭐ 同一距离的 3 次，用同一组 3 个 run 的随机源（跨距离公平）。
# ⭐ 截图只截第 1 次。
# ⭐ 期望中心 aim 按距离变化（假人近大远小，瞄准点下移）。
# ⭐ 理想反推轨迹用"30m 的 aim"作反推基准。
# ⭐ 加速度按时间（画布%/秒²），每发换算成 %/发。
#
# 用法：
#   python test_recoil.py
#   python test_recoil.py --weapon 41
#   python test_recoil.py --config 41#1
#   python test_recoil.py --limit 3
#   python test_recoil.py --no-clean
#
#   python test_recoil.py --aim-speed-only
#   python test_recoil.py --aim-speed-only --weapon 41
#   python test_recoil.py --aim-speed-only --config 41#1

import argparse
import hashlib
import os
import shutil
import math
import random
import re
import time
from datetime import datetime

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from config import (
    DFTTK_URL,
    SELECTORS,
    RECOIL_OUTPUT_DIR,
    DATA_JSON,
)
from _common import (
    install_signal_handler,
    launch_browser, close_browser, profile_exists,
    switch_weapon, open_library, close_library, load_scheme,
    load_json, save_json, safe_str,
)


# ============================================================
# 参数
# ============================================================

DISTANCES = [30, 50, 100]
FEEDBACK_RUNS = 3     # 每个距离的反馈轮重复次数

# ⭐ 测试弹容：统一打这么多发；实际弹容不足时用实际弹容
TEST_ROUNDS = 30

# ⭐ 排除枪械（仅 Marlin杠杆步枪）
EXCLUDE_WEAPON_IDS = {50}

SCOPE = 2.25
BLOOD_VALUE = 10000

AIM_X_RATIO = 0.50
AIM_Y_RATIO_BY_DISTANCE = {
    30:  0.45,
    50:  0.465,
    100: 0.48,
}
AIM_Y_RATIO_FALLBACK = 0.45

SMOOTH_WINDOW = 9

# ⭐ 压枪轨迹参数（按时间）
A_MAX_PER_SEC2 = 14.0
INITIAL_SPEED = 0.0

# ⭐ 开火稳定性参数
BASE_SIGMA_FALLBACK = 1.0
STABILITY_MULT_FALLBACK = 1.0
STABILITY_SIGMA_SCALE = 1.5

# ⭐ 呼吸晃动参数
BREATH_AMP_X = 4.0
BREATH_AMP_Y = 2.0
BREATH_FREQ  = 0.12
BREATH_Y_HARMONIC = 2.0

# ⭐ 反馈拉枪参数
FB_ACCEL_PER_SEC2 = 9.0
FB_THRESHOLD_BY_DISTANCE = {
    30: 5.0,
    50: 4.5,
    100: 4.0,
}
FB_THRESHOLD_FALLBACK = 5.0

# ⭐ 命中部位
PARTS_KNOWN = ['头部', '胸部', '腹部', '上臂', '下臂', '大腿', '小腿', '脱靶']

# ⭐ 镭射相关
AFTER_LASER_TOGGLE_WAIT = 500   # 点击镭射后等待
T_AIM_SPEED_READ_RETRY = 3      # 读开镜时间重试次数
AIM_SPEED_READ_INTERVAL_MS = 200

READ_RETRIES = 8
READ_RETRY_INTERVAL_MS = 200
T_RECOIL_PANEL_READY = 3000

AFTER_NEW_ROUND_WAIT = 500
BEFORE_MOUSE_DOWN_WAIT = 300
BETWEEN_ROUNDS_WAIT = 800
AFTER_SCOPE_CHANGE_WAIT = 800
AFTER_DISTANCE_CHANGE_WAIT = 800

T_RECOIL_CANVAS = 3000
T_BUILDER_READY = 3000

FIRE_RATE_DEFAULT = 800

CANVAS_SELECTOR = ".recoil-range-stage"
NEW_ROUND_SELECTOR = "button.recoil-range-new-round"
BACK_SELECTOR = "button.weapon-recoil-lab-back"
BLOOD_INPUT_SELECTOR = ".weapon-recoil-lab-number-field input[type='number']"
CAPACITY_SELECTOR = ".recoil-loadout-stat.is-capacity dd"
FIRE_RATE_SELECTOR = ".recoil-loadout-stat.is-fire-rate dd"
SLIDER_SELECTOR = ".weapon-recoil-lab-slider input[type='range']"
RECOIL_TEST_BTN_SELECTOR = "button.is-primary"

LASER_TOGGLE_SELECTOR = "button.weapon-builder-laser-toggle"
SUBSTAT_ROW_SELECTOR = ".weapon-builder-substat-row"

SCREENSHOT_DIR = os.path.join(RECOIL_OUTPUT_DIR, "screenshots")
HIT_RATE_JSON = os.path.join(RECOIL_OUTPUT_DIR, "_hit_rate.json")


def _fb_threshold(distance):
    return FB_THRESHOLD_BY_DISTANCE.get(distance, FB_THRESHOLD_FALLBACK)


def _aim_pct(distance):
    y_ratio = AIM_Y_RATIO_BY_DISTANCE.get(distance, AIM_Y_RATIO_FALLBACK)
    return {"x": AIM_X_RATIO * 100, "y": y_ratio * 100}


def _is_excluded(weapon_id):
    return weapon_id in EXCLUDE_WEAPON_IDS


# ============================================================
# 随机种子
# ============================================================

def _derive_seed(weapon_id, config_id, run=0):
    key = f"{weapon_id}#{config_id}#run{run}"
    h = hashlib.md5(key.encode("utf-8")).hexdigest()
    return int(h[:8], 16)


# ============================================================
# 任务提取
# ============================================================

def _extract_scheme_index(config_id):
    if not config_id:
        return None
    m = re.search(r"#(\d+)", str(config_id))
    return int(m.group(1)) if m else None


def _extract_tasks(data):
    prices = data.get("prices", [])
    if not prices:
        return [], {}

    tasks = []
    skipped = {
        "no_id": 0, "no_config": 0, "no_scheme": 0,
        "disabled": 0, "excluded": 0,
    }

    for entry in prices:
        weapon_id = entry.get("weaponId")
        weapon_name = safe_str(entry.get("weaponName"), default="未知武器")

        if weapon_id is None:
            skipped["no_id"] += 1
            continue

        if _is_excluded(weapon_id):
            skipped["excluded"] += 1
            continue

        configs = entry.get("configs", [])
        if not configs:
            continue

        for config in configs:
            config_id = config.get("id")
            if not config_id:
                skipped["no_config"] += 1
                continue
            if config.get("enabled") is False:
                skipped["disabled"] += 1
                continue

            scheme_index = _extract_scheme_index(config_id)
            if scheme_index is None:
                skipped["no_scheme"] += 1
                continue

            tasks.append({
                "weaponId": weapon_id,
                "weaponName": weapon_name,
                "configId": config_id,
                "schemeIndex": scheme_index,
            })

    return tasks, skipped


def _parse_config_filter(config_str):
    if not config_str:
        return None
    result = set()
    for part in config_str.split(","):
        part = part.strip()
        if not part:
            continue
        if "#" not in part:
            raise ValueError(
                f"--config 格式错误: {part}（应为 weaponId#configId）")
        w_str, c_str = part.split("#", 1)
        w = int(w_str.strip())
        c = "#" + c_str.strip().lstrip("#")
        result.add((w, c))
    return result


# ============================================================
# 清空输出目录
# ============================================================

def _clean_output_dir():
    if not os.path.isdir(RECOIL_OUTPUT_DIR):
        return
    for name in os.listdir(RECOIL_OUTPUT_DIR):
        path = os.path.join(RECOIL_OUTPUT_DIR, name)
        try:
            if os.path.isfile(path) or os.path.islink(path):
                os.remove(path)
            elif os.path.isdir(path):
                shutil.rmtree(path)
        except Exception as e:
            print(f"  ⚠️ 清空失败: {path} ({e})")
    print(f"🧹 已清空: {RECOIL_OUTPUT_DIR}")


# ============================================================
# 页面元素读取
# ============================================================

def _read_number_stable(page, selector, retries=READ_RETRIES,
                        interval_ms=READ_RETRY_INTERVAL_MS):
    last_val = None
    for _ in range(retries):
        try:
            el = page.locator(selector).first
            text = el.inner_text().strip()
            val = int("".join(c for c in text if c.isdigit()))
            if val > 0:
                if val == last_val:
                    return val
                last_val = val
        except Exception:
            pass
        page.wait_for_timeout(interval_ms)
    return last_val if last_val else 0


def _read_capacity(page):
    return _read_number_stable(page, CAPACITY_SELECTOR)


def _read_fire_rate(page):
    val = _read_number_stable(page, FIRE_RATE_SELECTOR)
    return val if val > 0 else FIRE_RATE_DEFAULT


def _read_stability_multiplier(page):
    try:
        return page.evaluate("""() => {
            const dts = document.querySelectorAll(
                '.recoil-dashboard-metrics dt');
            for (const dt of dts) {
                if (dt.innerText.trim() === '开火稳定性') {
                    const dd = dt.nextElementSibling;
                    if (!dd) continue;
                    const m = dd.innerText.match(/×\\s*([\\d.]+)/);
                    if (m) return parseFloat(m[1]);
                }
            }
            return null;
        }""")
    except Exception:
        return None


def _read_base_stability(data, weapon_name):
    try:
        for w in data.get("weapons", []):
            if w.get("name") == weapon_name:
                val = w.get("baseStability")
                if val is not None:
                    return float(val)
        return None
    except Exception:
        return None


def _read_shots(page):
    return page.evaluate("""() => {
        const PARTS = ['头部','胸部','腹部','上臂','下臂','大腿','小腿'];
        const markers = document.querySelectorAll('.recoil-shot-marker');
        const result = [];
        for (const m of markers) {
            const left = parseFloat(m.style.left);
            const top = parseFloat(m.style.top);
            if (isNaN(left) || isNaN(top)) continue;
            const miss = m.classList.contains('recoil-shot-miss');

            let part = null;
            if (miss) {
                part = '脱靶';
            } else {
                for (const p of PARTS) {
                    if (m.classList.contains('is-' + p) ||
                        m.classList.contains(p)) {
                        part = p;
                        break;
                    }
                }
                if (!part && m.dataset && m.dataset.part) {
                    part = m.dataset.part;
                }
                if (!part && m.title) {
                    for (const p of PARTS) {
                        if (m.title.includes(p)) { part = p; break; }
                    }
                }
                if (!part) {
                    const txt = (m.innerText || '').trim();
                    for (const p of PARTS) {
                        if (txt.includes(p)) { part = p; break; }
                    }
                }
                if (!part && m.getAttribute) {
                    const al = m.getAttribute('aria-label') || '';
                    for (const p of PARTS) {
                        if (al.includes(p)) { part = p; break; }
                    }
                }
            }

            result.push({ x: left, y: top, hit: !miss, part: part });
        }
        return result;
    }""")


def _read_aim_speed(page):
    """
    读开镜时间（ms）。在 .weapon-builder-substat-row 里找 label='开镜时间'。
    读不到返回 None。
    """
    for _ in range(T_AIM_SPEED_READ_RETRY):
        try:
            val = page.evaluate("""() => {
                const rows = document.querySelectorAll(
                    '.weapon-builder-substat-row');
                for (const row of rows) {
                    const label = row.querySelector('span');
                    if (!label) continue;
                    if (label.innerText.trim() !== '开镜时间') continue;
                    const strong = row.querySelector(
                        '.weapon-builder-substat-value strong');
                    if (!strong) continue;
                    const m = strong.innerText.match(/(\\d+)/);
                    if (m) return parseInt(m[1]);
                }
                return null;
            }""")
            if val is not None:
                return val
        except Exception:
            pass
        page.wait_for_timeout(AIM_SPEED_READ_INTERVAL_MS)
    return None


def _ensure_laser_on(page):
    """
    确保镭射开启：
      按钮文本含"开启" → 已经开启，不点
      按钮文本含"关闭" → 点击，让镭射开启
      没有按钮       → 不点
    返回状态字符串：'already_on' / 'clicked' / 'no_button' / 'error'
    """
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


# ============================================================
# 页面操作
# ============================================================

def _set_blood(page, value=BLOOD_VALUE):
    inp = page.locator(BLOOD_INPUT_SELECTOR).first
    inp.wait_for(state="visible", timeout=5000)
    inp.fill(str(value))
    inp.press("Enter")


def _set_slider_and_wait(page, index, value, timeout_ms=2000):
    page.evaluate("""(args) => {
        const sliders = document.querySelectorAll(args.selector);
        const slider = sliders[args.index];
        if (!slider) return false;
        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(slider, String(args.value));
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }""", {"selector": SLIDER_SELECTOR, "index": index, "value": value})

    try:
        page.wait_for_function(
            """(args) => {
                const sliders = document.querySelectorAll(args.selector);
                const slider = sliders[args.index];
                if (!slider) return false;
                return Math.abs(parseFloat(slider.value) - args.target) < 0.01;
            }""",
            arg={"selector": SLIDER_SELECTOR,
                 "index": index, "target": float(value)},
            timeout=timeout_ms, polling=50,
        )
        return True
    except PlaywrightTimeout:
        return False


def _set_distance(page, meters):
    _set_slider_and_wait(page, 0, meters)


def _set_scope(page, magnification):
    _set_slider_and_wait(page, 1, magnification)


def _wait_recoil_panel_ready(page, timeout_ms=T_RECOIL_PANEL_READY):
    try:
        page.wait_for_function("""
            () => {
                const cap = document.querySelector(
                    '.recoil-loadout-stat.is-capacity dd');
                const fr = document.querySelector(
                    '.recoil-loadout-stat.is-fire-rate dd');
                if (!cap || !fr) return false;
                const capTxt = (cap.innerText || '').trim();
                const frTxt = (fr.innerText || '').trim();
                if (!capTxt || !frTxt) return false;
                if (!/\\d+/.test(capTxt) || !/\\d+/.test(frTxt)) return false;
                return true;
            }
        """, timeout=timeout_ms, polling=50)
        return True
    except PlaywrightTimeout:
        return False


def _click_recoil_test(page):
    if "/recoil" in page.url:
        page.wait_for_timeout(500)
        _wait_recoil_panel_ready(page)
        return True

    try:
        btn = page.locator(RECOIL_TEST_BTN_SELECTOR).filter(
            has_text="压枪测试"
        ).first
        if btn.count() == 0:
            print(f"    ❌ 找不到'压枪测试'按钮（当前 URL: {page.url}）")
            return False
        btn.click(timeout=5000)
    except Exception as e:
        print(f"    ❌ 点击'压枪测试'失败: {e}")
        return False

    try:
        page.wait_for_url(lambda url: "/recoil" in url, timeout=8000)
    except PlaywrightTimeout:
        if "/recoil" not in page.url:
            print(f"    ❌ 未跳转到 recoil 页")
            return False

    try:
        page.locator(CANVAS_SELECTOR).first.wait_for(
            state="visible", timeout=T_RECOIL_CANVAS)
    except PlaywrightTimeout:
        print("    ⚠️ 画布未出现")

    _wait_recoil_panel_ready(page)
    return True


def _click_back_to_builder(page):
    if "/recoil" not in page.url:
        return True
    try:
        btn = page.locator(BACK_SELECTOR).first
        if btn.count() == 0:
            return False
        btn.click(timeout=5000)
    except Exception:
        return False

    try:
        page.wait_for_url(lambda url: "/recoil" not in url, timeout=8000)
    except PlaywrightTimeout:
        return False

    try:
        page.locator(SELECTORS["weapon_selector"]).wait_for(
            state="visible", timeout=T_BUILDER_READY)
    except PlaywrightTimeout:
        pass
    return True


# ============================================================
# watcher
# ============================================================

_WATCHER_JS = """
window.__recoil__ = {
    init: null,
    current: null,
    target: null,
    observer: null,

    _get_dd: function() {
        const dts = document.querySelectorAll(
            '.recoil-dashboard-grid dt');
        for (const dt of dts) {
            if (dt.innerText.trim() === '剩余弹量') {
                return dt.nextElementSibling;
            }
        }
        return null;
    },

    _parse: function(text) {
        const m = text.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
        return m ? parseInt(m[1]) : null;
    },

    start: function(target) {
        this.stop();
        const dd = this._get_dd();
        if (!dd) return false;
        this.init = this._parse(dd.innerText);
        this.current = this.init;
        this.target = target;

        const self = this;
        this.observer = new MutationObserver(function() {
            const cur = self._parse(dd.innerText);
            if (cur === null) return;
            self.current = cur;
        });
        this.observer.observe(dd, {
            childList: true,
            characterData: true,
            subtree: true,
        });
        return true;
    },

    stop: function() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    },
};
"""


def _inject_watcher(page):
    try:
        page.evaluate("() => { " + _WATCHER_JS + " return true; }")
        return True
    except Exception as e:
        print(f"  ⚠️ 注入 watcher 失败: {e}")
        return False


def _start_watcher(page, target_ammo):
    try:
        return page.evaluate("(t) => window.__recoil__.start(t)",
                             target_ammo)
    except Exception:
        return False


def _wait_ammo_target(page, target_ammo, timeout_ms):
    try:
        page.wait_for_function(
            "(t) => window.__recoil__ && "
            "window.__recoil__.current !== null && "
            "window.__recoil__.current <= t",
            arg=target_ammo, polling=1, timeout=timeout_ms,
        )
        return True
    except PlaywrightTimeout:
        return False


def _read_ammo(page):
    try:
        return page.evaluate("""() => {
            const dts = document.querySelectorAll(
                '.recoil-dashboard-grid dt');
            for (const dt of dts) {
                if (dt.innerText.trim() === '剩余弹量') {
                    const dd = dt.nextElementSibling;
                    const m = dd.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+)/);
                    if (m) return parseInt(m[1]);
                }
            }
            return null;
        }""")
    except Exception:
        return None


# ============================================================
# 截图标记
# ============================================================

_MARKER_JS_INJECT = """(args) => {
    const canvas = document.querySelector(args.canvas);
    if (!canvas) return { ok: false, reason: 'no canvas' };

    canvas.querySelectorAll('.__recoil_marker__').forEach(e => e.remove());

    const ns = 'http://www.w3.org/2000/svg';

    function drawPolyline(points, color, width, zIndex, opacity, dash) {
        if (!points || points.length < 2) return;
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('class', '__recoil_marker__');
        svg.setAttribute('viewBox', '0 0 100 100');
        svg.setAttribute('preserveAspectRatio', 'none');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';
        svg.style.zIndex = String(zIndex);

        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute('points', points.map(p =>
            p[0].toFixed(3) + ',' + p[1].toFixed(3)
        ).join(' '));
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', color);
        pl.setAttribute('stroke-width', String(width));
        pl.setAttribute('stroke-linecap', 'round');
        pl.setAttribute('stroke-linejoin', 'round');
        pl.setAttribute('vector-effect', 'non-scaling-stroke');
        pl.setAttribute('opacity', String(opacity));
        if (dash) pl.setAttribute('stroke-dasharray', dash);
        svg.appendChild(pl);
        canvas.appendChild(svg);
    }

    if (args.smoothPoints) {
        drawPolyline(args.smoothPoints, '#00bcd4', 2.5, 9990, 0.85);
    }
    if (args.idealPoints) {
        drawPolyline(args.idealPoints, '#ff9800', 2.5, 9991, 0.9, '6,4');
    }
    if (args.mousePoints) {
        drawPolyline(args.mousePoints, '#2196f3', 2.5, 9992, 0.95);
    }
    if (args.feedbackPoints) {
        drawPolyline(args.feedbackPoints, '#e91e63', 2.5, 9993, 0.9);
    }

    if (args.expected) {
        const c = document.createElement('div');
        c.className = '__recoil_marker__';
        c.style.position = 'absolute';
        c.style.pointerEvents = 'none';
        c.style.left = args.expected.x + '%';
        c.style.top  = args.expected.y + '%';
        c.style.width  = args.expectedDotPx + 'px';
        c.style.height = args.expectedDotPx + 'px';
        c.style.borderRadius = '50%';
        c.style.border = '2px solid #ff9800';
        c.style.boxSizing = 'border-box';
        c.style.transform = 'translate(-50%, -50%)';
        c.style.zIndex = '9999';
        canvas.appendChild(c);
    }

    if (args.threshold) {
        const svg2 = document.createElementNS(ns, 'svg');
        svg2.setAttribute('class', '__recoil_marker__');
        svg2.setAttribute('viewBox', '0 0 100 100');
        svg2.setAttribute('preserveAspectRatio', 'none');
        svg2.style.position = 'absolute';
        svg2.style.left = '0';
        svg2.style.top = '0';
        svg2.style.width = '100%';
        svg2.style.height = '100%';
        svg2.style.pointerEvents = 'none';
        svg2.style.zIndex = '9998';

        const ellipse = document.createElementNS(ns, 'ellipse');
        ellipse.setAttribute('cx', args.threshold.cx);
        ellipse.setAttribute('cy', args.threshold.cy);
        ellipse.setAttribute('rx', args.threshold.rx);
        ellipse.setAttribute('ry', args.threshold.ry);
        ellipse.setAttribute('fill', 'none');
        ellipse.setAttribute('stroke', '#ff5722');
        ellipse.setAttribute('stroke-width', '2');
        ellipse.setAttribute('stroke-dasharray', '6,4');
        ellipse.setAttribute('vector-effect', 'non-scaling-stroke');
        ellipse.setAttribute('opacity', '0.9');
        svg2.appendChild(ellipse);
        canvas.appendChild(svg2);
    }

    if (args.box) {
        const d = document.createElement('div');
        d.className = '__recoil_marker__';
        d.style.position = 'absolute';
        d.style.pointerEvents = 'none';
        d.style.left = args.box.x0 + '%';
        d.style.top  = args.box.y0 + '%';
        d.style.width  = (args.box.x1 - args.box.x0) + '%';
        d.style.height = (args.box.y1 - args.box.y0) + '%';
        d.style.border = '2px solid #00c853';
        d.style.boxSizing = 'border-box';
        d.style.zIndex = '9999';

        const cross = document.createElement('div');
        cross.style.position = 'absolute';
        cross.style.left = '50%';
        cross.style.top = '50%';
        cross.style.width = '10px';
        cross.style.height = '10px';
        cross.style.transform = 'translate(-50%, -50%)';
        cross.style.borderLeft = '1px solid #00c853';
        cross.style.borderTop = '1px solid #00c853';
        d.appendChild(cross);
        canvas.appendChild(d);
    }

    const lines = [];
    if (args.title) {
        lines.push({ color: '#000000', text: args.title, size: '14px' });
    }
    if (args.infoLines) {
        for (const ln of args.infoLines) {
            lines.push({ color: ln.color, text: ln.text });
        }
    }

    if (lines.length > 0) {
        const panel = document.createElement('div');
        panel.className = '__recoil_marker__';
        panel.style.position = 'absolute';
        panel.style.pointerEvents = 'none';
        panel.style.right = '8px';
        panel.style.bottom = '8px';
        panel.style.padding = '6px 10px';
        panel.style.background = 'rgba(255,255,255,0.88)';
        panel.style.border = '1px solid #ccc';
        panel.style.borderRadius = '4px';
        panel.style.fontSize = '12px';
        panel.style.fontWeight = 'bold';
        panel.style.lineHeight = '1.5';
        panel.style.zIndex = '9999';
        panel.style.whiteSpace = 'nowrap';

        for (const ln of lines) {
            const div = document.createElement('div');
            div.textContent = ln.text;
            div.style.color = ln.color;
            if (ln.size) div.style.fontSize = ln.size;
            panel.appendChild(div);
        }
        canvas.appendChild(panel);
    }
    return { ok: true };
}"""

_MARKER_JS_REMOVE = """() => {
    document.querySelectorAll('.__recoil_marker__').forEach(e => e.remove());
    return { ok: true };
}"""

EXPECTED_DOT_PX = 12


def _inject_markers(page, title=None, box=None, expected=None,
                    smooth_points=None, ideal_points=None,
                    mouse_points=None, feedback_points=None,
                    threshold=None, info_lines=None):
    try:
        return page.evaluate(_MARKER_JS_INJECT, {
            "canvas": CANVAS_SELECTOR,
            "title": title,
            "box": box,
            "expected": expected,
            "smoothPoints": smooth_points,
            "idealPoints": ideal_points,
            "mousePoints": mouse_points,
            "feedbackPoints": feedback_points,
            "threshold": threshold,
            "infoLines": info_lines,
            "expectedDotPx": EXPECTED_DOT_PX,
        })
    except Exception as e:
        print(f"        ⚠️ 注入标记失败: {e}")
        return None


def _remove_markers(page):
    try:
        page.evaluate(_MARKER_JS_REMOVE)
    except Exception:
        pass


def _dense_box(shots):
    if not shots:
        return None
    xs = [s["x"] for s in shots]
    ys = [s["y"] for s in shots]
    n = len(xs)
    cx = sum(xs) / n
    cy = sum(ys) / n
    if n > 1:
        sx = (sum((x - cx) ** 2 for x in xs) / n) ** 0.5
        sy = (sum((y - cy) ** 2 for y in ys) / n) ** 0.5
    else:
        sx = sy = 0.0
    kept = [s for s in shots
            if abs(s["x"] - cx) <= 2.0 * sx
            and abs(s["y"] - cy) <= 2.0 * sy]
    if not kept:
        kept = shots
    xs = [s["x"] for s in kept]
    ys = [s["y"] for s in kept]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    cx = (x_min + x_max) / 2
    cy = (y_min + y_max) / 2
    w = max(2.0, min(30.0, (x_max - x_min) * 1.3))
    h = max(2.0, min(30.0, (y_max - y_min) * 1.3))
    return {
        "x0": round(cx - w / 2, 3),
        "y0": round(cy - h / 2, 3),
        "x1": round(cx + w / 2, 3),
        "y1": round(cy + h / 2, 3),
        "cx": round(cx, 3),
        "cy": round(cy, 3),
        "w": round(w, 3),
        "h": round(h, 3),
    }


def _count_parts(shots):
    counts = {p: 0 for p in PARTS_KNOWN}
    unknown = 0
    for s in shots:
        p = s.get("part")
        if p in counts:
            counts[p] += 1
        else:
            unknown += 1
    total = sum(counts.values()) + unknown

    ratios = {}
    if total > 0:
        for p in PARTS_KNOWN:
            ratios[p] = round(counts[p] / total * 100, 1)
    else:
        for p in PARTS_KNOWN:
            ratios[p] = 0.0

    return counts, ratios, total, unknown


def _take_screenshot(page, path, title, box=None, expected=None,
                     smooth_points=None, ideal_points=None,
                     mouse_points=None, feedback_points=None,
                     threshold=None, info_lines=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    _inject_markers(
        page,
        title=title,
        box=box,
        expected=expected,
        smooth_points=smooth_points,
        ideal_points=ideal_points,
        mouse_points=mouse_points,
        feedback_points=feedback_points,
        threshold=threshold,
        info_lines=info_lines,
    )
    page.wait_for_timeout(80)
    page.screenshot(path=path, full_page=False)
    _remove_markers(page)


# ============================================================
# 平滑曲线
# ============================================================

def _smooth_shots(shots, window=SMOOTH_WINDOW):
    n = len(shots)
    if n == 0:
        return []
    if window <= 1 or window > n:
        return [{"x": s["x"], "y": s["y"]} for s in shots]

    half = window // 2
    padded = (
        [shots[0]] * half
        + list(shots)
        + [shots[-1]] * half
    )

    result = []
    for i in range(n):
        xs = [padded[j]["x"] for j in range(i, i + window)]
        ys = [padded[j]["y"] for j in range(i, i + window)]
        result.append({
            "x": sum(xs) / window,
            "y": sum(ys) / window,
        })

    result[0] = {"x": shots[0]["x"], "y": shots[0]["y"]}
    result[-1] = {"x": shots[-1]["x"], "y": shots[-1]["y"]}
    return result


# ============================================================
# 鼠标轨迹生成
# ============================================================

def _build_ideal_track(smooth_bare, aim_pct, bare_aim_pct):
    aim_x = aim_pct["x"]
    aim_y = aim_pct["y"]
    bare_aim_x = bare_aim_pct["x"]
    bare_aim_y = bare_aim_pct["y"]
    track = []
    for s in smooth_bare:
        track.append({
            "x": aim_x + (bare_aim_x - s["x"]),
            "y": aim_y + (bare_aim_y - s["y"]),
        })
    return track


def _build_mouse_track_with_accel(ideal_track, interval_s,
                                  a_max_per_sec2=A_MAX_PER_SEC2,
                                  initial_speed=INITIAL_SPEED):
    n = len(ideal_track)
    if n == 0:
        return []

    a_max_per_shot = a_max_per_sec2 * interval_s

    result = [{"x": ideal_track[0]["x"], "y": ideal_track[0]["y"]}]
    vx = initial_speed
    vy = initial_speed

    for i in range(1, n):
        prev = result[i - 1]
        target = ideal_track[i]

        tvx = target["x"] - prev["x"]
        tvy = target["y"] - prev["y"]

        dvx = tvx - vx
        dvy = tvy - vy
        dv = math.hypot(dvx, dvy)

        if dv > a_max_per_shot and dv > 0:
            scale = a_max_per_shot / dv
            vx += dvx * scale
            vy += dvy * scale
        else:
            vx = tvx
            vy = tvy

        result.append({
            "x": prev["x"] + vx,
            "y": prev["y"] + vy,
        })

    return result


def _build_mouse_track_with_feedback(ideal_track, bare_shots,
                                     aim_pct, bare_aim_pct,
                                     breath_seq_pct, stability_seq_pct,
                                     interval_s,
                                     fb_threshold,
                                     fb_accel_per_sec2=FB_ACCEL_PER_SEC2,
                                     a_max_per_sec2=A_MAX_PER_SEC2,
                                     initial_speed=INITIAL_SPEED):
    n = len(ideal_track)
    if n == 0:
        return [], [], [], []

    a_max_per_shot = a_max_per_sec2 * interval_s
    fb_accel_per_shot = fb_accel_per_sec2 * interval_s

    aim_x = aim_pct["x"]
    aim_y = aim_pct["y"]

    bare_aim_x = bare_aim_pct["x"]
    bare_aim_y = bare_aim_pct["y"]

    real = [{"x": ideal_track[0]["x"], "y": ideal_track[0]["y"]}]
    v_ff_x = initial_speed
    v_ff_y = initial_speed
    v_fb_x = 0.0
    v_fb_y = 0.0

    fb_offset_list = [(0.0, 0.0)]
    v_fb_list = [(0.0, 0.0)]
    triggered_list = [False]

    for i in range(1, n):
        prev = real[i - 1]
        target = ideal_track[i]

        tvx = target["x"] - prev["x"]
        tvy = target["y"] - prev["y"]

        dvx = tvx - v_ff_x
        dvy = tvy - v_ff_y
        dv = math.hypot(dvx, dvy)

        if dv > a_max_per_shot and dv > 0:
            scale = a_max_per_shot / dv
            v_ff_x += dvx * scale
            v_ff_y += dvy * scale
        else:
            v_ff_x = tvx
            v_ff_y = tvy

        b_prev = bare_shots[i - 1]
        br = breath_seq_pct[i - 1]
        st = stability_seq_pct[i - 1]
        hit_x = (prev["x"] + (b_prev["x"] - bare_aim_x)
                 + br[0] + st[0])
        hit_y = (prev["y"] + (b_prev["y"] - bare_aim_y)
                 + br[1] + st[1])

        dev_x = hit_x - aim_x
        dev_y = hit_y - aim_y
        dev_len = math.hypot(dev_x, dev_y)

        triggered = False
        if dev_len > fb_threshold and dev_len > 0:
            dir_x = -dev_x / dev_len
            dir_y = -dev_y / dev_len
            v_fb_x += dir_x * fb_accel_per_shot
            v_fb_y += dir_y * fb_accel_per_shot
            triggered = True

        new_fb_x = fb_offset_list[-1][0] + v_fb_x
        new_fb_y = fb_offset_list[-1][1] + v_fb_y
        fb_offset_list.append((new_fb_x, new_fb_y))
        v_fb_list.append((v_fb_x, v_fb_y))
        triggered_list.append(triggered)

        real.append({
            "x": prev["x"] + v_ff_x + v_fb_x,
            "y": prev["y"] + v_ff_y + v_fb_y,
        })

    return real, fb_offset_list, v_fb_list, triggered_list


# ============================================================
# 随机源
# ============================================================

def _generate_stability_sequence(rounds, sigma_pct, rng):
    seq = [(0.0, 0.0)]
    for _ in range(1, rounds):
        dx = rng.gauss(0, sigma_pct)
        dy = rng.gauss(0, sigma_pct)
        seq.append((dx, dy))
    return seq


def _generate_breath_sequence(rounds, interval_s, rng,
                              amp_x=BREATH_AMP_X, amp_y=BREATH_AMP_Y,
                              freq=BREATH_FREQ,
                              y_harmonic=BREATH_Y_HARMONIC):
    phase = rng.uniform(0, 2 * math.pi)

    two_pi_f = 2 * math.pi * freq
    two_pi_f_y = 2 * math.pi * y_harmonic * freq

    dx0 = amp_x * math.sin(phase)
    dy0 = amp_y * math.sin(y_harmonic * phase)

    offsets = []
    for i in range(rounds):
        t = i * interval_s
        dx = amp_x * math.sin(two_pi_f * t + phase) - dx0
        dy = amp_y * math.sin(two_pi_f_y * t + y_harmonic * phase) - dy0
        offsets.append((dx, dy))
    return offsets, phase


def _apply_offsets_pct(targets_px, offsets_pct, canvas_box):
    px_x = canvas_box["width"] / 100
    px_y = canvas_box["height"] / 100

    result = []
    for (x, y), (dx_pct, dy_pct) in zip(targets_px, offsets_pct):
        result.append((
            x + dx_pct * px_x,
            y + dy_pct * px_y,
        ))
    return result


# ============================================================
# 通用：按鼠标目标序列打一轮
# ============================================================

def _run_with_targets(page, rounds, fire_rate, targets):
    _set_blood(page, BLOOD_VALUE)
    page.locator(NEW_ROUND_SELECTOR).click()
    page.wait_for_timeout(AFTER_NEW_ROUND_WAIT)

    _inject_watcher(page)
    init_ammo = _read_ammo(page)

    page.mouse.move(targets[0][0], targets[0][1])
    page.wait_for_timeout(BEFORE_MOUSE_DOWN_WAIT)

    if init_ammo is not None:
        _start_watcher(page, init_ammo - rounds)

    page.mouse.down()

    interval_ms = 60000.0 / fire_rate if fire_rate > 0 else 100.0
    timeout_ms = int(5 * interval_ms)

    for i in range(rounds):
        if i < len(targets):
            tx, ty = targets[i]
        else:
            tx, ty = targets[-1]
        page.mouse.move(tx, ty)

        if init_ammo is not None:
            target_ammo = init_ammo - (i + 1)
            _wait_ammo_target(page, target_ammo, timeout_ms)
        else:
            page.wait_for_timeout(int(interval_ms))

    page.mouse.up()
    page.wait_for_timeout(300)

    shots = _read_shots(page)
    return {"shots": shots, "init_ammo": init_ammo}


# ============================================================
# 构建压枪目标
# ============================================================

def _track_pct_to_px(track_pct, canvas_box):
    px_x = canvas_box["width"] / 100
    px_y = canvas_box["height"] / 100
    base_x = canvas_box["x"]
    base_y = canvas_box["y"]
    return [
        (base_x + p["x"] * px_x, base_y + p["y"] * px_y)
        for p in track_pct
    ]


def _px_to_pct(points_px, canvas_box):
    px_x = canvas_box["width"] / 100
    px_y = canvas_box["height"] / 100
    base_x = canvas_box["x"]
    base_y = canvas_box["y"]
    return [
        [(x - base_x) / px_x, (y - base_y) / px_y]
        for x, y in points_px
    ]


# ============================================================
# 安全文件名
# ============================================================

def _safe_name(name):
    if not name:
        return "unknown"
    bad = '<>:"/\\|?*'
    result = "".join(c for c in name if c not in bad).strip()
    return result if result else "unknown"


def _shot_filename(weapon_name, scheme_index, distance, kind):
    return (f"{_safe_name(weapon_name)}方案{scheme_index}"
            f"_{distance}m_{kind}.png")


# ============================================================
# 流程：切换 + 载方案
# ============================================================

def _setup_weapon(page, task):
    """
    切枪 → 开方案库 → 载方案 → 关方案库
    返回 True / False
    """
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]

    if "/recoil" in page.url:
        _click_back_to_builder(page)

    print(f"  · 切枪 → {weapon_name} ...", end=" ", flush=True)
    try:
        switch_weapon(page, weapon_name)
        print("OK")
    except Exception as e:
        print(f"❌ {e}")
        return False

    print(f"  · 打开方案库 ...", end=" ", flush=True)
    try:
        open_library(page)
        print("OK")
    except Exception as e:
        print(f"❌ {e}")
        return False

    print(f"  · 载入方案 '{weapon_name} 方案 {scheme_index}' ...",
          end=" ", flush=True)
    try:
        ok = load_scheme(page, task)
    except Exception as e:
        print(f"❌ {e}")
        try:
            close_library(page)
        except Exception:
            pass
        return False

    if not ok:
        print("❌ 方案库里没有")
        try:
            close_library(page)
        except Exception:
            pass
        return False
    print("OK")

    print(f"  · 关闭方案库 ...", end=" ", flush=True)
    try:
        close_library(page)
        print("OK")
    except Exception as e:
        print(f"⚠️ {e}")

    return True


# ============================================================
# 模式 1：仅读开镜速度
# ============================================================

def _run_aim_speed_only_one(page, task, data):
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]
    config_id = task["configId"]
    weapon_id = task["weaponId"]

    print()
    print("=" * 70)
    print(f"🔫 {weapon_name} {config_id}  [仅开镜速度]")
    print("=" * 70)

    ok = _setup_weapon(page, task)
    if not ok:
        return None

    # 确保镭射开启
    laser_state = _ensure_laser_on(page)
    print(f"  · 镭射: {laser_state}", end="")
    if laser_state == "clicked":
        print(f"（点击后等待 {AFTER_LASER_TOGGLE_WAIT}ms）", end="")
        page.wait_for_timeout(AFTER_LASER_TOGGLE_WAIT)
    print()

    aim_speed = _read_aim_speed(page)
    if aim_speed is None:
        print(f"  ⚠️ 读不到开镜时间")
    else:
        print(f"  ⭐ 开镜时间: {aim_speed} ms")

    return {
        "weaponId": weapon_id,
        "weaponName": weapon_name,
        "configId": config_id,
        "schemeIndex": scheme_index,
        "aimSpeed": aim_speed,
        "laserState": laser_state,
    }


# ============================================================
# 模式 2：完整压枪测试
# ============================================================

def _run_full_one(page, task, data):
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]
    config_id = task["configId"]
    weapon_id = task["weaponId"]

    print()
    print("=" * 70)
    print(f"🔫 {weapon_name} {config_id}")
    print("=" * 70)

    ok = _setup_weapon(page, task)
    if not ok:
        return None

    # ⭐ 读开镜速度（先确保镭射开启）
    laser_state = _ensure_laser_on(page)
    if laser_state == "clicked":
        page.wait_for_timeout(AFTER_LASER_TOGGLE_WAIT)
    aim_speed = _read_aim_speed(page)
    print(f"  · 镭射: {laser_state}, 开镜时间: {aim_speed} ms")

    print(f"  · 进入压枪测试页 ...", end=" ", flush=True)
    if not _click_recoil_test(page):
        print("❌")
        return None
    print("OK")

    capacity = _read_capacity(page)
    fire_rate = _read_fire_rate(page)
    if fire_rate <= 0:
        fire_rate = FIRE_RATE_DEFAULT

    if capacity > 0:
        rounds = min(TEST_ROUNDS, capacity)
    else:
        rounds = TEST_ROUNDS

    print(f"  弹容: {capacity}（测试上限 {TEST_ROUNDS}）, "
          f"射速: {fire_rate} RPM, 打 {rounds} 发")

    base_sigma = _read_base_stability(data, weapon_name)
    if base_sigma is None:
        base_sigma = BASE_SIGMA_FALLBACK
    stability_mult = _read_stability_multiplier(page)
    if stability_mult is None:
        stability_mult = STABILITY_MULT_FALLBACK

    sigma_raw = base_sigma * stability_mult
    sigma_pct = sigma_raw * STABILITY_SIGMA_SCALE
    print(f"  baseStability = {base_sigma}, 页面倍率 = ×{stability_mult}")
    print(f"  σ = {base_sigma} × {stability_mult} × {STABILITY_SIGMA_SCALE} "
          f"= {sigma_pct:.4f}%")

    interval_s = 60.0 / fire_rate if fire_rate > 0 else 0.1
    a_max_per_shot = A_MAX_PER_SEC2 * interval_s
    fb_accel_per_shot = FB_ACCEL_PER_SEC2 * interval_s
    print(f"  每发间隔 = {interval_s:.4f}s")
    print(f"  压枪层每发最大速度变化 = {A_MAX_PER_SEC2} × {interval_s:.4f} "
          f"= {a_max_per_shot:.4f} %/发")
    print(f"  反馈每发加速度         = {FB_ACCEL_PER_SEC2} × {interval_s:.4f} "
          f"= {fb_accel_per_shot:.4f} %/发")

    runs_ctx = []
    for run_idx in range(FEEDBACK_RUNS):
        seed_i = _derive_seed(weapon_id, config_id, run=run_idx)
        rng_i = random.Random(seed_i)
        stab_i = _generate_stability_sequence(rounds, sigma_pct, rng_i)
        br_i, phase_i = _generate_breath_sequence(rounds, interval_s, rng_i)
        runs_ctx.append({
            "run": run_idx,
            "seed": seed_i,
            "stability": stab_i,
            "breath": br_i,
            "phase": phase_i,
        })
    print(f"  ⭐ 反馈轮打 {FEEDBACK_RUNS} 次，每个 run 独立随机源")
    for ctx in runs_ctx:
        print(f"    run{ctx['run']+1}: seed={ctx['seed']}, "
              f"breath_phase={ctx['phase']:.4f}")

    _set_scope(page, SCOPE)
    page.wait_for_timeout(AFTER_SCOPE_CHANGE_WAIT)

    _set_distance(page, 30)
    page.wait_for_timeout(AFTER_DISTANCE_CHANGE_WAIT)

    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)
    canvas_box = canvas.bounding_box()

    aim_pct_30 = _aim_pct(30)
    aim_pct_50 = _aim_pct(50)
    aim_pct_100 = _aim_pct(100)

    bare_aim_pct = aim_pct_30

    print(f"  aim: 30m={aim_pct_30}, 50m={aim_pct_50}, 100m={aim_pct_100}")

    result = {
        "weaponId": weapon_id,
        "weaponName": weapon_name,
        "configId": config_id,
        "schemeIndex": scheme_index,
        "aimSpeed": aim_speed,
        "capacity": capacity,
        "testRounds": TEST_ROUNDS,
        "fireRate": fire_rate,
        "rounds": rounds,
        "baseStability": base_sigma,
        "stabilityMultiplier": stability_mult,
        "sigmaPct": round(sigma_pct, 4),
        "rounds_detail": {},
    }

    # ============================================================
    # 30m
    # ============================================================
    print()
    print(f"📍 30m  (aim={aim_pct_30})")
    print(f"  {'-'*60}")

    print(f"  [1/3] 裸弹道 ...", end=" ", flush=True)
    aim_px_30_x = canvas_box["x"] + canvas_box["width"] * aim_pct_30["x"] / 100
    aim_px_30_y = canvas_box["y"] + canvas_box["height"] * aim_pct_30["y"] / 100
    bare = _run_with_targets(
        page, rounds, fire_rate,
        [(aim_px_30_x, aim_px_30_y)] * rounds,
    )
    bare_shots = bare["shots"]
    if not bare_shots:
        print("❌ 没抓到弹着点")
        _click_back_to_builder(page)
        return None
    print(f"OK ({len(bare_shots)} 发)")

    bare_box = _dense_box(bare_shots)
    hit_count = sum(1 for s in bare_shots if s.get("hit"))
    result["rounds_detail"]["30m_bare"] = {
        "count": len(bare_shots),
        "hitCount": hit_count,
        "hitRate": round(hit_count / len(bare_shots) * 100, 1),
        "denseBox": bare_box,
    }

    bare_png = os.path.join(
        SCREENSHOT_DIR,
        _shot_filename(weapon_name, scheme_index, 30, "1裸弹道"))
    _take_screenshot(
        page, bare_png,
        title=f"{weapon_name}#{scheme_index} - 30m - 裸弹道",
        box=bare_box,
        expected=aim_pct_30,
    )

    page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

    smooth_bare = _smooth_shots(bare_shots, SMOOTH_WINDOW)
    ideal_track_30 = _build_ideal_track(smooth_bare, aim_pct_30, bare_aim_pct)
    smooth_points_pct = [[p["x"], p["y"]] for p in smooth_bare]
    ideal_points_pct_30 = [[p["x"], p["y"]] for p in ideal_track_30]

    print(f"  [2/3] 平滑压枪 ...", end=" ", flush=True)
    mouse_track_pct = _build_mouse_track_with_accel(
        ideal_track_30,
        interval_s,
        a_max_per_sec2=A_MAX_PER_SEC2,
        initial_speed=INITIAL_SPEED,
    )
    mouse_track_px = _track_pct_to_px(mouse_track_pct, canvas_box)

    smooth = _run_with_targets(page, rounds, fire_rate, mouse_track_px)
    smooth_shots = smooth["shots"]
    if not smooth_shots:
        print("❌ 没抓到弹着点")
        _click_back_to_builder(page)
        return None
    smooth_box = _dense_box(smooth_shots)
    hit_count = sum(1 for s in smooth_shots if s.get("hit"))
    hit_rate = hit_count / len(smooth_shots) * 100
    result["rounds_detail"]["30m_smooth"] = {
        "count": len(smooth_shots),
        "hitCount": hit_count,
        "hitRate": round(hit_rate, 1),
        "denseBox": smooth_box,
    }
    print(f"OK ({len(smooth_shots)} 发, 命中率 {hit_rate:.1f}%)")

    smooth_png = os.path.join(
        SCREENSHOT_DIR,
        _shot_filename(weapon_name, scheme_index, 30, "2平滑压枪"))
    _take_screenshot(
        page, smooth_png,
        title=f"{weapon_name}#{scheme_index} - 30m - 平滑压枪",
        box=smooth_box,
        expected=aim_pct_30,
        smooth_points=smooth_points_pct,
        ideal_points=ideal_points_pct_30,
        mouse_points=[[p["x"], p["y"]] for p in mouse_track_pct],
    )

    page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

    print(f"  [3/3] 平滑+反馈+呼吸+σ × {FEEDBACK_RUNS} ...")
    fb30 = _fb_threshold(30)

    shots_list_30 = []

    for run_idx, ctx in enumerate(runs_ctx):
        breath_seq = ctx["breath"]
        stab_seq = ctx["stability"]
        run_label = f"run{run_idx+1}"

        (fb_mouse_pct,
         fb_offset_list,
         v_fb_list,
         triggered_list) = _build_mouse_track_with_feedback(
            ideal_track_30,
            bare_shots,
            aim_pct_30,
            bare_aim_pct,
            breath_seq,
            stab_seq,
            interval_s,
            fb_threshold=fb30,
            fb_accel_per_sec2=FB_ACCEL_PER_SEC2,
            a_max_per_sec2=A_MAX_PER_SEC2,
            initial_speed=INITIAL_SPEED,
        )
        fb_mouse_px = _track_pct_to_px(fb_mouse_pct, canvas_box)

        targets_px = _apply_offsets_pct(
            fb_mouse_px, breath_seq, canvas_box)
        targets_px = _apply_offsets_pct(
            targets_px, stab_seq, canvas_box)

        trig = sum(1 for t in triggered_list if t)
        print(f"    {run_label}: 触发 {trig}/{rounds}", end="", flush=True)

        res = _run_with_targets(page, rounds, fire_rate, targets_px)
        shots = res["shots"]
        if not shots:
            print("  ❌ 没抓到")
            continue
        hit_count = sum(1 for s in shots if s.get("hit"))
        hr = hit_count / len(shots) * 100
        print(f"  命中率 {hr:.1f}%", flush=True)

        shots_list_30.append(shots)

        if run_idx == 0:
            feedback_points_pct = [
                [aim_pct_30["x"] + dx, aim_pct_30["y"] + dy]
                for dx, dy in fb_offset_list
            ]
            threshold_pct_30 = {
                "cx": aim_pct_30["x"], "cy": aim_pct_30["y"],
                "rx": fb30, "ry": fb30,
            }
            info = []
            info.append({
                "color": '#ff9800',
                "text": f"命中率 {hr:.1f}%  aim=({aim_pct_30['x']:.1f}, "
                        f"{aim_pct_30['y']:.1f})",
            })
            info.append({
                "color": '#e91e63',
                "text": f"反馈拉枪：阈值 {fb30}%，"
                        f"加速度 {FB_ACCEL_PER_SEC2}%/秒² "
                        f"（每发 {fb_accel_per_shot:.3f}%），"
                        f"触发 {trig}/{rounds} 次",
            })
            info.append({
                "color": '#ff5722',
                "text": f"阈值椭圆：半径 {fb30}%（画布%）",
            })
            info.append({
                "color": '#2196f3',
                "text": f"（截图仅第 1 次，其余 {FEEDBACK_RUNS-1} 次不截图）",
            })

            full_png = os.path.join(
                SCREENSHOT_DIR,
                _shot_filename(weapon_name, scheme_index, 30,
                               "3平滑压枪_反馈拉枪_呼吸_稳定性"))
            _take_screenshot(
                page, full_png,
                title=f"{weapon_name}#{scheme_index} - 30m - "
                      f"平滑+反馈+呼吸+σ (run1)",
                box=_dense_box(shots),
                expected=aim_pct_30,
                smooth_points=smooth_points_pct,
                ideal_points=ideal_points_pct_30,
                mouse_points=_px_to_pct(targets_px, canvas_box),
                feedback_points=feedback_points_pct,
                threshold=threshold_pct_30,
                info_lines=info,
            )

        page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

    if shots_list_30:
        hit_rates = []
        for shots in shots_list_30:
            hc = sum(1 for s in shots if s.get("hit"))
            hit_rates.append(hc / len(shots) * 100)
        avg_30 = sum(hit_rates) / len(hit_rates)
        result["rounds_detail"]["30m_full_feedback"] = {
            "avgHitRate": round(avg_30, 1),
            "runsHitRate": [round(x, 1) for x in hit_rates],
        }
        print(f"  → 30m 反馈轮平均命中率: {avg_30:.1f}%")

    # ============================================================
    # 50m / 100m
    # ============================================================
    for dist in [50, 100]:
        print()
        aim_pct_d = _aim_pct(dist)
        print(f"📍 {dist}m  (aim={aim_pct_d})")
        print(f"  {'-'*60}")
        print(f"  [1/1] 平滑+反馈+呼吸+σ × {FEEDBACK_RUNS} ...")

        _set_distance(page, dist)
        page.wait_for_timeout(AFTER_DISTANCE_CHANGE_WAIT)

        ideal_track_d = _build_ideal_track(smooth_bare, aim_pct_d,
                                           bare_aim_pct)
        ideal_points_pct_d = [[p["x"], p["y"]] for p in ideal_track_d]

        fb_d = _fb_threshold(dist)

        shots_list_d = []

        for run_idx, ctx in enumerate(runs_ctx):
            breath_seq = ctx["breath"]
            stab_seq = ctx["stability"]
            run_label = f"run{run_idx+1}"

            (fb_mouse_pct,
             fb_offset_list,
             v_fb_list,
             triggered_list) = _build_mouse_track_with_feedback(
                ideal_track_d,
                bare_shots,
                aim_pct_d,
                bare_aim_pct,
                breath_seq,
                stab_seq,
                interval_s,
                fb_threshold=fb_d,
                fb_accel_per_sec2=FB_ACCEL_PER_SEC2,
                a_max_per_sec2=A_MAX_PER_SEC2,
                initial_speed=INITIAL_SPEED,
            )
            fb_mouse_px = _track_pct_to_px(fb_mouse_pct, canvas_box)

            targets_px = _apply_offsets_pct(
                fb_mouse_px, breath_seq, canvas_box)
            targets_px = _apply_offsets_pct(
                targets_px, stab_seq, canvas_box)

            trig = sum(1 for t in triggered_list if t)
            print(f"    {run_label}: 触发 {trig}/{rounds}",
                  end="", flush=True)

            res = _run_with_targets(page, rounds, fire_rate, targets_px)
            shots = res["shots"]
            if not shots:
                print("  ❌ 没抓到")
                continue
            hit_count = sum(1 for s in shots if s.get("hit"))
            hr = hit_count / len(shots) * 100
            print(f"  命中率 {hr:.1f}%", flush=True)

            shots_list_d.append(shots)

            if run_idx == 0:
                feedback_points_d = [
                    [aim_pct_d["x"] + dx, aim_pct_d["y"] + dy]
                    for dx, dy in fb_offset_list
                ]
                threshold_pct_d = {
                    "cx": aim_pct_d["x"], "cy": aim_pct_d["y"],
                    "rx": fb_d, "ry": fb_d,
                }
                info_d = []
                info_d.append({
                    "color": '#ff9800',
                    "text": f"命中率 {hr:.1f}%  aim=({aim_pct_d['x']:.1f}, "
                            f"{aim_pct_d['y']:.1f})",
                })
                info_d.append({
                    "color": '#e91e63',
                    "text": f"反馈拉枪：阈值 {fb_d}%，"
                            f"加速度 {FB_ACCEL_PER_SEC2}%/秒² "
                            f"（每发 {fb_accel_per_shot:.3f}%），"
                            f"触发 {trig}/{rounds} 次",
                })
                info_d.append({
                    "color": '#ff5722',
                    "text": f"阈值椭圆：半径 {fb_d}%（画布%）",
                })
                info_d.append({
                    "color": '#2196f3',
                    "text": f"（截图仅第 1 次，其余 {FEEDBACK_RUNS-1} 次不截图）",
                })

                png_d = os.path.join(
                    SCREENSHOT_DIR,
                    _shot_filename(weapon_name, scheme_index, dist,
                                   "1平滑压枪_反馈拉枪_呼吸_稳定性"))
                _take_screenshot(
                    page, png_d,
                    title=f"{weapon_name}#{scheme_index} - {dist}m - "
                          f"平滑+反馈+呼吸+σ (run1)",
                    box=_dense_box(shots),
                    expected=aim_pct_d,
                    smooth_points=smooth_points_pct,
                    ideal_points=ideal_points_pct_d,
                    mouse_points=_px_to_pct(targets_px, canvas_box),
                    feedback_points=feedback_points_d,
                    threshold=threshold_pct_d,
                    info_lines=info_d,
                )

            page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

        if shots_list_d:
            hit_rates = []
            for shots in shots_list_d:
                hc = sum(1 for s in shots if s.get("hit"))
                hit_rates.append(hc / len(shots) * 100)
            avg_d = sum(hit_rates) / len(hit_rates)
            result["rounds_detail"][f"{dist}m_full_feedback"] = {
                "avgHitRate": round(avg_d, 1),
                "runsHitRate": [round(x, 1) for x in hit_rates],
            }
            print(f"  → {dist}m 反馈轮平均命中率: {avg_d:.1f}%")

    _click_back_to_builder(page)

    return result


# ============================================================
# 命中率输出
# ============================================================

def _load_existing_hit_rate_json():
    if not os.path.exists(HIT_RATE_JSON):
        return None
    try:
        return load_json(HIT_RATE_JSON)
    except Exception:
        return None


def _write_hit_rate_json_full(results):
    """完整模式：覆盖写 _hit_rate.json"""
    weapons_out = []
    for r in results:
        rd = r["rounds_detail"]

        hr_30 = rd.get("30m_full_feedback", {})
        hr_50 = rd.get("50m_full_feedback", {})
        hr_100 = rd.get("100m_full_feedback", {})

        pct_30 = hr_30.get("avgHitRate")
        pct_50 = hr_50.get("avgHitRate")
        pct_100 = hr_100.get("avgHitRate")

        def _to_frac(pct):
            if pct is None:
                return None
            return round(pct / 100.0, 4)

        weapons_out.append({
            "weaponId": r["weaponId"],
            "weaponName": r["weaponName"],
            "configId": r["configId"],
            "schemeIndex": r["schemeIndex"],
            "aimSpeed": r.get("aimSpeed"),
            "hitRate": {
                "30": _to_frac(pct_30),
                "50": _to_frac(pct_50),
                "100": _to_frac(pct_100),
            },
            "hitRatePct": {
                "30": pct_30,
                "50": pct_50,
                "100": pct_100,
            },
            "runsHitRatePct": {
                "30": hr_30.get("runsHitRate", []),
                "50": hr_50.get("runsHitRate", []),
                "100": hr_100.get("runsHitRate", []),
            },
            "feedbackRuns": FEEDBACK_RUNS,
        })

    out = {
        "generatedAt": datetime.now().isoformat(),
        "distances": DISTANCES,
        "feedbackRuns": FEEDBACK_RUNS,
        "testRounds": TEST_ROUNDS,
        "weapons": weapons_out,
    }
    save_json(HIT_RATE_JSON, out)
    return HIT_RATE_JSON


def _merge_aim_speed_into_hit_rate_json(aim_speed_results):
    """
    把 aim_speed_results 里的 aimSpeed 合并到 _hit_rate.json。
    已存在的条目只更新 aimSpeed；不存在的新增（只含基础字段）。
    """
    existing = _load_existing_hit_rate_json()

    if existing is None:
        # 新建
        weapons_out = []
        for r in aim_speed_results:
            weapons_out.append({
                "weaponId": r["weaponId"],
                "weaponName": r["weaponName"],
                "configId": r["configId"],
                "schemeIndex": r["schemeIndex"],
                "aimSpeed": r.get("aimSpeed"),
                "hitRate": {"30": None, "50": None, "100": None},
                "hitRatePct": {"30": None, "50": None, "100": None},
                "runsHitRatePct": {"30": [], "50": [], "100": []},
                "feedbackRuns": FEEDBACK_RUNS,
            })
        out = {
            "generatedAt": datetime.now().isoformat(),
            "distances": DISTANCES,
            "feedbackRuns": FEEDBACK_RUNS,
            "testRounds": TEST_ROUNDS,
            "weapons": weapons_out,
        }
        save_json(HIT_RATE_JSON, out)
        return HIT_RATE_JSON, 0, len(weapons_out)

    # 合并
    weapons = existing.get("weapons", [])
    # 建索引 (weaponId, configId) → 条目
    idx = {}
    for w in weapons:
        key = (w.get("weaponId"), w.get("configId"))
        idx[key] = w

    updated = 0
    added = 0
    for r in aim_speed_results:
        key = (r["weaponId"], r["configId"])
        if key in idx:
            idx[key]["aimSpeed"] = r.get("aimSpeed")
            updated += 1
        else:
            weapons.append({
                "weaponId": r["weaponId"],
                "weaponName": r["weaponName"],
                "configId": r["configId"],
                "schemeIndex": r["schemeIndex"],
                "aimSpeed": r.get("aimSpeed"),
                "hitRate": {"30": None, "50": None, "100": None},
                "hitRatePct": {"30": None, "50": None, "100": None},
                "runsHitRatePct": {"30": [], "50": [], "100": []},
                "feedbackRuns": FEEDBACK_RUNS,
            })
            added += 1

    existing["weapons"] = weapons
    existing["generatedAt"] = datetime.now().isoformat()
    save_json(HIT_RATE_JSON, existing)
    return HIT_RATE_JSON, updated, added


# ============================================================
# 主流程
# ============================================================

def run_all(tasks, no_clean=False, aim_speed_only=False):
    if not tasks:
        print("❌ 没有要跑的任务")
        return

    if aim_speed_only:
        print("=" * 70)
        print(f"🎯 仅读取开镜速度 · {len(tasks)} 个配置")
        print("=" * 70)
    else:
        print("=" * 70)
        print(f"🎯 全枪械后坐力测试 · {len(tasks)} 个配置")
        print("=" * 70)
    for i, t in enumerate(tasks):
        print(f"  [{i+1:>3}] {t['weaponName']} {t['configId']}")
    print()

    if not aim_speed_only:
        print(f"  距离: {DISTANCES}")
        print(f"  每距离反馈轮次数: {FEEDBACK_RUNS}")
        print(f"  测试弹容上限: {TEST_ROUNDS}")
        print(f"  排除 weaponId: {sorted(EXCLUDE_WEAPON_IDS)}")
        print(f"  倍镜: {SCOPE}")
        print(f"  aim y 比例: {AIM_Y_RATIO_BY_DISTANCE}")
        print(f"  σ 放大: ×{STABILITY_SIGMA_SCALE}")
        print(f"  呼吸: amp=({BREATH_AMP_X}, {BREATH_AMP_Y})%, "
              f"freq={BREATH_FREQ}Hz")
        print(f"  压枪加速度: {A_MAX_PER_SEC2} %/秒²")
        print(f"  反馈加速度: {FB_ACCEL_PER_SEC2} %/秒²")
        print(f"  反馈阈值: {FB_THRESHOLD_BY_DISTANCE}")
        print()

    install_signal_handler()
    need_pause = not profile_exists()

    data = load_json(DATA_JSON)
    if not data:
        print(f"❌ 读不到 {DATA_JSON}")
        return

    pw, context, page = launch_browser(fullscreen=True)
    t_total_start = time.time()

    results = []
    failed = []

    try:
        page.goto(DFTTK_URL, wait_until="commit")
        try:
            page.locator(SELECTORS["weapon_selector"]).wait_for(
                state="visible", timeout=30000)
        except PlaywrightTimeout:
            print("  ⚠️ 武器选择器未出现")

        if need_pause:
            print()
            print("=" * 70)
            print("  请确认页面已加载、已登录、已切到「烽火地带」")
            print("  方案库里能看到要测的枪的方案")
            print("=" * 70)
            try:
                input("\n准备好后按回车...\n")
            except (KeyboardInterrupt, EOFError):
                return

        for i, task in enumerate(tasks):
            print()
            print(f"━━━ [{i+1}/{len(tasks)}] "
                  f"{task['weaponName']} {task['configId']} ━━━")
            try:
                if aim_speed_only:
                    result = _run_aim_speed_only_one(page, task, data)
                else:
                    result = _run_full_one(page, task, data)

                if result:
                    results.append(result)
                else:
                    failed.append(
                        f"{task['weaponName']} {task['configId']}")
            except Exception as e:
                import traceback
                print(f"  ❌ 异常: {e}")
                traceback.print_exc()
                failed.append(
                    f"{task['weaponName']} {task['configId']}")
                try:
                    if "/recoil" in page.url:
                        _click_back_to_builder(page)
                except Exception:
                    pass

            # 每把枪跑完更新一次命中率文件
            if results and not aim_speed_only:
                _write_hit_rate_json_full(results)

    finally:
        t_total = time.time() - t_total_start

        print()
        print("=" * 70)
        print("📊 全部汇总")
        print("=" * 70)
        print(f"  成功: {len(results)}/{len(tasks)}")
        if failed:
            print(f"  失败 {len(failed)} 个：")
            for name in failed:
                print(f"    - {name}")
        print(f"  总耗时: {t_total:.1f}s")

        if results:
            if aim_speed_only:
                path, upd, add = _merge_aim_speed_into_hit_rate_json(results)
                print(f"  💾 命中率文件: {path}  "
                      f"（更新 {upd} 条，新增 {add} 条 aimSpeed）")
            else:
                path = _write_hit_rate_json_full(results)
                print(f"  💾 命中率文件: {path}")

        print(f"  截图目录: {SCREENSHOT_DIR}")
        close_browser(pw, context)


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="全枪械后坐力测试（30m/50m/100m 反馈轮各 3 次）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python test_recoil.py\n"
            "  python test_recoil.py --weapon 41\n"
            "  python test_recoil.py --config 41#1,2#1\n"
            "  python test_recoil.py --limit 3\n"
            "  python test_recoil.py --no-clean\n"
            "\n"
            "  python test_recoil.py --aim-speed-only\n"
            "  python test_recoil.py --aim-speed-only --weapon 41\n"
        ),
    )
    p.add_argument("--weapon", type=int, default=None,
                   help="只跑指定 weaponId（所有配置）")
    p.add_argument("--config", type=str, default=None,
                   help="只跑指定配置，格式 weaponId#configId，"
                        "多个用逗号分隔。例：--config 41#1,2#1")
    p.add_argument("--limit", type=int, default=0,
                   help="只跑前 N 个任务（0 = 全部）")
    p.add_argument("--no-clean", action="store_true",
                   help="不清空输出目录")
    p.add_argument("--aim-speed-only", action="store_true",
                   help="仅读取开镜速度（不压枪、不截图），"
                        "合并到 _hit_rate.json")
    return p.parse_args()


def main():
    args = parse_args()

    if not args.aim_speed_only and not args.no_clean:
        _clean_output_dir()

    os.makedirs(RECOIL_OUTPUT_DIR, exist_ok=True)
    os.makedirs(SCREENSHOT_DIR, exist_ok=True)

    data = load_json(DATA_JSON)
    if not data:
        print(f"❌ 读不到 {DATA_JSON}")
        return

    tasks, skipped = _extract_tasks(data)
    print(f"从 data.json 提取 {len(tasks)} 个任务")
    if skipped:
        detail = [f"{k}={v}" for k, v in skipped.items() if v]
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("❌ 没有任务")
        return

    config_filter = None
    if args.config:
        try:
            config_filter = _parse_config_filter(args.config)
        except ValueError as e:
            print(f"❌ {e}")
            return

    if config_filter is not None:
        tasks = [t for t in tasks
                 if (t["weaponId"], t["configId"]) in config_filter]
        if not tasks:
            print(f"❌ --config 没匹配到任何任务")
            return
    elif args.weapon is not None:
        tasks = [t for t in tasks if t["weaponId"] == args.weapon]
        if not tasks:
            print(f"❌ --weapon {args.weapon} 没匹配到任务")
            return

    if args.limit and args.limit > 0:
        tasks = tasks[:args.limit]

    run_all(tasks, no_clean=args.no_clean,
            aim_speed_only=args.aim_speed_only)


if __name__ == "__main__":
    main()