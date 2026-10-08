# tools/update_weapon_prices.py
#
# 需求2：更新枪械配置价格（一步到位）
#
# 流程：
#   1. 读 data.json，提取所有 enabled 的配置（可按 --config 过滤）
#   2. 启动浏览器（默认全屏）
#   3. 逐条抓价格（进度条刷新，同武器不重复切枪/关库）
#   4. 备份 data.json
#   5. 写回 data.json（只写成功的）
#   6. 打印"价格更新明细"（成功 ✅ / 未找到 ⏭️ / 失败 ❌）
#
# 用法：
#   python update_weapon_prices.py
#   python update_weapon_prices.py --config 20#1
#   python update_weapon_prices.py --config 20#1,41#1,15#1
#   python update_weapon_prices.py --dry-run
#   python update_weapon_prices.py --debug

import argparse
import json
import os
import re
import sys
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from config import (
    DATA_JSON,
    DFTTK_URL,
    SELECTORS,
    STATUS_OK,
    STATUS_NOT_FOUND,
    STATUS_ERROR,
    WAIT_AFTER_LOAD,
    WAIT_AFTER_SEARCH,
    WAIT_POLL_INTERVAL,
)
from _common import (
    load_json, save_json, safe_int, safe_str, backup_data_json,
    set_debug, dlog, install_signal_handler, is_interrupted,
    launch_browser, close_browser, profile_exists,
    switch_weapon, open_library, close_library,
)


# ============================================================
# 抓取参数（速度相关，独立于 config.py）
# ============================================================

# 点"载入"后，等价格更新的固定时间
AFTER_LOAD_SCHEME_WAIT = 800

# 切换武器后，额外等页面稳定
AFTER_SWITCH_WEAPON_WAIT = 300


# ============================================================
# 提取任务
# ============================================================

def _extract_scheme_index(config_id):
    """从 configId 提取方案编号。"#1" -> 1"""
    if not config_id:
        return None
    match = re.search(r"#(\d+)", str(config_id))
    if not match:
        return None
    return int(match.group(1))


def extract_tasks(data):
    """从 data.json 的 prices 里提取任务"""
    prices = data.get("prices", [])
    if not prices:
        return [], {}

    tasks = []
    skipped = {"no_id": 0, "no_config": 0, "no_scheme": 0, "disabled": 0}

    for entry in prices:
        weapon_id = entry.get("weaponId")
        weapon_name = safe_str(entry.get("weaponName"), default="未知武器")

        if weapon_id is None:
            skipped["no_id"] += 1
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
                "oldPrice": safe_int(config.get("price"), default=0),
            })

    return tasks, skipped


def _parse_config_filter(config_str):
    """
    "41#1,42#1" → {(41, "#1"), (42, "#1")}
    """
    if not config_str:
        return None
    result = set()
    for part in config_str.split(","):
        part = part.strip()
        if not part:
            continue
        if "#" not in part:
            raise ValueError(
                f"--config 格式错误: {part}（应为 weaponId#configId）"
            )
        w_str, c_str = part.split("#", 1)
        w = int(w_str.strip())
        c = "#" + c_str.strip().lstrip("#")
        result.add((w, c))
    return result


# ============================================================
# 抓单个任务
# ============================================================

def _parse_price(text):
    if not text:
        return None
    cleaned = text.replace(",", "").replace("，", "").strip()
    try:
        return int(cleaned)
    except ValueError:
        return None


def _scrape_one(page, task):
    """
    抓单个任务。
    ⭐ 优化：点"载入"后不等价格变化，直接等固定时间读。
    @returns dict {weaponId, weaponName, configId, newPrice, status, error}
    """
    weapon_name = task["weaponName"]
    scheme_index = task["schemeIndex"]

    result = {
        "weaponId": task["weaponId"],
        "weaponName": weapon_name,
        "configId": task["configId"],
        "newPrice": None,
        "status": STATUS_ERROR,
        "error": None,
    }

    try:
        scheme_text = f"{weapon_name} 方案 {scheme_index}"
        escaped = json.dumps(scheme_text, ensure_ascii=False)
        scheme_name_selector = f'{SELECTORS["scheme_name"]}:text-is({escaped})'

        card = page.locator(SELECTORS["scheme_card"]).filter(
            has=page.locator(scheme_name_selector)
        ).first

        try:
            card.wait_for(state="attached", timeout=WAIT_AFTER_SEARCH)
        except PlaywrightTimeout:
            result["status"] = STATUS_NOT_FOUND
            return result

        # 点"载入"
        card.locator(SELECTORS["load_btn"]).click()

        # 二次确认弹窗
        dialog_btn = page.locator(SELECTORS["dialog_confirm_btn"])
        try:
            dialog_btn.wait_for(state="visible", timeout=1500)
            dialog_btn.click()
        except PlaywrightTimeout:
            pass

        # ⭐ 直接等固定时间（不再读旧价/等价格变化）
        page.wait_for_timeout(AFTER_LOAD_SCHEME_WAIT)

        price_text = page.locator(SELECTORS["price"]).inner_text()
        new_price = _parse_price(price_text)

        if new_price is None:
            result["status"] = STATUS_ERROR
            result["error"] = f"价格解析失败: {price_text!r}"
        else:
            result["newPrice"] = new_price
            result["status"] = STATUS_OK

    except PlaywrightTimeout as e:
        result["status"] = STATUS_ERROR
        result["error"] = f"超时: {e}"
    except Exception as e:
        result["status"] = STATUS_ERROR
        result["error"] = str(e)

    return result


# ============================================================
# 进度条
# ============================================================

def _print_progress(current, total, prefix="抓取中"):
    if total <= 0:
        return
    pct = current / total * 100
    bar = f"{prefix}... {current}/{total} ({pct:.0f}%)"
    sys.stdout.write(f"\r{bar:<60}")
    sys.stdout.flush()


def _clear_progress():
    sys.stdout.write("\r" + " " * 60 + "\r")
    sys.stdout.flush()


# ============================================================
# 主流程
# ============================================================

def run(dry_run=False, config_filter=None):
    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)
    if not data:
        raise ValueError("data.json 为空或不存在")

    tasks, skipped = extract_tasks(data)
    print(f"共提取 {len(tasks)} 个任务")

    # 按 --config 过滤
    if config_filter is not None:
        before = len(tasks)
        tasks = [t for t in tasks
                 if (t["weaponId"], t["configId"]) in config_filter]
        print(f"  --config 过滤: {before} → {len(tasks)} 个任务")
        if not tasks:
            print(f"❌ --config 没匹配到任何任务")
            return

    detail = []
    if skipped:
        for k, v in skipped.items():
            if v:
                detail.append(f"{k}={v}")
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("⚠️ 没有要抓的任务")
        return

    # ---------- 启动浏览器 ----------
    install_signal_handler()
    need_pause = not profile_exists()

    pw, context, page = launch_browser(fullscreen=True)

    results = []
    try:
        page.goto(DFTTK_URL, wait_until="commit")
        try:
            page.locator(SELECTORS["weapon_selector"]).wait_for(
                state="visible", timeout=30000
            )
        except PlaywrightTimeout:
            print("  ⚠️ 武器选择器未出现，继续")

        if need_pause:
            print()
            print("=" * 60)
            print("  首次运行，请确认：")
            print("  1. 页面已完全加载")
            print("  2. 已登录（如果需要）")
            print("  3. 已切换到「烽火地带」模式")
            print("  4. 方案库里能看到你的方案")
            print("=" * 60)
            try:
                input("\n完成后按回车开始抓取...\n")
            except (KeyboardInterrupt, EOFError):
                print("\n⚠️ 用户取消")
                return

        print()
        total = len(tasks)
        current_weapon = None
        library_open = False

        for idx, task in enumerate(tasks):
            if is_interrupted():
                break

            weapon_name = task["weaponName"]

            # ⭐ 切枪（仅当武器变了）
            if weapon_name != current_weapon:
                # 关掉上一个武器的方案库
                if library_open:
                    try:
                        close_library(page)
                    except Exception:
                        pass
                    library_open = False

                # 切枪
                try:
                    switch_weapon(page, weapon_name)
                    page.wait_for_timeout(AFTER_SWITCH_WEAPON_WAIT)
                    current_weapon = weapon_name
                except Exception as e:
                    dlog(f"切换武器失败: {e}")

            # ⭐ 打开方案库（只在没开时）
            if not library_open:
                try:
                    open_library(page)
                    library_open = True
                except Exception as e:
                    dlog(f"打开方案库失败: {e}")

            # 抓
            result = _scrape_one(page, task)
            results.append(result)

            # 进度条
            _print_progress(idx + 1, total)

        _clear_progress()

        # 循环结束，关掉方案库
        if library_open:
            try:
                close_library(page)
            except Exception:
                pass

    finally:
        close_browser(pw, context)

    # ---------- 更新 data.json ----------
    print()
    print("=" * 70)
    print("价格更新明细")
    print("=" * 70)

    price_map = {}
    for entry in data.get("prices", []):
        wid = entry.get("weaponId")
        if wid is not None:
            price_map[wid] = entry

    updated = 0
    not_found = 0
    error = 0

    for item in results:
        weapon_id = item.get("weaponId")
        config_id = item.get("configId")
        weapon_name = item.get("weaponName", "未知")
        status = item.get("status")
        new_price = item.get("newPrice")

        if status == STATUS_NOT_FOUND:
            print(f"  ⏭️ {weapon_name} {config_id}: 方案库里没有")
            not_found += 1
            continue

        if status == STATUS_ERROR or new_price is None:
            err = item.get("error", "")
            print(f"  ❌ {weapon_name} {config_id}: {err}")
            error += 1
            continue

        entry = price_map.get(weapon_id)
        if not entry:
            print(f"  ❌ {weapon_name} {config_id}: data.json 里找不到武器")
            error += 1
            continue

        target = None
        for cfg in entry.get("configs", []):
            if cfg.get("id") == config_id:
                target = cfg
                break

        if not target:
            print(f"  ❌ {weapon_name} {config_id}: data.json 里找不到配置")
            error += 1
            continue

        old_price = safe_int(target.get("price"), default=0)
        rounded = _round_to_wan(new_price)

        diff = rounded - old_price
        diff_str = f"+{diff}" if diff >= 0 else str(diff)

        if rounded != new_price:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded:>8} ({diff_str})  "
                  f"[抓取 {new_price} → 规整 {rounded}]")
        else:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded:>8} ({diff_str})")

        if not dry_run:
            target["price"] = rounded
        updated += 1

    print()

    if not dry_run and updated > 0:
        from datetime import datetime
        today = datetime.now().strftime("%Y-%m-%d")
        old_updated_at = data.get("updatedAt", "")
        data["updatedAt"] = today
        if old_updated_at != today:
            print(f"📅 updatedAt: {old_updated_at} → {today}")

        backup_data_json()

        save_json(DATA_JSON, data)
        print()
        print("💾 已写入 data.json")
    elif dry_run:
        print("🔍 dry-run 模式：未写入文件")

    print()
    print("=" * 70)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}✅ 完成：更新 {updated}，"
          f"未找到 {not_found}，失败 {error}")
    print("=" * 70)


def _round_to_wan(price, unit=10000):
    """价格规整到最接近的整万"""
    if price is None or price < 0:
        return price
    return round(price / unit) * unit


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="更新枪械配置价格（一步到位）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python update_weapon_prices.py\n"
            "  python update_weapon_prices.py --config 20#1\n"
            "  python update_weapon_prices.py --config 20#1,41#1,15#1\n"
            "  python update_weapon_prices.py --dry-run\n"
            "  python update_weapon_prices.py --debug\n"
        ),
    )
    p.add_argument("--config", type=str, default=None,
                   help="只抓指定配置，格式 weaponId#configId，"
                        "多个用逗号分隔。例：--config 20#1 或 20#1,41#1,15#1")
    p.add_argument("--dry-run", action="store_true",
                   help="只打印不写入 data.json")
    p.add_argument("--debug", action="store_true",
                   help="打印调试日志")
    return p.parse_args()


def main():
    args = parse_args()
    set_debug(args.debug)

    config_filter = None
    if args.config:
        try:
            config_filter = _parse_config_filter(args.config)
        except ValueError as e:
            print(f"❌ {e}")
            return

    run(dry_run=args.dry_run, config_filter=config_filter)


if __name__ == "__main__":
    main()