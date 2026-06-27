import json
import unittest
from unittest.mock import patch
from io import StringIO

import todo


class TestTodo(unittest.TestCase):

    def setUp(self):
        self.sample_data = [
            {"task": "任务A", "done": False, "priority": "低"},
            {"task": "任务B", "done": False, "priority": "高"},
            {"task": "任务C", "done": False, "priority": "中"},
        ]

    @patch("todo.save")
    @patch("todo.load", return_value=[])
    def test_add_task(self, mock_load, mock_save):
        with patch("sys.argv", ["todo.py", "add", "测试任务"]):
            todo.main()
        saved = mock_save.call_args[0][0]
        self.assertEqual(len(saved), 1)
        self.assertEqual(saved[0]["task"], "测试任务")
        self.assertEqual(saved[0]["priority"], "中")

    @patch("todo.save")
    @patch("todo.load", return_value=[])
    def test_add_task_with_priority(self, mock_load, mock_save):
        with patch("sys.argv", ["todo.py", "add", "紧急任务", "--priority", "高"]):
            todo.main()
        saved = mock_save.call_args[0][0]
        self.assertEqual(saved[0]["priority"], "高")

    @patch("todo.load")
    def test_list_sorted_by_priority(self, mock_load):
        mock_load.return_value = self.sample_data.copy()
        with patch("sys.argv", ["todo.py", "list"]):
            with patch("builtins.print") as mock_print:
                todo.main()
        output = "\n".join(c[0][0] for c in mock_print.call_args_list)
        pos_high = output.index("任务B")
        pos_mid = output.index("任务C")
        pos_low = output.index("任务A")
        self.assertLess(pos_high, pos_mid)
        self.assertLess(pos_mid, pos_low)

    @patch("todo.save")
    @patch("todo.load")
    def test_delete_task(self, mock_load, mock_save):
        mock_load.return_value = self.sample_data.copy()
        with patch("sys.argv", ["todo.py", "delete", "1"]):
            todo.main()
        saved = mock_save.call_args[0][0]
        self.assertEqual(len(saved), 2)
        tasks = [t["task"] for t in saved]
        self.assertNotIn("任务B", tasks)
        self.assertIn("任务A", tasks)
        self.assertIn("任务C", tasks)

    @patch("todo.load")
    def test_list_empty(self, mock_load):
        mock_load.return_value = []
        with patch("sys.argv", ["todo.py", "list"]):
            with patch("builtins.print") as mock_print:
                todo.main()
        self.assertIn("暂无任务", mock_print.call_args[0][0])


if __name__ == "__main__":
    unittest.main()
