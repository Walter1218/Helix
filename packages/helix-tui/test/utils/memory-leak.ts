/**
 * Helix TUI 测试基础设施 —— 内存泄漏检测
 *
 * 使用 Bun.gc() 或 process.memoryUsage() 检测测试前后的内存增量，
 * 用于验证 TUI 组件在长时间运行、频繁切换、大量消息场景下不泄漏内存。
 */

/**
 * 获取当前内存使用量（RSS 字节数）。
 * 优先使用 Bun.gc() 后读取 process.memoryUsage()，
 * 如果 Bun.gc 不可用则直接读取。
 */
function getMemoryUsage(): number {
  // 尝试强制 GC 以获取更准确的读数
  if (typeof Bun !== "undefined" && Bun.gc) {
    Bun.gc(true)
  }
  return process.memoryUsage().rss
}

/**
 * 断言测试函数执行前后内存增量不超过阈值。
 *
 * @param testFn 测试函数
 * @param thresholdBytes 内存增量阈值（字节），默认 5MB
 * @param warmupRuns 热身次数（消除 JIT 影响），默认 3
 *
 * @example
 *   await assertNoMemoryLeak(async () => {
 *     for (let i = 0; i < 100; i++) {
 *       await sendMessage(result, `test ${i}`)
 *     }
 *   }, 10 * 1024 * 1024) // 10MB
 */
export async function assertNoMemoryLeak(
  testFn: () => Promise<void>,
  thresholdBytes: number = 5 * 1024 * 1024,
  warmupRuns: number = 3,
): Promise<void> {
  // 热身：消除 JIT 编译等一次性开销
  for (let i = 0; i < warmupRuns; i++) {
    await testFn()
    await new Promise((r) => setTimeout(r, 100))
  }

  // 等待 GC 稳定
  await new Promise((r) => setTimeout(r, 500))
  const before = getMemoryUsage()

  // 正式测试
  await testFn()

  // 等待 GC 稳定
  await new Promise((r) => setTimeout(r, 500))
  const after = getMemoryUsage()

  const delta = after - before
  if (delta > thresholdBytes) {
    throw new Error(
      `Memory leak detected: usage increased by ${(delta / 1024 / 1024).toFixed(2)}MB (threshold: ${(thresholdBytes / 1024 / 1024).toFixed(2)}MB)\n` +
        `  Before: ${(before / 1024 / 1024).toFixed(2)}MB\n` +
        `  After:  ${(after / 1024 / 1024).toFixed(2)}MB`,
    )
  }
}

/**
 * 测量内存增量，返回实际增量值，不抛出异常。
 * 用于收集内存使用数据，而非断言。
 */
export async function measureMemoryDelta(
  testFn: () => Promise<void>,
  warmupRuns: number = 3,
): Promise<{ before: number; after: number; delta: number }> {
  for (let i = 0; i < warmupRuns; i++) {
    await testFn()
    await new Promise((r) => setTimeout(r, 100))
  }

  await new Promise((r) => setTimeout(r, 500))
  const before = getMemoryUsage()

  await testFn()

  await new Promise((r) => setTimeout(r, 500))
  const after = getMemoryUsage()

  return { before, after, delta: after - before }
}
