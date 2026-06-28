import path from "path"
import { writeHeapSnapshot } from "node:v8"
import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { Log } from "@/util"

const log = Log.create({ service: "heap" })
const MINUTE = 60_000
const LIMIT = 1.5 * 1024 * 1024 * 1024
const WARN_LIMIT = 1024 * 1024 * 1024

let timer: Timer | undefined
let lock = false
let armed = true
let warned = false

export function gc() {
  globalThis.gc?.()
}

export function start() {
  if (!Flag.MIMOCODE_AUTO_HEAP_SNAPSHOT) return
  if (timer) return

  const run = async () => {
    if (lock) return

    const stat = process.memoryUsage()
    if (stat.rss <= LIMIT) {
      armed = true
      if (stat.rss > WARN_LIMIT && !warned) {
        warned = true
        log.warn("memory usage approaching limit", {
          rss: stat.rss,
          heap: stat.heapUsed,
          external: stat.external,
        })
      }
      if (stat.rss <= WARN_LIMIT) warned = false
      return
    }
    if (!armed) return

    lock = true
    armed = false
    const file = path.join(
      Global.Path.log,
      `heap-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.heapsnapshot`,
    )
    log.warn("heap usage exceeded limit", {
      rss: stat.rss,
      heap: stat.heapUsed,
      file,
    })

    gc()

    await Promise.resolve()
      .then(() => writeHeapSnapshot(file))
      .catch((err) => {
        log.error("failed to write heap snapshot", {
          error: err instanceof Error ? err.message : String(err),
          file,
        })
      })

    lock = false
  }

  timer = setInterval(() => {
    void run()
  }, MINUTE)
  timer.unref?.()
}

export * as Heap from "./heap"
