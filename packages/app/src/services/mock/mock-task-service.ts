import { createSignal, createMemo } from "solid-js"
import type { TaskGroup, TaskNode, TaskStatus } from "@/pages/session/task-list-panel"

const mockTaskGroups: TaskGroup[] = [
  {
    id: "group-1",
    title: "Task 1: 优化数据库查询",
    mode: "loop",
    tasks: [
      {
        id: "task-1-1",
        title: "分析现有查询模式",
        status: "completed",
        startedAt: "2026-06-17T10:00:00Z",
        completedAt: "2026-06-17T10:15:00Z",
      },
      {
        id: "task-1-2",
        title: "添加索引",
        status: "completed",
        startedAt: "2026-06-17T10:15:00Z",
        completedAt: "2026-06-17T10:30:00Z",
      },
      {
        id: "task-1-3",
        title: "重写 ORM 查询",
        status: "in_progress",
        progress: 65,
        startedAt: "2026-06-17T10:30:00Z",
        currentAction: "修改 src/db.ts",
        children: [
          {
            id: "task-1-3-1",
            title: "分析 ORM 调用链路",
            status: "completed",
          },
          {
            id: "task-1-3-2",
            title: "重构批量查询",
            status: "in_progress",
            progress: 80,
            currentAction: "添加 join 优化",
          },
          {
            id: "task-1-3-3",
            title: "更新单元测试",
            status: "pending",
          },
        ],
      },
      {
        id: "task-1-4",
        title: "回归测试",
        status: "pending",
      },
    ],
  },
  {
    id: "group-2",
    title: "Task 2: 添加单元测试",
    mode: "plan",
    tasks: [
      {
        id: "task-2-1",
        title: "设计测试用例",
        status: "completed",
      },
      {
        id: "task-2-2",
        title: "编写测试代码",
        status: "in_progress",
        progress: 45,
      },
      {
        id: "task-2-3",
        title: "覆盖率检查",
        status: "pending",
      },
    ],
  },
]

export function createMockTaskService() {
  const [groups, setGroups] = createSignal<TaskGroup[]>(mockTaskGroups)
  const [updating, setUpdating] = createSignal(false)

  const simulateProgress = () => {
    setUpdating(true)
    const current = groups()
    const updated: TaskGroup[] = current.map((group) => ({
      ...group,
      tasks: group.tasks.map((task): TaskNode => {
        if (task.status === "in_progress" && task.progress !== undefined) {
          const newProgress = Math.min(100, task.progress + Math.random() * 10)
          return {
            ...task,
            progress: newProgress,
            status: newProgress >= 100 ? "completed" : "in_progress",
            completedAt: newProgress >= 100 ? new Date().toISOString() : task.completedAt,
          }
        }
        if (task.status === "pending" && Math.random() > 0.7) {
          return { ...task, status: "in_progress", progress: 0, startedAt: new Date().toISOString() }
        }
        return task
      }),
    }))
    setGroups(updated)
    setTimeout(() => setUpdating(false), 500)
  }

  // Auto-simulate progress every 5 seconds
  const interval = setInterval(simulateProgress, 5000)

  return {
    groups,
    simulateProgress,
    updating,
    dispose: () => clearInterval(interval),
  }
}
