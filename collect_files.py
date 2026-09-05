#!/usr/bin/env python3
"""
文件收集脚本 - 将所有源码文件平铺复制到同一个文件夹
方便一次性复制所有代码
"""

import os
import shutil
from pathlib import Path
from datetime import datetime

# ============================================================
# 配置
# ============================================================

# 只复制这些目录下的文件
INCLUDE_DIRS = {
    'src',
    'public',
}

# 文件扩展名
INCLUDE_EXTENSIONS = {
    '.ts', '.js', '.html', '.css', '.json', '.md', '.txt',
    '.yaml', '.yml', '.toml',
}

# 要排除的目录（任何层级）
EXCLUDE_PATHS = {
    'node_modules', 'dist', 'build', '.git', '.vscode', '.idea',
    '__pycache__', '.pytest_cache', 'venv', 'env', '.venv',
    'logs', 'tmp', 'temp', '.cache', 'coverage',
}

# 要排除的文件名
EXCLUDE_FILES = {
    'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
    '.DS_Store', 'Thumbs.db', 'desktop.ini',
    '.gitignore', '.env', '.env.local',
}

# 输出目录前缀
OUTPUT_PREFIX = 'collected_files_'

# ============================================================
# 主逻辑
# ============================================================

def get_project_root() -> Path:
    return Path(__file__).parent.resolve()


def get_output_dir() -> Path:
    root = get_project_root()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    return root / f'{OUTPUT_PREFIX}{timestamp}'


def get_unique_filename(dest_dir: Path, original_name: str, counter: int = 0) -> str:
    """生成唯一文件名，避免重名冲突"""
    if counter == 0:
        new_name = original_name
    else:
        name, ext = os.path.splitext(original_name)
        new_name = f"{name}_{counter}{ext}"
    
    dest_path = dest_dir / new_name
    if dest_path.exists():
        return get_unique_filename(dest_dir, original_name, counter + 1)
    return new_name


def should_include_file(file_path: Path, root: Path) -> bool:
    """判断是否应该包含该文件"""
    
    # 检查文件名
    if file_path.name in EXCLUDE_FILES:
        return False
    
    # 检查扩展名
    if file_path.suffix not in INCLUDE_EXTENSIONS:
        return False
    
    # 获取相对于项目根目录的路径
    rel_path = file_path.relative_to(root)
    parts = rel_path.parts
    
    # 跳过输出目录本身
    for part in parts:
        if part.startswith(OUTPUT_PREFIX):
            return False
        if part in EXCLUDE_PATHS:
            return False
    
    # 只包含 src 和 public 目录下的文件
    if len(parts) > 0:
        first_dir = parts[0]
        if first_dir in INCLUDE_DIRS:
            return True
        
        # 根目录的配置文件也包含
        if len(parts) == 1 and file_path.suffix in {'.json', '.md', '.txt', '.yaml', '.yml'}:
            return True
    
    return False


def collect_files():
    """收集所有文件并平铺复制到输出目录"""
    
    root = get_project_root()
    output_dir = get_output_dir()
    
    # 如果输出目录已存在，先删除
    if output_dir.exists():
        print(f"⚠️  输出目录已存在，正在删除: {output_dir}")
        shutil.rmtree(output_dir)
    
    output_dir.mkdir(exist_ok=True)
    
    print(f"📁 项目根目录: {root}")
    print(f"📂 输出目录: {output_dir}")
    print(f"📋 包含目录: {', '.join(INCLUDE_DIRS)}")
    print(f"📋 包含扩展名: {', '.join(sorted(INCLUDE_EXTENSIONS))}")
    print()
    print("📄 所有文件将平铺在同一个文件夹中")
    print()
    
    collected_count = 0
    skipped_count = 0
    renamed_count = 0
    
    # 遍历 src 目录
    for include_dir in INCLUDE_DIRS:
        dir_path = root / include_dir
        if not dir_path.exists():
            print(f"⚠️  目录不存在: {include_dir}")
            continue
        
        print(f"📂 处理目录: {include_dir}/")
        
        for file_path in dir_path.rglob('*'):
            if file_path.is_dir():
                continue
            
            if should_include_file(file_path, root):
                original_name = file_path.name
                
                # 生成唯一文件名（避免重名）
                dest_name = get_unique_filename(output_dir, original_name)
                if dest_name != original_name:
                    renamed_count += 1
                
                dest_path = output_dir / dest_name
                shutil.copy2(file_path, dest_path)
                collected_count += 1
                
                # 显示路径信息
                rel_path = file_path.relative_to(root)
                if dest_name != original_name:
                    print(f"  ✅ {rel_path} → {dest_name} (重命名)")
                else:
                    print(f"  ✅ {rel_path}")
            else:
                skipped_count += 1
    
    # 复制根目录的配置文件
    print()
    print("📂 处理根目录配置文件:")
    root_files = ['package.json', 'tsconfig.json', 'vite.config.ts', 'README.md', 'index.html']
    for filename in root_files:
        file_path = root / filename
        if file_path.exists():
            dest_name = get_unique_filename(output_dir, filename)
            dest_path = output_dir / dest_name
            shutil.copy2(file_path, dest_path)
            collected_count += 1
            print(f"  ✅ {filename}")
    
    print()
    print("=" * 60)
    print(f"✅ 完成！")
    print(f"   📄 共复制 {collected_count} 个文件")
    print(f"   📂 全部在: {output_dir}")
    if renamed_count > 0:
        print(f"   🔄 {renamed_count} 个文件因重名已自动重命名")
    print("=" * 60)


def main():
    print("=" * 60)
    print("📦 项目文件收集工具 (平铺版)")
    print("=" * 60)
    print()
    
    collect_files()


if __name__ == '__main__':
    main()