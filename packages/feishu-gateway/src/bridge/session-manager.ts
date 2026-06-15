import { config } from "../config"
import { Logger } from "../logger"

const log = Logger.create("session")

interface SessionInfo {
  status?: string
}

/**
 * Session 管理器：维护飞书用户 open_id ↔ Helix sessionID 的映射。
 * 同一用户的新任务自动复用已有 Session。
 */
export class SessionManager {
  private sessions = new Map<string, { sessionID: string; chatId: string; createdAt: number }>()
  private tokenCache: { token: string; expiresAt: number } | null = null

  /** 获取或创建 Session */
  async create(openId: string, chatId: string): Promise<string> {
    const existing = this.sessions.get(openId)
    if (existing && Date.now() - existing.createdAt < 600_000) {
      existing.chatId = chatId // 更新 chatId（可能从群聊切私聊）
      return existing.sessionID
    }

    try {
      const res = await fetch(`${config.helix.url}/api/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          directory: config.helix.workDir,
          model: { providerID: config.helix.modelProvider, modelID: config.helix.model },
        }),
      })
      if (!res.ok) {
        log.error("创建 Helix Session 失败", { status: res.status })
        return ""
      }
      const data = await res.json() as { id?: string }
      const sessionID = data.id ?? `feishu-${openId}-${Date.now()}`
      this.sessions.set(openId, { sessionID, chatId, createdAt: Date.now() })
      log.info("Session 已创建", { openId, sessionID })
      return sessionID
    } catch (err) {
      log.error("无法连接 Helix", err)
      return ""
    }
  }

  /** 下发 Prompt (Macro Goal) */
  async sendPrompt(sessionID: string, text: string) {
    try {
      await fetch(`${config.helix.url}/api/session/${sessionID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "prompt", content: text }),
      })
    } catch (err) {
      log.error("下发 Prompt 失败", err)
    }
  }

  /** 取消任务 */
  async cancel(sessionID: string) {
    try {
      await fetch(`${config.helix.url}/api/session/${sessionID}`, { method: "DELETE" })
    } catch {
      // ignore
    }
  }

  /** 获取 Session 信息 */
  async getSessionInfo(sessionID: string): Promise<SessionInfo | null> {
    try {
      const res = await fetch(`${config.helix.url}/api/session/${sessionID}`)
      if (!res.ok) return null
      return await res.json() as SessionInfo
    } catch {
      return null
    }
  }

  getSessionID(openId: string): string | undefined {
    return this.sessions.get(openId)?.sessionID
  }

  clear(openId: string) {
    this.sessions.delete(openId)
  }

  /** 获取 tenant_access_token（缓存 1 小时） */
  async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token
    }
    const baseHost = config.feishu.domain === "lark" ? "open.larksuite.com" : "open.feishu.cn"
    const res = await fetch(`https://${baseHost}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: config.feishu.appId, app_secret: config.feishu.appSecret }),
    })
    const data = await res.json() as { tenant_access_token?: string }
    if (data.tenant_access_token) {
      this.tokenCache = { token: data.tenant_access_token, expiresAt: Date.now() + 3500_000 }
      return this.tokenCache.token
    }
    throw new Error("获取 access token 失败")
  }
}
