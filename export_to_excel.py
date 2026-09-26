# -*- coding: utf-8 -*-
"""
data.json → Excel 导出脚本

用法：
    python export_to_excel.py
    python export_to_excel.py data.json output.xlsx

输出：
    ttk_export_YYYYMMDD_HHMMSS.xlsx
    - Sheet 1: 配置总览（每武器每配置一行，含评分）
    - Sheet 2: 武器基础
    - Sheet 3: 子弹数据
    - Sheet 4: 护甲数据
    - Sheet 5: 评分明细
"""

import json
import sys
import os
from datetime import datetime

try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("❌ 缺少 openpyxl，请先安装：")
    print("   pip install openpyxl")
    sys.exit(1)


# ============================================================
# 样式定义
# ============================================================

HEADER_FILL = PatternFill(start_color="4A6CF7", end_color="4A6CF7", fill_type="solid")
HEADER_FONT = Font(color="FFFFFF", bold=True, size=11)
HEADER_ALIGN = Alignment(horizontal="center", vertical="center", wrap_text=True)

GRADE_FILLS = {
    "A": PatternFill(start_color="C8E6C9", end_color="C8E6C9", fill_type="solid"),
    "B": PatternFill(start_color="BBDEFB", end_color="BBDEFB", fill_type="solid"),
    "C": PatternFill(start_color="FFE0B2", end_color="FFE0B2", fill_type="solid"),
    "D": PatternFill(start_color="FFCDD2", end_color="FFCDD2", fill_type="solid"),
}

TYPE_FILLS = {
    "步枪": PatternFill(start_color="E3F2FD", end_color="E3F2FD", fill_type="solid"),
    "冲锋枪": PatternFill(start_color="F3E5F5", end_color="F3E5F5", fill_type="solid"),
    "轻机枪": PatternFill(start_color="FFF3E0", end_color="FFF3E0", fill_type="solid"),
    "精确射手步枪": PatternFill(start_color="E8F5E9", end_color="E8F5E9", fill_type="solid"),
    "手枪": PatternFill(start_color="FFEBEE", end_color="FFEBEE", fill_type="solid"),
}

THIN_BORDER = Border(
    left=Side(style="thin", color="DDDDDD"),
    right=Side(style="thin", color="DDDDDD"),
    top=Side(style="thin", color="DDDDDD"),
    bottom=Side(style="thin", color="DDDDDD"),
)


# ============================================================
# 工具函数
# ============================================================

def _apply_header(ws, headers, row=1):
    """写入表头 + 样式"""
    for col, name in enumerate(headers, start=1):
        cell = ws.cell(row=row, column=col, value=name)
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = HEADER_ALIGN
        cell.border = THIN_BORDER
    ws.freeze_panes = ws.cell(row=row + 1, column=1)


def _autofit_columns(ws, min_width=8, max_width=40):
    """根据内容自动调整列宽"""
    for col_idx, col in enumerate(ws.iter_cols(), start=1):
        max_len = 0
        for cell in col:
            if cell.value is None:
                continue
            # 处理中文（占 2 字符宽度）
            s = str(cell.value)
            length = sum(2 if ord(c) > 127 else 1 for c in s)
            max_len = max(max_len, length)
        width = min(max(max_len + 2, min_width), max_width)
        ws.column_dimensions[get_column_letter(col_idx)].width = width


def _format_ranges(ranges):
    """['Infinity', 62, ...] → '35/62/∞/∞'"""
    if not ranges:
        return ""
    parts = []
    for r in ranges:
        if r == "Infinity" or r == float("inf") or r is None:
            parts.append("∞")
        else:
            parts.append(str(int(r)) if float(r).is_integer() else str(r))
    return "/".join(parts)


def _format_decays(decays):
    """[1, 0.9, 0.7, 0.7, 0.7] → '1.00/0.90/0.70/0.70/0.70'"""
    if not decays:
        return ""
    return "/".join(f"{d:.2f}" for d in decays)


def _format_mult(mult):
    """{'head': 2.1, ...} → '2.10/1.00/0.90/0.40'"""
    if not mult:
        return ""
    keys = ["head", "chest", "stomach", "limbs"]
    return "/".join(f"{mult.get(k, 1):.2f}" for k in keys)


def _format_bullet_part_mult(pm):
    """子弹的 partMult → '1.00/1.00/1.00/1.00'"""
    if not pm:
        return ""
    keys = ["head", "chest", "stomach", "limbs"]
    return "/".join(f"{pm.get(k, 1):.2f}" for k in keys)


def _format_armor_mult(armor_data):
    """护甲衰减 1~6 级 → '1.00/1.00/0.75/0.50/0.00/0.00'"""
    if not armor_data:
        return ""
    vals = []
    for i in range(1, 7):
        d = armor_data.get(str(i)) or armor_data.get(i) or {}
        vals.append(f"{d.get('armorMult', 1):.2f}")
    return "/".join(vals)


def _format_pen(armor_data):
    """穿透 1~6 级 → '1.00/1.00/0.75/0.50/0.00/0.00'"""
    if not armor_data:
        return ""
    vals = []
    for i in range(1, 7):
        d = armor_data.get(str(i)) or armor_data.get(i) or {}
        vals.append(f"{d.get('pen', 0):.2f}")
    return "/".join(vals)


def _price_w(price):
    """240000 → '24.0W'"""
    if price is None or price == 0:
        return "0"
    return f"{price / 10000:.1f}W"


def _get_bullet_by_id(bullets, bullet_id):
    if not bullet_id:
        return None
    for b in bullets:
        if b.get("id") == bullet_id:
            return b
    return None


def _get_default_bullet(bullets, caliber, level):
    """按口径 + 等级找默认子弹"""
    if not caliber or level is None:
        return None
    candidates = [
        b for b in bullets
        if b.get("caliber") == caliber and str(b.get("level")) == str(level)
    ]
    if not candidates:
        return None
    for b in candidates:
        if b.get("isDefault"):
            return b
    return candidates[0]


# ============================================================
# Sheet 1: 配置总览
# ============================================================

def build_config_sheet(wb, data):
    ws = wb.create_sheet("配置总览")

    weapons = data.get("weapons", [])
    prices = data.get("prices", [])
    bullets = data.get("bullets", [])
    weapon_scores = data.get("weaponScores", {})

    # 建立映射
    weapon_map = {w["id"]: w for w in weapons}
    price_map = {p["weaponId"]: p for p in prices}

    headers = [
        "武器ID", "武器名", "类型", "配置", "启用",
        "枪管", "枪口", "精校",
        "射速", "初速", "肉伤", "甲伤",
        "射程", "衰减", "部位倍率(头/胸/腹/肢)",
        "开镜(ms)", "价格", "改枪码",
        "评分", "分档", "哈弗币",
        "子弹ID", "子弹名", "子弹等级", "子弹单价", "子弹部位倍率",
        "命中率映射",
    ]

    _apply_header(ws, headers)
    row = 2

    # 按武器类型 + 名称排序
    type_order = {
        "步枪": 0, "冲锋枪": 1, "轻机枪": 2,
        "精确射手步枪": 3, "手枪": 4,
    }
    sorted_weapons = sorted(
        weapons,
        key=lambda w: (type_order.get(w.get("type"), 99), w.get("name", "")),
    )

    for weapon in sorted_weapons:
        wid = weapon["id"]
        price_entry = price_map.get(wid)
        if not price_entry:
            continue

        for config in price_entry.get("configs", []):
            cfg_id = config.get("id", "")

            # 查配置的枪管（用 barrelId 拿实际枪管名）
            barrel_id = config.get("barrelId", -1)
            barrel_name = "无"
            if barrel_id is not None and barrel_id >= 0:
                barrels = weapon.get("barrels", [])
                if barrel_id < len(barrels):
                    barrel_name = barrels[barrel_id].get("name", "")

            # 子弹（配置里指定优先，否则按口径+等级查默认）
            bullet_id = config.get("bullet", "") or ""
            bullet = None
            if bullet_id:
                bullet = _get_bullet_by_id(bullets, bullet_id)
            else:
                # 按全局 bulletLevel 找
                params = data.get("params", {})
                lvl = params.get("bulletLevel", 4)
                bullet = _get_default_bullet(bullets, weapon.get("allowedBullet"), lvl)
                if bullet:
                    bullet_id = bullet.get("id", "")

            # 命中率映射
            hit_rate_str = ""
            dists = config.get("distance", [])
            rates = config.get("hitRate", [])
            if dists and rates:
                n = min(len(dists), len(rates))
                hit_rate_str = ",".join(f"{dists[i]}:{rates[i]}" for i in range(n))

            # 评分
            score_key = f"{wid}_{cfg_id}"
            score_entry = weapon_scores.get(score_key, {})
            score_val = score_entry.get("score")
            grade_val = score_entry.get("grade")
            havoc_val = score_entry.get("meta", {}).get("havocCost")

            # 射速/初速/肉伤/甲伤 —— 用武器基础值（枪管加成在分析时另算）
            # 若想显示"应用枪管后"的值，需要在脚本里重算（见下面的可选函数）
            rof = weapon.get("rof", "")
            velocity = weapon.get("velocity", "")
            flesh = weapon.get("flesh", "")
            armor = weapon.get("armor", "")

            values = [
                wid,
                weapon.get("name", ""),
                weapon.get("type", ""),
                cfg_id,
                "✓" if config.get("enabled", True) else "✗",
                barrel_name,
                config.get("muzzle", "无"),
                config.get("precision", 0),
                rof,
                velocity,
                flesh,
                armor,
                _format_ranges(weapon.get("ranges")),
                _format_decays(weapon.get("decays")),
                _format_mult(weapon.get("mult")),
                config.get("aimSpeed", 0),
                config.get("price", 0),
                config.get("buildCode", ""),
                round(score_val, 2) if score_val is not None else "",
                grade_val or "",
                round(havoc_val, 0) if havoc_val is not None else "",
                bullet_id,
                bullet.get("name", "") if bullet else "",
                bullet.get("level", "") if bullet else "",
                bullet.get("price", "") if bullet else "",
                _format_bullet_part_mult(bullet.get("partMult")) if bullet else "",
                hit_rate_str,
            ]

            for col, v in enumerate(values, start=1):
                cell = ws.cell(row=row, column=col, value=v)
                cell.border = THIN_BORDER
                cell.alignment = Alignment(horizontal="center", vertical="center")

            # 分档配色
            if grade_val in GRADE_FILLS:
                ws.cell(row=row, column=20).fill = GRADE_FILLS[grade_val]

            # 类型配色
            type_val = weapon.get("type")
            if type_val in TYPE_FILLS:
                ws.cell(row=row, column=3).fill = TYPE_FILLS[type_val]

            row += 1

    _autofit_columns(ws)
    # 自动筛选
    ws.auto_filter.ref = f"A1:Z{row - 1}"

    return ws


# ============================================================
# Sheet 2: 武器基础
# ============================================================

def build_weapon_sheet(wb, data):
    ws = wb.create_sheet("武器基础")

    weapons = data.get("weapons", [])

    headers = [
        "武器ID", "名称", "类型", "口径",
        "射速", "初速", "肉伤", "甲伤", "扳机延迟(ms)",
        "射程", "衰减",
        "头倍率", "胸倍率", "腹倍率", "肢倍率",
        "开火模式", "连发数", "内部射速", "连发间隔(s)",
        "枪管数", "枪管列表",
    ]

    _apply_header(ws, headers)
    row = 2

    type_order = {
        "步枪": 0, "冲锋枪": 1, "轻机枪": 2,
        "精确射手步枪": 3, "手枪": 4,
    }
    sorted_weapons = sorted(
        weapons,
        key=lambda w: (type_order.get(w.get("type"), 99), w.get("name", "")),
    )

    for weapon in sorted_weapons:
        barrels = weapon.get("barrels", [])
        barrel_names = " | ".join(b.get("name", "") for b in barrels) if barrels else ""

        mult = weapon.get("mult", {})
        values = [
            weapon["id"],
            weapon.get("name", ""),
            weapon.get("type", ""),
            weapon.get("allowedBullet", ""),
            weapon.get("rof", ""),
            weapon.get("velocity", ""),
            weapon.get("flesh", ""),
            weapon.get("armor", ""),
            weapon.get("triggerDelay", 0),
            _format_ranges(weapon.get("ranges")),
            _format_decays(weapon.get("decays")),
            mult.get("head", ""),
            mult.get("chest", ""),
            mult.get("stomach", ""),
            mult.get("limbs", ""),
            weapon.get("fireMode") or "",
            weapon.get("burstCount") or "",
            weapon.get("burstInternalROF") or "",
            weapon.get("burstInterval") or "",
            len(barrels),
            barrel_names,
        ]

        for col, v in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

        type_val = weapon.get("type")
        if type_val in TYPE_FILLS:
            ws.cell(row=row, column=3).fill = TYPE_FILLS[type_val]

        row += 1

    _autofit_columns(ws)
    ws.auto_filter.ref = f"A1:U{row - 1}"
    return ws


# ============================================================
# Sheet 3: 子弹数据
# ============================================================

def build_bullet_sheet(wb, data):
    ws = wb.create_sheet("子弹数据")

    bullets = data.get("bullets", [])

    headers = [
        "子弹ID", "口径", "名称", "等级",
        "价格", "启用", "默认",
        "部位倍率(头/胸/腹/肢)",
        "护甲衰减(1~6级)",
        "穿透(1~6级)",
    ]

    _apply_header(ws, headers)
    row = 2

    # 按口径排序
    sorted_bullets = sorted(
        bullets,
        key=lambda b: (b.get("caliber", ""), int(b.get("level", 0)) if str(b.get("level", "")).isdigit() else 99, b.get("name", "")),
    )

    for bullet in sorted_bullets:
        values = [
            bullet.get("id", ""),
            bullet.get("caliber", ""),
            bullet.get("name", ""),
            bullet.get("level", ""),
            bullet.get("price", 0),
            "✓" if bullet.get("enabled", True) else "✗",
            "★" if bullet.get("isDefault") else "",
            _format_bullet_part_mult(bullet.get("partMult")),
            _format_armor_mult(bullet.get("armorData")),
            _format_pen(bullet.get("armorData")),
        ]

        for col, v in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

        row += 1

    _autofit_columns(ws)
    ws.auto_filter.ref = f"A1:J{row - 1}"
    return ws


# ============================================================
# Sheet 4: 护甲数据
# ============================================================

def build_armor_sheet(wb, data):
    ws = wb.create_sheet("护甲数据")

    armors = data.get("armors", [])

    headers = ["ID", "类型", "名称", "等级", "护甲值", "价格", "防护部位", "启用"]

    _apply_header(ws, headers)
    row = 2

    # armor 在前，helmet 在后
    type_order = {"armor": 0, "helmet": 1}
    sorted_armors = sorted(
        armors,
        key=lambda a: (
            type_order.get(a.get("type"), 99),
            -int(a.get("level", 0)) if str(a.get("level", "")).isdigit() else 0,
            -float(a.get("value", 0)),
            a.get("name", ""),
        ),
    )

    for armor in sorted_armors:
        values = [
            armor.get("id", ""),
            armor.get("type", ""),
            armor.get("name", ""),
            armor.get("level", ""),
            armor.get("value", 0),
            armor.get("price", 0),
            armor.get("parts", ""),
            "✓" if armor.get("enabled", True) else "✗",
        ]

        for col, v in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

        row += 1

    _autofit_columns(ws)
    ws.auto_filter.ref = f"A1:H{row - 1}"
    return ws


# ============================================================
# Sheet 5: 评分明细（原始 weaponScores）
# ============================================================

def build_score_sheet(wb, data):
    ws = wb.create_sheet("评分明细")

    weapon_scores = data.get("weaponScores", {})

    headers = [
        "key", "评分", "分档",
        "武器ID", "武器名", "配置", "枪管",
        "枪口", "精校", "子弹ID", "子弹名", "子弹等级", "子弹单价",
        "开镜(ms)", "价格", "哈弗币", "改枪码", "启用",
    ]

    _apply_header(ws, headers)
    row = 2

    # 按评分升序
    items = list(weapon_scores.items())
    items.sort(key=lambda kv: kv[1].get("score") or float("inf"))

    for key, entry in items:
        meta = entry.get("meta", {})
        values = [
            key,
            round(entry.get("score", 0), 2) if entry.get("score") is not None else "",
            entry.get("grade", ""),
            meta.get("weaponId", ""),
            meta.get("weaponName", ""),
            meta.get("configId", ""),
            meta.get("barrel", ""),
            meta.get("muzzle", ""),
            meta.get("precision", 0),
            meta.get("bulletId", ""),
            meta.get("bulletName", ""),
            meta.get("bulletLevel", ""),
            meta.get("bulletPrice", 0),
            meta.get("aimSpeed", 0),
            meta.get("price", 0),
            round(meta.get("havocCost", 0), 0) if meta.get("havocCost") is not None else "",
            meta.get("buildCode", ""),
            "✓" if meta.get("enabled", True) else "✗",
        ]

        for col, v in enumerate(values, start=1):
            cell = ws.cell(row=row, column=col, value=v)
            cell.border = THIN_BORDER
            cell.alignment = Alignment(horizontal="center", vertical="center")

        grade_val = entry.get("grade")
        if grade_val in GRADE_FILLS:
            ws.cell(row=row, column=3).fill = GRADE_FILLS[grade_val]

        row += 1

    _autofit_columns(ws)
    ws.auto_filter.ref = f"A1:R{row - 1}"
    return ws


# ============================================================
# 主入口
# ============================================================

def main():
    # 参数解析
    input_file = sys.argv[1] if len(sys.argv) > 1 else "data.json"
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    # 尝试从常见位置找 data.json
    if not os.path.exists(input_file):
        candidates = ["public/data.json", "../public/data.json", "./data.json"]
        for c in candidates:
            if os.path.exists(c):
                input_file = c
                print(f"ℹ️  自动找到: {input_file}")
                break
        else:
            print(f"❌ 找不到文件: {input_file}")
            sys.exit(1)

    # 输出文件名
    if not output_file:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_file = f"ttk_export_{ts}.xlsx"

    # 读 JSON
    print(f"📖 读取: {input_file}")
    with open(input_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    print(f"   武器 {len(data.get('weapons', []))} 把")
    print(f"   子弹 {len(data.get('bullets', []))} 颗")
    print(f"   价格 {len(data.get('prices', []))} 组")
    print(f"   护甲 {len(data.get('armors', []))} 条")
    print(f"   评分 {len(data.get('weaponScores', {}))} 条")

    # 建 Excel
    print(f"\n📝 生成 Excel: {output_file}")
    wb = openpyxl.Workbook()
    wb.remove(wb.active)  # 删掉默认 sheet

    build_config_sheet(wb, data)
    build_weapon_sheet(wb, data)
    build_bullet_sheet(wb, data)
    build_armor_sheet(wb, data)
    build_score_sheet(wb, data)

    wb.save(output_file)
    print(f"\n✅ 完成！")
    print(f"   文件: {os.path.abspath(output_file)}")
    print(f"   Sheets:")
    for name in wb.sheetnames:
        ws = wb[name]
        print(f"     - {name}: {ws.max_row - 1} 行 × {ws.max_column} 列")


if __name__ == "__main__":
    main()