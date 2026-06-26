import { onMount } from "solid-js"
import { createStore, produce, unwrap } from "solid-js/store"
import { createSimpleContext } from "../../context/helper"
import { Database, desc } from "@/storage"
import { InputHistoryTable } from "./history.sql"
import { eq, sql } from "drizzle-orm"
import type { AgentPart, FilePart, TextPart } from "@mimo-ai/sdk/v2"

export type PromptInfo = {
  input: string
  mode?: "normal" | "shell"
  parts: (
    | Omit<FilePart, "id" | "messageID" | "sessionID">
    | Omit<AgentPart, "id" | "messageID" | "sessionID">
    | (Omit<TextPart, "id" | "messageID" | "sessionID"> & {
        source?: {
          text: {
            start: number
            end: number
            value: string
          }
        }
      })
  )[]
}

const MAX_HISTORY_ENTRIES = 50

export const { use: usePromptHistory, provider: PromptHistoryProvider } = createSimpleContext({
  name: "PromptHistory",
  init: () => {
    onMount(async () => {
      const rows = Database.use((db) =>
        db
          .select()
          .from(InputHistoryTable)
          .orderBy(desc(InputHistoryTable.time_created))
          .limit(MAX_HISTORY_ENTRIES)
          .all(),
      )

      const entries = rows
        .reverse()
        .map((row) => ({
          input: row.input,
          mode: row.mode ?? undefined,
          parts: (row.parts ?? []) as PromptInfo["parts"],
        }))
        .filter((entry) => entry.input.length > 0)

      setStore("history", entries)
    })

    const [store, setStore] = createStore({
      index: 0,
      history: [] as PromptInfo[],
    })

    return {
      move(direction: 1 | -1, input: string) {
        if (!store.history.length) return undefined
        const current = store.history.at(store.index)
        if (!current) return undefined
        if (current.input !== input && input.length) return
        setStore(
          produce((draft) => {
            const next = store.index + direction
            if (Math.abs(next) > store.history.length) return
            if (next > 0) return
            draft.index = next
          }),
        )
        if (store.index === 0)
          return {
            input: "",
            parts: [],
          }
        return store.history.at(store.index)
      },
      append(item: PromptInfo) {
        const entry = structuredClone(unwrap(item))
        let trimmed = false
        setStore(
          produce((draft) => {
            draft.history.push(entry)
            if (draft.history.length > MAX_HISTORY_ENTRIES) {
              draft.history = draft.history.slice(-MAX_HISTORY_ENTRIES)
              trimmed = true
            }
            draft.index = 0
          }),
        )

        Database.use((db) => {
          db.insert(InputHistoryTable)
            .values({
              input: entry.input,
              mode: entry.mode ?? null,
              parts: entry.parts,
            })
            .run()

          if (trimmed) {
            const countRow = db
              .select({ count: sql<number>`count(*)` })
              .from(InputHistoryTable)
              .get()
            const total = countRow?.count ?? 0
            if (total > MAX_HISTORY_ENTRIES) {
              const excess = total - MAX_HISTORY_ENTRIES
              const oldest = db
                .select({ id: InputHistoryTable.id })
                .from(InputHistoryTable)
                .orderBy(InputHistoryTable.time_created)
                .limit(excess)
                .all()
              for (const row of oldest) {
                db.delete(InputHistoryTable).where(eq(InputHistoryTable.id, row.id)).run()
              }
            }
          }
        })
      },
    }
  },
})
