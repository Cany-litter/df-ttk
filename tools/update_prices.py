# tools/update_prices.py
#
# 合并版：一键更新枪械配置 + 子弹价格
#
# 子命令：
#   weapon    只抓枪械（dfttk.com：价格 + 开镜 + 呼吸 + 屏息 + 后坐力 + 稳定性）
#   ammo      只抓子弹（orzice.com：子弹价格）
#   all       两个都抓（共享一次浏览器 + 一次 data.json 读写）
#
# 流程（all）：
#   1. 读 data.json
#   2. launch 一次浏览器（全屏 profile）
#   3. 枪械阶段：切枪 → 方案库 → 载方案 → 读价格 + 9 属性
#   4. 子弹阶段：导航 orzice → 翻页抓 → 按候选名匹配
#   5. 关浏览器
#   6. 只备份一次 data.json
#   7. 只写一次 data.json
#
# 用法：
#   python update_prices.py weapon
#   python update_prices.py ammo
#   python update_prices.py all
#
#   python update_prices.py weapon --config 20#1,41#1,15#1
#   python update_prices.py weapon --no-substats
#   python update_prices.py ammo --pages 3
#   python update_prices.py all --dry-run
#   python update_prices.py weapon --debug

import argparse
import re
import sys
import time
from datetime import datetime

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
    switch_weapon, open_library, close_library, load_scheme,
    read_all_substats_with_laser,
)


# ============================================================
# 抓取参数
# ============================================================

AFTER_LOAD_SCHEME_WAIT = 800
AFTER_SWITCH_WEAPON_WAIT = 300


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


def _fmt_val(v, default="无"):
    if v is None:
        return default
    if isinstance(v, float):
        return f"{v:g}"
    return str(v)


def _round_to_wan(price, unit=10000):
    if price is None or price < 0:
        return price
    return round(price / unit) * unit


# ============================================================
# 枪械：提取任务
# ============================================================

def _extract_scheme_index(config_id):
    if not config_id:
        return None
    match = re.search(r"#(\d+)", str(config_id))
    if not match:
        return None
    return int(match.group(1))


def _extract_weapon_tasks(data):
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
                f"--config 格式错误: {part}（应为 weaponId#configId）"
            )
        w_str, c_str = part.split("#", 1)
        w = int(w_str.strip())
        c = "#" + c_str.strip().lstrip("#")
        result.add((w, c))
    return result


# ============================================================
# 枪械：抓单个任务
# ============================================================

def _parse_price_text(text):
    if not text:
        return None
    cleaned = text.replace(",", "").replace("，", "").strip()
    try:
        return int(cleaned)
    except ValueError:
        return None


def _scrape_one_weapon(page, task, read_substats=True):
    """
    抓单个枪械任务：价格 + 9 个属性。
    ⚠️ 前置条件：页面已切到对应武器、方案库已打开。
    """
    result = {
        "weaponId": task["weaponId"],
        "weaponName": task["weaponName"],
        "configId": task["configId"],
        "newPrice": None,
        "aimSpeed": None,
        "breathSway": None,
        "breathHoldDuration": None,
        "breathHoldReduction": None,
        "recoilVerticalAuto": None,
        "recoilHorizontalAuto": None,
        "recoilVerticalBurst": None,
        "recoilHorizontalBurst": None,
        "stabilityMultiplier": None,
        "laserState": None,
        "status": STATUS_ERROR,
        "error": None,
    }

    try:
        ok = load_scheme(page, task)
        if not ok:
            result["status"] = STATUS_NOT_FOUND
            return result

        page.wait_for_timeout(AFTER_LOAD_SCHEME_WAIT)

        price_text = page.locator(SELECTORS["price"]).inner_text()
        new_price = _parse_price_text(price_text)

        if new_price is None:
            result["status"] = STATUS_ERROR
            result["error"] = f"价格解析失败: {price_text!r}"
            return result

        result["newPrice"] = new_price

        if read_substats:
            substats, laser_state = read_all_substats_with_laser(page)
            result["aimSpeed"] = substats["aimSpeed"]
            result["breathSway"] = substats["breathSway"]
            result["breathHoldDuration"] = substats["breathHoldDuration"]
            result["breathHoldReduction"] = substats["breathHoldReduction"]
            result["recoilVerticalAuto"] = substats.get("recoilVerticalAuto")
            result["recoilHorizontalAuto"] = substats.get("recoilHorizontalAuto")
            result["recoilVerticalBurst"] = substats.get("recoilVerticalBurst")
            result["recoilHorizontalBurst"] = substats.get("recoilHorizontalBurst")
            result["stabilityMultiplier"] = substats.get("stabilityMultiplier")
            result["laserState"] = laser_state

        result["status"] = STATUS_OK

    except PlaywrightTimeout as e:
        result["status"] = STATUS_ERROR
        result["error"] = f"超时: {e}"
    except Exception as e:
        result["status"] = STATUS_ERROR
        result["error"] = str(e)

    return result


# ============================================================
# 枪械：阶段主流程
# ============================================================

def _phase_weapon(page, data, config_filter=None, read_substats=True):
    """
    在已打开的 page 上跑枪械阶段。
    返回 results 列表（含 status / newPrice / 属性）。
    """
    tasks, skipped = _extract_weapon_tasks(data)
    print(f"共提取 {len(tasks)} 个枪械任务（所有 enabled 配置）")
    if not read_substats:
        print("  ⚠️ --no-substats：只抓价格，不抓属性")

    if config_filter is not None:
        before = len(tasks)
        tasks = [t for t in tasks
                 if (t["weaponId"], t["configId"]) in config_filter]
        print(f"  --config 过滤: {before} → {len(tasks)} 个任务")
        if not tasks:
            print("❌ --config 没匹配到任何任务")
            return []

    if skipped:
        detail = [f"{k}={v}" for k, v in skipped.items() if v]
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("⚠️ 没有枪械任务")
        return []

    page.goto(DFTTK_URL, wait_until="commit")
    try:
        page.locator(SELECTORS["weapon_selector"]).wait_for(
            state="visible", timeout=30000
        )
    except PlaywrightTimeout:
        print("  ⚠️ 武器选择器未出现，继续")

    if not profile_exists():
        print()
        print("=" * 60)
        print("  首次运行，请确认：")
        print("  1. 页面已完全加载")
        print("  2. 已登录（如果需要）")
        print("  3. 已切换到「烽火地带」模式")
        print("  4. 方案库里能看到你的方案")
        print("=" * 60)
        try:
            input("\n完成后按回车开始抓取枪械...\n")
        except (KeyboardInterrupt, EOFError):
            print("\n⚠️ 用户取消枪械阶段")
            return []

    print()
    total = len(tasks)
    results = []

    for idx, task in enumerate(tasks):
        if is_interrupted():
            print("\n  ⏸ 中断，跳过剩余枪械任务")
            break

        weapon_name = task["weaponName"]

        # 切枪
        try:
            switch_weapon(page, weapon_name)
            page.wait_for_timeout(AFTER_SWITCH_WEAPON_WAIT)
        except Exception as e:
            dlog(f"切换武器失败: {e}")

        # 开方案库
        try:
            open_library(page)
        except Exception as e:
            dlog(f"打开方案库失败: {e}")

        # 载方案 + 读价格 + 读属性
        result = _scrape_one_weapon(page, task, read_substats=read_substats)
        results.append(result)

        # 关方案库
        try:
            close_library(page)
        except Exception:
            pass

        _print_progress(idx + 1, total, prefix="枪械抓取中")

    _clear_progress()
    return results


# ============================================================
# 子弹：提取任务
# ============================================================

def _build_ammo_candidates(caliber, name, level):
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


def _extract_ammo_tasks(data):
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

        candidates = _build_ammo_candidates(caliber, name, level)
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
# 子弹：翻页抓取
# ============================================================

def _build_ammo_page_url(page_num):
    params = ORZICE_AMMO_PARAMS.format(page=page_num)
    return f"{ORZICE_AMMO_URL}?{params}"


def _scrape_one_ammo_page(page, page_num, total_pages):
    url = _build_ammo_page_url(page_num)
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
                price = _parse_price_text(price_text)
                if price is None:
                    continue

                scraped_map[name] = price
            except Exception as e:
                dlog(f"行 {idx} 抓取失败: {e}")
                continue

    except Exception as e:
        dlog(f"页面 {page_num} 异常: {e}")

    return scraped_map


def _match_ammo_task(task, scraped_map):
    for candidate in task.get("candidates", []):
        if candidate in scraped_map:
            return candidate, scraped_map[candidate]
    return None, None


# ============================================================
# 子弹：阶段主流程
# ============================================================

def _phase_ammo(page, data, total_pages=None):
    """
    在已打开的 page 上跑子弹阶段（会导航到 orzice.com）。
    返回 results 列表（含 status / newPrice）。
    """
    if total_pages is None:
        total_pages = ORZICE_AMMO_TOTAL_PAGES

    tasks, skipped = _extract_ammo_tasks(data)
    print(f"共提取 {len(tasks)} 个子弹任务")

    if skipped:
        detail = [f"{k}={v}" for k, v in skipped.items() if v]
        if detail:
            print(f"  跳过: {', '.join(detail)}")

    if not tasks:
        print("⚠️ 没有子弹任务")
        return []

    print(f"目标页数: {total_pages}")
    print()
    print("=" * 60)
    print(f"开始抓取 orzice.com 子弹价格（{total_pages} 页）")
    print("=" * 60)

    all_scraped = {}
    for page_num in range(1, total_pages + 1):
        if is_interrupted():
            print("\n  ⏸ 中断，跳过剩余页")
            break
        page_map = _scrape_one_ammo_page(page, page_num, total_pages)
        all_scraped.update(page_map)

        _print_progress(page_num, total_pages, prefix="子弹翻页抓取中")

        if page_num < total_pages and not is_interrupted():
            page.wait_for_timeout(WAIT_AFTER_AMMO_PAGE_NAV)

    _clear_progress()
    print(f"✅ 抓到 {len(all_scraped)} 颗子弹")

    # 匹配
    results = []
    for task in tasks:
        matched_name, price = _match_ammo_task(task, all_scraped)
        if matched_name is not None and price is not None:
            results.append({
                "bulletId": task["bulletId"],
                "caliber": task.get("caliber", ""),
                "name": task.get("name", ""),
                "matchedBy": matched_name,
                "newPrice": price,
                "status": STATUS_OK,
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
                "status": STATUS_NOT_FOUND,
                "error": None,
                "oldPrice": task.get("oldPrice", 0),
            })

    return results


# ============================================================
# 写回：枪械
# ============================================================

def _apply_weapon_results(data, results, dry_run=False, read_substats=True):
    print()
    print("=" * 100)
    print("枪械价格 + 属性 更新明细")
    print("=" * 100)

    price_map = {}
    for entry in data.get("prices", []):
        wid = entry.get("weaponId")
        if wid is not None:
            price_map[wid] = entry

    updated = 0
    updated_price = 0
    updated_aim = 0
    updated_sway = 0
    updated_hold_dur = 0
    updated_hold_red = 0
    updated_rv_auto = 0
    updated_rh_auto = 0
    updated_rv_burst = 0
    updated_rh_burst = 0
    updated_stab_mult = 0
    not_found = 0
    error = 0

    for item in results:
        weapon_id = item.get("weaponId")
        config_id = item.get("configId")
        weapon_name = item.get("weaponName", "未知")
        status = item.get("status")
        new_price = item.get("newPrice")
        new_aim = item.get("aimSpeed")
        new_sway = item.get("breathSway")
        new_hold_dur = item.get("breathHoldDuration")
        new_hold_red = item.get("breathHoldReduction")
        new_rv_auto = item.get("recoilVerticalAuto")
        new_rh_auto = item.get("recoilHorizontalAuto")
        new_rv_burst = item.get("recoilVerticalBurst")
        new_rh_burst = item.get("recoilHorizontalBurst")
        new_stab_mult = item.get("stabilityMultiplier")

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

        attr_str = ""
        if read_substats:
            old_aim = target.get("aimSpeed")
            old_sway = target.get("breathSway")
            old_hold_dur = target.get("breathHoldDuration")
            old_hold_red = target.get("breathHoldReduction")
            old_rv_auto = target.get("recoilVerticalAuto")
            old_rh_auto = target.get("recoilHorizontalAuto")
            old_rv_burst = target.get("recoilVerticalBurst")
            old_rh_burst = target.get("recoilHorizontalBurst")
            old_stab_mult = target.get("stabilityMultiplier")

            parts = []
            if new_aim is not None:
                parts.append(f"开镜 {_fmt_val(old_aim)}→{_fmt_val(new_aim)}ms")
            if new_sway is not None:
                parts.append(f"呼吸 {_fmt_val(old_sway)}→{_fmt_val(new_sway)}")
            if new_hold_dur is not None:
                parts.append(f"屏息 {_fmt_val(old_hold_dur)}→{_fmt_val(new_hold_dur)}s")
            if new_hold_red is not None:
                parts.append(f"减免 {_fmt_val(old_hold_red)}→{_fmt_val(new_hold_red)}")
            if new_rv_auto is not None:
                parts.append(f"垂后(自) {_fmt_val(old_rv_auto)}→{_fmt_val(new_rv_auto)}")
            if new_rh_auto is not None:
                parts.append(f"水后(自) {_fmt_val(old_rh_auto)}→{_fmt_val(new_rh_auto)}")
            if new_rv_burst is not None:
                parts.append(f"垂后(单) {_fmt_val(old_rv_burst)}→{_fmt_val(new_rv_burst)}")
            if new_rh_burst is not None:
                parts.append(f"水后(单) {_fmt_val(old_rh_burst)}→{_fmt_val(new_rh_burst)}")
            if new_stab_mult is not None:
                parts.append(f"稳定性 {_fmt_val(old_stab_mult)}→{_fmt_val(new_stab_mult)}")

            if parts:
                attr_str = "  | " + "  ".join(parts)
            else:
                attr_str = "  | ⚠️ 属性读不到"

        if rounded != new_price:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded:>8} ({diff_str})"
                  f"{attr_str}  [抓取 {new_price} → 规整 {rounded}]")
        else:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded:>8} ({diff_str})"
                  f"{attr_str}")

        if not dry_run:
            target["price"] = rounded
        updated_price += 1

        if read_substats:
            if new_aim is not None:
                if not dry_run:
                    target["aimSpeed"] = new_aim
                updated_aim += 1
            if new_sway is not None:
                if not dry_run:
                    target["breathSway"] = new_sway
                updated_sway += 1
            if new_hold_dur is not None:
                if not dry_run:
                    target["breathHoldDuration"] = new_hold_dur
                updated_hold_dur += 1
            if new_hold_red is not None:
                if not dry_run:
                    target["breathHoldReduction"] = new_hold_red
                updated_hold_red += 1
            if new_rv_auto is not None:
                if not dry_run:
                    target["recoilVerticalAuto"] = new_rv_auto
                updated_rv_auto += 1
            if new_rh_auto is not None:
                if not dry_run:
                    target["recoilHorizontalAuto"] = new_rh_auto
                updated_rh_auto += 1
            if new_rv_burst is not None:
                if not dry_run:
                    target["recoilVerticalBurst"] = new_rv_burst
                updated_rv_burst += 1
            if new_rh_burst is not None:
                if not dry_run:
                    target["recoilHorizontalBurst"] = new_rh_burst
                updated_rh_burst += 1
            if new_stab_mult is not None:
                if not dry_run:
                    target["stabilityMultiplier"] = new_stab_mult
                updated_stab_mult += 1

        updated += 1

    print()
    print("=" * 100)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}✅ 枪械阶段完成：")
    print(f"     更新配置 {updated} 条")
    print(f"     其中价格     {updated_price} 条")
    if read_substats:
        print(f"     其中开镜时间 {updated_aim} 条")
        print(f"     其中呼吸晃动 {updated_sway} 条")
        print(f"     其中屏息时长 {updated_hold_dur} 条")
        print(f"     其中屏息减免 {updated_hold_red} 条")
        print(f"     其中垂后(自) {updated_rv_auto} 条")
        print(f"     其中水后(自) {updated_rh_auto} 条")
        print(f"     其中垂后(单) {updated_rv_burst} 条")
        print(f"     其中水后(单) {updated_rh_burst} 条")
        print(f"     其中稳定性   {updated_stab_mult} 条")
    print(f"     未找到 {not_found}，失败 {error}")
    print("=" * 100)


# ============================================================
# 写回：子弹
# ============================================================

def _apply_ammo_results(data, results, dry_run=False):
    print()
    print("=" * 70)
    print("子弹价格更新明细")
    print("=" * 70)

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

        if status != STATUS_OK or new_price is None:
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
    print("=" * 70)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}✅ 子弹阶段完成：更新 {updated}，未找到 {not_found}，失败 {error}")
    print("=" * 70)


# ============================================================
# 主流程
# ============================================================

def run(mode, dry_run=False, config_filter=None, read_substats=True,
        ammo_pages=None):
    """
    mode: "weapon" | "ammo" | "all"
    """
    if mode not in ("weapon", "ammo", "all"):
        raise ValueError(f"未知 mode: {mode}")

    if ammo_pages is None:
        ammo_pages = ORZICE_AMMO_TOTAL_PAGES

    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)
    if not data:
        raise ValueError("data.json 为空或不存在")

    install_signal_handler()

    need_browser = (mode in ("weapon", "all", "ammo"))
    pw = context = page = None

    if need_browser:
        # ⭐ 只在需要时启动一次浏览器
        pw, context, page = launch_browser(fullscreen=True)

    weapon_results = []
    ammo_results = []

    try:
        # ---------- 枪械阶段 ----------
        if mode in ("weapon", "all"):
            print()
            print("=" * 60)
            print("🔫 枪械阶段")
            print("=" * 60)
            weapon_results = _phase_weapon(
                page, data,
                config_filter=config_filter,
                read_substats=read_substats,
            )

            # 中断时：问是否继续抓子弹
            if is_interrupted() and mode == "all":
                print()
                print("⚠️ 枪械阶段被中断。")
                try:
                    ans = input("是否继续抓子弹？(y/N) ").strip().lower()
                except (KeyboardInterrupt, EOFError):
                    ans = "n"
                if ans != "y":
                    print("  ⏭ 跳过子弹阶段")
                    mode = "weapon"

        # ---------- 子弹阶段 ----------
        if mode in ("ammo", "all"):
            if is_interrupted():
                print("\n  ⏸ 已中断，跳过子弹阶段")
            else:
                print()
                print("=" * 60)
                print("🔸 子弹阶段")
                print("=" * 60)
                ammo_results = _phase_ammo(page, data, total_pages=ammo_pages)

    finally:
        if need_browser:
            close_browser(pw, context)

    # ---------- 应用结果 ----------
    if weapon_results:
        _apply_weapon_results(
            data, weapon_results,
            dry_run=dry_run,
            read_substats=read_substats,
        )

    if ammo_results:
        _apply_ammo_results(data, ammo_results, dry_run=dry_run)

    # ---------- 统一保存 ----------
    print()
    if not dry_run:
        any_updated = bool(weapon_results or ammo_results)
        if any_updated:
            today = datetime.now().strftime("%Y-%m-%d")
            old_updated_at = data.get("updatedAt", "")
            data["updatedAt"] = today
            if old_updated_at != today:
                print(f"📅 updatedAt: {old_updated_at} → {today}")

            backup_data_json()
            save_json(DATA_JSON, data)
            print()
            print("💾 已写入 data.json")
        else:
            print("⚠️ 没有更新任何数据")
    else:
        print("🔍 dry-run 模式：未写入文件")

    print()
    print("=" * 60)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}🏁 全部完成")


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="一键更新枪械配置 + 子弹价格（子命令版）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python update_prices.py weapon\n"
            "  python update_prices.py ammo\n"
            "  python update_prices.py all\n"
            "\n"
            "  python update_prices.py weapon --config 20#1,41#1,15#1\n"
            "  python update_prices.py weapon --no-substats\n"
            "  python update_prices.py ammo --pages 3\n"
            "  python update_prices.py all --dry-run\n"
            "  python update_prices.py weapon --debug\n"
        ),
    )

    sub = p.add_subparsers(dest="mode", required=True)

    # weapon
    pw_ = sub.add_parser("weapon", help="只抓枪械（价格 + 属性）")
    pw_.add_argument("--config", type=str, default=None,
                     help="只抓指定配置，格式 weaponId#configId，"
                          "多个用逗号分隔。例：--config 20#1 或 20#1,41#1,15#1")
    pw_.add_argument("--dry-run", action="store_true",
                     help="只打印不写入 data.json")
    pw_.add_argument("--no-substats", action="store_true",
                     help="只抓价格，不抓开镜/呼吸/屏息/后坐力/稳定性")
    pw_.add_argument("--debug", action="store_true",
                     help="打印调试日志")

    # ammo
    pa = sub.add_parser("ammo", help="只抓子弹价格")
    pa.add_argument("--pages", type=int, default=ORZICE_AMMO_TOTAL_PAGES,
                    help=f"抓取页数（默认 {ORZICE_AMMO_TOTAL_PAGES}）")
    pa.add_argument("--dry-run", action="store_true",
                    help="只打印不写入 data.json")
    pa.add_argument("--debug", action="store_true",
                    help="打印调试日志")

    # all
    pall = sub.add_parser("all", help="两个都抓（共享一次浏览器）")
    pall.add_argument("--config", type=str, default=None,
                      help="只抓指定枪械配置（对子弹无效）")
    pall.add_argument("--pages", type=int, default=ORZICE_AMMO_TOTAL_PAGES,
                      help=f"子弹抓取页数（默认 {ORZICE_AMMO_TOTAL_PAGES}）")
    pall.add_argument("--dry-run", action="store_true",
                      help="只打印不写入 data.json")
    pall.add_argument("--no-substats", action="store_true",
                      help="枪械只抓价格，不抓属性")
    pall.add_argument("--debug", action="store_true",
                      help="打印调试日志")

    return p.parse_args()


def main():
    args = parse_args()
    set_debug(getattr(args, "debug", False))

    mode = args.mode

    config_filter = None
    if getattr(args, "config", None):
        try:
            config_filter = _parse_config_filter(args.config)
        except ValueError as e:
            print(f"❌ {e}")
            return

    run(
        mode=mode,
        dry_run=getattr(args, "dry_run", False),
        config_filter=config_filter,
        read_substats=not getattr(args, "no_substats", False),
        ammo_pages=getattr(args, "pages", ORZICE_AMMO_TOTAL_PAGES),
    )


if __name__ == "__main__":
    main()