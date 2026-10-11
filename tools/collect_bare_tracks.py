# tools/collect_bare_tracks.py
#
# 采集所有武器「配置 #1」的裸弹道（默认参数，30 发）
#
# 每把枪：
#   切枪 → 载方案(#1) → 进 recoil 页 → 不调任何参数 → 打 30 发 → 读落点
#
# 输出：
#   assets/_bare_tracks/{武器名}_1.json
#     每个文件：
#     {
#       "weaponId": 41,
#       "weaponName": "腾龙",
#       "configId": "#1",
#       "schemeIndex": 1,
#       "rounds": 30,
#       "shots": [{"x": 50.0, "y": 45.0, "hit": true}, ...],
#       "canvasBox": {...},
#       "capturedAt": "..."
#     }
#
# 用法：
#   python collect_bare_tracks.py
#   python collect_bare_tracks.py --weapon 41
#   python collect_bare_tracks.py --limit 3
#   python collect_bare_tracks.py --rounds 30
#   python collect_bare_tracks.py --clean      # 采集前清空输出目录

import argparse
import json
import os
import re
import shutil
import sys
import time
from datetime import datetime

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from config import (
    DFTTK_URL,
    SELECTORS,
    DATA_JSON,
)
from _common import (
    install_signal_handler,
    launch_browser, close_browser, profile_exists,
    switch_weapon, open_library, close_library, load_scheme,
    load_json, safe_str,
)


# ============================================================
# 输出目录（放 assets/，稳定数据，不被脚本清空）
# ============================================================

try:
    from config import BARE_TRACKS_DIR
except ImportError:
    from config import PROJECT_ROOT
    BARE_TRACKS_DIR = os.path.join(PROJECT_ROOT, "assets", "_bare_tracks")


# ============================================================
# 参数
# ============================================================

DEFAULT_ROUNDS = 30

AFTER_NEW_ROUND_WAIT = 500
AFTER_NEW_ROUND_CHECK = 50

CANVAS_SELECTOR = ".recoil-range-stage"
NEW_ROUND_SELECTOR = "button.recoil-range-new-round"
RECOIL_TEST_BTN_SELECTOR = "button.is-primary"

T_RECOIL_CANVAS = 3000

# 开火前，鼠标 move 到中心后的稳定等待
BEFORE_MOUSE_DOWN_WAIT = 400

# ⭐ 只采集配置 #1
TARGET_CONFIG_ID = "#1"
TARGET_SCHEME_INDEX = 1


# ============================================================
# 读落点
# ============================================================

def _read_shots(page):
    return page.evaluate("""() => {
        const markers = document.querySelectorAll('.recoil-shot-marker');
        const result = [];
        for (const m of markers) {
            const left = parseFloat(m.style.left);
            const top = parseFloat(m.style.top);
            if (isNaN(left) || isNaN(top)) continue;
            const miss = m.classList.contains('recoil-shot-miss');
            result.push({ x: left, y: top, miss: miss });
        }
        return result;
    }""")


def _clear_shots(page):
    """
    清空画布上的落点。
    用 JS 点「新开一轮」按钮（不移动鼠标，避免准星被带偏）。
    """
    try:
        page.evaluate("""(sel) => {
            const btn = document.querySelector(sel);
            if (btn) btn.click();
        }""", NEW_ROUND_SELECTOR)
        return True
    except Exception:
        return False


def _wait_round_reset(page, timeout_ms=AFTER_NEW_ROUND_WAIT):
    """等落点清零"""
    try:
        page.wait_for_function("""() => {
            const markers = document.querySelectorAll(
                '.recoil-shot-marker');
            return markers.length === 0;
        }""", timeout=timeout_ms, polling=AFTER_NEW_ROUND_CHECK)
        return True
    except PlaywrightTimeout:
        return False


def _wait_shots_count(page, count, timeout_ms=10000):
    """等页面出现至少 count 个落点"""
    try:
        page.wait_for_function(
            "(n) => document.querySelectorAll('.recoil-shot-marker').length >= n",
            arg=count,
            timeout=timeout_ms,
            polling=10,
        )
        return True
    except PlaywrightTimeout:
        return False


def _get_canvas_box(page):
    canvas = page.locator(CANVAS_SELECTOR).first
    canvas.wait_for(state="visible", timeout=5000)
    return canvas.bounding_box()


# ============================================================
# 打一发裸弹道
# ============================================================

def _run_bare(page, canvas_box, rounds):
    """
    鼠标固定在画布中心，打 rounds 发。
    返回 shots 列表。

    关键：
      - 不点「新开一轮」按钮（鼠标会跑过去）
      - 用 JS 清空落点（鼠标不动）
      - down 前确保鼠标在画布中心（准星 = 鼠标位置）
    """
    # ⭐ 重新拿 canvas_box，防止布局变化
    canvas_box = _get_canvas_box(page)
    center_x = canvas_box["x"] + canvas_box["width"] / 2
    center_y = canvas_box["y"] + canvas_box["height"] / 2
    print(f"    [debug] canvas=({canvas_box['x']:.1f},"
          f"{canvas_box['y']:.1f},"
          f"{canvas_box['width']:.1f}x{canvas_box['height']:.1f}) "
          f"center=({center_x:.1f},{center_y:.1f})")

    # ⭐ 1) 先把鼠标移到中心
    page.mouse.move(center_x, center_y)
    page.wait_for_timeout(BEFORE_MOUSE_DOWN_WAIT)

    # ⭐ 2) 用 JS 清空落点（鼠标不动）
    _clear_shots(page)
    page.wait_for_timeout(AFTER_NEW_ROUND_WAIT)
    _wait_round_reset(page)
    page.wait_for_timeout(300)   # 额外稳定

    # ⭐ 3) 再 move 一次到中心，确保准星在中心
    page.mouse.move(center_x, center_y)
    page.wait_for_timeout(150)

    # 按下
    page.mouse.down()
    page.wait_for_timeout(80)

    # 等 rounds 发打完
    _wait_shots_count(page, rounds, timeout_ms=30000)
    page.wait_for_timeout(500)

    # 松开
    page.mouse.up()
    page.wait_for_timeout(300)

    # 读落点
    shots = _read_shots(page)
    return shots


# ============================================================
# 从 data.json 提取任务（只取配置 #1）
# ============================================================

def _extract_tasks(data):
    prices = data.get("prices", [])
    if not prices:
        return [], {}

    tasks = []
    skipped = {"no_id": 0, "no_config1": 0, "disabled": 0}

    for entry in prices:
        weapon_id = entry.get("weaponId")
        weapon_name = safe_str(entry.get("weaponName"), default="未知武器")

        if weapon_id is None:
            skipped["no_id"] += 1
            continue

        configs = entry.get("configs", [])
        if not configs:
            continue

        # ⭐ 只找 configId == "#1" 的配置
        target = None
        for config in configs:
            if config.get("id") == TARGET_CONFIG_ID:
                target = config
                break

        if target is None:
            skipped["no_config1"] += 1
            continue

        if target.get("enabled") is False:
            skipped["disabled"] += 1
            continue

        tasks.append({
            "weaponId": weapon_id,
            "weaponName": weapon_name,
            "configId": TARGET_CONFIG_ID,
            "schemeIndex": TARGET_SCHEME_INDEX,
        })

    return tasks, skipped


# ============================================================
# 单把枪
# ============================================================

def _safe_filename(name):
    if not name:
        return "unknown"
    bad = '<>:"/\\|?*'
    result = "".join(c for c in name if c not in bad).strip()
    return result if result else "unknown"


def _run_one(page, task, rounds):
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]
    config_id = task["configId"]
    weapon_id = task["weaponId"]

    print()
    print("=" * 70)
    print(f"🔫 {weapon_name} {config_id}")
    print("=" * 70)

    # 返回 builder
    if "/recoil" in page.url:
        try:
            btn = page.locator("button.weapon-recoil-lab-back").first
            if btn.count() > 0:
                btn.click(timeout=5000)
                page.wait_for_url(
                    lambda url: "/recoil" not in url, timeout=8000)
        except Exception:
            pass

    # 切枪
    print(f"  · 切枪 → {weapon_name} ...", end=" ", flush=True)
    try:
        switch_weapon(page, weapon_name)
        print("OK")
    except Exception as e:
        print(f"❌ {e}")
        return None

    # 方案库
    print(f"  · 打开方案库 ...", end=" ", flush=True)
    try:
        open_library(page)
        print("OK")
    except Exception as e:
        print(f"❌ {e}")
        return None

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
        return None

    if not ok:
        print("❌ 方案库里没有")
        try:
            close_library(page)
        except Exception:
            pass
        return None
    print("OK")

    print(f"  · 关闭方案库 ...", end=" ", flush=True)
    try:
        close_library(page)
        print("OK")
    except Exception as e:
        print(f"⚠️ {e}")

    # 进 recoil 页
    print(f"  · 进入压枪测试页 ...", end=" ", flush=True)
    try:
        btn = page.locator(RECOIL_TEST_BTN_SELECTOR).filter(
            has_text="压枪测试"
        ).first
        if btn.count() == 0:
            print(f"❌ 找不到'压枪测试'按钮")
            return None
        btn.click(timeout=5000)
        page.wait_for_url(lambda url: "/recoil" in url, timeout=8000)
        page.locator(CANVAS_SELECTOR).first.wait_for(
            state="visible", timeout=T_RECOIL_CANVAS)
    except Exception as e:
        print(f"❌ {e}")
        return None
    print("OK")

    # 拿画布
    canvas_box = _get_canvas_box(page)
    print(f"  画布: x={canvas_box['x']:.2f}, y={canvas_box['y']:.2f}, "
          f"w={canvas_box['width']:.2f}, h={canvas_box['height']:.2f}")

    # 打裸弹道
    print(f"  · 打 {rounds} 发裸弹道 ...", end=" ", flush=True)
    try:
        shots = _run_bare(page, canvas_box, rounds)
    except Exception as e:
        print(f"❌ {e}")
        import traceback
        traceback.print_exc()
        return None

    if not shots:
        print("❌ 没抓到落点")
        return None

    print(f"OK ({len(shots)} 发)")

    # 返回 builder，为下一把枪准备
    try:
        btn = page.locator("button.weapon-recoil-lab-back").first
        if btn.count() > 0:
            btn.click(timeout=5000)
            page.wait_for_url(
                lambda url: "/recoil" not in url, timeout=8000)
    except Exception:
        pass

    return {
        "weaponId": weapon_id,
        "weaponName": weapon_name,
        "configId": config_id,
        "schemeIndex": scheme_index,
        "rounds": len(shots),
        "shots": [
            {
                "x": round(s["x"], 4),
                "y": round(s["y"], 4),
                "hit": not s.get("miss", False),
            }
            for s in shots
        ],
        "canvasBox": {
            "x": round(canvas_box["x"], 2),
            "y": round(canvas_box["y"], 2),
            "width": round(canvas_box["width"], 2),
            "height": round(canvas_box["height"], 2),
        },
        "capturedAt": datetime.now().isoformat(),
    }


def _save_one(result):
    os.makedirs(BARE_TRACKS_DIR, exist_ok=True)
    name = _safe_filename(result["weaponName"])
    cfg = result["configId"].replace("#", "")
    path = os.path.join(BARE_TRACKS_DIR, f"{name}_{cfg}.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    return path


# ============================================================
# 主流程
# ============================================================

def run(tasks, rounds, clean=False):
    if not tasks:
        print("❌ 没有要跑的任务")
        return

    if clean:
        if os.path.isdir(BARE_TRACKS_DIR):
            shutil.rmtree(BARE_TRACKS_DIR)
            print(f"🧹 已清空: {BARE_TRACKS_DIR}")

    os.makedirs(BARE_TRACKS_DIR, exist_ok=True)

    print("=" * 70)
    print(f"🎯 裸弹道采集 · 仅配置 #1 · {len(tasks)} 把武器 · 每把 {rounds} 发")
    print("=" * 70)
    for i, t in enumerate(tasks):
        print(f"  [{i+1:>3}] {t['weaponName']} {t['configId']}")
    print()

    install_signal_handler()
    need_pause = not profile_exists()

    pw, context, page = launch_browser(fullscreen=True)
    t_start = time.time()

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
                result = _run_one(page, task, rounds)
                if result:
                    path = _save_one(result)
                    print(f"  💾 {path}")
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

    finally:
        t_total = time.time() - t_start

        print()
        print("=" * 70)
        print("📊 全部完成")
        print("=" * 70)
        print(f"  成功: {len(results)}/{len(tasks)}")
        if failed:
            print(f"  失败 {len(failed)} 个：")
            for name in failed:
                print(f"    - {name}")
        print(f"  总耗时: {t_total:.1f}s ({t_total/60:.1f} 分钟)")
        print(f"  输出目录: {BARE_TRACKS_DIR}")

        close_browser(pw, context)


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="采集所有武器「配置 #1」的裸弹道",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python collect_bare_tracks.py\n"
            "  python collect_bare_tracks.py --weapon 41\n"
            "  python collect_bare_tracks.py --limit 3\n"
            "  python collect_bare_tracks.py --rounds 30\n"
            "  python collect_bare_tracks.py --clean\n"
        ),
    )
    p.add_argument("--weapon", type=int, default=None,
                   help="只跑指定 weaponId")
    p.add_argument("--limit", type=int, default=0,
                   help="只跑前 N 个任务（0 = 全部）")
    p.add_argument("--rounds", type=int, default=DEFAULT_ROUNDS,
                   help=f"每把枪打几发（默认 {DEFAULT_ROUNDS}）")
    p.add_argument("--clean", action="store_true",
                   help="采集前清空输出目录（默认不清空，只覆盖同名文件）")
    return p.parse_args()


def main():
    args = parse_args()

    data = load_json(DATA_JSON)
    if not data:
        print(f"❌ 读不到 {DATA_JSON}")
        return

    tasks, skipped = _extract_tasks(data)
    print(f"从 data.json 提取 {len(tasks)} 把武器（仅配置 #1）")
    if skipped:
        detail = [f"{k}={v}" for k, v in skipped.items() if v]
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("❌ 没有任务")
        return

    # 过滤
    if args.weapon is not None:
        tasks = [t for t in tasks if t["weaponId"] == args.weapon]
        if not tasks:
            print(f"❌ --weapon {args.weapon} 没匹配到任务")
            return

    if args.limit and args.limit > 0:
        tasks = tasks[:args.limit]

    run(tasks, args.rounds, clean=args.clean)


if __name__ == "__main__":
    main()