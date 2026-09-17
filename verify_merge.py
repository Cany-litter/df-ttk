# verify_merge.py
"""
文件合并重构 - 全局残留检查脚本

作用：
  扫描 src/ 下所有 .vue / .js 文件，检查是否还残留旧 import 或旧引用。

检查项：
  1. 已删除文件的 import（@/stores/dataStore 等）
  2. 已合并文件的 import（./config.js 等）
  3. 已删除组件的 import（AppHeader.vue 等）
  4. 新文件是否存在
  5. 新文件是否为空（空文件 = 没填充）

用法：
    python verify_merge.py
"""
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.resolve()
SRC_DIR = PROJECT_ROOT / "src"

# ============================================================
# 要检查的"旧 import"关键词
# 每一项：(搜索关键词, 说明, 期望出现在哪个文件里)
# ============================================================

# 1. 已删除的 store 文件
OLD_STORE_IMPORTS = [
    "@/stores/dataStore",
    "@/stores/paramsStore",
    "@/stores/appStore",
    "stores/dataStore",
    "stores/paramsStore",
    "stores/appStore",
]

# 2. 已合并的 core 文件
OLD_CORE_IMPORTS = [
    "./config.js",
    "./config'",
    './config"',
    "./CombatUtils.js",
    "./CombatUtils'",
    './CombatUtils"',
    "./BulletStrategy.js",
    "./BulletStrategy'",
    './BulletStrategy"',
]

# 3. 已移入 core 的 utils 文件
OLD_UTILS_IMPORTS = [
    "@/utils/rng",
    "../utils/rng",
    "./rng.js",
    "@/utils/formatters",
    "../utils/formatters",
    "./formatters.js",
    "@/utils/validators",
    "../utils/validators",
    "./validators.js",
    "@/utils/performance",
    "../utils/performance",
    "./performance.js",
]

# 4. 已删除的组件
OLD_COMPONENT_IMPORTS = [
    "AppHeader.vue",
    "AppFooter.vue",
    "RecCard.vue",
    "RecTable.vue",
    "EditableCell.vue",
]

# 5. 新文件清单（必须存在且非空）
NEW_FILES = [
    "src/stores/stores.js",
    "src/core/CombatCore.js",
    "src/components/AppLayout.vue",
]

# 6. 已删除的文件（不应存在）
DELETED_FILES = [
    "src/stores/dataStore.js",
    "src/stores/paramsStore.js",
    "src/stores/appStore.js",
    "src/core/config.js",
    "src/core/CombatUtils.js",
    "src/core/BulletStrategy.js",
    "src/utils/rng.js",
    "src/utils/formatters.js",
    "src/utils/validators.js",
    "src/utils/performance.js",
    "src/components/AppHeader.vue",
    "src/components/AppFooter.vue",
    "src/components/RecCard.vue",
    "src/components/RecTable.vue",
    "src/components/EditableCell.vue",
]

# ============================================================
# 工具函数
# ============================================================

def iter_source_files():
    """遍历 src/ 下所有 .vue / .js 文件"""
    for ext in ("*.vue", "*.js"):
        for p in SRC_DIR.rglob(ext):
            yield p


def read_lines(path):
    """读文件行，返回 [(行号, 行内容), ...]"""
    try:
        with open(path, "r", encoding="utf-8") as f:
            return list(enumerate(f.readlines(), start=1))
    except UnicodeDecodeError:
        # 兼容 BOM 或其他编码
        with open(path, "r", encoding="utf-8-sig") as f:
            return list(enumerate(f.readlines(), start=1))


def is_import_line(line):
    """判断这一行是不是 import / from 语句"""
    stripped = line.strip()
    return (
        stripped.startswith("import ")
        or stripped.startswith("import{")
        or " from " in stripped and ("'" in stripped or '"' in stripped)
    )


def check_keywords(keywords, label, results):
    """检查一组关键词是否还出现在 import 行里"""
    hits = []
    for path in iter_source_files():
        rel = path.relative_to(PROJECT_ROOT)
        for lineno, line in read_lines(path):
            if not is_import_line(line):
                continue
            for kw in keywords:
                if kw in line:
                    hits.append((str(rel), lineno, kw, line.rstrip()))
    results[label] = hits
    return hits


# ============================================================
# 主流程
# ============================================================

def main():
    print("=" * 72)
    print("  文件合并重构 - 全局残留检查")
    print("=" * 72)
    print(f"  项目根目录: {PROJECT_ROOT}")
    print()

    total_errors = 0

    # ---------- 1. 检查旧 import ----------
    checks = [
        ("旧 store import", OLD_STORE_IMPORTS),
        ("旧 core import", OLD_CORE_IMPORTS),
        ("旧 utils import", OLD_UTILS_IMPORTS),
        ("旧组件 import", OLD_COMPONENT_IMPORTS),
    ]

    for label, keywords in checks:
        print(f"【检查】{label}")
        hits = []
        for path in iter_source_files():
            rel = path.relative_to(PROJECT_ROOT)
            for lineno, line in read_lines(path):
                if not is_import_line(line):
                    continue
                for kw in keywords:
                    if kw in line:
                        hits.append((str(rel), lineno, kw, line.rstrip()))
                        break  # 同一行只报一次

        if hits:
            total_errors += len(hits)
            for rel, lineno, kw, line in hits:
                print(f"  ❌ {rel}:{lineno}")
                print(f"       匹配: {kw}")
                print(f"       内容: {line}")
        else:
            print("  ✅ 无残留")
        print()

    # ---------- 2. 检查新文件是否存在且非空 ----------
    print("【检查】新文件是否存在且非空")
    for rel in NEW_FILES:
        path = PROJECT_ROOT / rel
        if not path.exists():
            total_errors += 1
            print(f"  ❌ 不存在: {rel}")
        elif path.stat().st_size == 0:
            total_errors += 1
            print(f"  ❌ 空文件: {rel}")
        else:
            size_kb = path.stat().st_size / 1024
            print(f"  ✅ {rel}  ({size_kb:.1f} KB)")
    print()

    # ---------- 3. 检查已删除文件是否真的不存在 ----------
    print("【检查】已删除文件是否真的不存在")
    leftover = []
    for rel in DELETED_FILES:
        path = PROJECT_ROOT / rel
        if path.exists():
            leftover.append(rel)
            total_errors += 1

    if leftover:
        for rel in leftover:
            print(f"  ❌ 仍存在: {rel}")
    else:
        print("  ✅ 全部已删除")
    print()

    # ---------- 4. 统计 src/ 文件数 ----------
    print("【统计】src/ 下文件数")
    all_files = list(iter_source_files())
    by_dir = {}
    for p in all_files:
        rel = p.relative_to(SRC_DIR)
        top = rel.parts[0] if len(rel.parts) > 1 else "(root)"
        by_dir[top] = by_dir.get(top, 0) + 1

    for d in sorted(by_dir.keys()):
        print(f"  {d:20s} {by_dir[d]} 个")
    print(f"  {'合计':20s} {len(all_files)} 个")
    print()

    # ---------- 5. 汇总 ----------
    print("=" * 72)
    if total_errors == 0:
        print("  ✅ 全部通过！没有发现残留问题。")
        print()
        print("  下一步：")
        print("    1. 跑 npm run dev，按功能清单逐项验证")
        print("    2. 验证通过后 git commit")
    else:
        print(f"  ❌ 发现 {total_errors} 个问题，请逐个修复。")
        print()
        print("  修复建议：")
        print("    - 旧 store import → 改成 @/stores/stores")
        print("    - 旧 core import → 改成 ./CombatCore.js")
        print("    - 旧 utils import → rng 移到 CombatCore；其他删掉")
        print("    - 旧组件 import → AppHeader/AppFooter → AppLayout；RecCard/RecTable 内联")
    print("=" * 72)

    return 0 if total_errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())