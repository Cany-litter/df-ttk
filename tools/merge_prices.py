# tools/merge_prices.py
#
# 阶段3：把抓取结果合并回 public/data.json
#
# 输入：tools/scraped_prices.json + public/data.json
# 输出：public/data.json（原地更新）
#
# 安全措施：
#   - 只更新 status === "ok" 的条目
#   - 更新前自动备份 data.json → data.json.bak（最新的会覆盖旧的）
#   - 打印每个配置的旧价格 → 新价格
#   - 自动更新 data.json 顶层的 updatedAt 字段
#
# ⭐ v3 改进：
#   - 价格规整到整万（281635 → 280000）
#   - 打印"原始价 → 规整价"便于核对
#
# ⭐ v2 已有：
#   - 常量统一从 config.py 引入
#   - 备份文件加时间戳，避免多次运行互相覆盖
#   - 增加 "武器找不到" / "配置找不到" 的清晰报错

import json
import os
import shutil
from datetime import datetime

from config import (
    DATA_JSON,
    DATA_BAK,
    SCRAPED_JSON,
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


def round_to_wan(price, unit=10000):
    """
    ⭐ v3：把价格规整到最接近的整万

    示例：
      281635 → 280000
      234860 → 230000
      316946 → 320000
      316946 → 320000

    @param {number} price - 原始价格
    @param {number} unit  - 单位（默认 10000，即 1W）
    @returns {number} 规整后的价格
    """
    if price is None or price < 0:
        return price
    return round(price / unit) * unit


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

def merge_prices():
    # ---------- 1. 读输入 ----------
    print(f"读取抓取结果: {SCRAPED_JSON}")
    scraped = load_json(SCRAPED_JSON)

    if not isinstance(scraped, list) or len(scraped) == 0:
        print("⚠️ scraped_prices.json 为空，无需更新")
        return

    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)

    if not isinstance(data, dict):
        raise ValueError("data.json 格式错误，应为 JSON 对象")

    # ---------- 2. 备份 ----------
    backup_data_json()

    # ---------- 3. 构建索引：weaponId → price_entry ----------
    prices = data.get("prices", [])
    price_map = {p.get("weaponId"): p for p in prices if p.get("weaponId") is not None}

    # ---------- 4. 遍历抓取结果，逐个更新 ----------
    updated = 0
    skipped = 0
    not_found = 0
    rounded_count = 0

    print()
    print("=" * 70)
    print("价格更新明细")
    print("=" * 70)

    for item in scraped:
        weapon_id = item.get("weaponId")
        config_id = item.get("configId")
        weapon_name = item.get("weaponName", "未知武器")
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

        # 找 weaponId
        price_entry = price_map.get(weapon_id)
        if not price_entry:
            print(f"  ❌ {weapon_name}（{weapon_id}）在 data.json 里找不到")
            not_found += 1
            continue

        # 找 configId
        configs = price_entry.get("configs", [])
        target_config = None
        for cfg in configs:
            if cfg.get("id") == config_id:
                target_config = cfg
                break

        if not target_config:
            print(f"  ❌ {weapon_name} {config_id} 在 data.json 里找不到")
            not_found += 1
            continue

        # ---------- ⭐ 价格规整到整万 ----------
        rounded_price = round_to_wan(new_price)
        if rounded_price != new_price:
            rounded_count += 1

        # 更新价格
        old_price = safe_int(target_config.get("price"), default=0)
        target_config["price"] = rounded_price

        diff = rounded_price - old_price
        diff_str = f"+{diff}" if diff >= 0 else str(diff)

        # 打印（规整了的显示原始价）
        if rounded_price != new_price:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded_price:>8} ({diff_str})  "
                  f"[抓取 {new_price} → 规整 {rounded_price}]")
        else:
            print(f"  ✅ {weapon_name} {config_id}: "
                  f"{old_price:>8} → {rounded_price:>8} ({diff_str})")

        updated += 1

    # ---------- 5. 更新 updatedAt ----------
    today = datetime.now().strftime("%Y-%m-%d")
    old_updated_at = data.get("updatedAt", "")
    data["updatedAt"] = today
    if old_updated_at != today:
        print()
        print(f"📅 updatedAt: {old_updated_at} → {today}")

    # ---------- 6. 写回 data.json ----------
    save_json(DATA_JSON, data)

    # ---------- 7. 汇总 ----------
    print()
    print("=" * 70)
    print(f"✅ 完成：更新 {updated} 个，跳过 {skipped} 个，未找到 {not_found} 个")
    if rounded_count > 0:
        print(f"   💰 其中 {rounded_count} 个价格被规整到整万")
    print(f"   数据文件: {DATA_JSON}")
    print(f"   备份文件: {DATA_BAK}")
    print("=" * 70)


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    merge_prices()