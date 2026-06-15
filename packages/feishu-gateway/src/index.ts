import { FeishuWSClient } from "./client/feishu-ws"
import { MessageRouter } from "./router/message-router"
import { config, validate } from "./config"
import { Logger } from "./logger"

const log = Logger.create("gateway")

async function main() {
  console.log("\n╔════════════════════════════════════════════╗")
  console.log("║   🦞 Helix × 飞书 IM Gateway v1.0          ║")
  console.log("╚════════════════════════════════════════════╝\n")

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

  // 3. 建立飞书 WebSocket 长连接
  const client = new FeishuWSClient(
    config.feishu.appId,
    config.feishu.appSecret,
    config.feishu.domain,
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
}

main()
