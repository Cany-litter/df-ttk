# tools/scrape_recoil.py
#
# 单枪多距离 · 固定轨迹压枪
#
# 目标：第 2 轮按一条固定轨迹移动鼠标，把每发都压到同一个点。
#
# 原理：
#   第 1 轮：鼠标停在画布中心不动，按住左键自动连发 30 发。
#            记录每发弹着点 bare_shots[i]。
#            ⭐ 基础弹道与距离无关，只在 30m 跑一次，50m/100m 复用。
#
#   第 2 轮：目标点 = bare_shots[0]（第 1 发落点）。
#            算出每发开火时鼠标应该在哪：
#              mouse_target[i] = 中心 + (目标点 - bare_shots[i]) * px_per_pct
#            开火前先把鼠标瞬移到 mouse_target[0]，
#            然后每发用 interval 时间走到下一个 mouse_target[i]，
#            保证第 i 发开火时鼠标恰好到达 mouse_target[i]。
#
# ⭐ v26.1 绝对时间轴 + 动态步长
# ⭐ v26.2 去掉 networkidle 等待
# ⭐ v26.3 鼠标边界从画布改成 viewport
# ⭐ v26.4 viewport 高 1000（config.py），首次运行后自动跳过回车
# ⭐ v26.5 支持多把枪（--limit N），输出汇总
# ⭐ v26.6 加回 50m / 100m，每把枪跑三个距离
# ⭐ v26.7 50m/100m 复用 30m 的基础弹道
# ⭐ v26.8 去掉目标点上移；默认跑全部枪
#
# 用法：
#   python scrape_recoil.py              跑全部枪，每把 30/50/100m
#   python scrape_recoil.py --limit 3    只跑前 3 把
#   python scrape_recoil.py --weapon 41  只跑 weaponId=41

import argparse
import json
import os
import time

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from config import (
    USER_DATA_DIR,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    DFTTK_URL,
    HEADLESS,
    SELECTORS,
    TASKS_JSON,
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

AFTER_DISTANCE_CHANGE_WAIT = 800
AFTER_SCOPE_CHANGE_WAIT = 800
AFTER_LOAD_SCHEME_WAIT = 1500
AFTER_PAGE_SWITCH_WAIT = 1500

CANVAS_SELECTOR = ".recoil-range-stage"
MANNEQUIN_SELECTOR = 'img[alt="训练假人"]'
NEW_ROUND_SELECTOR = "button.recoil-range-new-round"
BACK_SELECTOR = "button.weapon-recoil-lab-back"
BLOOD_INPUT_SELECTOR = ".weapon-recoil-lab-number-field input[type='number']"
CAPACITY_SELECTOR = ".recoil-loadout-stat.is-capacity dd"
FIRE_RATE_SELECTOR = ".recoil-loadout-stat.is-fire-rate dd"
SLIDER_SELECTOR = ".weapon-recoil-lab-slider input[type='range']"

RECOIL_TEST_BTN_SELECTOR = "button.is-primary"

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "recoil_results")

# 第 2 轮每发之间分几步走（越大越平滑，越小越精确）
STEPS_PER_SHOT = 4

# 鼠标活动范围 = 整个 viewport（不是画布）
VIEWPORT_MARGIN = 5


# ============================================================
# 基础工具
# ============================================================

def profile_exists():
    if not os.path.isdir(USER_DATA_DIR):
        return False
    try:
        return len(os.listdir(USER_DATA_DIR)) > 0
    except Exception:
        return False


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
    return page.evaluate("""(args) => {
        const sliders = document.querySelectorAll(args.selector);
        const slider = sliders[args.index];
        if (!slider) return { ok: false, count: sliders.length };

        const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(slider, String(args.value));

        slider.dispatchEvent(new Event('input', { bubbles: true }));
        slider.dispatchEvent(new Event('change', { bubbles: true }));

        return { ok: true, value: slider.value };
    }""", {"selector": SLIDER_SELECTOR, "index": index, "value": value})


def set_distance(page, meters):
    set_slider(page, 0, meters)


def set_scope(page, magnification):
    set_slider(page, 1, magnification)


def read_shots(page):
    return page.evaluate("""() => {
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


def spread(shots):
    """弹着点离散度：所有弹着点到质心的平均距离（百分比坐标）"""
    if not shots:
        return 0.0
    cx = sum(s["x"] for s in shots) / len(shots)
    cy = sum(s["y"] for s in shots) / len(shots)
    total = 0.0
    for s in shots:
        dx = s["x"] - cx
        dy = s["y"] - cy
        total += (dx * dx + dy * dy) ** 0.5
    return total / len(shots)


def clamp_to_viewport(x, y):
    x = max(VIEWPORT_MARGIN, min(VIEWPORT_WIDTH - VIEWPORT_MARGIN, x))
    y = max(VIEWPORT_MARGIN, min(VIEWPORT_HEIGHT - VIEWPORT_MARGIN, y))
    return x, y


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
# 核心：第 1 轮裸弹道
# ============================================================

def run_bare(page, rounds, fire_rate):
    """
    鼠标停在画布中心不动，按住左键自动连发。
    返回 { shots, box, center_x, center_y, interval_ms }
    """
    set_blood(page, BLOOD_VALUE)
    page.locator(NEW_ROUND_SELECTOR).click()
    page.wait_for_timeout(200)

    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)
    box = canvas.bounding_box()

    center_x = box["x"] + box["width"] / 2
    center_y = box["y"] + box["height"] / 2

    interval_ms = 60000.0 / fire_rate if fire_rate > 0 else 100.0

    page.mouse.move(center_x, center_y)
    page.wait_for_timeout(100)
    page.mouse.down()

    page.wait_for_timeout(int(rounds * interval_ms) + 800)

    page.mouse.up()
    page.wait_for_timeout(300)

    shots = read_shots(page)

    return {
        "shots": shots,
        "box": box,
        "center_x": center_x,
        "center_y": center_y,
        "interval_ms": interval_ms,
    }


# ============================================================
# 核心：第 2 轮固定轨迹压枪
# ============================================================

def compute_mouse_targets(bare_shots, target_point, center_x, center_y,
                          px_per_pct_x, px_per_pct_y):
    """
    根据第 1 轮弹着点，算出第 2 轮每发开火时鼠标应该在哪。

    mouse_target[i] = 中心 + (目标点 - bare_shots[i]) * px_per_pct

    注意：这里不做钳制，钳制在 run_perfect 里做（用 viewport 边界）。
    """
    targets = []
    for s in bare_shots:
        dx = target_point["x"] - s["x"]
        dy = target_point["y"] - s["y"]
        targets.append((
            center_x + dx * px_per_pct_x,
            center_y + dy * px_per_pct_y,
        ))
    return targets


def run_perfect(page, rounds, fire_rate, mouse_targets):
    """
    固定轨迹压枪（绝对时间轴版）。
    """
    BUSY_WAIT_MS = 2.0

    set_blood(page, BLOOD_VALUE)
    page.locator(NEW_ROUND_SELECTOR).click()
    page.wait_for_timeout(200)

    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)

    interval_ms = 60000.0 / fire_rate if fire_rate > 0 else 100.0

    first_x, first_y = clamp_to_viewport(*mouse_targets[0])

    page.mouse.move(first_x, first_y)
    page.wait_for_timeout(50)

    t_start = time.perf_counter()
    page.mouse.down()

    cur_x, cur_y = first_x, first_y

    for i in range(1, rounds):
        if i < len(mouse_targets):
            tx, ty = mouse_targets[i]
        else:
            tx, ty = first_x, first_y

        tx, ty = clamp_to_viewport(tx, ty)

        t_shot = (i * interval_ms) / 1000.0

        step_start_x = cur_x
        step_start_y = cur_y

        for s in range(STEPS_PER_SHOT):
            frac = (s + 1) / STEPS_PER_SHOT

            sx = step_start_x + (tx - step_start_x) * frac
            sy = step_start_y + (ty - step_start_y) * frac

            t_step = t_shot - (interval_ms / 1000.0) * (1.0 - frac)

            page.mouse.move(sx, sy, steps=1)

            t_now = time.perf_counter() - t_start
            wait_s = t_step - t_now

            if wait_s > 0:
                if wait_s > BUSY_WAIT_MS / 1000.0:
                    page.wait_for_timeout(
                        int((wait_s - BUSY_WAIT_MS / 1000.0) * 1000)
                    )
                target_t = t_start + t_step
                while time.perf_counter() < target_t:
                    pass

        cur_x, cur_y = tx, ty

    elapsed_ms = (time.perf_counter() - t_start) * 1000.0
    remain_ms = rounds * interval_ms - elapsed_ms
    if remain_ms > 0:
        page.wait_for_timeout(int(remain_ms) + 300)
    else:
        page.wait_for_timeout(300)

    page.mouse.up()
    page.wait_for_timeout(300)

    return read_shots(page)


# ============================================================
# 单距离两轮定式
# ============================================================

def run_one_distance(page, distance, rounds, fire_rate, shared_bare=None):
    """
    跑一个距离的两轮定式。

    @param shared_bare - 如果非 None，直接复用这份基础弹道，跳过第 1 轮。
    """
    set_distance(page, distance)
    page.wait_for_timeout(AFTER_DISTANCE_CHANGE_WAIT)

    # ---------- 第 1 轮：裸弹道（或复用） ----------
    if shared_bare is None:
        print(f"     [{distance}m 1/2] 裸弹道 ...", end=" ", flush=True)
        bare = run_bare(page, rounds, fire_rate)
        bare_shots = bare["shots"]

        if not bare_shots:
            print("❌ 没抓到弹着点")
            return None

        bare_spread = spread(bare_shots)
        print(f"OK  ({len(bare_shots)} 发, 离散度 {bare_spread:.2f}%)")
        bare_source = "measured"
    else:
        print(f"     [{distance}m 1/2] 复用 30m 基础弹道")
        bare = shared_bare
        bare_shots = bare["shots"]
        bare_spread = spread(bare_shots)
        bare_source = "shared"

    box = bare["box"]
    center_x = bare["center_x"]
    center_y = bare["center_y"]
    px_per_pct_x = box["width"] / 100
    px_per_pct_y = box["height"] / 100

    # ---------- 目标点 = 第 1 发落点 ----------
    target_point = {
        "x": bare_shots[0]["x"],
        "y": bare_shots[0]["y"],
    }
    print(f"             目标点=({target_point['x']:.2f}, {target_point['y']:.2f})")

    # ---------- 算出第 2 轮鼠标轨迹 ----------
    mouse_targets = compute_mouse_targets(
        bare_shots, target_point,
        center_x, center_y,
        px_per_pct_x, px_per_pct_y,
    )

    ys = [y for _, y in mouse_targets]
    print(f"             鼠标y范围={min(ys):.0f}~{max(ys):.0f}")

    # ---------- 第 2 轮：固定轨迹压枪 ----------
    print(f"     [{distance}m 2/2] 固定轨迹压枪 ...", end=" ", flush=True)
    perfect_shots = run_perfect(
        page, rounds, fire_rate, mouse_targets,
    )
    perfect_spread = spread(perfect_shots)
    print(f"OK  ({len(perfect_shots)} 发, 离散度 {perfect_spread:.2f}%)")

    return {
        "distance": distance,
        "bare_source": bare_source,
        "target_point": {
            "x": round(target_point["x"], 3),
            "y": round(target_point["y"], 3),
        },
        "bare": {
            "shots": bare_shots,
            "spread": round(bare_spread, 3),
        },
        "mouse_targets": [(round(x, 1), round(y, 1)) for x, y in mouse_targets],
        "perfect": {
            "shots": perfect_shots,
            "spread": round(perfect_spread, 3),
        },
    }


# ============================================================
# 切枪 + 加载方案 + 页面跳转
# ============================================================

def switch_weapon(page, weapon_name):
    page.locator(SELECTORS["weapon_selector"]).click()
    page.locator(SELECTORS["search_input"]).wait_for(state="visible", timeout=3000)
    page.locator(SELECTORS["search_input"]).fill(weapon_name)

    try:
        page.wait_for_function(
            """(name) => {
                const items = document.querySelectorAll('.option-item');
                for (const item of items) {
                    const nameEl = item.querySelector('.option-name');
                    if (nameEl && nameEl.innerText.includes(name)) return true;
                }
                return false;
            }""",
            arg=weapon_name, timeout=3000, polling=50,
        )
    except PlaywrightTimeout:
        print(f"    ⚠️ 搜索 '{weapon_name}' 超时")

    option = page.locator(SELECTORS["option_item"]).filter(
        has=page.locator(SELECTORS["option_name"], has_text=weapon_name)
    ).first
    option.click()

    try:
        page.locator(SELECTORS["search_input"]).wait_for(state="hidden", timeout=3000)
    except PlaywrightTimeout:
        print(f"    ⚠️ 武器切换 '{weapon_name}' 超时")


def open_library(page):
    drawer = page.locator(SELECTORS["drawer"])
    if drawer.count() > 0 and drawer.is_visible():
        return
    page.locator(SELECTORS["library_btn"]).click()
    try:
        drawer.wait_for(state="visible", timeout=3000)
        page.wait_for_function(
            """() => {
                const drawer = document.querySelector('.weapon-loadout-drawer');
                if (!drawer) return false;
                const hasCard = drawer.querySelector('.weapon-loadout-card');
                const hasEmpty = drawer.innerText.includes('还没有保存方案');
                return hasCard || hasEmpty;
            }""",
            timeout=2000, polling=50,
        )
    except PlaywrightTimeout:
        print(f"    ⚠️ 打开方案库超时")


def close_library(page):
    drawer = page.locator(SELECTORS["drawer"])
    if drawer.count() == 0 or not drawer.is_visible():
        return
    page.keyboard.press("Escape")
    try:
        drawer.wait_for(state="hidden", timeout=1000)
    except PlaywrightTimeout:
        close_btn = page.locator(SELECTORS["drawer_close_btn"]).first
        if close_btn.count() > 0:
            close_btn.click(force=True)
            try:
                drawer.wait_for(state="hidden", timeout=1000)
            except PlaywrightTimeout:
                pass


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
        card.wait_for(state="attached", timeout=3000)
    except PlaywrightTimeout:
        return False

    card.locator(SELECTORS["load_btn"]).click()

    dialog_btn = page.locator(SELECTORS["dialog_confirm_btn"])
    try:
        dialog_btn.wait_for(state="visible", timeout=2000)
        dialog_btn.click()
    except PlaywrightTimeout:
        pass

    page.wait_for_timeout(AFTER_LOAD_SCHEME_WAIT)
    return True


def click_recoil_test(page):
    btn = page.locator(RECOIL_TEST_BTN_SELECTOR).filter(has_text="压枪测试").first
    if btn.count() == 0:
        print(f"    ❌ 找不到'压枪测试'按钮")
        return False
    btn.click()
    try:
        page.wait_for_url("**/recoil", timeout=5000)
        page.wait_for_timeout(AFTER_PAGE_SWITCH_WAIT)
        return True
    except PlaywrightTimeout:
        print(f"    ⚠️ 未跳转到 recoil 页，当前 URL: {page.url}")
        return False


def click_back_to_builder(page):
    btn = page.locator(BACK_SELECTOR).first
    if btn.count() == 0:
        print(f"    ❌ 找不到'反回改枪'按钮")
        return False
    btn.click()
    try:
        page.wait_for_url(lambda url: "/recoil" not in url, timeout=5000)
        page.wait_for_timeout(AFTER_PAGE_SWITCH_WAIT)
        return True
    except PlaywrightTimeout:
        print(f"    ⚠️ 未跳回价格页，当前 URL: {page.url}")
        return False


# ============================================================
# 单把枪流程
# ============================================================

def run_one_weapon(page, task):
    weapon_id = task["weaponId"]
    weapon_name = task["weaponName"]
    config_id = task["configId"]

    print()
    print("=" * 70)
    print(f"🔫 {weapon_name} {config_id} (weaponId={weapon_id})")
    print("=" * 70)

    try:
        switch_weapon(page, weapon_name)
    except Exception as e:
        print(f"  ❌ 切武器失败: {e}")
        return None, "failed"

    try:
        open_library(page)
    except Exception as e:
        print(f"  ❌ 打开方案库失败: {e}")
        return None, "failed"

    try:
        ok = load_scheme(page, task)
        if not ok:
            close_library(page)
            print(f"  ⏭️ 跳过：方案库里没有 '{weapon_name} 方案 {task.get('schemeIndex')}'")
            return None, "skipped_no_scheme"
    except Exception as e:
        print(f"  ❌ 载入方案失败: {e}")
        close_library(page)
        return None, "failed"

    close_library(page)

    ok = click_recoil_test(page)
    if not ok:
        return None, "failed"

    t_start = time.time()
    capacity = read_capacity(page)
    fire_rate = read_fire_rate(page)
    if capacity <= 0:
        capacity = DEFAULT_CAPACITY
    if fire_rate <= 0:
        fire_rate = FIRE_RATE_DEFAULT

    rounds = min(ROUNDS_TO_FIRE, capacity)

    print(f"  弹容: {capacity}, 射速: {fire_rate} RPM")

    set_scope(page, SCOPE)
    page.wait_for_timeout(AFTER_SCOPE_CHANGE_WAIT)

    all_distances = []
    shared_bare = None

    for idx, dist in enumerate(DISTANCES):
        print()
        print(f"📍 {dist}m")
        print(f"  {'-'*60}")

        result = run_one_distance(
            page, dist, rounds, fire_rate,
            shared_bare=shared_bare if idx > 0 else None,
        )
        if result:
            all_distances.append(result)
            if idx == 0:
                # 缓存 30m 的 bare，给 50/100m 复用
                try:
                    canvas = page.locator(CANVAS_SELECTOR).first
                    canvas.wait_for(state="visible", timeout=5000)
                    box = canvas.bounding_box()
                    shared_bare = {
                        "shots": result["bare"]["shots"],
                        "box": box,
                        "center_x": box["x"] + box["width"] / 2,
                        "center_y": box["y"] + box["height"] / 2,
                    }
                except Exception:
                    shared_bare = None

    t_elapsed = time.time() - t_start

    click_back_to_builder(page)

    data = {
        "url": RECOIL_URL,
        "weapon_id": weapon_id,
        "weapon_name": weapon_name,
        "config_id": config_id,
        "scheme_index": task.get("schemeIndex"),
        "capacity": capacity,
        "fire_rate": fire_rate,
        "rounds_fired": rounds,
        "scope": SCOPE,
        "distances": DISTANCES,
        "design": "固定轨迹压枪（绝对时间轴 + viewport 边界）",
        "total_elapsed_s": round(t_elapsed, 2),
        "results": all_distances,
    }

    config_key = config_id.replace("#", "")
    out_path = os.path.join(OUTPUT_DIR, f"recoil_{weapon_id}_{config_key}.json")
    safe_json_save(out_path, data)
    print()
    print(f"  💾 已保存: {out_path}")
    print(f"  ⏱️ 本枪耗时: {t_elapsed:.1f}s")

    dist_stats = {}
    for r in all_distances:
        dist_stats[r["distance"]] = {
            "bare": r["bare"]["spread"],
            "perfect": r["perfect"]["spread"],
        }

    summary = {
        "weapon_id": weapon_id,
        "weapon_name": weapon_name,
        "config_id": config_id,
        "distances": dist_stats,
        "elapsed": t_elapsed,
    }
    return summary, "ok"


# ============================================================
# 参数解析
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="固定轨迹压枪（多距离，支持多把枪）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python scrape_recoil.py              跑全部枪，每把 30/50/100m\n"
            "  python scrape_recoil.py --limit 3    只跑前 3 把\n"
            "  python scrape_recoil.py --weapon 41  只跑 weaponId=41\n"
        ),
    )
    parser.add_argument("--limit", type=int, default=0,
                        help="只跑前 N 把（默认 0 = 全部）")
    parser.add_argument("--weapon", type=int, default=None, help="只跑指定 weaponId")
    parser.add_argument(
        "--always-pause", action="store_true",
        help="即使 profile 已存在，也暂停等回车（默认：已存在则自动跳过）",
    )
    return parser.parse_args()


# ============================================================
# 主流程
# ============================================================

def main():
    args = parse_args()

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    tasks = safe_json_load(TASKS_JSON)
    if not tasks:
        print(f"❌ 读不到 tasks.json: {TASKS_JSON}")
        return

    print(f"📋 共 {len(tasks)} 把枪")

    if args.weapon is not None:
        tasks = [t for t in tasks if t["weaponId"] == args.weapon]
        print(f"   过滤 weaponId={args.weapon}: {len(tasks)} 把")
    elif args.limit and args.limit > 0:
        tasks = tasks[:args.limit]
        print(f"   只跑前 {args.limit} 把（默认跑全部）")
    else:
        print(f"   跑全部 {len(tasks)} 把")

    if not tasks:
        print("❌ 没有要跑的枪")
        return

    print()
    print("📋 待跑清单:")
    for i, t in enumerate(tasks):
        print(f"  [{i+1}] {t['weaponName']} {t['configId']} "
              f"(weaponId={t['weaponId']}, 方案 {t['schemeIndex']})")
    print(f"  📍 距离: {DISTANCES}（基础弹道只在 30m 获取，50/100m 复用）")

    is_first_run = not profile_exists()
    need_pause = is_first_run or args.always_pause

    if is_first_run:
        print()
        print("🆕 首次运行（_browser_profile 为空），需要手动确认")
    else:
        print()
        print("✅ 检测到已有 profile，自动跳过回车确认")
        if args.always_pause:
            print("   （--always-pause 已开启，仍会暂停）")

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=HEADLESS,
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            args=["--disable-blink-features=AutomationControlled"],
        )
        page = context.pages[0] if context.pages else context.new_page()

        t_total_start = time.time()
        results_summary = []
        success = 0
        skipped = 0
        failed = 0

        try:
            page.goto(DFTTK_URL, wait_until="commit")

            try:
                page.locator(SELECTORS["weapon_selector"]).wait_for(
                    state="visible", timeout=30000
                )
            except PlaywrightTimeout:
                print("  ⚠️ 武器选择器未出现，继续（请确认页面已加载）")

            if need_pause:
                print()
                print("=" * 70)
                print("  请确认：")
                print("  1. 页面已完全加载")
                print("  2. 已登录（如果需要）")
                print("  3. 已切换到「烽火地带」模式")
                print("=" * 70)
                try:
                    input("\n准备好后按回车开始（或直接关闭窗口退出）...\n")
                except (KeyboardInterrupt, EOFError):
                    print("\n⚠️ 用户取消")
                    context.close()
                    return

            for i, task in enumerate(tasks):
                print()
                print(f"━━━ [{i+1}/{len(tasks)}] ━━━")
                try:
                    summary, status = run_one_weapon(page, task)
                    if status == "ok" and summary:
                        success += 1
                        results_summary.append(summary)
                    elif status == "skipped_no_scheme":
                        skipped += 1
                    else:
                        failed += 1
                except Exception as e:
                    import traceback
                    print(f"  ❌ 异常: {e}")
                    traceback.print_exc()
                    failed += 1
                    try:
                        if "/recoil" in page.url:
                            click_back_to_builder(page)
                    except Exception:
                        pass

        finally:
            t_total_elapsed = time.time() - t_total_start

            print()
            print("=" * 70)
            print("📊 总汇总")
            print("=" * 70)
            print(f"  成功: {success}")
            print(f"  跳过（无方案）: {skipped}")
            print(f"  失败: {failed}")
            print(f"  总耗时: {t_total_elapsed:.1f}s")

            if results_summary:
                print()
                print("  离散度对比（裸弹道 / 压枪，越小越集中）：")
                header = f"  {'武器':<12}{'配置':<7}"
                for d in DISTANCES:
                    header += f"{str(d)+'m':<14}"
                header += "耗时"
                print("  " + "─" * (len(header) - 2))
                print(header)
                print("  " + "─" * (len(header) - 2))

                for s in results_summary:
                    name = s["weapon_name"][:10].ljust(10)
                    cfg = s["config_id"].ljust(6)
                    row = f"  {name} {cfg} "
                    for d in DISTANCES:
                        st = s["distances"].get(d, {})
                        bs = st.get("bare", 0)
                        ps = st.get("perfect", 0)
                        cell = f"{bs:>5.1f}/{ps:<5.1f}"
                        row += f"{cell:<14}"
                    row += f"{s['elapsed']:.1f}s"
                    print(row)
                print("  " + "─" * (len(header) - 2))

            if results_summary:
                summary_path = os.path.join(OUTPUT_DIR, "_summary.txt")
                with open(summary_path, "w", encoding="utf-8") as f:
                    f.write(f"总耗时: {t_total_elapsed:.1f}s\n")
                    f.write(f"成功: {success}, 跳过: {skipped}, 失败: {failed}\n\n")
                    header = f"{'武器':<14}{'配置':<8}"
                    for d in DISTANCES:
                        header += f"{str(d)+'m裸/压':<14}"
                    header += "耗时\n"
                    f.write(header)
                    for s in results_summary:
                        row = f"{s['weapon_name']:<14}{s['config_id']:<8}"
                        for d in DISTANCES:
                            st = s["distances"].get(d, {})
                            bs = st.get("bare", 0)
                            ps = st.get("perfect", 0)
                            row += f"{bs:.1f}/{ps:.1f}{'':<7}"
                        row += f"{s['elapsed']:.1f}s\n"
                        f.write(row)
                print()
                print(f"  汇总文件: {summary_path}")

            print(f"  输出目录: {OUTPUT_DIR}")

            try:
                page.wait_for_timeout(3000)
            except Exception:
                pass
            try:
                context.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()