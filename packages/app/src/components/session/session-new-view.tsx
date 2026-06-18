import { Show, createMemo } from "solid-js"
import { useSync } from "@/context/sync"
import { useSDK } from "@/context/sdk"
import { useLanguage } from "@/context/language"
import { Icon } from "@mimo-ai/ui/icon"
import { getDirectory, getFilename } from "@mimo-ai/shared/util/path"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"
const ROOT_CLASS = "size-full flex flex-col"

/** Helix 双螺旋图标（DNA 风格） */
const HelixMark = (props: { class?: string }) => (
  <svg
    classList={{ [props.class ?? ""]: !!props.class }}
    viewBox="0 0 32 32"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M10 2C10 9 14 13 16 16C18 13 22 9 22 2"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
      opacity="0.7"
    />
    <path
      d="M10 30C10 23 14 19 16 16C18 19 22 23 22 30"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      fill="none"
      opacity="0.7"
    />
    <line x1="11" y1="8" x2="21" y2="8" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
    <line x1="11" y1="16" x2="21" y2="16" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
    <line x1="11" y1="24" x2="21" y2="24" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
  </svg>
)

interface NewSessionViewProps {
  worktree: string
}

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const sdk = useSDK()
  const language = useLanguage()

  const sandboxes = createMemo(() => sync.project?.sandboxes ?? [])
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE])
  const current = createMemo(() => {
    const selection = props.worktree
    if (options().includes(selection)) return selection
    return MAIN_WORKTREE
  })
  const projectRoot = createMemo(() => sync.project?.worktree ?? sdk.directory)
  const isWorktree = createMemo(() => {
    const project = sync.project
    if (!project) return false
    return sdk.directory !== project.worktree
  })

  const label = (value: string) => {
    if (value === MAIN_WORKTREE) {
      if (isWorktree()) return language.t("session.new.worktree.main")
      const branch = sync.data.vcs?.branch
      if (branch) return language.t("session.new.worktree.mainWithBranch", { branch })
      return language.t("session.new.worktree.main")
    }

    if (value === CREATE_WORKTREE) return language.t("session.new.worktree.create")

    return getFilename(value)
  }

  return (
    <div class={ROOT_CLASS}>
      <div class="h-12 shrink-0" aria-hidden />
      <div class="flex-1 px-6 pb-30 flex items-center justify-center text-center">
        <div class="w-full max-w-200 flex flex-col items-center text-center gap-4">
          <div class="flex flex-col items-center gap-6">
            <HelixMark class="w-10 text-icon-strong-base" />
            <div class="text-20-medium text-text-strong">{language.t("session.new.title")}</div>
          </div>
          <div class="w-full flex flex-col gap-4 items-center">
            <div class="flex items-start justify-center gap-3 min-h-5">
              <div class="text-12-medium text-text-weak select-text leading-5 min-w-0 max-w-160 break-words text-center">
                {getDirectory(projectRoot())}
                <span class="text-text-strong">{getFilename(projectRoot())}</span>
              </div>
            </div>
            <div class="flex items-start justify-center gap-1.5 min-h-5">
              <Icon name="branch" size="small" class="mt-0.5 shrink-0" />
              <div class="text-12-medium text-text-weak select-text leading-5 min-w-0 max-w-160 break-words text-center">
                {label(current())}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
