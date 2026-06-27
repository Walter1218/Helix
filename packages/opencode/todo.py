#!/usr/bin/env python3
import json
import sys
import os

TODO_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".todo.json")

PRIORITY_ORDER = {"高": 1, "中": 2, "低": 3}

def load_tasks():
    if os.path.exists(TODO_FILE):
        with open(TODO_FILE) as f:
            return json.load(f)
    return []

def save_tasks(tasks):
    with open(TODO_FILE, "w") as f:
        json.dump(tasks, f, indent=2)

def add_task(description, priority="中"):
    if priority not in PRIORITY_ORDER:
        print(f"无效优先级: {priority}，可选: 高/中/低")
        return
    tasks = load_tasks()
    task_id = max([t["id"] for t in tasks], default=0) + 1
    tasks.append({"id": task_id, "description": description, "priority": priority, "done": False})
    save_tasks(tasks)
    print(f"已添加任务: {description} [优先级:{priority}]")

def list_tasks():
    tasks = load_tasks()
    if not tasks:
        print("暂无任务")
        return
    sorted_tasks = sorted(tasks, key=lambda t: PRIORITY_ORDER.get(t.get("priority", "中"), 2))
    for task in sorted_tasks:
        status = "✓" if task["done"] else "○"
        priority = task.get("priority", "中")
        print(f"{task['id']}. [{status}] [{priority}] {task['description']}")

def complete_task(task_id):
    tasks = load_tasks()
    for task in tasks:
        if task["id"] == task_id:
            task["done"] = True
            save_tasks(tasks)
            print(f"已完成任务: {task['description']}")
            return
    print(f"未找到任务 {task_id}")

def main():
    if len(sys.argv) < 2:
        print("用法: todo.py <命令> [参数]")
        print("命令:")
        print("  add <描述> [优先级]  添加任务，优先级: 高/中/低(默认中)")
        print("  list                 列出任务(按优先级排序)")
        print("  done <id>            完成任务")
        return

    command = sys.argv[1]

    if command == "add" and len(sys.argv) >= 3:
        if sys.argv[-1] in PRIORITY_ORDER:
            priority = sys.argv[-1]
            add_task(" ".join(sys.argv[2:-1]), priority)
        else:
            add_task(" ".join(sys.argv[2:]))
    elif command == "list":
        list_tasks()
    elif command == "done" and len(sys.argv) >= 3:
        try:
            complete_task(int(sys.argv[2]))
        except ValueError:
            print("任务ID必须是数字")
    else:
        print("无效命令")

if __name__ == "__main__":
    main()
