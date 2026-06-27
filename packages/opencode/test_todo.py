#!/usr/bin/env python3
import unittest
import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import todo

class TestTodoApp(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        self.tmp.write('[]')
        self.tmp.close()
        todo.TODO_FILE = self.tmp.name

    def tearDown(self):
        os.unlink(self.tmp.name)

    def test_add_task_default_priority(self):
        todo.add_task("测试任务")
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 1)
        self.assertEqual(tasks[0]["description"], "测试任务")
        self.assertEqual(tasks[0]["priority"], "中")
        self.assertFalse(tasks[0]["done"])

    def test_add_task_custom_priority(self):
        todo.add_task("高优先级", "高")
        tasks = todo.load_tasks()
        self.assertEqual(tasks[0]["priority"], "高")

    def test_add_task_invalid_priority(self):
        todo.add_task("无效", "紧急")
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 0)

    def test_list_tasks_sorted_by_priority(self):
        todo.add_task("低优先级", "低")
        todo.add_task("高优先级", "高")
        todo.add_task("中优先级", "中")
        import io
        from contextlib import redirect_stdout
        f = io.StringIO()
        with redirect_stdout(f):
            todo.list_tasks()
        output = f.getvalue()
        lines = output.strip().split(chr(10))
        self.assertIn("[高]", lines[0])
        self.assertIn("[中]", lines[1])
        self.assertIn("[低]", lines[2])

    def test_complete_task(self):
        todo.add_task("待完成")
        todo.complete_task(1)
        tasks = todo.load_tasks()
        self.assertTrue(tasks[0]["done"])

    def test_complete_nonexistent_task(self):
        import io
        from contextlib import redirect_stdout
        f = io.StringIO()
        with redirect_stdout(f):
            todo.complete_task(999)
        self.assertIn("未找到", f.getvalue())

    def test_task_id_increment(self):
        todo.add_task("任务1")
        todo.add_task("任务2")
        tasks = todo.load_tasks()
        self.assertEqual(tasks[0]["id"], 1)
        self.assertEqual(tasks[1]["id"], 2)

    def test_list_empty(self):
        import io
        from contextlib import redirect_stdout
        f = io.StringIO()
        with redirect_stdout(f):
            todo.list_tasks()
        self.assertIn("暂无任务", f.getvalue())

    def test_persistence(self):
        todo.add_task("持久化测试")
        tasks = todo.load_tasks()
        self.assertEqual(len(tasks), 1)
        with open(todo.TODO_FILE) as f:
            data = json.load(f)
        self.assertEqual(data[0]["description"], "持久化测试")

if __name__ == "__main__":
    unittest.main()
