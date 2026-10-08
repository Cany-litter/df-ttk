# tools/open_browser.py
#
# 临时打开浏览器，用于手动配置 dfttk 方案库。
# 全屏启动，关闭后 profile 保留。
#
# 用法：
#   python open_browser.py
#
# 关闭：直接关浏览器窗口，或 Ctrl+C。

import os
import sys

from playwright.sync_api import sync_playwright

from config import (
    USER_DATA_DIR,
    DFTTK_URL,
)


def main():
    os.makedirs(USER_DATA_DIR, exist_ok=True)

    pw = sync_playwright().start()
    context = pw.chromium.launch_persistent_context(
        user_data_dir=USER_DATA_DIR,
        headless=False,
        viewport=None,                    # ← 取消固定视口
        no_viewport=True,                 # ← 用系统窗口尺寸
        args=[
            "--disable-blink-features=AutomationControlled",
            "--start-maximized",          # ← 启动最大化
        ],
    )

    page = context.pages[0] if context.pages else context.new_page()
    page.goto(DFTTK_URL, wait_until="commit")

    print()
    print("=" * 70)
    print("  浏览器已全屏打开。")
    print("=" * 70)
    print("  你可以：")
    print("    - 登录 dfttk.com（如需要）")
    print("    - 切换到「烽火地带」模式")
    print("    - 在方案库里添加/修改/删除方案")
    print()
    print("  配置完成后：")
    print("    - 直接关闭浏览器窗口，或")
    print("    - 按 Ctrl+C 退出本脚本")
    print("=" * 70)
    print()

    try:
        # 等浏览器关闭
        while True:
            try:
                # 检查 context 是否还活着
                _ = context.pages
                page.wait_for_timeout(1000)
            except Exception:
                break
    except KeyboardInterrupt:
        print("\n⚠️ 收到 Ctrl+C，关闭浏览器...")

    try:
        context.close()
    except Exception:
        pass
    try:
        pw.stop()
    except Exception:
        pass

    print("✅ 浏览器已关闭，profile 已保存。")


if __name__ == "__main__":
    main()