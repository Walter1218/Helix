import * as lark from "@larksuiteoapi/node-sdk"
import { Logger } from "../logger"

const log = Logger.create("feishu-ws")

/** 飞书 im.message.receive_v1 事件数据结构 */
export interface MessageEventData {
  sender: {
    sender_id?: { union_id?: string; user_id?: string; open_id?: string }
    sender_type: string
  }
  message: {
    message_id: string
    chat_id: string
    chat_type: string
    message_type: string
    content: string
    mentions?: Array<{
      key: string
      id: { open_id?: string }
      name: string
    }>
  }
}

export type MessageHandler = (data: MessageEventData) => Promise<void>

/**
 * 飞书 WebSocket 长连接客户端。
 * 基于 @larksuiteoapi/node-sdk 官方 WSClient，
 * 通过 outbound 长连接接收飞书事件，无需公网 IP。
 */
export class FeishuWSClient {
  private wsClient: lark.WSClient

  constructor(
    private appId: string,
    private appSecret: string,
    private handler: MessageHandler,
  ) {
    this.wsClient = new lark.WSClient({
      appId: this.appId,
      appSecret: this.appSecret,
      loggerLevel: lark.LoggerLevel.warn,
    })
  }

  async start() {
    const eventDispatcher = new lark.EventDispatcher({}).register({
      "im.message.receive_v1": async (data) => {
        await this.handler(data as unknown as MessageEventData)
      },
    })

    await this.wsClient.start({ eventDispatcher })
    log.info("WebSocket 长连接已建立")
  }

  close() {
    this.wsClient.close()
    log.info("WebSocket 已关闭")
  }
}
