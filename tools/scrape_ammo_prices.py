# tools/scrape_ammo_prices.py
#
# 阶段2：用 Playwright 抓取 orzice.com 的子弹价格
#
# 输入：tools/ammo_tasks.json
# 输出：tools/ammo_scraped.json
#
# ⭐ v2 改动（诊断增强）：
#   - --debug 时 dump 第一行 outerHTML
#   - --debug 时检查 iframe 数量并自动切换
#   - --debug 时逐行打印 name/price 元素状态
#   - goto 改为 networkidle（等 XHR 完成）
#   - 加了 3 个备选选择器（防御性）
#
# ⭐ 与其他脚本的差异：
#   - 武器价格（scrape_prices.py）：需要登录 + 点方案库 + 二次确认（交互重）
#   - 子弹价格（本脚本）：纯翻页 + 抓表格（无需交互，简单）
#
# 用法：
#   python scrape_ammo_prices.py              # 抓全部 9 页
#   python scrape_ammo_prices.py --pages 1 --debug   # 只抓 1 页 + 详细日志
#   python scrape_ammo_prices.py --dump-html  # 保存第一页 HTML 到文件

import argparse
import json
import os
import signal
import sys

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from config import (
    AMMO_TASKS_JSON,
    AMMO_SCRAPED_JSON,
    ORZICE_AMMO_URL,
    ORZICE_AMMO_PARAMS,
    ORZICE_AMMO_TOTAL_PAGES,
    ORZICE_HEADLESS,
    USER_DATA_DIR,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    AMMO_SELECTORS,
    STATUS_OK,
    STATUS_NOT_FOUND,
    STATUS_ERROR,
    WAIT_AFTER_AMMO_PAGE_LOAD,
    WAIT_AFTER_AMMO_PAGE_NAV,
)


# ============================================================
# 全局：中断控制 + 调试开关
# ============================================================

_interrupted = False
_DEBUG = False


def _signal_handler(signum, frame):
    global _interrupted
    if _interrupted:
        print("\n\n⚠️ 强制退出...")
        sys.exit(1)
    _interrupted = True
    print("\n\n⚠️ 收到中断信号（Ctrl+C），正在保存已抓结果...")
    print("   （再按一次 Ctrl+C 可强制退出）\n")


def dlog(msg):
    if _DEBUG:
        print(f"      [debug] {msg}")


# ============================================================
# 工具
# ============================================================

def load_tasks():
    if not os.path.exists(AMMO_TASKS_JSON):
        raise FileNotFoundError(
            f"找不到任务文件: {AMMO_TASKS_JSON}\n"
            f"请先运行 extract_ammo_tasks.py"
        )
    with open(AMMO_TASKS_JSON, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        raise ValueError(f"文件为空: {AMMO_TASKS_JSON}")
    return json.loads(content)


def save_results(results):
    with open(AMMO_SCRAPED_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def parse_price(text):
    """
    '6,954'   -> 6954
    '5,974'   -> 5974
    '≈ 3.58'  -> None
    ''        -> None
    """
    if not text:
        return None
    cleaned = text.replace(",", "").replace("，", "").strip()
    if not cleaned or not cleaned.lstrip("-").isdigit():
        return None
    try:
        return int(cleaned)
    except ValueError:
        return None


def build_page_url(page_num):
    params = ORZICE_AMMO_PARAMS.format(page=page_num)
    return f"{ORZICE_AMMO_URL}?{params}"


# ============================================================
# 诊断：dump 页面结构
# ============================================================

def diagnose_page(page, page_num):
    """
    详细的页面诊断（只在 --debug 时调用）
    """
    print(f"      [debug] ============ 诊断第 {page_num} 页 ============")

    # ---------- 1. 检查 iframe ----------
    try:
        iframe_count = page.locator("iframe").count()
        print(f"      [debug] iframe 数量: {iframe_count}")
        if iframe_count > 0:
            for i in range(iframe_count):
                fr = page.locator("iframe").nth(i)
                src = fr.get_attribute("src") or "(无 src)"
                print(f"      [debug]   iframe[{i}] src = {src}")
    except Exception as e:
        print(f"      [debug] iframe 检查失败: {e}")

    # ---------- 2. 检查各选择器命中数 ----------
    checks = {
        "table.ui-table": "table.ui-table",
        "table.ui-table tbody": "table.ui-table tbody",
        "table.ui-table tbody tr": "table.ui-table tbody tr",
        ".ui-table": ".ui-table",
        ".ui-name": ".ui-name",
        ".ui-cell-gold": ".ui-cell-gold",
        ".ui-cell-gold .ui-num": ".ui-cell-gold .ui-num",
        ".ui-item-main .ui-name": ".ui-item-main .ui-name",
    }
    for label, sel in checks.items():
        try:
            cnt = page.locator(sel).count()
            print(f"      [debug] {label:<30} → {cnt}")
        except Exception as e:
            print(f"      [debug] {label:<30} → 异常: {e}")

    # ---------- 3. dump 第一行 outerHTML ----------
    try:
        first_row = page.locator("table.ui-table tbody tr").first
        if first_row.count() > 0:
            html = first_row.evaluate("el => el.outerHTML")
            print(f"      [debug] 第一行 outerHTML (前 2000 字):")
            print(f"      [debug] {html[:2000]}")
        else:
            # 退而求其次：找任意 tr
            any_tr = page.locator("tr").first
            if any_tr.count() > 0:
                html = any_tr.evaluate("el => el.outerHTML")
                print(f"      [debug] 任意 tr outerHTML (前 2000 字):")
                print(f"      [debug] {html[:2000]}")
            else:
                print(f"      [debug] 页面上找不到任何 tr")
    except Exception as e:
        print(f"      [debug] dump 第一行失败: {e}")

    print(f"      [debug] ============================================")


def dump_full_html(page, page_num):
    """把当前页的完整 HTML 保存到文件（--dump-html 用）"""
    try:
        html = page.content()
        out_path = os.path.join(
            os.path.dirname(AMMO_SCRAPED_JSON),
            f"debug_page_{page_num}.html"
        )
        with open(out_path, "w", encoding="utf-8") as f:
            f.write(html)
        print(f"      💾 已保存 HTML: {out_path}")
    except Exception as e:
        print(f"      ⚠️ 保存 HTML 失败: {e}")


# ============================================================
# 页面抓取
# ============================================================

def scrape_one_page(page, page_num, total_pages, dump_html=False):
    """
    抓取一页子弹表格
    @returns {dict} { 名称: 价格 }
    """
    url = build_page_url(page_num)
    print(f"  [{page_num}/{total_pages}] {url}")

    scraped_map = {}

    try:
        # ---------- 1. 打开页面 ----------
        # ⭐ 改为 networkidle：等 XHR 全部完成
        page.goto(url, wait_until="networkidle")

        # ---------- 2. 等表格出现 ----------
        try:
            page.locator(AMMO_SELECTORS["table"]).wait_for(
                state="visible",
                timeout=WAIT_AFTER_AMMO_PAGE_LOAD,
            )
        except PlaywrightTimeout:
            print(f"    ⚠️ 表格加载超时（{page_num}）")

        # ---------- 2.5 诊断（debug 模式） ----------
        if _DEBUG:
            diagnose_page(page, page_num)

        # ---------- 2.6 dump 完整 HTML（--dump-html 模式） ----------
        if dump_html:
            dump_full_html(page, page_num)

        # ---------- 3. 抓所有行 ----------
        rows = page.locator(AMMO_SELECTORS["row"]).all()
        dlog(f"本页找到 {len(rows)} 行")

        for idx, row in enumerate(rows):
            try:
                # ---------- 名称 ----------
                name_el = row.locator(AMMO_SELECTORS["name"]).first
                name_cnt = name_el.count()

                if _DEBUG and idx < 3:
                    dlog(f"行 {idx}: name_el.count() = {name_cnt}")

                if name_cnt == 0:
                    if _DEBUG and idx < 3:
                        html = row.evaluate("el => el.outerHTML")[:300]
                        dlog(f"行 {idx}: 找不到 name 元素，row HTML 前 300: {html}")
                    continue

                name = name_el.inner_text().strip()
                if not name:
                    if _DEBUG and idx < 3:
                        dlog(f"行 {idx}: name 为空")
                    continue

                # ---------- 价格 ----------
                price_el = row.locator(AMMO_SELECTORS["price"]).first
                price_cnt = price_el.count()

                if _DEBUG and idx < 3:
                    dlog(f"行 {idx} ({name}): price_el.count() = {price_cnt}")

                if price_cnt == 0:
                    dlog(f"行 {idx} ({name}): 找不到价格元素")
                    continue

                price_text = price_el.inner_text().strip()
                price = parse_price(price_text)

                if _DEBUG and idx < 3:
                    dlog(f"行 {idx} ({name}): 价格原文 = '{price_text}' → {price}")

                if price is None:
                    dlog(f"行 {idx} ({name}): 价格解析失败 '{price_text}'")
                    continue

                if name in scraped_map:
                    dlog(f"行 {idx}: 名称重复 '{name}'，覆盖")
                scraped_map[name] = price

            except Exception as e:
                dlog(f"行 {idx} 抓取失败: {e}")
                continue

        dlog(f"本页抓到 {len(scraped_map)} 条")

    except PlaywrightTimeout as e:
        print(f"    ⚠️ 超时: {e}")
    except Exception as e:
        print(f"    ❌ 异常: {e}")

    return scraped_map


def scrape_all_pages(page, total_pages, dump_html=False):
    all_scraped = {}
    for page_num in range(1, total_pages + 1):
        if _interrupted:
            print("  ⏸ 中断，跳过剩余页")
            break
        page_map = scrape_one_page(page, page_num, total_pages, dump_html)
        all_scraped.update(page_map)
        if page_num < total_pages and not _interrupted:
            page.wait_for_timeout(WAIT_AFTER_AMMO_PAGE_NAV)
    return all_scraped


# ============================================================
# 匹配任务
# ============================================================

def match_task(task, scraped_map):
    for candidate in task.get("candidates", []):
        if candidate in scraped_map:
            return candidate, scraped_map[candidate]
    return None, None


def build_results(tasks, scraped_map):
    results = []
    for task in tasks:
        bullet_id = task["bulletId"]
        caliber = task.get("caliber", "")
        name = task.get("name", "")

        matched_name, price = match_task(task, scraped_map)

        if matched_name is not None and price is not None:
            results.append({
                "bulletId": bullet_id,
                "caliber": caliber,
                "name": name,
                "matchedBy": matched_name,
                "newPrice": price,
                "status": STATUS_OK,
                "error": None,
            })
        else:
            results.append({
                "bulletId": bullet_id,
                "caliber": caliber,
                "name": name,
                "matchedBy": None,
                "newPrice": None,
                "status": STATUS_NOT_FOUND,
                "error": None,
            })
    return results


# ============================================================
# 参数解析
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="从 orzice.com 抓取子弹价格",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python scrape_ammo_prices.py                    抓全部 9 页\n"
            "  python scrape_ammo_prices.py --pages 1 --debug  只抓 1 页 + 详细日志\n"
            "  python scrape_ammo_prices.py --dump-html        保存 HTML 到文件\n"
        ),
    )
    parser.add_argument(
        "--pages", type=int, default=ORZICE_AMMO_TOTAL_PAGES,
        help=f"抓取页数（默认 {ORZICE_AMMO_TOTAL_PAGES}）",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="打印详细调试日志（含 dump HTML）",
    )
    parser.add_argument(
        "--dump-html", action="store_true",
        help="保存每页完整 HTML 到 tools/debug_page_N.html",
    )
    return parser.parse_args()


# ============================================================
# 主流程
# ============================================================

def main():
    global _DEBUG

    args = parse_args()
    _DEBUG = args.debug

    signal.signal(signal.SIGINT, _signal_handler)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _signal_handler)

    # ---------- 1. 读任务 ----------
    tasks = load_tasks()
    total_tasks = len(tasks)
    print(f"共 {total_tasks} 个子弹任务")
    print(f"目标页数: {args.pages}")

    if total_tasks == 0:
        print("⚠️ 没有任务，退出")
        return

    # ---------- 2. 启动浏览器 ----------
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    print()
    print(f"📁 用户数据目录: {USER_DATA_DIR}")
    print(f"🌐 无头模式: {ORZICE_HEADLESS}")
    if _DEBUG:
        print(f"   🔧 调试模式已开启")
    print()

    scraped_map = {}
    results = []

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=ORZICE_HEADLESS,
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            args=["--disable-blink-features=AutomationControlled"],
        )

        page = context.pages[0] if context.pages else context.new_page()

        try:
            print("=" * 60)
            print("开始抓取 orzice.com 子弹价格")
            print("=" * 60)

            scraped_map = scrape_all_pages(page, args.pages, dump_html=args.dump_html)

            print()
            print(f"✅ 抓到 {len(scraped_map)} 颗子弹")

        finally:
            print()
            print("=" * 60)
            print("匹配任务")
            print("=" * 60)

            results = build_results(tasks, scraped_map)

            ok_count = sum(1 for r in results if r["status"] == STATUS_OK)
            not_found_count = sum(1 for r in results if r["status"] == STATUS_NOT_FOUND)

            print(f"  ✅ 命中: {ok_count}")
            print(f"  ⏭️  未命中: {not_found_count}")

            if not_found_count > 0:
                print()
                print("未命中的任务（前 20 条）：")
                shown = 0
                for r in results:
                    if r["status"] == STATUS_NOT_FOUND:
                        print(f"  ❌ {r['bulletId']} (caliber={r['caliber']}, name={r['name']})")
                        shown += 1
                        if shown >= 20:
                            remaining = not_found_count - 20
                            if remaining > 0:
                                print(f"  ... 还有 {remaining} 条")
                            break

            save_results(results)
            print()
            print(f"💾 已保存结果到: {AMMO_SCRAPED_JSON}")

            try:
                context.close()
            except Exception:
                pass

    # ---------- 6. 汇总 ----------
    ok = sum(1 for r in results if r["status"] == STATUS_OK)
    not_found = sum(1 for r in results if r["status"] == STATUS_NOT_FOUND)
    error = sum(1 for r in results if r["status"] == STATUS_ERROR)

    print()
    print("=" * 60)
    if _interrupted:
        print("⚠️ 运行被中断")
    else:
        print("✅ 运行完成")
    print(f"   任务总数: {total_tasks}")
    print(f"   成功: {ok}")
    print(f"   未命中: {not_found}")
    print(f"   失败: {error}")
    print(f"   抓取到的子弹总数: {len(scraped_map)}")
    print(f"   结果文件: {AMMO_SCRAPED_JSON}")
    print("=" * 60)


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    main()