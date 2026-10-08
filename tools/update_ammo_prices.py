# tools/update_ammo_prices.py
#
# 需求1：更新子弹价格（一步到位）
#
# 流程：
#   1. 读 data.json，提取所有 bullet（构建候选名）
#   2. 启动浏览器（固定 viewport，纯翻页抓取）
#   3. 翻 N 页抓 orzice.com，得到 子弹名 → 价格 映射
#   4. 按候选名匹配，标注成功/未找到
#   5. 备份 data.json
#   6. 写回 data.json（只写成功的）
#   7. 打印"子弹价格更新明细"
#
# 用法：
#   python update_ammo_prices.py
#   python update_ammo_prices.py --pages 3
#   python update_ammo_prices.py --dry-run
#   python update_ammo_prices.py --debug

import argparse
import sys
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeout

from config import (
    DATA_JSON,
    ORZICE_AMMO_URL,
    ORZICE_AMMO_PARAMS,
    ORZICE_AMMO_TOTAL_PAGES,
    ORZICE_HEADLESS,
    AMMO_SELECTORS,
    WAIT_AFTER_AMMO_PAGE_LOAD,
    WAIT_AFTER_AMMO_PAGE_NAV,
)
from _common import (
    load_json, save_json, safe_int, safe_str, backup_data_json,
    set_debug, dlog, install_signal_handler, is_interrupted,
    launch_browser, close_browser, profile_exists,
)


# ============================================================
# 提取任务
# ============================================================

def _build_candidates(caliber, name, level):
    """
    为子弹生成"候选显示名"列表（按优先级排序）：
      1. `口径 名称`      —— 最常见
      2. `口径_等级`      —— 少数
      3. `名称`           —— 特殊口径（Arrow）
    """
    candidates = []

    if caliber and name:
        candidates.append(f"{caliber} {name}")
    if caliber and level is not None:
        candidates.append(f"{caliber}_{level}")
    if name:
        candidates.append(name)

    seen = set()
    result = []
    for c in candidates:
        c = c.strip()
        if not c or c in seen:
            continue
        seen.add(c)
        result.append(c)
    return result


def extract_tasks(data):
    """从 data.json 的 bullets 里提取任务"""
    bullets = data.get("bullets", [])
    if not bullets:
        return [], {}

    tasks = []
    skipped = {"no_id": 0, "no_caliber": 0, "no_name": 0}

    for bullet in bullets:
        bullet_id = bullet.get("id")
        caliber = safe_str(bullet.get("caliber"))
        name = safe_str(bullet.get("name"))
        level = bullet.get("level")
        old_price = safe_int(bullet.get("price"), default=0)

        if not bullet_id:
            skipped["no_id"] += 1
            continue
        if not caliber:
            skipped["no_caliber"] += 1
            continue
        if not name:
            skipped["no_name"] += 1
            continue

        candidates = _build_candidates(caliber, name, level)
        if not candidates:
            continue

        tasks.append({
            "bulletId": bullet_id,
            "caliber": caliber,
            "name": name,
            "level": level,
            "candidates": candidates,
            "oldPrice": old_price,
        })

    return tasks, skipped


# ============================================================
# 抓取
# ============================================================

def _parse_price(text):
    if not text:
        return None
    cleaned = text.replace(",", "").replace("，", "").strip()
    if not cleaned or not cleaned.lstrip("-").isdigit():
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def _build_page_url(page_num):
    params = ORZICE_AMMO_PARAMS.format(page=page_num)
    return f"{ORZICE_AMMO_URL}?{params}"


def _scrape_one_page(page, page_num, total_pages):
    url = _build_page_url(page_num)
    dlog(f"[{page_num}/{total_pages}] {url}")

    scraped_map = {}

    try:
        page.goto(url, wait_until="networkidle")

        try:
            page.locator(AMMO_SELECTORS["table"]).wait_for(
                state="visible",
                timeout=WAIT_AFTER_AMMO_PAGE_LOAD,
            )
        except PlaywrightTimeout:
            dlog(f"表格加载超时（{page_num}）")

        rows = page.locator(AMMO_SELECTORS["row"]).all()
        dlog(f"本页找到 {len(rows)} 行")

        for idx, row in enumerate(rows):
            try:
                name_el = row.locator(AMMO_SELECTORS["name"]).first
                if name_el.count() == 0:
                    continue
                name = name_el.inner_text().strip()
                if not name:
                    continue

                price_el = row.locator(AMMO_SELECTORS["price"]).first
                if price_el.count() == 0:
                    continue
                price_text = price_el.inner_text().strip()
                price = _parse_price(price_text)
                if price is None:
                    continue

                scraped_map[name] = price
            except Exception as e:
                dlog(f"行 {idx} 抓取失败: {e}")
                continue

    except Exception as e:
        dlog(f"页面 {page_num} 异常: {e}")

    return scraped_map


def _match_task(task, scraped_map):
    for candidate in task.get("candidates", []):
        if candidate in scraped_map:
            return candidate, scraped_map[candidate]
    return None, None


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

def run(total_pages=None, dry_run=False):
    if total_pages is None:
        total_pages = ORZICE_AMMO_TOTAL_PAGES

    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)
    if not data:
        raise ValueError("data.json 为空或不存在")

    tasks, skipped = extract_tasks(data)
    print(f"共提取 {len(tasks)} 个子弹任务")

    if skipped:
        detail = [f"{k}={v}" for k, v in skipped.items() if v]
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("⚠️ 没有要抓的任务")
        return

    print(f"目标页数: {total_pages}")

    # ---------- 启动浏览器 ----------
    install_signal_handler()

    # ⭐ orzice 是纯翻页抓取，不需要全屏
    pw, context, page = launch_browser(
        headless=ORZICE_HEADLESS, fullscreen=False
    )

    all_scraped = {}
    try:
        print()
        print("=" * 60)
        print(f"开始抓取 orzice.com 子弹价格（{total_pages} 页）")
        print("=" * 60)

        for page_num in range(1, total_pages + 1):
            if is_interrupted():
                print("\n  ⏸ 中断，跳过剩余页")
                break
            page_map = _scrape_one_page(page, page_num, total_pages)
            all_scraped.update(page_map)

            _print_progress(page_num, total_pages, prefix="翻页抓取中")

            if page_num < total_pages and not is_interrupted():
                page.wait_for_timeout(WAIT_AFTER_AMMO_PAGE_NAV)

        _clear_progress()
        print(f"✅ 抓到 {len(all_scraped)} 颗子弹")

    finally:
        close_browser(pw, context)

    # ---------- 匹配 ----------
    results = []
    for task in tasks:
        matched_name, price = _match_task(task, all_scraped)
        if matched_name is not None and price is not None:
            results.append({
                "bulletId": task["bulletId"],
                "caliber": task.get("caliber", ""),
                "name": task.get("name", ""),
                "matchedBy": matched_name,
                "newPrice": price,
                "status": "ok",
                "error": None,
                "oldPrice": task.get("oldPrice", 0),
            })
        else:
            results.append({
                "bulletId": task["bulletId"],
                "caliber": task.get("caliber", ""),
                "name": task.get("name", ""),
                "matchedBy": None,
                "newPrice": None,
                "status": "not_found",
                "error": None,
                "oldPrice": task.get("oldPrice", 0),
            })

    # ---------- 更新 data.json ----------
    print()
    print("=" * 70)
    print("子弹价格更新明细")
    print("=" * 70)

    # 建 bulletId → bullet 的映射
    bullet_map = {}
    for b in data.get("bullets", []):
        bid = b.get("id")
        if bid is not None:
            bullet_map[bid] = b

    updated = 0
    not_found = 0
    error = 0

    for item in results:
        bullet_id = item.get("bulletId")
        status = item.get("status")
        new_price = item.get("newPrice")
        caliber = item.get("caliber", "")
        name = item.get("name", "")
        display = f"{caliber} {name}".strip() or bullet_id

        if status != "ok" or new_price is None:
            print(f"  ⏭️ {display} ({bullet_id}): 未找到")
            not_found += 1
            continue

        new_price = safe_int(new_price, default=None)
        if new_price is None or new_price < 0:
            print(f"  ❌ {display} ({bullet_id}): 价格异常")
            error += 1
            continue

        target = bullet_map.get(bullet_id)
        if not target:
            print(f"  ❌ {display} ({bullet_id}): data.json 里找不到")
            error += 1
            continue

        old_price = safe_int(target.get("price"), default=0)
        diff = new_price - old_price
        diff_str = f"+{diff}" if diff >= 0 else str(diff)

        print(f"  ✅ {display} ({bullet_id}): "
              f"{old_price:>7} → {new_price:>7} ({diff_str})")

        if not dry_run:
            target["price"] = new_price
        updated += 1

    print()

    if not dry_run and updated > 0:
        backup_data_json()
        save_json(DATA_JSON, data)
        print()
        print("💾 已写入 data.json")
    elif dry_run:
        print("🔍 dry-run 模式：未写入文件")

    print()
    print("=" * 70)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}✅ 完成：更新 {updated}，未找到 {not_found}，失败 {error}")
    print("=" * 70)


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="更新子弹价格（一步到位）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python update_ammo_prices.py\n"
            "  python update_ammo_prices.py --pages 3\n"
            "  python update_ammo_prices.py --dry-run\n"
            "  python update_ammo_prices.py --debug\n"
        ),
    )
    p.add_argument("--pages", type=int, default=ORZICE_AMMO_TOTAL_PAGES,
                   help=f"抓取页数（默认 {ORZICE_AMMO_TOTAL_PAGES}）")
    p.add_argument("--dry-run", action="store_true",
                   help="只打印不写入 data.json")
    p.add_argument("--debug", action="store_true",
                   help="打印调试日志")
    return p.parse_args()


def main():
    args = parse_args()
    set_debug(args.debug)

    run(total_pages=args.pages, dry_run=args.dry_run)


if __name__ == "__main__":
    main()