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

    async function startEvents() {
      try {
        const result = await client.event.subscribe()
        setConnected(true)
        for await (const event of result.stream) {
          if (abort.signal.aborted) break
          batch(() => {
            listeners.forEach((l) => l(event as unknown as GlobalEvent))
          })
        }
      } catch {
        setConnected(false)
      }
    }

    startEvents()

    onCleanup(() => {
      abort.abort()
    })

    return {
      client,
      subscribe,
      connected,
      ready: true,
    }
  },
})
