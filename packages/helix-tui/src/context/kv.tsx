import { rename, rm, mkdir } from "fs/promises"
import { createSignal } from "solid-js"
import { createStore, unwrap } from "solid-js/store"
import { createSimpleContext } from "./helper"
import path from "path"
import { existsSync } from "fs"

const STATE_DIR = path.join(
  process.env.MIMOCODE_HOME ?? path.join(process.env.HOME ?? "~", ".config", "helix-tui"),
  "state",
)

const FILE_PATH = path.join(STATE_DIR, "kv.json")

async function readJson(filePath: string): Promise<Record<string, any> | undefined> {
  if (!existsSync(filePath)) return undefined
  const file = Bun.file(filePath)
  return file.json()
}

async function writeJson(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await Bun.write(tempPath, JSON.stringify(data, null, 2))
  await rename(tempPath, filePath).catch(async (error) => {
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  })
}

export const { use: useKV, provider: KVProvider } = createSimpleContext({
  name: "KV",
  init: () => {
    const [ready, setReady] = createSignal(false)
    const [store, setStore] = createStore<Record<string, any>>()
    let write = Promise.resolve()

    readJson(FILE_PATH)
      .then((data) => {
        if (data) setStore(data as Record<string, any>)
      })
      .catch((error) => {
        console.error("Failed to read KV state", { filePath: FILE_PATH, error })
      })
      .finally(() => {
        setReady(true)
      })

    const result = {
      get ready() {
        return ready()
      },
      get store() {
        return store
      },
      signal<T>(name: string, defaultValue: T) {
        if (store[name] === undefined) setStore(name, defaultValue)
        return [
          function () {
            return result.get(name) as T
          },
          function setter(next: T | ((prev: T) => T)) {
            result.set(name, next)
          },
        ] as const
      },
      get(key: string, defaultValue?: any) {
        return store[key] ?? defaultValue
      },
      set(key: string, value: any) {
        setStore(key, value)
        const snapshot = structuredClone(unwrap(store))
        write = write
          .then(() => writeJson(FILE_PATH, snapshot))
          .catch((error) => {
            console.error("Failed to write KV state", { filePath: FILE_PATH, error })
          })
      },
    }
    return result
  },
})
