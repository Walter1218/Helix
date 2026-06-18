import { For, Show, createSignal, createMemo, type JSX } from "solid-js"
import { createStore, produce } from "solid-js/store"
import type { SnapshotFileDiff, VcsFileDiff } from "@mimo-ai/sdk/v2"
import { SessionReview } from "@mimo-ai/ui/session-review"
import { Icon } from "@mimo-ai/ui/icon"
import { IconButton } from "@mimo-ai/ui/icon-button"
import { Button } from "@mimo-ai/ui/button"
import { Dialog } from "@mimo-ai/ui/dialog"
import { useDialog } from "@mimo-ai/ui/context/dialog"
import { useLanguage } from "@/context/language"

export type ChangeType = "modified" | "added" | "deleted"

export interface FileChange {
  id: string
  path: string
  type: ChangeType
  additions: number
  deletions: number
  checked: boolean
  diff?: string
  content?: string
}

export interface Checkpoint {
  id: string
  number: number
  timestamp: string
  fileCount: number
  operator: "agent" | "user"
  description?: string
  files: FileChange[]
}

export interface CheckpointPanelProps {
  changes: () => FileChange[]
  staged: () => FileChange[]
  checkpoints: () => Checkpoint[]
  onKeep?: (fileId: string) => void
  onRevert?: (fileId: string) => void
  onStage?: (fileId: string) => void
  onUnstage?: (fileId: string) => void
  onAcceptAll?: () => void
  onRevertAll?: () => void
  onCommit?: () => void
  onCreateCheckpoint?: (description?: string) => void
  onRestoreCheckpoint?: (checkpointId: string) => void
  onCompareCheckpoint?: (checkpointId: string) => void
  onDeleteCheckpoint?: (checkpointId: string) => void
}

type Tab = "changes" | "staged" | "history"

const changeTypeIcon: Record<ChangeType, string> = {
  modified: "●",
  added: "+",
  deleted: "−",
}

const changeTypeColor: Record<ChangeType, string> = {
  modified: "text-purple-400",
  added: "text-green-400",
  deleted: "text-red-400",
}

export function CheckpointPanel(props: CheckpointPanelProps) {
  const language = useLanguage()
  const dialog = useDialog()
  const [activeTab, setActiveTab] = createSignal<Tab>("changes")
  const [selectedFileId, setSelectedFileId] = createSignal<string | null>(null)
  const [store, setStore] = createStore({
    allSelected: false,
  })

  const selectedChanges = createMemo(() => props.changes().filter((c) => c.checked))
  const totalAdditions = createMemo(() => props.changes().reduce((sum, c) => sum + c.additions, 0))
  const totalDeletions = createMemo(() => props.changes().reduce((sum, c) => sum + c.deletions, 0))

  const handleSelectAll = () => {
    const next = !store.allSelected
    setStore("allSelected", next)
    // Note: actual selection would be handled by parent via onX callbacks
  }

  const renderChangesTab = () => (
    <div class="flex flex-col h-full">
      <div class="flex-1 min-h-0 overflow-auto">
        <div class="flex items-center gap-2 px-3 py-2 border-b border-border-weaker-base">
          <button
            class="text-11-regular text-text-weak hover:text-text-base transition-colors"
            onClick={handleSelectAll}
          >
            {store.allSelected ? "反选" : "全选"}
          </button>
        </div>

        <For each={props.changes()}>
          {(file) => (
            <div
              class="flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary-base/50 cursor-pointer transition-colors"
              classList={{ "bg-background-tertiary-base/30": selectedFileId() === file.id }}
              onClick={() => setSelectedFileId(file.id === selectedFileId() ? null : file.id)}
            >
              <input
                type="checkbox"
                checked={file.checked}
                class="accent-primary"
                onClick={(e) => e.stopPropagation()}
              />
              <span class={`text-[11px] ${changeTypeColor[file.type]}`}>{changeTypeIcon[file.type]}</span>
              <span class="text-12-regular text-text-base truncate flex-1">{file.path}</span>
              <span class="text-11-regular text-text-weak shrink-0">
                {file.additions > 0 && `+${file.additions}`}
                {file.deletions > 0 && ` −${file.deletions}`}
              </span>

              <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  class="text-11-regular text-green-500 hover:text-green-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onKeep?.(file.id)
                  }}
                >
                  Keep
                </button>
                <button
                  class="text-11-regular text-red-500 hover:text-red-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onRevert?.(file.id)
                  }}
                >
                  Revert
                </button>
                <button
                  class="text-11-regular text-blue-500 hover:text-blue-400"
                  onClick={(e) => {
                    e.stopPropagation()
                    props.onStage?.(file.id)
                  }}
                >
                  Stage
                </button>
              </div>
            </div>
          )}
        </For>

        <Show when={selectedFileId()}>
          <div class="border-t border-border-weaker-base mx-2">
            <div class="text-11-regular text-text-weak px-2 py-1">Diff Preview</div>
            <div class="px-2 pb-2 text-12-regular font-mono">
              <For
                each={props
                  .changes()
                  .find((c) => c.id === selectedFileId())
                  ?.diff?.split("\n")}
              >
                {(line) => (
                  <div
                    class="py-0.5 px-1"
                    classList={{
                      "bg-green-500/10 text-green-400": line.startsWith("+"),
                      "bg-red-500/10 text-red-400": line.startsWith("-"),
                      "text-text-weak": line.startsWith("@@"),
                    }}
                  >
                    {line}
                  </div>
                )}
              </For>
            </div>
          </div>
        </Show>
      </div>

      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2">
        <div class="flex items-center justify-between text-11-regular text-text-weak mb-2">
          <span>
            {props.changes().length} 文件 · {totalAdditions()}+ {totalDeletions()}−
          </span>
        </div>
        <div class="flex items-center gap-2">
          <Button
            size="small"
            variant="secondary"
            class="flex-1"
            onClick={() => props.onAcceptAll?.()}
          >
            全部接受
          </Button>
          <Button
            size="small"
            variant="ghost"
            class="flex-1 text-red-500"
            onClick={() => props.onRevertAll?.()}
          >
            全部撤销
          </Button>
          <Button
            size="small"
            class="flex-1"
            onClick={() => {
              const selected = selectedChanges()
              if (selected.length > 0) {
                dialog.show(() => (
                  <div class="p-4">
                    <div class="text-16-medium mb-2">提交变更</div>
                    <div class="text-14-regular text-text-weak mb-4">
                      将 {selected.length} 个文件的变更提交到主工作区
                    </div>
                    <div class="flex items-center gap-2 justify-end">
                      <Button size="small" variant="ghost" onClick={() => dialog.close()}>
                        取消
                      </Button>
                      <Button
                        size="small"
                        onClick={() => {
                          props.onCommit?.()
                          dialog.close()
                        }}
                      >
                        确认提交
                      </Button>
                    </div>
                  </div>
                ))
              }
            }}
          >
            提交
          </Button>
        </div>
      </div>
    </div>
  )

  const renderStagedTab = () => (
    <div class="flex flex-col h-full">
      <div class="flex-1 min-h-0 overflow-auto">
        <For each={props.staged()}>
          {(file) => (
            <div class="flex items-center gap-2 px-3 py-1.5 hover:bg-background-tertiary-base/50">
              <span class={`text-[11px] ${changeTypeColor[file.type]}`}>{changeTypeIcon[file.type]}</span>
              <span class="text-12-regular text-text-base truncate flex-1">{file.path}</span>
              <button
                class="text-11-regular text-text-weak hover:text-text-base"
                onClick={() => props.onUnstage?.(file.id)}
              >
                Unstage
              </button>
            </div>
          )}
        </For>
      </div>
      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2 flex items-center gap-2">
        <Button size="small" variant="ghost" class="flex-1" onClick={() => props.onRevertAll?.()}>
          Reset
        </Button>
        <Button size="small" class="flex-1" onClick={() => props.onCommit?.()}>
          Commit
        </Button>
      </div>
    </div>
  )

  const renderHistoryTab = () => (
    <div class="flex flex-col h-full">
      <div class="flex-1 min-h-0 overflow-auto">
        <For each={props.checkpoints()}>
          {(cp) => (
            <div class="flex flex-col gap-1 px-3 py-2 border-b border-border-weaker-base hover:bg-background-tertiary-base/30">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <span class="text-13-medium text-text-strong">Checkpoint #{cp.number}</span>
                  <span class="text-11-regular text-text-weak">{cp.timestamp}</span>
                </div>
                <span
                  class="text-[10px] px-1 py-0.5 rounded"
                  classList={{
                    "bg-blue-500/20 text-blue-400": cp.operator === "agent",
                    "bg-purple-500/20 text-purple-400": cp.operator === "user",
                  }}
                >
                  {cp.operator === "agent" ? "Agent" : "用户"}
                </span>
              </div>
              <div class="text-11-regular text-text-weak">
                {cp.fileCount} 文件
                {cp.description && ` · ${cp.description}`}
              </div>
              <div class="flex items-center gap-2 mt-1">
                <button
                  class="text-11-regular text-blue-500 hover:text-blue-400"
                  onClick={() => props.onRestoreCheckpoint?.(cp.id)}
                >
                  恢复
                </button>
                <button
                  class="text-11-regular text-text-weak hover:text-text-base"
                  onClick={() => props.onCompareCheckpoint?.(cp.id)}
                >
                  对比
                </button>
                <button
                  class="text-11-regular text-red-500 hover:text-red-400"
                  onClick={() => props.onDeleteCheckpoint?.(cp.id)}
                >
                  删除
                </button>
              </div>
            </div>
          )}
        </For>
      </div>
      <div class="shrink-0 border-t border-border-weaker-base px-3 py-2">
        <Button
          size="small"
          variant="secondary"
          class="w-full"
          onClick={() => {
            dialog.show(() => (
              <div class="p-4">
                <div class="text-16-medium mb-2">创建检查点</div>
                <div class="text-14-regular text-text-weak mb-4">保存当前变更状态为新的检查点</div>
                <div class="flex items-center gap-2 justify-end">
                  <Button size="small" variant="ghost" onClick={() => dialog.close()}>
                    取消
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      props.onCreateCheckpoint?.()
                      dialog.close()
                    }}
                  >
                    创建
                  </Button>
                </div>
              </div>
            ))
          }}
        >
          创建检查点
        </Button>
      </div>
    </div>
  )

  return (
    <div class="h-full flex flex-col overflow-hidden bg-background-base">
      <div class="flex items-center gap-1 px-2 py-1.5 border-b border-border-weaker-base">
        <For each={(["changes", "staged", "history"] as Tab[])}>
          {(tab) => (
            <button
              class="px-2 py-1 rounded text-11-medium transition-colors"
              classList={{
                "bg-background-tertiary-base text-text-strong": activeTab() === tab,
                "text-text-weak hover:text-text-base": activeTab() !== tab,
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "changes" && `Changes (${props.changes().length})`}
              {tab === "staged" && `Staged (${props.staged().length})`}
              {tab === "history" && `History (${props.checkpoints().length})`}
            </button>
          )}
        </For>
      </div>

      <div class="flex-1 min-h-0 overflow-hidden">
        <Show when={activeTab() === "changes"}>{renderChangesTab()}</Show>
        <Show when={activeTab() === "staged"}>{renderStagedTab()}</Show>
        <Show when={activeTab() === "history"}>{renderHistoryTab()}</Show>
      </div>
    </div>
  )
}