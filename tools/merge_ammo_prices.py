# tools/merge_ammo_prices.py
#
# 阶段3：把抓取到的子弹价格合并回 public/data.json
#
# 输入：tools/ammo_scraped.json + public/data.json
# 输出：public/data.json（原地更新 bullets[].price）
#
# ⭐ 与武器价格合并（merge_prices.py）的差异：
#   - 子弹价格【不规整】：6954 → 6954（武器整枪价格才规整到整万）
#   - 子弹价格更新在 data.json 的 bullets 数组里（不是 prices）
#   - 【不更新】顶层 updatedAt（那是整枪价格的日期，子弹价格独立）
#
# 安全措施：
#   - 只更新 status === "ok" 的条目
#   - 更新前自动备份 data.json → data.json.bak（覆盖）
#   - 同时生成时间戳备份（保留历史）
#   - 打印每颗子弹的 旧价 → 新价
#
# 用法：
#   cd tools
#   python merge_ammo_prices.py
#
#   python merge_ammo_prices.py --dry-run   # 只打印不写入

import argparse
import json
import os
import shutil
from datetime import datetime

from config import (
    DATA_JSON,
    DATA_BAK,
    AMMO_SCRAPED_JSON,
    STATUS_OK,
)


# ============================================================
# 工具
# ============================================================

def load_json(path):
    """读 JSON 文件，空文件返回空列表"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"找不到文件: {path}")

    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()

    if not content:
        print(f"⚠️ 文件为空: {path}")
        return []

    try:
        return json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON 解析失败: {path}\n{e}")


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def safe_int(value, default=0):
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def backup_data_json():
    """
    备份 data.json
    - 固定名称：data.json.bak（覆盖）
    - 时间戳备份：data.json.YYYYMMDD_HHMMSS.bak（保留历史）
    """
    shutil.copy2(DATA_JSON, DATA_BAK)
    print(f"✅ 已备份原文件到: {DATA_BAK}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped = f"{DATA_BAK}.{ts}.bak"
    shutil.copy2(DATA_JSON, timestamped)
    print(f"✅ 已备份时间戳版本: {timestamped}")


# ============================================================
# 主逻辑
# ============================================================

def merge_ammo_prices(dry_run=False):
    # ---------- 1. 读输入 ----------
    print(f"读取抓取结果: {AMMO_SCRAPED_JSON}")
    scraped = load_json(AMMO_SCRAPED_JSON)

    if not isinstance(scraped, list) or len(scraped) == 0:
        print("⚠️ ammo_scraped.json 为空，无需更新")
        return

    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)

    if not isinstance(data, dict):
        raise ValueError("data.json 格式错误，应为 JSON 对象")

    # ---------- 2. 备份（dry-run 跳过） ----------
    if not dry_run:
        backup_data_json()
    else:
        print("🔍 dry-run 模式：跳过备份")

    # ---------- 3. 构建索引：bulletId → bullet 对象 ----------
    bullets = data.get("bullets", [])
    if not bullets:
        print("⚠️ data.json 里没有 bullets 数据")
        return

    bullet_map = {b.get("id"): b for b in bullets if b.get("id") is not None}

    # ---------- 4. 遍历抓取结果，逐个更新 ----------
    updated = 0
    skipped = 0
    not_found = 0

    print()
    print("=" * 70)
    print("子弹价格更新明细")
    print("=" * 70)

    for item in scraped:
        bullet_id = item.get("bulletId")
        status = item.get("status")
        new_price = item.get("newPrice")

        # 只处理 status === "ok"
        if status != STATUS_OK:
            skipped += 1
            continue

        # newPrice 必须是有效整数
        if new_price is None:
            skipped += 1
            continue

        new_price = safe_int(new_price, default=None)
        if new_price is None or new_price < 0:
            skipped += 1
            continue

        # 找 bulletId
        if not bullet_id:
            skipped += 1
            continue

        target_bullet = bullet_map.get(bullet_id)
        if not target_bullet:
            print(f"  ❌ {bullet_id} 在 data.json 里找不到")
            not_found += 1
            continue

        # ---------- 更新价格（不规整） ----------
        old_price = safe_int(target_bullet.get("price"), default=0)
        target_bullet["price"] = new_price

        diff = new_price - old_price
        diff_str = f"+{diff}" if diff >= 0 else str(diff)

        # 展示用的名称
        caliber = target_bullet.get("caliber", "")
        name = target_bullet.get("name", "")
        matched_by = item.get("matchedBy", "")

        display_name = f"{caliber} {name}".strip() or bullet_id

        # 命中候选名不同时，显示 matchedBy（便于排查）
        extra = ""
        if matched_by and matched_by != display_name:
            extra = f"  [matchedBy: {matched_by}]"

        print(f"  ✅ {display_name} ({bullet_id}): "
              f"{old_price:>7} → {new_price:>7} ({diff_str}){extra}")

        updated += 1

    # ---------- 5. 写回 data.json ----------
    if not dry_run:
        save_json(DATA_JSON, data)
        print()
        print("💾 已写入 data.json")
    else:
        print()
        print("🔍 dry-run 模式：未写入文件")

    # ---------- 6. 汇总 ----------
    print()
    print("=" * 70)
    if dry_run:
        print(f"🔍 [dry-run] 会更新 {updated} 个，跳过 {skipped} 个，未找到 {not_found} 个")
    else:
        print(f"✅ 完成：更新 {updated} 个，跳过 {skipped} 个，未找到 {not_found} 个")
    print(f"   数据文件: {DATA_JSON}")
    if not dry_run:
        print(f"   备份文件: {DATA_BAK}")
    print("=" * 70)


# ============================================================
# 参数解析
# ============================================================

def parse_args():
    parser = argparse.ArgumentParser(
        description="把抓取到的子弹价格合并回 data.json",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python merge_ammo_prices.py             实际写入\n"
            "  python merge_ammo_prices.py --dry-run   只打印不写入\n"
        ),
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="只打印更新明细，不写入文件（也不备份）",
    )
    return parser.parse_args()


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    args = parse_args()
    merge_ammo_prices(dry_run=args.dry_run)