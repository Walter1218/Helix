import json
import sys
from pathlib import Path

TODO_FILE = Path("todos.json")

PRIORITY_ORDER = {"高": 0, "中": 1, "低": 2}


def load():
    if TODO_FILE.exists():
        return json.loads(TODO_FILE.read_text())
    return []


def save(todos):
    TODO_FILE.write_text(json.dumps(todos, ensure_ascii=False, indent=2))


def main():
    if len(sys.argv) < 2:
        print("用法: python todo.py <add|list|delete> [任务内容/编号] [--priority 高|中|低]")
        return

    cmd = sys.argv[1]

    if cmd == "add":
        if len(sys.argv) < 3:
            print("请提供任务内容")
            return
        priority = "中"
        args = sys.argv[2:]
        if "--priority" in args:
            idx = args.index("--priority")
            if idx + 1 < len(args) and args[idx + 1] in PRIORITY_ORDER:
                priority = args[idx + 1]
            args = args[:idx] + args[idx + 2:]
        task = " ".join(args)
        todos = load()
        todos.append({"task": task, "done": False, "priority": priority})
        save(todos)
        print(f"已添加: {task} [优先级: {priority}]")

    elif cmd == "list":
        todos = load()
        if not todos:
            print("暂无任务")
            return
        todos_sorted = sorted(todos, key=lambda t: PRIORITY_ORDER.get(t.get("priority", "中"), 1))
        for i, t in enumerate(todos_sorted, 1):
            status = "✓" if t["done"] else " "
            p = t.get("priority", "中")
            print(f"  {i}. [{status}] {t['task']} [{p}]")

    elif cmd == "delete":
        if len(sys.argv) < 3:
            print("请提供任务编号")
            return
        try:
            index = int(sys.argv[2])
        except ValueError:
            print("编号必须是数字")
            return
        todos = load()
        todos_sorted = sorted(todos, key=lambda t: PRIORITY_ORDER.get(t.get("priority", "中"), 1))
        if index < 1 or index > len(todos_sorted):
            print(f"无效编号，范围: 1-{len(todos_sorted)}")
            return
        removed = todos_sorted[index - 1]
        todos.remove(removed)
        save(todos)
        print(f"已删除: {removed['task']}")

    else:
        print(f"未知命令: {cmd}")


if __name__ == "__main__":
    main()
