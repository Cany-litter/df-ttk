# tools/merge_hit_rate.py
#
# 把 _hit_rate.json 里的命中率和开镜速度回写到 public/data.json
#
# 回写字段：
#   - configs[].hitRate  = [30m, 50m, 100m]（小数，如 [0.85, 0.72, 0.55]）
#   - configs[].aimSpeed = 开镜时间（ms，整数）
#
# 匹配方式：
#   按 (weaponId, configId) 匹配 data.json 的 prices[].configs[]
#
# 流程：
#   1. 读 recoil_results/_hit_rate.json
#   2. 读 public/data.json
#   3. 逐条匹配，写入 hitRate / aimSpeed（非空才写）
#   4. 备份 data.json → data.json.bak + 时间戳备份
#   5. 写回 data.json，更新 updatedAt
#
# 用法：
#   python merge_hit_rate.py
#   python merge_hit_rate.py --dry-run
#   python merge_hit_rate.py --hit-rate path/to/_hit_rate.json

import argparse
import json
import os
import shutil
import sys
from datetime import datetime

from config import DATA_JSON, DATA_BAK, RECOIL_OUTPUT_DIR

HIT_RATE_JSON = os.path.join(RECOIL_OUTPUT_DIR, "_hit_rate.json")


# ============================================================
# 备份
# ============================================================

def _backup():
    shutil.copy2(DATA_JSON, DATA_BAK)
    print(f"✅ 已备份: {DATA_BAK}")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    timestamped = f"{DATA_BAK}.{ts}.bak"
    shutil.copy2(DATA_JSON, timestamped)
    print(f"✅ 已备份: {timestamped}")


# ============================================================
# 格式化
# ============================================================

def _fmt_arr(arr):
    if arr is None:
        return "无"
    return "[" + ", ".join(
        f"{v:.2f}" if isinstance(v, (int, float)) else str(v)
        for v in arr
    ) + "]"


def _fmt_aim(v):
    if v is None:
        return "无"
    return str(v)


# ============================================================
# 主流程
# ============================================================

def run(hit_rate_path, dry_run=False):
    # ---------- 读 _hit_rate.json ----------
    print(f"读取命中率文件: {hit_rate_path}")
    if not os.path.exists(hit_rate_path):
        print(f"❌ 找不到 {hit_rate_path}")
        print(f"   请先运行: python update_recoil.py")
        sys.exit(1)

    try:
        with open(hit_rate_path, "r", encoding="utf-8") as f:
            hit_data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ 解析 {hit_rate_path} 失败: {e}")
        sys.exit(1)

    weapons_hr = hit_data.get("weapons", [])
    if not weapons_hr:
        print(f"❌ {hit_rate_path} 里没有 weapons 数据")
        sys.exit(1)
    print(f"  共 {len(weapons_hr)} 条记录")

    # ---------- 读 data.json ----------
    print(f"读取数据文件: {DATA_JSON}")
    if not os.path.exists(DATA_JSON):
        print(f"❌ 找不到 {DATA_JSON}")
        sys.exit(1)

    try:
        with open(DATA_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"❌ 解析 {DATA_JSON} 失败: {e}")
        sys.exit(1)

    prices = data.get("prices", [])
    if not prices:
        print(f"❌ {DATA_JSON} 里没有 prices 数据")
        sys.exit(1)

    # 建 weaponId → entry 的映射
    price_map = {}
    for entry in prices:
        wid = entry.get("weaponId")
        if wid is not None:
            price_map[wid] = entry

    # ---------- 匹配 + 写入 ----------
    print()
    print("=" * 100)
    print("命中率 + 开镜速度 回写明细")
    print("=" * 100)

    updated = 0
    skipped = 0
    not_found = 0

    # 计数
    count_hit_rate = 0
    count_aim_speed = 0

    for w in weapons_hr:
        weapon_id = w.get("weaponId")
        config_id = w.get("configId")
        weapon_name = w.get("weaponName", "未知武器")

        if weapon_id is None or not config_id:
            print(f"  ⏭️ {weapon_name} (id={weapon_id}): "
                  f"缺 weaponId 或 configId")
            skipped += 1
            continue

        entry = price_map.get(weapon_id)
        if not entry:
            print(f"  ❌ {weapon_name} {config_id}: "
                  f"data.json 里找不到 weaponId={weapon_id}")
            not_found += 1
            continue

        target = None
        for cfg in entry.get("configs", []):
            if cfg.get("id") == config_id:
                target = cfg
                break

        if not target:
            print(f"  ❌ {weapon_name} {config_id}: "
                  f"data.json 里找不到该配置")
            not_found += 1
            continue

        # ---------- hitRate ----------
        hr = w.get("hitRate", {})
        hr_30 = hr.get("30")
        hr_50 = hr.get("50")
        hr_100 = hr.get("100")

        has_hit_rate = (hr_30 is not None
                        and hr_50 is not None
                        and hr_100 is not None)
        new_hit_rate = [hr_30, hr_50, hr_100] if has_hit_rate else None

        # ---------- aimSpeed ----------
        new_aim_speed = w.get("aimSpeed")
        has_aim_speed = new_aim_speed is not None

        # 两个都没有，跳过
        if not has_hit_rate and not has_aim_speed:
            print(f"  ⏭️ {weapon_name} {config_id}: "
                  f"hitRate 和 aimSpeed 都为空，跳过")
            skipped += 1
            continue

        # 打印对比
        old_hit_rate = target.get("hitRate")
        old_aim_speed = target.get("aimSpeed")

        parts = []
        if has_hit_rate:
            parts.append(
                f"hitRate {_fmt_arr(old_hit_rate)} → {_fmt_arr(new_hit_rate)}")
        if has_aim_speed:
            parts.append(
                f"aimSpeed {_fmt_aim(old_aim_speed)} → {_fmt_aim(new_aim_speed)}")

        print(f"  ✅ {weapon_name} {config_id}: " + "  |  ".join(parts))

        # 写入
        if not dry_run:
            if has_hit_rate:
                target["hitRate"] = new_hit_rate
            if has_aim_speed:
                target["aimSpeed"] = new_aim_speed

        if has_hit_rate:
            count_hit_rate += 1
        if has_aim_speed:
            count_aim_speed += 1
        updated += 1

    # ---------- 写回 ----------
    print()
    if not dry_run and updated > 0:
        today = datetime.now().strftime("%Y-%m-%d")
        old_updated = data.get("updatedAt", "")
        data["updatedAt"] = today
        if old_updated != today:
            print(f"📅 updatedAt: {old_updated} → {today}")

        _backup()

        with open(DATA_JSON, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 已写入 {DATA_JSON}")
    elif dry_run:
        print("🔍 dry-run 模式：未写入文件")
    else:
        print("⚠️ 没有更新任何配置")

    print()
    print("=" * 100)
    tag = "[dry-run] " if dry_run else ""
    print(f"{tag}✅ 完成：")
    print(f"     更新配置 {updated} 条")
    print(f"     其中 hitRate  {count_hit_rate} 条")
    print(f"     其中 aimSpeed {count_aim_speed} 条")
    print(f"     跳过 {skipped}，未找到 {not_found}")
    print("=" * 100)


# ============================================================
# 入口
# ============================================================

def parse_args():
    p = argparse.ArgumentParser(
        description="把 _hit_rate.json 回写到 data.json（hitRate + aimSpeed）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "示例:\n"
            "  python merge_hit_rate.py\n"
            "  python merge_hit_rate.py --dry-run\n"
            "  python merge_hit_rate.py --hit-rate path/to/_hit_rate.json\n"
        ),
    )
    p.add_argument("--hit-rate", type=str, default=HIT_RATE_JSON,
                   help=f"_hit_rate.json 路径（默认 {HIT_RATE_JSON}）")
    p.add_argument("--dry-run", action="store_true",
                   help="只打印，不写入 data.json")
    return p.parse_args()


def main():
    args = parse_args()
    run(hit_rate_path=args.hit_rate, dry_run=args.dry_run)


if __name__ == "__main__":
    main()