/**
 * Helix TUI 测试基础设施 —— localStorage Mock
 *
 * 为测试环境提供 `Storage` 接口的内存实现，
 * 用于测试 localStorage 相关功能（如会话恢复、lastSessionID 缓存）。
 *
 * @example
 *   import { createMockStorage } from "./utils/local-storage"
 *   global.localStorage = createMockStorage()
 *   global.sessionStorage = createMockStorage()
 */

export function createMockStorage(): Storage {
  const store = new Map<string, string>()

  return {
    get length() {
      return store.size
    },

    key(index: number): string | null {
      return Array.from(store.keys())[index] ?? null
    },

    getItem(key: string): string | null {
      return store.get(key) ?? null
    },

    setItem(key: string, value: string): void {
      store.set(key, value)
    },

    removeItem(key: string): void {
      store.delete(key)
    },

    clear(): void {
      store.clear()
    },
  }
}

/**
 * 在全局对象上注入 localStorage 和 sessionStorage 的 mock 实现。
 * 返回清理函数，用于测试后恢复原始状态。
 */
export function injectMockStorage(): () => void {
  const originalLocalStorage = global.localStorage
  const originalSessionStorage = global.sessionStorage

  global.localStorage = createMockStorage()
  global.sessionStorage = createMockStorage()

  return () => {
    global.localStorage = originalLocalStorage
    global.sessionStorage = originalSessionStorage
  }
}

/**
 * 快捷函数：在测试中临时注入 mock storage，自动在测试后清理。
 * 用于 beforeEach / afterEach 钩子。
 *
 * @example
 *   let cleanup: () => void
 *   beforeEach(() => { cleanup = injectMockStorage() })
 *   afterEach(() => { cleanup() })
 */
export function useMockStorage(): { cleanup: () => void; storage: Storage } {
  const originalLocalStorage = global.localStorage
  const originalSessionStorage = global.sessionStorage
  const storage = createMockStorage()

  global.localStorage = storage
  global.sessionStorage = storage

  return {
    cleanup: () => {
      global.localStorage = originalLocalStorage
      global.sessionStorage = originalSessionStorage
    },
    storage,
  }
}
