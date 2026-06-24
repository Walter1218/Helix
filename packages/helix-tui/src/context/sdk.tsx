import { createOpencodeClient, type GlobalEvent } from "@mimo-ai/sdk/v2"
import { createSimpleContext } from "./helper"
import { batch, onCleanup, createSignal } from "solid-js"

export type EventHandler = (event: GlobalEvent) => void

export const { use: useSDK, provider: SDKProvider } = createSimpleContext({
  name: "SDK",
  init: (props: {
    url: string
    directory?: string
    fetch?: typeof fetch
    headers?: RequestInit["headers"]
  }) => {
    const abort = new AbortController()
    const listeners = new Set<EventHandler>()
    const [connected, setConnected] = createSignal(false)

    const client = createOpencodeClient({
      baseUrl: props.url,
      signal: abort.signal,
      directory: props.directory,
      fetch: props.fetch,
      headers: props.headers,
    })

    const subscribe = (handler: EventHandler) => {
      listeners.add(handler)
      return () => listeners.delete(handler)
    }

    // 16ms batch event processing
    let pendingEvents: GlobalEvent[] = []
    let lastFlush = 0
    let flushTimeout: ReturnType<typeof setTimeout> | null = null

    function flushEvents() {
      if (flushTimeout) {
        clearTimeout(flushTimeout)
        flushTimeout = null
      }
      const events = pendingEvents
      pendingEvents = []
      lastFlush = Date.now()
      if (events.length > 0) {
        batch(() => {
          for (const event of events) {
            for (const l of listeners) l(event)
          }
        })
      }
    }

    function queueEvent(event: GlobalEvent) {
      pendingEvents.push(event)
      const now = Date.now()
      if (now - lastFlush > 16) {
        flushEvents()
      } else if (!flushTimeout) {
        flushTimeout = setTimeout(flushEvents, 16)
      }
    }

    async function startEvents() {
      let attempt = 0
      while (!abort.signal.aborted) {
        try {
          const result = await client.event.subscribe()
          setConnected(true)
          attempt = 0
          for await (const event of result.stream) {
            if (abort.signal.aborted) break
            queueEvent(event as unknown as GlobalEvent)
          }
        } catch {
          // Connection lost
        }
        setConnected(false)
        if (abort.signal.aborted) break
        // Exponential backoff: 1s, 2s, 4s, 8s, ... up to 30s
        attempt++
        const delay = Math.min(1000 * 2 ** (attempt - 1), 30000)
        await new Promise((r) => setTimeout(r, delay))
      }
    }

    startEvents()

    onCleanup(() => {
      abort.abort()
      if (flushTimeout) clearTimeout(flushTimeout)
    })

    return {
      client,
      subscribe,
      connected,
      ready: true,
    }
  },
})
