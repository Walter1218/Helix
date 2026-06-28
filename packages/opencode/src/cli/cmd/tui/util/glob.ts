// @ts-nocheck
export const Glob = {
  async glob(pattern: string, options?: { cwd?: string; onlyFiles?: boolean }): Promise<string[]> {
    const fs = await import("fs/promises")
    const path = await import("path")
    try {
      const cwd = options?.cwd ?? process.cwd()
      const entries = await fs.readdir(cwd, { withFileTypes: true })
      return entries.filter(e => e.isFile()).map(e => e.name)
    } catch { return [] }
  },
  async scan(dir: string): Promise<string[]> {
    const fs = await import("fs/promises")
    const path = await import("path")
    const result: string[] = []
    async function walk(d: string) {
      const entries = await fs.readdir(d, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(d, e.name)
        if (e.isFile()) result.push(full)
        else if (e.isDirectory()) await walk(full)
      }
    }
    try { await walk(dir) } catch {}
    return result
  },
}
