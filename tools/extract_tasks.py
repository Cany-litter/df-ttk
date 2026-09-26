# tools/extract_tasks.py
#
# 阶段1：从 public/data.json 提取价格抓取任务清单
#
# 输入：public/data.json
# 输出：tools/tasks.json
#
# 输出格式：
# [
#   {
#     "weaponId": 41,
#     "weaponName": "腾龙",
#     "configId": "#1",
#     "schemeIndex": 1,
#     "barrel": "新式蛟龙战术长枪管",
#     "muzzle": "先进/轻语/勇火",
#     "oldPrice": 440000,
#     "enabled": true
#   },
#   ...
# ]
#
# ⭐ 重构（v2）：
#   - 常量统一从 config.py 引入
#   - 修复 schemeIndex 为空的容错（跳过而不是照跑）
#
# ⭐ v2.1：
#   - 只提取 enabled !== false 的配置（跳过禁用的）

import json
import os
import re

from config import DATA_JSON, TASKS_JSON


# ============================================================
# 工具
# ============================================================

def extract_scheme_index(config_id):
    """
    从 configId 提取方案编号。
    "#1" -> 1
    "#12" -> 12
    提取不到 -> None
    """
    if not config_id:
        return None
    match = re.search(r"#(\d+)", str(config_id))
    if not match:
        return None
    return int(match.group(1))


def safe_str(value, default="无"):
    """空值兜底为默认字符串"""
    if value is None:
        return default
    s = str(value).strip()
    return s if s else default


def safe_int(value, default=0):
    """空值/非数字兜底为默认整数"""
    if value is None:
        return default
    try:
        return int(value)
    except (ValueError, TypeError):
        return default


def load_json(path):
    if not os.path.exists(path):
        raise FileNotFoundError(f"找不到数据文件: {path}")
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        raise ValueError(f"文件为空: {path}")
    return json.loads(content)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


# ============================================================
# 主逻辑
# ============================================================

def extract_tasks():
    # ---------- 1. 读 data.json ----------
    data = load_json(DATA_JSON)

    prices = data.get("prices", [])
    if not prices:
        print("⚠️ data.json 里没有 prices 数据")
        return []

    # ---------- 2. 遍历 prices，提取任务 ----------
    tasks = []
    skipped_no_id = 0
    skipped_no_config = 0
    skipped_no_scheme = 0
    skipped_disabled = 0        # ⭐ v2.1：禁用的配置

    for price_entry in prices:
        weapon_id = price_entry.get("weaponId")
        weapon_name = safe_str(price_entry.get("weaponName"), default="未知武器")

        if weapon_id is None:
            print(f"⚠️ 跳过无 weaponId 的条目: {weapon_name}")
            skipped_no_id += 1
            continue

        configs = price_entry.get("configs", [])
        if not configs:
            print(f"⚠️ {weapon_name}（{weapon_id}）没有配置")
            continue

        for config in configs:
            config_id = config.get("id")
            if not config_id:
                print(f"⚠️ {weapon_name} 有配置缺少 id，跳过")
                skipped_no_config += 1
                continue

            # ⭐ v2.1：跳过已禁用的配置
            if config.get("enabled") is False:
                skipped_disabled += 1
                continue

            scheme_index = extract_scheme_index(config_id)

            # 修复：schemeIndex 为空时跳过（避免爬虫拼出"方案 None"）
            if scheme_index is None:
                print(f"⚠️ {weapon_name} {config_id} 无法提取方案编号，跳过")
                skipped_no_scheme += 1
                continue

            task = {
                "weaponId": weapon_id,
                "weaponName": weapon_name,
                "configId": config_id,
                "schemeIndex": scheme_index,
                "barrel": safe_str(config.get("barrel"), default="无"),
                "muzzle": safe_str(config.get("muzzle"), default="无"),
                "oldPrice": safe_int(config.get("price"), default=0),
                "enabled": True,   # ⭐ 走到这里的都是启用的
            }
            tasks.append(task)

    # ---------- 3. 写 tasks.json ----------
    save_json(TASKS_JSON, tasks)

    # ---------- 4. 汇总 ----------
    print()
    print("=" * 50)
    print(f"✅ 已提取 {len(tasks)} 个任务")
    if skipped_no_id:
        print(f"   跳过（无 weaponId）: {skipped_no_id}")
    if skipped_no_config:
        print(f"   跳过（无 configId）: {skipped_no_config}")
    if skipped_no_scheme:
        print(f"   跳过（无 schemeIndex）: {skipped_no_scheme}")
    if skipped_disabled:                                            # ⭐ v2.1
        print(f"   跳过（已禁用）: {skipped_disabled}")              # ⭐ v2.1
    print(f"   输出: {TASKS_JSON}")
    print("=" * 50)

    # 按武器分组统计
    weapon_count = len(set(t["weaponId"] for t in tasks))
    print(f"\n共 {weapon_count} 把武器")

    # 打印前 5 条示例
    if tasks:
        print("\n前 5 条示例:")
        for t in tasks[:5]:
            print(f"  {t['weaponName']} {t['configId']} "
                  f"(方案 {t['schemeIndex']}) "
                  f"枪管={t['barrel']} 枪口={t['muzzle']} "
                  f"旧价={t['oldPrice']}")

    return tasks


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    extract_tasks()