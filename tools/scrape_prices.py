# tools/scrape_prices.py
#
# 阶段2：用 Playwright 抓取 dfttk.com 的价格
#
# 输入：tools/tasks.json
# 输出：tools/scraped_prices.json
#
# ⭐ v4 改进（性能优化：条件等待）：
#   - ⭐ 全部"死等"改为"条件等待"
#   - wait_for_timeout → wait_for / wait_for_function
#   - 正常情况 50~200ms 返回，只有异常才等满超时
#   - 单条任务从 ~1.4s 降到 ~0.5s
#   - 删掉多余的 search.fill("")
#   - 关方案库优先用 Escape，检查抽屉消失
#
# ⭐ v3 已有：
#   - 二次确认弹窗（点"载入"后要再点"载入方案"）
#   - 精确匹配方案名（:text-is()）
#
# ⭐ v3.1 已有：
#   - 找不到方案时跳过，不计入"失败"
#
# ⭐ v2 已有：
#   - 持久化用户数据目录
#   - 便捷中断（Ctrl+C）
#   - 中间保存（每 N 条）
#   - 断点续跑（--resume）
#   - 连续失败保护
#   - 命令行参数（--start / --debug）
#
# ⚠️ 使用前需安装依赖：
#   pip install playwright
#   playwright install chromium
#
# 用法：
#   python scrape_prices.py                # 从头抓
#   python scrape_prices.py --start 10     # 从第 10 条开始
#   python scrape_prices.py --resume       # 自动跳过已成功的
#   python scrape_prices.py --debug        # 打印调试日志

import argparse
import json
import os
import signal
import sys

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

from config import (
    TASKS_JSON,
    SCRAPED_JSON,
    DFTTK_URL,
    HEADLESS,
    USER_DATA_DIR,
    VIEWPORT_WIDTH,
    VIEWPORT_HEIGHT,
    SELECTORS,
    STATUS_OK,
    STATUS_NOT_FOUND,
    STATUS_ERROR,
    WAIT_AFTER_SELECTOR_CLICK,
    WAIT_AFTER_SEARCH,
    WAIT_AFTER_WEAPON_SWITCH,
    WAIT_AFTER_LIBRARY_OPEN,
    WAIT_AFTER_LOAD,
    WAIT_AFTER_CLOSE_LIBRARY,
    WAIT_POLL_INTERVAL,
)


# ============================================================
# 全局：中断控制 + 调试开关
# ============================================================

_interrupted = False
_DEBUG = False


def _signal_handler(signum, frame):
    """Ctrl+C 处理器：标记中断，让主循环自己收尾"""
    global _interrupted
    if _interrupted:
        print("\n\n⚠️ 强制退出...")
        sys.exit(1)
    _interrupted = True
    print("\n\n⚠️ 收到中断信号（Ctrl+C），正在保存已抓结果...")
    print("   （再按一次 Ctrl+C 可强制退出）\n")


def dlog(msg):
    """调试日志（只在 --debug 时打印）"""
    if _DEBUG:
        print(f"      [debug] {msg}")


# ============================================================
# 工具
# ============================================================

def load_tasks():
    if not os.path.exists(TASKS_JSON):
        raise FileNotFoundError(
            f"找不到任务文件: {TASKS_JSON}\n"
            f"请先运行 extract_tasks.py"
        )
    with open(TASKS_JSON, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        raise ValueError(f"文件为空: {TASKS_JSON}")
    return json.loads(content)


def load_existing_results():
    """读取已有的 scraped_prices.json（用于断点续跑）"""
    if not os.path.exists(SCRAPED_JSON):
        return []
    try:
        with open(SCRAPED_JSON, "r", encoding="utf-8") as f:
            content = f.read().strip()
        if not content:
            return []
        data = json.loads(content)
        if isinstance(data, list):
            return data
        return []
    except Exception as e:
        print(f"⚠️ 读取已有结果失败（忽略）: {e}")
        return []


def save_results(results):
    """写结果到 scraped_prices.json"""
    with open(SCRAPED_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)


def parse_price(text):
    """'198,552' -> 198552"""
    if not text:
        return None
    cleaned = text.replace(",", "").replace("，", "").strip()
    try:
        return int(cleaned)
    except ValueError:
        return None


def make_result_key(item):
    """给一条结果生成唯一 key（用于续跑去重）"""
    return f"{item.get('weaponId')}_{item.get('configId')}"


# ============================================================
# 页面操作（v4：条件等待版）
# ============================================================

def switch_weapon(page, weapon_name):
    """
    切换武器（条件等待版）
    
    流程：
      1. 点开武器选择器 → 等搜索框出现
      2. 填搜索词 → 等列表过滤出匹配项
      3. 点第一个匹配项 → 等下拉框消失（切换完成）
    """
    dlog(f"switch_weapon: {weapon_name}")

    # ---------- 1. 点开武器选择器 → 等搜索框出现 ----------
    page.locator(SELECTORS["weapon_selector"]).click()
    page.locator(SELECTORS["search_input"]).wait_for(
        state="visible",
        timeout=WAIT_AFTER_SELECTOR_CLICK,
    )

    # ---------- 2. 填入搜索词 → 等列表有匹配项 ----------
    search = page.locator(SELECTORS["search_input"])
    search.fill(weapon_name)   # fill 会自动清空旧内容

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
            arg=weapon_name,
            timeout=WAIT_AFTER_SEARCH,
            polling=WAIT_POLL_INTERVAL,
        )
    except PlaywrightTimeout:
        dlog(f"搜索 '{weapon_name}' 超时，继续尝试点击")

    # ---------- 3. 点第一个匹配的选项 ----------
    option = page.locator(SELECTORS["option_item"]).filter(
        has=page.locator(SELECTORS["option_name"], has_text=weapon_name)
    ).first
    option.click()

    # ---------- 4. 等下拉框消失（说明切换完成） ----------
    try:
        page.locator(SELECTORS["search_input"]).wait_for(
            state="hidden",
            timeout=WAIT_AFTER_WEAPON_SWITCH,
        )
    except PlaywrightTimeout:
        dlog(f"武器切换 '{weapon_name}' 超时（下拉框未消失）")

    dlog(f"switch_weapon 完成: {weapon_name}")


def open_library(page):
    """
    打开方案库（条件等待版）
    
    流程：
      1. 点方案库按钮
      2. 等抽屉出现
      3. 等卡片/空状态渲染完成
    """
    dlog("open_library")

    drawer = page.locator(SELECTORS["drawer"])
    if drawer.count() > 0 and drawer.is_visible():
        dlog("抽屉已打开，跳过")
        return

    page.locator(SELECTORS["library_btn"]).click()

    try:
        drawer.wait_for(
            state="visible",
            timeout=WAIT_AFTER_LIBRARY_OPEN,
        )

        # 再等卡片渲染完成（有卡片或空状态提示）
        try:
            page.wait_for_function(
                """() => {
                    const drawer = document.querySelector('.weapon-loadout-drawer');
                    if (!drawer) return false;
                    const hasCard = drawer.querySelector('.weapon-loadout-card');
                    const hasEmpty = drawer.innerText.includes('还没有保存方案');
                    return hasCard || hasEmpty;
                }""",
                timeout=800,
                polling=WAIT_POLL_INTERVAL,
            )
        except PlaywrightTimeout:
            dlog("方案卡片渲染超时")

        dlog("抽屉已打开")
    except PlaywrightTimeout:
        dlog("打开方案库超时")


def close_library(page, max_retry=2):
    """
    关闭方案库（条件等待版）
    
    优先级：
      1. Escape 键（最稳，不受遮挡影响）
      2. 关闭按钮（force=True）
    
    每次操作后等抽屉消失
    """
    dlog("close_library 开始")

    for attempt in range(max_retry):
        try:
            drawer = page.locator(SELECTORS["drawer"])
            if drawer.count() == 0:
                return True
            if not drawer.is_visible():
                return True

            # ---------- 1. 先按 Escape ----------
            page.keyboard.press("Escape")

            try:
                drawer.wait_for(state="hidden", timeout=WAIT_AFTER_CLOSE_LIBRARY)
                dlog(f"Escape 关闭成功 (attempt={attempt+1})")
                return True
            except PlaywrightTimeout:
                dlog(f"Escape 未关闭 (attempt={attempt+1})")

            # ---------- 2. 用关闭按钮 ----------
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

    dlog("close_library 尝试完毕（可能未成功关闭）")
    return False


def scrape_one(page, task):
    """
    抓单个任务（条件等待版）
    
    流程：
      1. 在方案库里找 "武器名 方案 N" 的卡片（精确匹配）
      2. 读点击前的价格
      3. 点卡片上的"载入"按钮
      4. 等弹窗出现 + 点"载入方案"按钮
      5. 等价格变化
      6. 读总价
    
    返回 status：
      - ok        ：抓取成功
      - not_found ：方案库里没有这个方案（正常跳过）
      - error     ：真失败
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
        dlog(f"查找方案卡片: {scheme_text}")

        # ---------- 1. 找方案卡片（精确匹配 + 超时保护） ----------
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

        # ---------- 2. 读点击前的价格（用于检测变化） ----------
        try:
            old_price_text = page.locator(SELECTORS["price"]).inner_text().strip()
        except Exception:
            old_price_text = ""

        # ---------- 3. 点"载入"按钮 ----------
        dlog("点击'载入'按钮")
        card.locator(SELECTORS["load_btn"]).click()

        # ---------- 4. 等弹窗出现 + 点确认 ----------
        dialog_btn = page.locator(SELECTORS["dialog_confirm_btn"])
        try:
            dialog_btn.wait_for(state="visible", timeout=WAIT_AFTER_LOAD)
            dlog("弹窗出现，点击'载入方案'")
            dialog_btn.click()
        except PlaywrightTimeout:
            dlog("未检测到弹窗（可能不需要确认）")

        # ---------- 5. 等价格变化 ----------
        try:
            page.wait_for_function(
                """(prevPrice) => {
                    const el = document.querySelector('.weapon-builder-total-value strong');
                    if (!el) return false;
                    const cur = el.innerText.trim();
                    return cur !== prevPrice && cur.length > 0;
                }""",
                arg=old_price_text,
                timeout=WAIT_AFTER_LOAD,
                polling=WAIT_POLL_INTERVAL,
            )
            dlog("价格已变化")
        except PlaywrightTimeout:
            dlog("价格未变化或超时，直接读当前值")

        # ---------- 6. 读价格 ----------
        price_text = page.locator(SELECTORS["price"]).inner_text()
        new_price = parse_price(price_text)
        dlog(f"价格: {price_text} → {new_price}")

        if new_price is None:
            result["status"] = STATUS_ERROR
            result["error"] = f"价格解析失败: {price_text}"
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
# 参数解析
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="从 dfttk.com 抓取武器价格",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python scrape_prices.py                  从头抓\n"
            "  python scrape_prices.py --start 10       从第 10 条开始\n"
            "  python scrape_prices.py --resume         跳过已成功抓过的\n"
            "  python scrape_prices.py --debug          打印调试日志\n"
        ),
    )
    parser.add_argument(
        "--start", type=int, default=0,
        help="从第 N 条任务开始抓（0-based，默认 0）",
    )
    parser.add_argument(
        "--resume", action="store_true",
        help="自动跳过已成功抓过的任务（用 scraped_prices.json 判断）",
    )
    parser.add_argument(
        "--save-every", type=int, default=5,
        help="每抓 N 条自动保存一次（默认 5）",
    )
    parser.add_argument(
        "--max-consecutive-fail", type=int, default=5,
        help="连续失败 N 次自动暂停（默认 5，0 = 不暂停）",
    )
    parser.add_argument(
        "--debug", action="store_true",
        help="打印详细调试日志",
    )
    return parser.parse_args()


# ============================================================
# 主流程
# ============================================================

def main():
    global _DEBUG

    args = parse_args()
    _DEBUG = args.debug

    # 注册 Ctrl+C 处理器
    signal.signal(signal.SIGINT, _signal_handler)
    if hasattr(signal, "SIGBREAK"):
        signal.signal(signal.SIGBREAK, _signal_handler)

    # ---------- 1. 读任务 ----------
    tasks = load_tasks()
    total = len(tasks)
    print(f"共 {total} 个任务")

    # ---------- 2. 断点续跑 ----------
    existing = load_existing_results()
    already_done = set()
    if existing:
        print(f"检测到已有结果: {len(existing)} 条")
        if args.resume or len(existing) > 0:
            for item in existing:
                if item.get("status") == STATUS_OK:
                    already_done.add(make_result_key(item))
            if already_done:
                print(f"其中成功的: {len(already_done)} 条")

    # 过滤待抓
    todo_tasks = []
    for i, task in enumerate(tasks):
        if i < args.start:
            continue
        if make_result_key(task) in already_done:
            continue
        todo_tasks.append((i, task))

    print(f"待抓: {len(todo_tasks)} 条")
    if len(todo_tasks) == 0:
        print("✅ 没有待抓任务")
        return

    # ---------- 3. 启动浏览器（持久化上下文） ----------
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    results = list(existing)
    todo_keys = {make_result_key(t) for _, t in todo_tasks}
    results = [r for r in results if make_result_key(r) not in todo_keys]

    # 会话统计
    consecutive_fail = 0
    saved_count = 0
    session_ok = 0
    session_skip = 0
    session_fail = 0

    print()
    print(f"📁 用户数据目录: {USER_DATA_DIR}")
    print(f"   首次运行请在此浏览器里登录/配置方案")
    if _DEBUG:
        print(f"   🔧 调试模式已开启")
    print()

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=USER_DATA_DIR,
            headless=HEADLESS,
            viewport={"width": VIEWPORT_WIDTH, "height": VIEWPORT_HEIGHT},
            args=["--disable-blink-features=AutomationControlled"],
        )

        page = context.pages[0] if context.pages else context.new_page()

        try:
            page.goto(DFTTK_URL)
            page.wait_for_load_state("networkidle")

            # ---------- 暂停，等用户准备 ----------
            print("=" * 60)
            print("  请确认：")
            print("  1. 页面已完全加载")
            print("  2. 已登录（如果需要）")
            print("  3. 已切换到「烽火地带」模式")
            print("  4. 方案库里能看到你的方案")
            print()
            print("  首次运行：请在浏览器里配置好方案再继续")
            print("  非首次：直接回车即可")
            print("=" * 60)

            try:
                input("\n完成后按回车开始抓取（或直接关闭窗口退出）...\n")
            except (KeyboardInterrupt, EOFError):
                print("\n⚠️ 用户取消，退出")
                context.close()
                return

            # ---------- 主循环 ----------
            current_weapon = None

            for order, (orig_idx, task) in enumerate(todo_tasks):
                if _interrupted:
                    break

                weapon_name = task["weaponName"]
                config_id = task["configId"]

                progress = f"[{order+1}/{len(todo_tasks)}]"

                # ---------- 切换武器 ----------
                if weapon_name != current_weapon:
                    print(f"{progress} 切换武器 → {weapon_name}")
                    try:
                        switch_weapon(page, weapon_name)
                        current_weapon = weapon_name
                    except Exception as e:
                        print(f"  ⚠️ 切换失败: {e}")
                        print(f"  请手动切换到 {weapon_name}")
                        try:
                            input("  完成后按回车继续（Ctrl+C 中断）...")
                        except (KeyboardInterrupt, EOFError):
                            break

                # ---------- 打开方案库 ----------
                try:
                    open_library(page)
                except Exception as e:
                    print(f"  ⚠️ 打开方案库失败: {e}")

                # ---------- 抓取 ----------
                print(f"  抓取 {weapon_name} {config_id} (方案 {task['schemeIndex']}) ...")
                result = scrape_one(page, task)

                # 去重
                key = make_result_key(result)
                results = [r for r in results if make_result_key(r) != key]
                results.append(result)

                # ---------- 状态分类 ----------
                if result["status"] == STATUS_OK:
                    status_icon = "✅"
                    consecutive_fail = 0
                    session_ok += 1
                    price_str = f"{result['newPrice']:,}" if result["newPrice"] else "-"
                    print(f"    {status_icon} ok {price_str}")

                elif result["status"] == STATUS_NOT_FOUND:
                    status_icon = "⏭️"
                    session_skip += 1
                    print(f"    {status_icon} 方案库里没有，跳过")

                else:
                    status_icon = "❌"
                    consecutive_fail += 1
                    session_fail += 1
                    print(f"    {status_icon} error")
                    if result.get("error"):
                        print(f"       └─ {result['error']}")

                # ---------- 关闭方案库 ----------
                try:
                    closed = close_library(page)
                    if not closed:
                        dlog("⚠️ close_library 返回未关闭")
                except Exception as e:
                    dlog(f"close_library 异常: {e}")

                # ---------- 中间保存 ----------
                if (order + 1) % args.save_every == 0:
                    save_results(results)
                    saved_count += 1

                # ---------- 连续失败保护 ----------
                if args.max_consecutive_fail > 0 and consecutive_fail >= args.max_consecutive_fail:
                    print()
                    print(f"⚠️ 连续失败 {consecutive_fail} 次，自动暂停")
                    print(f"   当前会话：成功 {session_ok}，跳过 {session_skip}，失败 {session_fail}")
                    print(f"   已自动保存结果，可重新运行续跑")
                    print()
                    try:
                        choice = input("输入 c 继续，其他键中断（Ctrl+C 也行）: ").strip().lower()
                        if choice != "c":
                            break
                        consecutive_fail = 0
                    except (KeyboardInterrupt, EOFError):
                        break

        finally:
            if results:
                save_results(results)
                print(f"\n💾 已保存结果到: {SCRAPED_JSON}")

            try:
                context.close()
            except Exception:
                pass

    # ---------- 汇总 ----------
    ok = sum(1 for r in results if r["status"] == STATUS_OK)
    not_found = sum(1 for r in results if r["status"] == STATUS_NOT_FOUND)
    error = sum(1 for r in results if r["status"] == STATUS_ERROR)

    print()
    print("=" * 50)
    if _interrupted:
        print("⚠️ 运行被中断")
    else:
        print("✅ 运行完成")
    print(f"   本次会话：成功 {session_ok}，跳过 {session_skip}，失败 {session_fail}")
    print(f"   累计结果：成功 {ok}，跳过 {not_found}，失败 {error}")
    print(f"   结果文件: {SCRAPED_JSON}")
    print("=" * 50)

    if _interrupted:
        print("\n💡 恢复方法：")
        print("   重新运行  python scrape_prices.py --resume")
        print("   会自动跳过已成功的任务")


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    main()