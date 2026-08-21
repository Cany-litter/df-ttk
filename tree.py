import os
import sys

def print_tree(dir_path, prefix="", excludes={".git", "node_modules", "__pycache__", ".vscode", "dist", "build"}):
    try:
        items = [f for f in os.listdir(dir_path) if f not in excludes]
        items.sort(key=lambda x: (not os.path.isdir(os.path.join(dir_path, x)), x))
        
        for i, item in enumerate(items):
            path = os.path.join(dir_path, item)
            is_last = i == len(items) - 1
            
            if os.path.isdir(path):
                print(prefix + ("└── " if is_last else "├── ") + item + "/")
                print_tree(path, prefix + ("    " if is_last else "│   "), excludes)
            else:
                print(prefix + ("└── " if is_last else "├── ") + item)
    except PermissionError:
        pass

if __name__ == "__main__":
    root = "."
    excludes = {".git", "node_modules", "__pycache__", ".vscode", "dist", "build", "coverage", ".next", ".nuxt", "out", "log", "temp"}
    print(os.path.basename(os.path.abspath(root)) + "/")
    print_tree(root, "", excludes)