import os

IGNORE = {
    ".git",
    "node_modules",
    ".obsidian",
    "__pycache__",
    "dist",
    "build"
}

def tree(directory, prefix=""):
    entries = [e for e in os.listdir(directory) if e not in IGNORE]
    entries.sort()

    for i, entry in enumerate(entries):
        path = os.path.join(directory, entry)
        connector = "└── " if i == len(entries) - 1 else "├── "
        print(prefix + connector + entry)

        if os.path.isdir(path):
            extension = "    " if i == len(entries) - 1 else "│   "
            tree(path, prefix + extension)


def generate_tree_md(root="."):
    from io import StringIO
    import sys

    buffer = StringIO()
    old_stdout = sys.stdout
    sys.stdout = buffer

    tree(root)

    sys.stdout = old_stdout

    with open("PROJECT_TREE.md", "w", encoding="utf-8") as f:
        f.write("```\n")
        f.write(buffer.getvalue())
        f.write("```\n")


if __name__ == "__main__":
    generate_tree_md()
    print("Tree generado en PROJECT_TREE.md")