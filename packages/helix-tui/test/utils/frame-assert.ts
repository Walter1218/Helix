/**
 * Helix TUI 测试基础设施 —— 帧断言库
 *
 * 封装 OpenTUI `captureCharFrame()` 的常用断言模式，
 * 使测试代码更简洁、错误信息更友好。
 */

/**
 * 断言帧内容包含所有指定模式（字符串或正则）。
 * 失败时抛出包含实际帧片段的错误信息。
 */
export function assertFrameContains(
  frame: string,
  patterns: string | RegExp | (string | RegExp)[],
  message?: string,
): void {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  const missing = list.filter((p) => {
    if (typeof p === "string") {
      return !frame.includes(p)
    }
    return !p.test(frame)
  })

  if (missing.length > 0) {
    const snippet = frame.slice(0, 500)
    const missingStr = missing
      .map((p) => (typeof p === "string" ? `"${p}"` : p.toString()))
      .join(", ")
    throw new Error(
      `${message ?? "Frame assertion failed"}: expected frame to contain ${missingStr}\n\n--- Frame snippet (first 500 chars) ---\n${snippet}\n---`,
    )
  }
}

/**
 * 断言帧内容**不包含**所有指定模式。
 */
export function assertFrameNotContains(
  frame: string,
  patterns: string | RegExp | (string | RegExp)[],
  message?: string,
): void {
  const list = Array.isArray(patterns) ? patterns : [patterns]
  const found = list.filter((p) => {
    if (typeof p === "string") {
      return frame.includes(p)
    }
    return p.test(frame)
  })

  if (found.length > 0) {
    const snippet = frame.slice(0, 500)
    const foundStr = found
      .map((p) => (typeof p === "string" ? `"${p}"` : p.toString()))
      .join(", ")
    throw new Error(
      `${message ?? "Frame assertion failed"}: expected frame NOT to contain ${foundStr}\n\n--- Frame snippet (first 500 chars) ---\n${snippet}\n---`,
    )
  }
}

/**
 * 断言帧中某个正则模式出现的次数。
 */
export function assertFrameCount(
  frame: string,
  pattern: RegExp,
  expectedCount: number,
  message?: string,
): void {
  const matches = frame.match(pattern) ?? []
  if (matches.length !== expectedCount) {
    const snippet = frame.slice(0, 500)
    throw new Error(
      `${message ?? "Frame count assertion failed"}: expected ${pattern.toString()} to appear ${expectedCount} times, but found ${matches.length}\n\n--- Frame snippet (first 500 chars) ---\n${snippet}\n---`,
    )
  }
}

/**
 * 断言帧的特定区域（x, y, width, height）包含指定模式。
 *
 * 注意：OpenTUI 的帧是按行存储的字符串，区域提取通过行分割实现。
 * 对于简单断言，建议使用 assertFrameContains；本函数用于精确区域验证。
 */
export function assertFrameRegion(
  frame: string,
  x: number,
  y: number,
  width: number,
  height: number,
  pattern: string | RegExp,
  message?: string,
): void {
  const lines = frame.split("\n")
  const region = lines
    .slice(y, y + height)
    .map((line) => line.slice(x, x + width))
    .join("\n")

  const found =
    typeof pattern === "string" ? region.includes(pattern) : pattern.test(region)

  if (!found) {
    throw new Error(
      `${message ?? "Frame region assertion failed"}: expected region (${x},${y},${width},${height}) to contain ${typeof pattern === "string" ? `"${pattern}"` : pattern.toString()}\n\n--- Region ---\n${region}\n---`,
    )
  }
}

/**
 * 断言帧中包含指定数量的行。
 */
export function assertFrameLineCount(
  frame: string,
  expectedCount: number,
  message?: string,
): void {
  const lines = frame.split("\n")
  if (lines.length !== expectedCount) {
    throw new Error(
      `${message ?? "Frame line count assertion failed"}: expected ${expectedCount} lines, but found ${lines.length}\n\n--- Frame (first 20 lines) ---\n${lines.slice(0, 20).join("\n")}\n---`,
    )
  }
}

/**
 * 在帧中搜索模式，返回匹配位置（行号、列号）用于调试。
 */
export function findInFrame(
  frame: string,
  pattern: string | RegExp,
): Array<{ line: number; col: number; match: string }> {
  const lines = frame.split("\n")
  const results: Array<{ line: number; col: number; match: string }> = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (typeof pattern === "string") {
      let idx = line.indexOf(pattern)
      while (idx !== -1) {
        results.push({ line: i, col: idx, match: pattern })
        idx = line.indexOf(pattern, idx + 1)
      }
    } else {
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g")
      let match: RegExpExecArray | null
      while ((match = globalPattern.exec(line)) !== null) {
        results.push({ line: i, col: match.index, match: match[0] })
      }
    }
  }

  return results
}

/**
 * 打印帧内容，用于调试。将不可见字符转为可见表示。
 */
export function printFrame(frame: string, maxLines?: number): void {
  const lines = frame.split("\n")
  const slice = maxLines ? lines.slice(0, maxLines) : lines
  console.log(
    slice
      .map((line, i) => `${String(i).padStart(3)} | ${line.replace(/\x1b\[[0-9;]*m/g, "")}`)
      .join("\n"),
  )
}
