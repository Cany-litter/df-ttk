# tools/scrape_recoil.py
#
# ⭐ v24.1：跳过后续距离的裸弹道
#
# 与 v24 的差异：
#   1. init_comp_curve is not None 时跳过裸弹道
#   2. 50m/100m 第 0 轮 = 迁移曲线验证轮
#   3. 50m/100m max_rounds 4 → 3
#
# 核心洞察：
#   切换距离不改变原始弹道。
#   30m 收敛后的补偿曲线，可以直接作为 50m 的起点。
#   50m 收敛后的曲线，可以直接作为 100m 的起点。
#
# 用法：
#   cd tools
#   python scrape_recoil.py
#   python scrape_recoil.py --weapon 41 --config "#1"
#   python scrape_recoil.py --weapon 41 --config "#1" --no-cache

import argparse
import json
import math
import os
import random
import time
from collections import Counter

from playwright.sync_api import sync_playwright

from config import (
    USER_DATA_DIR,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
)


# ============================================================
# 常量
# ============================================================

RECOIL_URL = "https://dfttk.com/firefight/builder/recoil"

DISTANCES = [30, 50, 100]
SCOPE = 2.25

BLOOD_VALUE = 10000
ROUNDS_TO_FIRE = 30
FIRE_RATE_DEFAULT = 800
DEFAULT_CAPACITY = 30

# ---------- 分距离参数 ----------
DISTANCE_PARAMS = {
    30: {
        "jitter_ratio": 0.003,
        "comp_scale": 1.10,
        "learning_rate": 0.35,
        "weighted_lr": True,
        "weight_gain": 1.5,
        "y_weighted_x": True,
        "y_weight_gain": 0.15,
        "smooth_window": 2,
        "global_offset_fix": True,
        "early_stop_patience": 2,
        "max_rounds": 8,
    },
    50: {
        "jitter_ratio": 0.002,
        "comp_scale": 1.05,
        "learning_rate": 0.35,
        "weighted_lr": True,
        "weight_gain": 1.5,
        "y_weighted_x": True,
        "y_weight_gain": 0.15,
        "smooth_window": 2,
        "global_offset_fix": True,
        "early_stop_patience": 2,
        "max_rounds": 3,          # ⭐ v24.1：4 → 3
    },
    100: {
        "jitter_ratio": 0.001,
        "comp_scale": 1.02,
        "learning_rate": 0.30,
        "weighted_lr": True,
        "weight_gain": 1.8,
        "y_weighted_x": True,
        "y_weight_gain": 0.20,
        "smooth_window": 2,
        "global_offset_fix": True,
        "early_stop_patience": 2,
        "max_rounds": 3,          # ⭐ v24.1：4 → 3
    },
}

MOVE_STEPS_PER_SHOT = 3

TORSO_X_RATIO = 0.5
TORSO_Y_OFFSET = 0.40
TORSO_H_RATIO = 0.4

BETWEEN_ROUNDS_WAIT = 500
AFTER_DISTANCE_CHANGE_WAIT = 800
AFTER_SCOPE_CHANGE_WAIT = 800

PARTS = ['头部', '胸部', '腹部', '上臂', '下臂', '大腿', '小腿', '脱靶']

CANVAS_SELECTOR = ".recoil-range-stage"
MANNEQUIN_SELECTOR = 'img[alt="训练假人"]'
NEW_ROUND_SELECTOR = "button.recoil-range-new-round"
BLOOD_INPUT_SELECTOR = ".weapon-recoil-lab-number-field input[type='number']"
CAPACITY_SELECTOR = ".recoil-loadout-stat.is-capacity dd"
FIRE_RATE_SELECTOR = ".recoil-loadout-stat.is-fire-rate dd"
SLIDER_SELECTOR = ".weapon-recoil-lab-slider input[type='range']"
MARKER_SELECTOR = ".recoil-shot-marker"

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "recoil_results")
BARE_CACHE_DIR = os.path.join(OUTPUT_DIR, "bare_cache")
CURVE_CACHE_DIR = os.path.join(OUTPUT_DIR, "curve_cache")


# ============================================================
# 基础工具
# ============================================================

def read_capacity(page):
    try:
        el = page.locator(CAPACITY_SELECTOR).first
        text = el.inner_text().strip()
        val = int("".join(c for c in text if c.isdigit()))
        return val if val > 0 else DEFAULT_CAPACITY
    except Exception:
        return DEFAULT_CAPACITY


def read_fire_rate(page):
    try:
        el = page.locator(FIRE_RATE_SELECTOR).first
        text = el.inner_text().strip()
        val = int("".join(c for c in text if c.isdigit()))
        return val if val > 0 else FIRE_RATE_DEFAULT
    except Exception:
        return FIRE_RATE_DEFAULT


def set_blood(page, value=BLOOD_VALUE):
    inp = page.locator(BLOOD_INPUT_SELECTOR).first
    inp.wait_for(state="visible", timeout=5000)
    inp.fill(str(value))
    inp.press("Enter")


def set_slider(page, index, value):
    result = page.evaluate("""(args) => {
        const sliders = document.querySelectorAll(args.selector);
        const slider = sliders[args.index];
        if (!slider) return { ok: false, reason: 'slider not found', count: sliders.length };

        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(slider, String(args.value));

        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));

        return { ok: true, value: slider.value };
    }""", {"selector": SLIDER_SELECTOR, "index": index, "value": value})
    return result


def set_distance(page, meters):
    result = set_slider(page, 0, meters)
    if result.get("ok"):
        print(f"  📏 距离 → {meters}m ✅")
    else:
        print(f"  ⚠️ 距离设置失败: {result}")


def set_scope(page, magnification):
    result = set_slider(page, 1, magnification)
    if result.get("ok"):
        print(f"  🔍 倍镜 → {magnification}× ✅")
    else:
        print(f"  ⚠️ 倍镜设置失败: {result}")


def read_torso_target(page):
    result = page.evaluate("""(args) => {
        const img = document.querySelector(args.mannequin_selector);
        const stage = document.querySelector(args.stage_selector);
        if (!img || !stage) return null;

        const img_rect = img.getBoundingClientRect();
        const stage_rect = stage.getBoundingClientRect();

        const torso_x = (img_rect.x + img_rect.width / 2 - stage_rect.x) / stage_rect.width * 100;
        const torso_y = (img_rect.y + img_rect.height * 0.40 - stage_rect.y) / stage_rect.height * 100;

        const torso_w = (img_rect.width * 0.5) / stage_rect.width * 100;
        const torso_h = (img_rect.height * 0.4) / stage_rect.height * 100;

        return {
            torso_x, torso_y, torso_w, torso_h,
            img_w_px: img_rect.width,
            img_h_px: img_rect.height,
            img_scale: img.style.transform,
            stage_w_px: stage_rect.width,
            stage_h_px: stage_rect.height,
        };
    }""", {
        "mannequin_selector": MANNEQUIN_SELECTOR,
        "stage_selector": CANVAS_SELECTOR,
    })
    return result


def read_shots(page):
    shots = page.evaluate("""() => {
        const markers = document.querySelectorAll('.recoil-shot-marker');
        const result = [];
        for (const m of markers) {
            const left = parseFloat(m.style.left);
            const top = parseFloat(m.style.top);
            if (isNaN(left) || isNaN(top)) continue;
            const hit = !m.classList.contains('recoil-shot-miss');
            result.push({ x: left, y: top, hit });
        }
        return result;
    }""")
    return shots


def read_last_hit(page):
    try:
        result = page.evaluate("""() => {
            const dts = document.querySelectorAll('.weapon-recoil-lab-status-grid dt');
            for (const dt of dts) {
                if (dt.innerText.trim() === '最近命中') {
                    return dt.nextElementSibling?.innerText.trim() || '';
                }
            }
            return '';
        }""")
        return result or ''
    except Exception:
        return ''


def stat(shots):
    hits = sum(1 for s in shots if s["hit"])
    total = len(shots)
    return {
        "hits": hits,
        "misses": total - hits,
        "total": total,
        "hit_rate": (hits / total * 100) if total else 0,
    }


def center_hit_rate(shots, target):
    """中心区域命中率（胸部+腹部的近似）"""
    if not shots:
        return 0.0

    cx = target["torso_x"]
    cy = target["torso_y"]
    half_w = target["torso_w"] * 0.5
    half_h = target["torso_h"] * 0.5

    hits = 0
    for s in shots:
        if abs(s["x"] - cx) <= half_w and abs(s["y"] - cy) <= half_h:
            hits += 1
    return hits / len(shots) * 100


def parse_part(hit_text):
    if not hit_text:
        return None
    text = hit_text.strip()
    if '·' in text:
        part = text.split('·')[0].strip()
    else:
        part = text
    if part in PARTS:
        return part
    return None


def count_parts(hit_log):
    counter = Counter()
    for entry in hit_log:
        part = parse_part(entry)
        if part:
            counter[part] += 1
    result = {}
    for p in PARTS:
        result[p] = counter.get(p, 0)
    return result


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def smooth_curve(curve, window=2):
    if window <= 1 or len(curve) <= 2:
        return curve
    half = window // 2
    n = len(curve)
    smoothed = []
    for i in range(n):
        lo = max(0, i - half)
        hi = min(n, i + half + 1)
        xs = [curve[j][0] for j in range(lo, hi)]
        ys = [curve[j][1] for j in range(lo, hi)]
        smoothed.append((sum(xs) / len(xs), sum(ys) / len(ys)))
    return smoothed


def safe_json_load(path):
    if not os.path.exists(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def safe_json_save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 核心：累积补偿 + 加权学习率 + 按 y 加权 x + 全局偏移
# ============================================================

def build_cumulative_comp(shots, target, px_per_pct_x, px_per_pct_y,
                          comp_scale, rounds, smooth_window):
    if not shots:
        return [(0.0, 0.0)] * rounds

    base_x = target["torso_x"]
    base_y = target["torso_y"]

    comp_abs = []
    for i in range(rounds):
        if i < len(shots):
            cum_dx = shots[i]["x"] - base_x
            cum_dy = shots[i]["y"] - base_y
            cx = -cum_dx * px_per_pct_x * comp_scale
            cy = -cum_dy * px_per_pct_y * comp_scale
        else:
            if comp_abs:
                cx, cy = comp_abs[-1]
            else:
                cx, cy = 0.0, 0.0
        comp_abs.append((cx, cy))

    return smooth_curve(comp_abs, smooth_window)


def build_weighted_comp(shots, target, px_per_pct_x, px_per_pct_y,
                        base_lr, weight_gain, rounds, smooth_window,
                        y_weighted_x=False, y_weight_gain=0.15):
    if not shots:
        return [(0.0, 0.0)] * rounds

    base_x = target["torso_x"]
    base_y = target["torso_y"]

    comp_abs = []
    for i in range(rounds):
        if i < len(shots):
            err_x = shots[i]["x"] - base_x
            err_y = shots[i]["y"] - base_y
            err_mag = math.sqrt(err_x * err_x + err_y * err_y)

            weight = min(weight_gain, 1.0 + err_mag / 10.0)

            x_weight = weight
            if y_weighted_x and err_y > 0:
                x_weight = weight * (1.0 + err_y * y_weight_gain)
                x_weight = min(x_weight, weight * 1.5)

            cx = -err_x * px_per_pct_x * base_lr * x_weight
            cy = -err_y * px_per_pct_y * base_lr * weight
        else:
            if comp_abs:
                cx, cy = comp_abs[-1]
            else:
                cx, cy = 0.0, 0.0
        comp_abs.append((cx, cy))

    return smooth_curve(comp_abs, smooth_window)


def compute_global_offset(shots, target, px_per_pct_x, px_per_pct_y, rounds):
    if not shots:
        return (0.0, 0.0)

    torso_x = target["torso_x"]
    torso_y = target["torso_y"]

    n = min(len(shots), rounds)
    sum_err_x = 0.0
    sum_err_y = 0.0
    for i in range(n):
        sum_err_x += shots[i]["x"] - torso_x
        sum_err_y += shots[i]["y"] - torso_y

    avg_err_x = sum_err_x / n
    avg_err_y = sum_err_y / n

    return (-avg_err_x * px_per_pct_x, -avg_err_y * px_per_pct_y)


def print_curve_summary(label, curve):
    if not curve:
        return
    first = curve[0]
    mid = curve[len(curve) // 2]
    last = curve[-1]
    print(f"     {label}: 首发({first[0]:+.1f},{first[1]:+.1f}) "
          f"中段({mid[0]:+.1f},{mid[1]:+.1f}) "
          f"末发({last[0]:+.1f},{last[1]:+.1f})")


# ============================================================
# 单轮压枪
# ============================================================

def do_one_recoil(page, round_label, comp_abs_curve, rounds, interval_ms, target, params):
    torso_x = target["torso_x"]
    torso_y = target["torso_y"]
    jitter_ratio = params["jitter_ratio"]

    print()
    print(f"  {'-'*56}")
    print(f"  🔫 {round_label}")
    print(f"     靶心: ({torso_x:.1f}, {torso_y:.1f})")
    if comp_abs_curve:
        print_curve_summary("累积补偿", comp_abs_curve)
    print(f"  {'-'*56}")

    set_blood(page, BLOOD_VALUE)
    page.locator(NEW_ROUND_SELECTOR).click()
    page.wait_for_timeout(200)

    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)
    box = canvas.bounding_box()

    center_x = box["x"] + box["width"] / 2
    center_y = box["y"] + box["height"] / 2

    page.mouse.move(center_x, center_y)
    page.wait_for_timeout(100)
    page.mouse.down()

    cur_x = center_x
    cur_y = center_y

    hit_log = []
    shot_times = []

    t_start = time.time()

    n_sub = MOVE_STEPS_PER_SHOT
    dt_sub = interval_ms / n_sub

    for i in range(rounds):
        t_now = (time.time() - t_start) * 1000
        shot_times.append(t_now)

        if comp_abs_curve and i < len(comp_abs_curve):
            target_offset_x, target_offset_y = comp_abs_curve[i]
        else:
            target_offset_x, target_offset_y = 0.0, 0.0

        jitter_x = random.uniform(-jitter_ratio, jitter_ratio)
        jitter_y = random.uniform(-jitter_ratio, jitter_ratio)

        target_x = center_x + target_offset_x * (1 + jitter_x)
        target_y = center_y + target_offset_y * (1 + jitter_y)

        target_x = max(box["x"] + 5, min(box["x"] + box["width"] - 5, target_x))
        target_y = max(box["y"] + 5, min(box["y"] + box["height"] - 5, target_y))

        step_start_x = cur_x
        step_start_y = cur_y

        for s in range(n_sub):
            frac = (s + 1) / n_sub
            sub_x = step_start_x + (target_x - step_start_x) * frac
            sub_y = step_start_y + (target_y - step_start_y) * frac
            page.mouse.move(sub_x, sub_y, steps=1)
            page.wait_for_timeout(dt_sub)

        cur_x = target_x
        cur_y = target_y

        hit_text = read_last_hit(page)
        if hit_text:
            hit_log.append(hit_text)

    page.mouse.up()
    page.wait_for_timeout(500)

    shots = read_shots(page)
    st = stat(shots)
    parts = count_parts(hit_log)
    chr_val = center_hit_rate(shots, target)

    if shots:
        err_x_list = [s["x"] - torso_x for s in shots]
        err_y_list = [s["y"] - torso_y for s in shots]
        avg_err_x = sum(err_x_list) / len(err_x_list)
        avg_err_y = sum(err_y_list) / len(err_y_list)
        max_abs_err_x = max(abs(e) for e in err_x_list)
        max_abs_err_y = max(abs(e) for e in err_y_list)

        start_x = shots[0]["x"]
        start_y = shots[0]["y"]
        end_x = shots[-1]["x"]
        end_y = shots[-1]["y"]
        end_rel_x = end_x - start_x
        end_rel_y = end_y - start_y
    else:
        avg_err_x = avg_err_y = max_abs_err_x = max_abs_err_y = 0.0
        start_x = start_y = end_x = end_y = 0.0
        end_rel_x = end_rel_y = 0.0

    print(f"     ✅ 命中 {st['hits']}/{st['total']} ({st['hit_rate']:.1f}%) | "
          f"中心 {chr_val:.1f}%")
    print(f"     🎯 部位: 头{parts['头部']} 胸{parts['胸部']} 腹{parts['腹部']} "
          f"上臂{parts['上臂']} 下臂{parts['下臂']} 大腿{parts['大腿']} 小腿{parts['小腿']} 脱{parts['脱靶']}")
    print(f"     📉 平均误差: Δx={avg_err_x:+.2f}% Δy={avg_err_y:+.2f}%")
    print(f"     🎯 终点相对起点: Δ=({end_rel_x:+.2f}, {end_rel_y:+.2f})")
    print(f"     ⏱️ 总耗时: {shot_times[-1]:.0f}ms")

    return {
        "round_label": round_label,
        "comp_abs_curve": [(round(x, 2), round(y, 2)) for x, y in comp_abs_curve] if comp_abs_curve else None,
        "shot_times": [round(t, 1) for t in shot_times],
        "shots": shots,
        "hit_log": hit_log,
        "parts": parts,
        "hits": st["hits"],
        "misses": st["misses"],
        "total": st["total"],
        "hit_rate": round(st["hit_rate"], 2),
        "center_hit_rate": round(chr_val, 2),
        "avg_err_x": round(avg_err_x, 3),
        "avg_err_y": round(avg_err_y, 3),
        "max_abs_err_x": round(max_abs_err_x, 3),
        "max_abs_err_y": round(max_abs_err_y, 3),
        "start_x": round(start_x, 3),
        "start_y": round(start_y, 3),
        "end_x": round(end_x, 3),
        "end_y": round(end_y, 3),
        "end_rel_x": round(end_rel_x, 3),
        "end_rel_y": round(end_rel_y, 3),
    }


# ============================================================
# 多轮学习
# ============================================================

def run_rounds(page, distance, rounds, interval_ms, weapon_id=None, config_id=None,
               use_cache=True, init_comp_curve=None):
    """
    ⭐ v24.1：
      - init_comp_curve is None → 第一个距离，打裸弹道
      - init_comp_curve is not None → 后续距离，跳过裸弹道，直接用迁移曲线
    """
    target = read_torso_target(page)
    if not target:
        print(f"  ⚠️ 读假人失败，跳过 {distance}m")
        return None

    params = DISTANCE_PARAMS.get(distance, DISTANCE_PARAMS[50])
    comp_scale = params["comp_scale"]
    lr = params["learning_rate"]
    weighted_lr = params["weighted_lr"]
    weight_gain = params["weight_gain"]
    y_weighted_x = params.get("y_weighted_x", False)
    y_weight_gain = params.get("y_weight_gain", 0.15)
    smooth_window = params["smooth_window"]
    global_fix = params["global_offset_fix"]
    patience = params["early_stop_patience"]
    max_rounds = params.get("max_rounds", 8)

    print(f"  🎯 靶心 ({target['torso_x']:.1f}, {target['torso_y']:.1f}) | "
          f"scale: {target.get('img_scale', '?')}")
    print(f"  ⚙️ 参数: 抖动={params['jitter_ratio']*100:.2f}% "
          f"首轮倍率={comp_scale} LR={lr} 早停={patience} 轮数上限={max_rounds}")

    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)
    box = canvas.bounding_box()
    px_per_pct_x = box["width"] / 100
    px_per_pct_y = box["height"] / 100

    print(f"  📐 画布 {box['width']:.0f}×{box['height']:.0f}px")

    results = []

    # ⭐ v24.1：只有第一个距离才打裸弹道
    bare_result = None
    if init_comp_curve is None:
        # 第一个距离：打裸弹道（可能有缓存）
        cache_path = None
        if weapon_id is not None and config_id is not None:
            config_key = config_id.replace("#", "")
            cache_path = os.path.join(
                BARE_CACHE_DIR,
                f"bare_{weapon_id}_{config_key}_{distance}.json"
            )
            if use_cache:
                cached = safe_json_load(cache_path)
                if cached:
                    print(f"     💾 使用裸弹道缓存: {cache_path}")
                    bare_result = cached

        if bare_result is None:
            bare_result = do_one_recoil(
                page, "0-裸弹道（不压）", None, rounds, interval_ms, target, params
            )
            if cache_path:
                safe_json_save(cache_path, bare_result)
                print(f"     💾 已缓存裸弹道: {cache_path}")

        results.append(bare_result)

        # 首轮补偿 = 裸弹道算
        comp_abs_curve = build_cumulative_comp(
            bare_result["shots"], target, px_per_pct_x, px_per_pct_y,
            comp_scale, rounds, smooth_window,
        )
        print()
        print(f"     📊 首轮累积补偿（靶心基准，倍率={comp_scale}）:")
        print_curve_summary("累积补偿", comp_abs_curve)

        best_hit_rate = bare_result["hit_rate"]
        best_center_rate = bare_result.get("center_hit_rate", 0)
        best_round_idx = 0
        best_comp_curve = comp_abs_curve

    else:
        # ⭐ v24.1：后续距离，跳过裸弹道，直接用迁移曲线
        print(f"     ⏭️ 跳过裸弹道（使用迁移曲线）")

        comp_abs_curve = [(float(x), float(y)) for x, y in init_comp_curve]
        print()
        print(f"     📊 迁移的初始补偿曲线（来自上一个距离）:")
        print_curve_summary("累积补偿", comp_abs_curve)

        # 迁移曲线先打一轮验证（作为"第 0 轮"）
        verify_result = do_one_recoil(
            page, "0-迁移验证", comp_abs_curve, rounds, interval_ms, target, params
        )
        results.append(verify_result)

        best_hit_rate = verify_result["hit_rate"]
        best_center_rate = verify_result.get("center_hit_rate", 0)
        best_round_idx = 0
        best_comp_curve = comp_abs_curve

        page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

    no_improve_count = 0

    for r in range(1, max_rounds + 1):
        result = do_one_recoil(
            page, f"{r}-精修", comp_abs_curve, rounds, interval_ms, target, params
        )
        results.append(result)

        cur_hit = result["hit_rate"]
        cur_center = result.get("center_hit_rate", 0)

        is_better = False
        if cur_hit > best_hit_rate:
            is_better = True
        elif cur_hit >= best_hit_rate - 1.0 and cur_center > best_center_rate + 1.0:
            is_better = True

        if is_better:
            best_hit_rate = max(best_hit_rate, cur_hit)
            best_center_rate = max(best_center_rate, cur_center)
            best_round_idx = r
            best_comp_curve = comp_abs_curve
            no_improve_count = 0
            print(f"     🏆 新纪录: 命中 {cur_hit:.1f}% / 中心 {cur_center:.1f}%（第 {r} 轮）")
        else:
            no_improve_count += 1
            print(f"     ⚠️ 未提升（连续 {no_improve_count}/{patience}）")

        if no_improve_count >= patience:
            print(f"     🛑 早停：连续 {patience} 轮未提升，停止迭代")
            break

        if weighted_lr:
            comp_new = build_weighted_comp(
                result["shots"], target, px_per_pct_x, px_per_pct_y,
                lr, weight_gain, rounds, smooth_window,
                y_weighted_x=y_weighted_x, y_weight_gain=y_weight_gain,
            )
        else:
            comp_new = build_cumulative_comp(
                result["shots"], target, px_per_pct_x, px_per_pct_y,
                lr, rounds, smooth_window,
            )

        comp_abs_curve = [
            (comp_abs_curve[i][0] + comp_new[i][0],
             comp_abs_curve[i][1] + comp_new[i][1])
            for i in range(rounds)
        ]

        if global_fix:
            gx, gy = compute_global_offset(
                result["shots"], target, px_per_pct_x, px_per_pct_y, rounds
            )
            comp_abs_curve = [
                (comp_abs_curve[i][0] + gx * lr,
                 comp_abs_curve[i][1] + gy * lr)
                for i in range(rounds)
            ]

        comp_abs_curve = smooth_curve(comp_abs_curve, smooth_window)

        prev_rate = results[-2]["hit_rate"]
        delta = cur_hit - prev_rate
        print(f"     📊 命中率变化: {prev_rate:.1f}% → {cur_hit:.1f}% ({delta:+.1f}%)")

        page.wait_for_timeout(BETWEEN_ROUNDS_WAIT)

    best_result = results[best_round_idx]

    print()
    print(f"  🏆 最佳轮: 第 {best_round_idx} 轮 "
          f"（命中 {best_result['hit_rate']:.1f}% / 中心 {best_result.get('center_hit_rate', 0):.1f}%）")

    # 缓存最佳补偿曲线
    if weapon_id is not None and config_id is not None:
        config_key = config_id.replace("#", "")
        curve_cache_path = os.path.join(
            CURVE_CACHE_DIR,
            f"curve_{weapon_id}_{config_key}_{distance}.json"
        )
        safe_json_save(curve_cache_path, {
            "distance": distance,
            "best_round_idx": best_round_idx,
            "hit_rate": best_result["hit_rate"],
            "center_hit_rate": best_result.get("center_hit_rate", 0),
            "comp_abs_curve": best_comp_curve,
        })

    return {
        "distance": distance,
        "target": target,
        "params": params,
        "bare_hit_rate": bare_result["hit_rate"] if bare_result else None,
        "rounds": results,
        "best_round_idx": best_round_idx,
        "best_comp_curve": [(round(x, 2), round(y, 2)) for x, y in best_comp_curve],
        "final_hit_rate": best_result["hit_rate"],
        "final_center_hit_rate": best_result.get("center_hit_rate", 0),
        "final_parts": best_result["parts"],
        "final_end_rel_x": best_result["end_rel_x"],
        "final_end_rel_y": best_result["end_rel_y"],
        "final_avg_err_x": best_result["avg_err_x"],
        "final_avg_err_y": best_result["avg_err_y"],
    }


# ============================================================
# 参数解析
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="后坐力模拟（v24.1 跳过后续距离裸弹道）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python scrape_recoil.py                              默认\n"
            "  python scrape_recoil.py --weapon 41 --config '#1'    指定枪/配置\n"
            "  python scrape_recoil.py --no-cache                   忽略缓存\n"
        ),
    )
    parser.add_argument("--weapon", type=int, default=None,
                        help="武器 ID")
    parser.add_argument("--config", type=str, default=None,
                        help="配置 ID（如 '#1'）")
    parser.add_argument("--name", type=str, default=None,
                        help="武器名（仅用于展示）")
    parser.add_argument("--no-cache", action="store_true",
                        help="忽略裸弹道缓存")
    return parser.parse_args()


# ============================================================
# 主流程
# ============================================================

def main():
    args = parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(BARE_CACHE_DIR, exist_ok=True)
    os.makedirs(CURVE_CACHE_DIR, exist_ok=True)

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=False,
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
        )
        page = context.pages[0] if context.pages else context.new_page()

        print(f"打开: {RECOIL_URL}")
        page.goto(RECOIL_URL, wait_until="domcontentloaded")

        print("等待页面加载...")
        page.locator(NEW_ROUND_SELECTOR).wait_for(state="visible", timeout=20000)
        page.locator(CANVAS_SELECTOR).first.wait_for(state="visible", timeout=20000)

        try:
            page.locator(FIRE_RATE_SELECTOR).first.wait_for(state="visible", timeout=5000)
        except Exception:
            pass

        page.wait_for_timeout(1000)
        print("页面已加载")

        capacity = read_capacity(page)
        fire_rate = read_fire_rate(page)

        if capacity <= 0:
            capacity = DEFAULT_CAPACITY
        if fire_rate <= 0:
            fire_rate = FIRE_RATE_DEFAULT

        rounds = min(ROUNDS_TO_FIRE, capacity)
        interval_ms = 60000 / fire_rate

        print(f"弹容: {capacity}, 射速: {fire_rate} RPM ({interval_ms:.1f} ms/发)")
        print(f"本次打: {rounds} 发")
        print(f"⭐ v24.1：跳过后续距离裸弹道（30m → 50m → 100m）")
        if args.weapon is not None:
            print(f"   武器: {args.weapon} / 配置: {args.config or '(未指定)'}")
        print(f"   距离: {DISTANCES}")

        print()
        print(f"⚙️ 设置倍镜 → {SCOPE}×")
        set_scope(page, SCOPE)
        page.wait_for_timeout(AFTER_SCOPE_CHANGE_WAIT)

        all_results = []
        prev_best_curve = None
        t_total_start = time.time()

        for dist in DISTANCES:
            print()
            print("=" * 60)
            print(f"📍 距离: {dist}m")
            print("=" * 60)

            set_distance(page, dist)
            page.wait_for_timeout(AFTER_DISTANCE_CHANGE_WAIT)

            t_dist_start = time.time()
            result = run_rounds(
                page, dist, rounds, interval_ms,
                weapon_id=args.weapon, config_id=args.config,
                use_cache=not args.no_cache,
                init_comp_curve=prev_best_curve,
            )
            t_dist_elapsed = time.time() - t_dist_start

            if result:
                all_results.append(result)
                prev_best_curve = result["best_comp_curve"]
                bare_str = f"{result['bare_hit_rate']:.1f}%" if result['bare_hit_rate'] is not None else "(跳过)"
                print()
                print(f"  🏆 {dist}m 裸弹道: {bare_str} | "
                      f"最佳轮: 第 {result['best_round_idx']} 轮 "
                      f"({result['final_hit_rate']:.1f}% / "
                      f"中心 {result['final_center_hit_rate']:.1f}%) | "
                      f"耗时 {t_dist_elapsed:.1f}s")

        t_total_elapsed = time.time() - t_total_start

        print()
        print("=" * 60)
        print("📊 汇总")
        print("=" * 60)
        for r in all_results:
            p = r["final_parts"]
            bare_str = f"{r['bare_hit_rate']:>5.1f}%" if r['bare_hit_rate'] is not None else " (跳过)"
            print(f"  {r['distance']:>4}m : 裸弹道 {bare_str} → "
                  f"最佳 {r['final_hit_rate']:>5.1f}% / "
                  f"中心 {r['final_center_hit_rate']:>5.1f}% "
                  f"(第 {r['best_round_idx']} 轮)")
            print(f"          部位: 头{p['头部']} 胸{p['胸部']} 腹{p['腹部']} "
                  f"上臂{p['上臂']} 下臂{p['下臂']} 大腿{p['大腿']} 小腿{p['小腿']} 脱{p['脱靶']}")

        print()
        print("🎯 目标对比:")
        targets = {30: (90, 100), 50: (60, 90), 100: (30, 70)}
        for r in all_results:
            lo, hi = targets.get(r["distance"], (0, 100))
            actual = r["final_hit_rate"]
            if lo <= actual <= hi:
                status = "✅ 达标"
            elif actual < lo:
                status = f"❌ 偏低（差 {lo - actual:.1f}%）"
            else:
                status = f"⚠️ 偏高（超 {actual - hi:.1f}%）"
            print(f"  {r['distance']:>4}m : 目标 {lo}~{hi}% | 实际 {actual:.1f}% | {status}")

        print()
        print(f"⏱️ 总耗时: {t_total_elapsed:.1f}s")

        data = {
            "url": RECOIL_URL,
            "weapon_id": args.weapon,
            "weapon_name": args.name,
            "config_id": args.config,
            "capacity": capacity,
            "fire_rate": fire_rate,
            "rounds_fired": rounds,
            "scope": SCOPE,
            "distances": DISTANCES,
            "design": "真人模拟 v24.1（跳过后续距离裸弹道）",
            "total_elapsed_s": round(t_total_elapsed, 2),
            "params": {
                "distance_params": {str(k): v for k, v in DISTANCE_PARAMS.items()},
                "move_steps_per_shot": MOVE_STEPS_PER_SHOT,
            },
            "parts_list": PARTS,
            "results": all_results,
        }

        if args.weapon is not None and args.config is not None:
            config_key = args.config.replace("#", "")
            out_path = os.path.join(
                OUTPUT_DIR, f"recoil_{args.weapon}_{config_key}.json"
            )
        elif args.weapon is not None:
            out_path = os.path.join(OUTPUT_DIR, f"recoil_{args.weapon}.json")
        else:
            out_path = os.path.join(os.path.dirname(__file__), "recoil_data.json")

        safe_json_save(out_path, data)
        print()
        print(f"💾 已保存到: {out_path}")
        print()
        print("浏览器保持打开 10 秒")
        page.wait_for_timeout(10000)

        context.close()


if __name__ == "__main__":
    main()