export const createStopwatch = () => {
  let elapsed = 0
  let startTime: number | null = null
  let interval: ReturnType<typeof setInterval> | null = null

  const start = () => {
    if (interval) return
    startTime = Date.now() - elapsed
    interval = setInterval(() => {
      elapsed = Date.now() - startTime!
    }, 10)
  }

  const stop = () => {
    if (!interval) return
    clearInterval(interval)
    interval = null
    startTime = null
  }

  const reset = () => {
    stop()
    elapsed = 0
  }

  const time = () => elapsed

  const format = () => {
    const ms = elapsed % 1000
    const s = Math.floor(elapsed / 1000) % 60
    const m = Math.floor(elapsed / 60000) % 60
    const h = Math.floor(elapsed / 3600000)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`
  }

  return { start, stop, reset, time, format }
}
