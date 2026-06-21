import { FeishuWSClient } from "./client/feishu-ws"
import { MessageRouter } from "./router/message-router"
import { createApiRouter } from "./router/api-router"
import { config, validate } from "./config"
import { Logger } from "./logger"
import { Hono } from "hono"
import { serve } from "@hono/node-server"

const log = Logger.create("gateway")

async function main() {
  console.log(`\n╔════════════════════════════════════════════╗`)
  console.log(`║   🦞 Helix × 飞书 IM Gateway v3.0          ║`)
  console.log(`║   (Server 模式 · 支持多轮对话)            ║`)
  console.log(`╚════════════════════════════════════════════╝\n`)

  // 1. 校验配置
  const errors = validate()
  if (errors.length > 0) {
    console.log("❌ 配置校验失败:\n")
    for (const e of errors) console.log(`   - ${e}`)
    console.log("\n请编辑 .env 文件填入正确的凭证后重试。")
    console.log("复制 .env.example → .env 并填入你的飞书 App ID / App Secret。")
    process.exit(1)
  }

  console.log(`✅ 配置已就绪`)
  console.log(`   飞书 App ID: ${config.feishu.appId.slice(0, 8)}...`)
  console.log(`   Helix 地址: ${config.helix.url}`)
  console.log(`   工作目录:   ${config.helix.workDir}`)
  console.log(`   默认模型:   ${config.helix.modelProvider}/${config.helix.model}`)
  console.log(`   群聊模式:   ${config.feishu.groupMode}`)
  if (config.feishu.allowedUsers.length > 0) {
    console.log(`   用户白名单: ${config.feishu.allowedUsers.length} 人`)
  } else {
    console.log(`   用户白名单: 未启用（所有人可用）`)
  }
  console.log()

  // 2. 创建消息路由器
  const router = new MessageRouter()

  // 3. 启动 HTTP API 服务器（供自动开发任务调用）
  const apiPort = 3096
  const apiApp = new Hono()
  const apiRoutes = createApiRouter(router.sessions)
  apiApp.route("/api", apiRoutes)

  serve({
    fetch: apiApp.fetch,
    port: apiPort,
  }, (info) => {
    log.info(`API 服务器已启动`, { port: apiPort })
    console.log(`📡 API 服务器: http://localhost:${apiPort}`)
  })

  // 4. 建立飞书 WebSocket 长连接（官方 SDK）
  const client = new FeishuWSClient(
    config.feishu.appId,
    config.feishu.appSecret,
    router.onMessage,
  )

  try {
    await client.start()
    log.info("Gateway 已就绪，等待飞书消息...")
    console.log("🚀 Gateway 启动成功！在飞书里给你的机器人发消息试试吧。\n")
  } catch (err) {
    log.error("Gateway 启动失败", err)
    process.exit(1)
  }

  // 优雅退出
  process.on("SIGINT", () => {
    console.log("\n🛑 正在关闭 Gateway...")
    client.close()
    process.exit(0)
  })

  process.on("SIGTERM", () => {
    client.close()
    process.exit(0)
  })
}

main()
