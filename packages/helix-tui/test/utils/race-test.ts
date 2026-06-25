/**
 * Helix TUI 测试基础设施 —— 竞态测试工具
 *
 * 提供循环执行、并发压力、异常聚合等测试工具，
 * 用于验证 TUI 在快速操作、并发事件下的稳定性。
 */

/**
 * 循环执行测试函数，捕获所有异常，最终断言异常数量为 0。
 *
 * @param name 测试名称（用于错误信息）
 * @param iterations 循环次数
 * @param testFn 测试函数，返回 Promise
 *
 * @example
 *   await raceTest("快速发送消息", 50, async () => {
 *     await sendMessage(result, "stress test")
 *     await waitForFrame(result, f => f.includes("Helix:"), 5000)
 *   })
 */
export async function raceTest(
  name: string,
  iterations: number,
  testFn: () => Promise<void>,
): Promise<void> {
  const errors: Array<{ index: number; error: Error }> = []

  for (let i = 0; i < iterations; i++) {
    try {
      await testFn()
    } catch (e) {
      errors.push({ index: i, error: e instanceof Error ? e : new Error(String(e)) })
    }
  }

  if (errors.length > 0) {
    const firstErrors = errors.slice(0, 5)
    const errorMessages = firstErrors
      .map((e) => `  [iteration ${e.index}] ${e.error.message}`)
      .join("\n")
    const more = errors.length > 5 ? `\n  ... and ${errors.length - 5} more errors` : ""
    throw new Error(
      `Race test "${name}" failed: ${errors.length}/${iterations} iterations threw errors:\n${errorMessages}${more}`,
    )
  }
}

/**
 * 并发执行多个测试函数，捕获所有异常，最终断言异常数量为 0。
 *
 * @param name 测试名称
 * @param testFns 并发执行的测试函数数组
 *
 * @example
 *   await concurrentTest("并发操作", [
 *     async () => { await sendMessage(result, "A") },
 *     async () => { await sendMessage(result, "B") },
 *   ])
 */
export async function concurrentTest(
  name: string,
  testFns: Array<() => Promise<void>>,
): Promise<void> {
  const results = await Promise.allSettled(testFns.map((fn) => fn()))
  const errors = results
    .map((r, i) => ({ index: i, result: r }))
    .filter((r) => r.result.status === "rejected")
    .map((r) => ({
      index: r.index,
      error: (r.result as PromiseRejectedResult).reason as Error,
    }))

  if (errors.length > 0) {
    const errorMessages = errors
      .map((e) => `  [concurrent ${e.index}] ${e.error instanceof Error ? e.error.message : String(e.error)}`)
      .join("\n")
    throw new Error(
      `Concurrent test "${name}" failed: ${errors.length}/${testFns.length} tasks threw errors:\n${errorMessages}`,
    )
  }
}

/**
 * 重复执行某个操作，直到超时或断言通过。
 * 用于处理异步竞态的轮询断言。
 *
 * @param name 操作名称
 * @param predicate 断言函数
 * @param maxWaitMs 最大等待时间
 * @param intervalMs 轮询间隔
 *
 * @example
 *   await pollUntil("等待渲染完成", async () => {
 *     const frame = result.captureCharFrame()
 *     return frame.includes("Helix:")
 *   }, 30000)
 */
export async function pollUntil(
  name: string,
  predicate: () => Promise<boolean> | boolean,
  maxWaitMs: number = 60000,
  intervalMs: number = 200,
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const result = await predicate()
    if (result) return
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Poll "${name}" timed out after ${maxWaitMs}ms`)
}

/**
 * 在有限时间内等待条件满足，返回实际经过的时间。
 * 不抛出异常，适合用于超时测试。
 */
export async function waitWithTimeout(
  predicate: () => Promise<boolean> | boolean,
  maxWaitMs: number = 5000,
  intervalMs: number = 100,
): Promise<{ success: boolean; elapsedMs: number }> {
  const start = Date.now()
  while (Date.now() - start < maxWaitMs) {
    const result = await predicate()
    if (result) return { success: true, elapsedMs: Date.now() - start }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return { success: false, elapsedMs: Date.now() - start }
}
