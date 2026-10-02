# tools/extract_ammo_tasks.py
#
# 阶段1：从 public/data.json 提取子弹价格抓取任务清单
#
# 输入：public/data.json
# 输出：tools/ammo_tasks.json
#
# 输出格式：
# [
#   {
#     "bulletId": "5.56x45mm#5",
#     "caliber": "5.56x45mm",
#     "name": "M995",
#     "level": 5,
#     "candidates": [
#       "5.56x45mm M995",       # 标准：口径 + 空格 + 名称
#       "5.56x45mm_5",           # 兜底：口径 + _ + 等级
#       "M995"                   # 兜底：仅名称
#     ],
#     "oldPrice": 5317
#   },
#   ...
# ]
#
# ⭐ 匹配策略（三层兜底）：
#   1. `${caliber} ${name}`   —— 标准格式（对齐 orzice 显示）
#   2. `${caliber}_${level}`  —— 某些口径（如 .300BLK）在 orzice 上用数字后缀
#   3. `${name}`              —— 某些特殊口径（如 Arrow）只显示名称
#
# ⭐ 与其他脚本的关系：
#   - 只读 data.json，不修改
#   - 输出 ammo_tasks.json 供 scrape_ammo_prices.py 消费
#
# 用法：
#   cd tools
#   python extract_ammo_tasks.py

import json
import os

from config import DATA_JSON, AMMO_TASKS_JSON


# ============================================================
# 工具
# ============================================================

def safe_str(value, default=""):
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
# 候选名生成（核心）
# ============================================================

def build_candidates(caliber, name, level):
    """
    为子弹生成"候选显示名"列表（按优先级排序）

    orzice 上的显示名可能有多种格式：
      1. `5.56x45mm M995`      —— 口径 + 空格 + 名称（最常见）
      2. `.300BLK_5`           —— 口径 + _ + 等级（少数）
      3. `碳纤维穿甲箭矢`       —— 仅名称（Arrow 等特殊口径）

    依次尝试，第一个命中的就是它。

    @param {string} caliber - 口径（如 "5.56x45mm" / ".45 ACP"）
    @param {string} name    - 名称（如 "M995" / "Super"）
    @param {int}    level   - 等级（1~5）
    @returns {list<string>} 候选列表（去掉空/重复）
    """
    candidates = []

    # ---------- ① 标准：口径 + 空格 + 名称 ----------
    if caliber and name:
        candidates.append(f"{caliber} {name}")

    # ---------- ② 兜底：口径 + _ + 等级 ----------
    if caliber and level is not None:
        candidates.append(f"{caliber}_{level}")

    # ---------- ③ 兜底：仅名称 ----------
    if name:
        candidates.append(name)

    # 去重 + 去空 + 保持顺序
    seen = set()
    result = []
    for c in candidates:
        c = c.strip()
        if not c:
            continue
        if c in seen:
            continue
        seen.add(c)
        result.append(c)

    return result


# ============================================================
# 主逻辑
# ============================================================

def extract_ammo_tasks():
    # ---------- 1. 读 data.json ----------
    print(f"读取数据文件: {DATA_JSON}")
    data = load_json(DATA_JSON)

    bullets = data.get("bullets", [])
    if not bullets:
        print("⚠️ data.json 里没有 bullets 数据")
        return []

    print(f"共 {len(bullets)} 颗子弹")

    # ---------- 2. 遍历 bullets，生成任务 ----------
    tasks = []
    skipped_no_id = 0
    skipped_no_caliber = 0
    skipped_no_name = 0

    for bullet in bullets:
        bullet_id = bullet.get("id")
        caliber = safe_str(bullet.get("caliber"))
        name = safe_str(bullet.get("name"))
        level = bullet.get("level")
        old_price = safe_int(bullet.get("price"), default=0)

        # ---------- 校验 ----------
        if not bullet_id:
            print(f"⚠️ 跳过无 id 的子弹: {bullet}")
            skipped_no_id += 1
            continue

        if not caliber:
            print(f"⚠️ {bullet_id} 缺 caliber，跳过")
            skipped_no_caliber += 1
            continue

        if not name:
            print(f"⚠️ {bullet_id} 缺 name，跳过")
            skipped_no_name += 1
            continue

        # ---------- 生成候选列表 ----------
        candidates = build_candidates(caliber, name, level)

        if not candidates:
            print(f"⚠️ {bullet_id} 无法生成候选名，跳过")
            continue

        task = {
            "bulletId": bullet_id,
            "caliber": caliber,
            "name": name,
            "level": level,
            "candidates": candidates,
            "oldPrice": old_price,
        }
        tasks.append(task)

    # ---------- 3. 写 ammo_tasks.json ----------
    save_json(AMMO_TASKS_JSON, tasks)

    # ---------- 4. 汇总 ----------
    print()
    print("=" * 60)
    print(f"✅ 已提取 {len(tasks)} 个子弹任务")
    if skipped_no_id:
        print(f"   跳过（无 id）: {skipped_no_id}")
    if skipped_no_caliber:
        print(f"   跳过（无 caliber）: {skipped_no_caliber}")
    if skipped_no_name:
        print(f"   跳过（无 name）: {skipped_no_name}")
    print(f"   输出: {AMMO_TASKS_JSON}")
    print("=" * 60)

    # 按口径分组统计
    caliber_count = {}
    for t in tasks:
        cal = t["caliber"]
        caliber_count[cal] = caliber_count.get(cal, 0) + 1

    print(f"\n共 {len(caliber_count)} 种口径：")
    for cal in sorted(caliber_count.keys()):
        print(f"  {cal}: {caliber_count[cal]} 颗")

    # 打印前 10 条示例
    if tasks:
        print("\n前 10 条示例:")
        for t in tasks[:10]:
            candidates_str = " | ".join(t["candidates"])
            print(f"  {t['bulletId']}  Lv.{t['level']}")
            print(f"    候选: {candidates_str}")
            print(f"    旧价: {t['oldPrice']}")

    # 打印特殊格式的样本（多候选的情况）
    print("\n特殊格式样本（候选数 > 1 且第一个候选不等于唯一候选）:")
    special_count = 0
    for t in tasks:
        # 说明：我们总是生成 2~3 个候选。真正"特殊"的是那些
        # 标准格式可能匹配不上的（比如 Arrow 口径）
        cal = t["caliber"]
        if cal == "Arrow" or cal.endswith("Gauge") or "_" in t["name"]:
            print(f"  {t['bulletId']}  caliber={t['caliber']} name={t['name']}")
            print(f"    候选: {' | '.join(t['candidates'])}")
            special_count += 1
            if special_count >= 5:
                break

    return tasks


# ============================================================
# 入口
# ============================================================

if __name__ == "__main__":
    extract_ammo_tasks()