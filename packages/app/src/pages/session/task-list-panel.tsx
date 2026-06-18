import { For, Show, createSignal, createMemo } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { useModeRegistry } from "@/context/mode-registry"
import { Icon } from "@mimo-ai/ui/icon"
import { IconButton } from "@mimo-ai/ui/icon-button"

export type TaskStatus = "pending" | "in_progress" | "completed" | "failed" | "paused"

export interface TaskNode {
  id: string
  title: string
  status: TaskStatus
  progress?: number
  children?: TaskNode[]
  startedAt?: string
  completedAt?: string
  associatedFiles?: string[]
  currentAction?: string
}

export interface TaskGroup {
  id: string
  title: string
  tasks: TaskNode[]
  mode: string
}

export interface TaskListPanelProps {
  groups: () => TaskGroup[]
  onTaskClick?: (taskId: string, groupId: string) => void
}

export const statusIcon: Record<TaskStatus, string> = {
  pending: "⏳",
  in_progress: "🔄",
  completed: "✅",
  failed: "❌",
  paused: "⏸",
}

export const statusColor: Record<TaskStatus, string> = {
  pending: "text-text-weak",
  in_progress: "text-amber-500",
  completed: "text-green-500",
  failed: "text-red-500",
  paused: "text-orange-400",
}

function TaskItem(props: {
  task: TaskNode
  depth: number
  groupId: string
  onClick?: (id: string, groupId: string) => void
}) {
  const [expanded, setExpanded] = createSignal(true)
  const hasChildren = () => (props.task.children?.length ?? 0) > 0

  return (
    <div class="flex flex-col">
      <div
        class="flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer hover:bg-background-tertiary-base/50 transition-colors"
        style={{ "padding-left": `${props.depth * 12 + 4}px` }}
        onClick={() => props.onClick?.(props.task.id, props.groupId)}
      >
        <Show when={hasChildren()}>
          <button
            class="text-text-weak hover:text-text-base transition-colors shrink-0 w-3"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded())
            }}
          >
            <span class="text-[10px]">{expanded() ? "▼" : "▶"}</span>
          </button>
        </Show>
        <Show when={!hasChildren()}>
          <span class="w-3 shrink-0" />
        </Show>

        <span class={`text-[13px] shrink-0 ${statusColor[props.task.status]}`}>{statusIcon[props.task.status]}</span>

        <span class="text-12-regular text-text-base truncate flex-1">{props.task.title}</span>

        <Show when={props.task.progress !== undefined && props.task.status === "in_progress"}>
          <div class="w-16 h-1 bg-background-tertiary-base rounded-full overflow-hidden shrink-0">
            <div
              class="h-full rounded-full transition-all duration-500"
              style={{
                width: `${props.task.progress}%`,
                background:
                  props.task.progress! < 30
                    ? "#ef4444"
                    : props.task.progress! < 70
                      ? "#eab308"
                      : "#22c55e",
              }}
            />
          </div>
        </Show>

        <Show when={props.task.currentAction}>
          <span class="text-11-regular text-text-weak truncate max-w-[120px]">{props.task.currentAction}</span>
        </Show>
      </div>

      <Show when={hasChildren() && expanded()}>
        <div class="flex flex-col">
          <For each={props.task.children}>
            {(child) => (
              <TaskItem
                task={child}
                depth={props.depth + 1}
                groupId={props.groupId}
                onClick={props.onClick}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}

export function TaskListPanel(props: TaskListPanelProps) {
  const registry = useModeRegistry()
  const [expandedGroups, setExpandedGroups] = createStore<Record<string, boolean>>({})

  const totalStats = createMemo(() => {
    let total = 0
    let completed = 0
    let inProgress = 0
    let failed = 0

    for (const group of props.groups()) {
      for (const task of group.tasks) {
        countTask(task)
      }
    }

    function countTask(task: TaskNode) {
      total++
      if (task.status === "completed") completed++
      if (task.status === "in_progress") inProgress++
      if (task.status === "failed") failed++
      task.children?.forEach(countTask)
    }

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    return { total, completed, inProgress, failed, percent }
  })

  const overallProgressColor = createMemo(() => {
    const p = totalStats().percent
    if (p < 30) return "#ef4444"
    if (p < 70) return "#eab308"
    return "#22c55e"
  })

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      <div class="flex-1 min-h-0 overflow-auto px-2 py-1">
        <For each={props.groups()}>
          {(group) => {
            const expanded = () => expandedGroups[group.id] ?? true
            return (
              <div class="mb-2">
                <div
                  class="flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer hover:bg-background-tertiary-base/50 transition-colors"
                  onClick={() =>
                    setExpandedGroups(
                      produce((state) => {
                        state[group.id] = !expanded()
                      }),
                    )
                  }
                >
                  <span class="text-[10px] text-text-weak">{expanded() ? "▼" : "▶"}</span>
                  <span class="text-13-medium text-text-strong">{group.title}</span>
                  <span
                    class="text-[10px] px-1 py-0.5 rounded"
                    style={{
                      background: `${registry.getModeById(group.mode)?.color ?? "#666"}20`,
                      color: registry.getModeById(group.mode)?.color ?? "#666",
                    }}
                  >
                    {registry.getModeById(group.mode)?.name ?? group.mode}
                  </span>
                </div>

                <Show when={expanded()}>
                  <div class="flex flex-col">
                    <For each={group.tasks}>
                      {(task) => (
                        <TaskItem
                          task={task}
                          depth={0}
                          groupId={group.id}
                          onClick={props.onTaskClick}
                        />
                      )}
                    </For>
                  </div>
                </Show>
              </div>
            )
          }}
        </For>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2">
        <div class="flex items-center gap-2 mb-1">
          <div class="flex-1 h-1.5 bg-background-tertiary-base rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-700"
              style={{ width: `${totalStats().percent}%`, background: overallProgressColor() }}
            />
          </div>
          <span class="text-11-medium text-text-weak shrink-0">{totalStats().percent}%</span>
        </div>
        <div class="flex items-center justify-between text-11-regular text-text-weak">
          <span>
            {totalStats().completed}/{totalStats().total} 完成
          </span>
          <span>
            <Show when={totalStats().inProgress > 0}>
              {totalStats().inProgress} 进行中
            </Show>
            <Show when={totalStats().failed > 0}>
              {totalStats().failed} 失败
            </Show>
          </span>
        </div>
        <div class="flex items-center gap-2 mt-1.5">
          <button class="text-11-regular text-text-weak hover:text-text-base transition-colors">
            全部展开
          </button>
          <span class="text-text-weaker">|</span>
          <button class="text-11-regular text-text-weak hover:text-text-base transition-colors">
            全部折叠
          </button>
        </div>
      </div>
    </div>
  )
}