import { Log } from "../util"

const log = Log.create({ service: "embedder" })

export interface EmbedderConfig {
  baseUrl: string
  model: string
  enabled: boolean
}

export class Embedder {
  enabled: boolean

  constructor(private config_: EmbedderConfig) {
    this.enabled = config_.enabled
  }

  async embed(text: string): Promise<number[]> {
    const results = await this.embedBatch([text])
    if (results.length === 0) throw new Error("embedding returned empty")
    return results[0]
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []
    if (!this.enabled) {
      return texts.map(() => new Array(768).fill(0))
    }
    try {
      const res = await fetch(this.config_.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: this.config_.model, input: texts }),
      })
      if (!res.ok) {
        log.error("embedding API failed", { status: res.status })
        return texts.map(() => new Array(768).fill(0))
      }
      const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
      if (!data.data || data.data.length !== texts.length) {
        log.error("embedding count mismatch", { expected: texts.length, got: data.data?.length ?? 0 })
        return texts.map(() => new Array(768).fill(0))
      }
      return data.data.map((d) => d.embedding)
    } catch (err) {
      log.error("embedding API error", { error: String(err) })
      return texts.map(() => new Array(768).fill(0))
    }
  }

  static cosine(a: number[], b: number[]): number {
    let dot = 0, na = 0, nb = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      na += a[i] * a[i]
      nb += b[i] * b[i]
    }
    return na > 0 && nb > 0 ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
  }
}
