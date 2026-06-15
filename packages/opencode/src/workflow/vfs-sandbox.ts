import * as fs from "node:fs"
import * as path from "node:path"
import { Log } from "@/util"

const log = Log.create({ service: "vfs-sandbox" })

/**
 * 基于写时复制 (Copy-on-Write) 的轻量级虚拟文件系统。
 *
 * 不复制整个项目目录，只在内存中维护一个 overlay Map。
 * 读取时先查 overlay，没有则 fallback 到真实文件系统。
 * 写入只修改 overlay，绝不触碰原始文件。
 *
 * 用于在超大 Monorepo（>500MB）上替代 git worktree，
 * 实现毫秒级的沙箱创建。
 */
export class VFSOverlay {
  /** overlay 中存储的修改/新增文件 (绝对路径 → 文件内容) */
  private overlay = new Map<string, Buffer>()
  /** 被标记为删除的文件 */
  private deleted = new Set<string>()
  /** 沙箱根路径 */
  readonly root: string
  /** 工作目录 */
  private cwd: string

  constructor(projectRoot: string, workspaceDir?: string) {
    this.root = path.resolve(projectRoot)
    this.cwd = workspaceDir ?? this.root
  }

  /**
   * 估算项目大小，判断是否需要使用 VFS 降级。
   * 返回字节数。
   */
  static estimateProjectSize(root: string): number {
    try {
      let total = 0
      const skip = new Set(["node_modules", ".git", ".dogfooding", "dist", ".next", "__pycache__", "target"])
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
        for (const e of entries) {
          if (skip.has(e.name)) continue
          const p = path.join(dir, e.name)
          if (e.isDirectory()) {
            walk(p)
          } else if (e.isFile()) {
            total += e.size ?? fs.statSync(p).size
          }
        }
      }
      walk(root)
      return total
    } catch {
      return 0
    }
  }

  /** 获取 overlay 中修改过的文件列表 */
  modifiedFiles(): string[] {
    const files: string[] = []
    for (const [k] of this.overlay) files.push(k)
    return files
  }

  /** 获取 Diff（overlay 中的内容 vs 原始文件内容） */
  getDiff(): Map<string, { original: string | null; modified: string }> {
    const diffs = new Map<string, { original: string | null; modified: string }>()
    for (const [filePath, content] of this.overlay) {
      const original = this.readRealFile(filePath)
      const modified = content.toString("utf-8")
      if (original !== modified) {
        diffs.set(filePath, { original, modified })
      }
    }
    return diffs
  }

  /** 读取文件：先查 overlay，再查真实文件系统 */
  readFileSync(filePath: string): Buffer {
    const resolved = this.resolve(filePath)
    if (this.deleted.has(resolved)) {
      throw Object.assign(new Error(`ENOENT: ${resolved}`), { code: "ENOENT" })
    }
    if (this.overlay.has(resolved)) {
      return this.overlay.get(resolved)!
    }
    return fs.readFileSync(resolved)
  }

  /** 写入文件：只修改 overlay */
  writeFileSync(filePath: string, content: string | Buffer): void {
    const resolved = this.resolve(filePath)
    this.deleted.delete(resolved)
    this.overlay.set(resolved, Buffer.isBuffer(content) ? content : Buffer.from(content))
  }

  /** 删除文件：标记为已删除 */
  deleteFileSync(filePath: string): void {
    const resolved = this.resolve(filePath)
    this.overlay.delete(resolved)
    this.deleted.add(resolved)
  }

  /** 检查文件是否存在 */
  existsSync(filePath: string): boolean {
    const resolved = this.resolve(filePath)
    if (this.deleted.has(resolved)) return false
    if (this.overlay.has(resolved)) return true
    return fs.existsSync(resolved)
  }

  /** 列出目录 */
  readdirSync(dirPath: string): string[] {
    const resolved = this.resolve(dirPath)
    const real = (() => {
      try {
        return fs.readdirSync(resolved)
      } catch {
        return []
      }
    })()
    const overlayEntries: string[] = []
    for (const [k] of this.overlay) {
      if (path.dirname(k) === resolved) {
        overlayEntries.push(path.basename(k))
      }
    }
    // 合并去重
    const all = new Set([...real, ...overlayEntries])
    return [...all].filter((e) => !this.deleted.has(path.join(resolved, e)))
  }

  /** 获取文件状态 */
  statSync(filePath: string): fs.Stats | null {
    const resolved = this.resolve(filePath)
    if (this.deleted.has(resolved)) return null
    if (this.overlay.has(resolved)) {
      const buf = this.overlay.get(resolved)!
      return {
        size: buf.length,
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
        mtime: new Date(),
        // minimal stats
      } as unknown as fs.Stats
    }
    try {
      return fs.statSync(resolved)
    } catch {
      return null
    }
  }

  /** 路径解析：相对路径 → 绝对路径 */
  private resolve(p: string): string {
    if (path.isAbsolute(p)) return p
    return path.resolve(this.cwd, p)
  }

  /** 设置工作目录 */
  chdir(dir: string): void {
    this.cwd = this.resolve(dir)
  }

  /** 清除所有 overlay 数据（释放内存） */
  clear(): void {
    this.overlay.clear()
    this.deleted.clear()
  }

  /** 将 overlay 中的修改应用到真实文件系统 */
  applyToRealFS(): { applied: number; deleted: number } {
    let applied = 0
    for (const [filePath, content] of this.overlay) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, content)
      applied++
    }
    let removed = 0
    for (const filePath of this.deleted) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        removed++
      }
    }
    this.clear()
    return { applied, deleted: removed }
  }

  private readRealFile(filePath: string): string | null {
    try {
      return fs.readFileSync(filePath, "utf-8")
    } catch {
      return null
    }
  }
}

/**
 * 智能选择沙箱策略：
 * - 项目 < 500MB → 返回 null，应使用 git worktree
 * - 项目 >= 500MB → 返回 VFSOverlay 实例，自动降级
 */
export function createSandbox(projectRoot: string, workspaceDir?: string): VFSOverlay | null {
  const size = VFSOverlay.estimateProjectSize(projectRoot)
  const THRESHOLD = 500 * 1024 * 1024 // 500MB
  if (size < THRESHOLD) {
    log.info("project under 500MB, prefer git worktree", { sizeMB: (size / 1024 / 1024).toFixed(1) })
    return null
  }
  log.info("project over 500MB, using VFS overlay sandbox", { sizeMB: (size / 1024 / 1024).toFixed(1) })
  return new VFSOverlay(projectRoot, workspaceDir)
}
