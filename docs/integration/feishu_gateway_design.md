# Helix × 飞书 IM Gateway 设计方案

> 让 Helix 作为飞书机器人，通过 WebSocket 长连接接收任务、推送进展、支持中途追问。

---

## 一、整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                          飞书开放平台                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────────────┐   │
│  │ 用户私聊  │    │  群聊 @   │    │  交互式卡片（选项/按钮/审批）   │   │
│  └────┬─────┘    └────┬─────┘    └──────────────┬───────────────┘   │
│       │               │                         │                    │
│       └───────────────┼─────────────────────────┘                    │
│                       │ WebSocket 长连接 (outbound)                   │
└───────────────────────┼──────────────────────────────────────────────┘
                        │
                        ▼
┌───────────────────────────────────────────────────────────────────────┐
│                     Feishu Gateway (新增 ~600 行)                      │
│                                                                       │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐   │
│  │ WebSocket Client │  │  Message Router   │  │  Card Builder      │   │
│  │ (飞书 SDK)       │  │  (意图 → Session) │  │  (交互式卡片)       │   │
│  └────────┬────────┘  └────────┬─────────┘  └────────┬───────────┘   │
│           │                    │                      │               │
│           └────────────────────┼──────────────────────┘               │
│                                │                                      │
│              ┌─────────────────┼─────────────────┐                   │
│              ▼                 ▼                  ▼                    │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────┐         │
│  │ Session Manager│  │ Event Bridge   │  │ Alert Dispatcher  │         │
│  │ (user→session) │  │ (Helix→飞书)   │  │ (偏离→推送)       │         │
│  └───────┬───────┘  └───────┬───────┘  └────────┬─────────┘         │
└──────────┼──────────────────┼───────────────────┼───────────────────┘
           │ HTTP             │ WebSocket Client  │ HTTP
           ▼                  ▼                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         Helix Engine                                   │
│                                                                       │
│  POST /api/session  │  WS Event Bus  │  POST /api/session/:id/resume │
│  (创建任务)          │  (实时事件)     │  (中途追问恢复)               │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 二、消息流

### 流 1：用户下发任务（主流程）

```
用户飞书发 "重构 src/types.ts 的类型定义"
    │
    ▼
飞书 SDK → WebSocket push: im.message.receive_v1
    │
    ▼
Gateway Message Router
    ├── 1. 提取用户 open_id + 内容
    ├── 2. Session Manager: open_id → 复用或创建 Helix Session
    ├── 3. POST /api/session 下发 Goal
    │      body: { sessionID, goal: "重构 src/types.ts ...", directory, model }
    │      返回: { sessionID, status: "running" }
    ├── 4. 飞书 Bot API: 回复 "🚀 已启动"
    └── 5. Event Bridge: 订阅该 session 的 WebSocket 事件
```

### 流 2：Agent 偏离告警 → 飞书推送

```
Helix AlignmentGuard 检测到偏离
    │
    ▼
Event Bus: observability.alignment_alert
    │
    ▼
Gateway Event Bridge 监听到
    ├── 1. 解析 alert: { level, reason, suggestion }
    ├── 2. Card Builder: 构建交互式卡片
    │      ┌─────────────────────────────┐
    │      │ ⚠️ Agent 可能偏离目标        │
    │      │                             │
    │      │ 修改了 5 个无关文件            │
    │      │                             │
    │      │ [查看详情] [暂停任务] [忽略]   │
    │      └─────────────────────────────┘
    └── 3. 飞书 Bot API: 发送卡片
```

### 流 3：Agent 主动追问 → 用户回答 → 恢复

```
Helix Agent 调用 AskUserQuestion("用 MySQL 还是 PostgreSQL?")
    │
    ▼
processor: ctx.suspended = true → 返回 "suspend"
    │
    ▼
Gateway 监听到 session.status → idle (suspended)
    ├── 1. GET /api/session/:id/pending-question
    │      返回: { question: "用 MySQL 还是 PostgreSQL?", options: [...] }
    ├── 2. Card Builder: 构建选项卡片
    │      ┌─────────────────────────────┐
    │      │ 🤔 Agent 需要你的决定         │
    │      │                             │
    │      │ 用 MySQL 还是 PostgreSQL?    │
    │      │                             │
    │      │ [MySQL]  [PostgreSQL]       │
    │      └─────────────────────────────┘
    └── 3. 飞书 Bot API: 发送卡片

用户点击 [PostgreSQL]
    │
    ▼
飞书 SDK → 卡片回调事件
    │
    ▼
Gateway:
    ├── POST /api/session/:id/resume
    │      body: { content: "PostgreSQL", action: "resume" }
    └── Agent 恢复执行，知道用户选了 PostgreSQL
```

### 流 4：任务完成 → 推送结果

```
Helix Session 完成
    │
    ▼
Event Bus: session.idle (正常结束)
    │
    ▼
Gateway:
    ├── 1. 收集最终 Diff / 摘要
    ├── 2. 飞书 Bot API: 发送结果卡片
    │      ┌─────────────────────────────┐
    │      │ ✅ 任务完成                   │
    │      │                             │
    │      │ "重构 src/types.ts 的类型定义" │
    │      │                             │
    │      │ 修改 12 个文件  +87 -34 行     │
    │      │                             │
    │      │ [查看 Diff]  [不满意，重做]    │
    │      └─────────────────────────────┘
    └── 3. 清理: 解绑 session 事件订阅
```

---

## 三、组件设计

### 3.1 WebSocket Client

```typescript
// 使用 @larksuiteoapi/node-sdk 的 WSClient
class FeishuWSClient {
  private client: WSClient
  
  async start() {
    this.client = new WSClient({ appId, appSecret, domain: "feishu" })
    this.client.on("im.message.receive_v1", this.onMessage)
    this.client.on("card.action.trigger", this.onCardAction)
    await this.client.start()  // 建立 outbound WebSocket
  }
}
```

### 3.2 Message Router

```typescript
class MessageRouter {
  async onMessage(event: FeishuEvent) {
    const { open_id, content, chat_id, chat_type } = event

    // 群聊只响应 @机器人
    if (chat_type === "group" && !content.includes("@机器人")) return

    const text = stripMention(content)  // 去掉 @机器人 前缀
    
    // 内置命令
    if (text.startsWith("/")) return this.handleCommand(text, open_id, chat_id)
    
    // 正常任务 → 创建 Helix Session
    await this.dispatchTask(text, open_id, chat_id)
  }
}
```

### 3.3 Session Manager

```typescript
class SessionManager {
  private sessions = new Map<openId, { sessionID, chatId, createdAt }>()

  async getOrCreate(openId: string, chatId: string): Promise<Session> {
    const existing = this.sessions.get(openId)
    if (existing && !this.isExpired(existing)) return existing

    // POST /api/session 创建新 Session
    const res = await fetch(`${HELIX_URL}/api/session`, {
      method: "POST",
      body: JSON.stringify({
        sessionID: `feishu-${openId}`,
        directory: WORK_DIR,
        model: { provider: "mimo", model: "mimo-v2.5-pro" },
      }),
    })
    
    const session = { sessionID: res.sessionID, chatId, createdAt: Date.now() }
    this.sessions.set(openId, session)
    return session
  }
}
```

### 3.4 Event Bridge（双向）

```typescript
class EventBridge {
  // 飞书 → Helix: 下发任务
  async dispatchTask(sessionID: string, goal: string) {
    await fetch(`${HELIX_URL}/api/prompt`, {
      method: "POST",
      body: JSON.stringify({ sessionID, content: goal }),
    })
  }

  // Helix → 飞书: 订阅事件，反向推送
  async subscribeSession(sessionID: string, chatId: string) {
    const ws = new WebSocket(`${HELIX_WS_URL}/events?sessionID=${sessionID}`)

    ws.on("message", (raw) => {
      const event = JSON.parse(raw)

      switch (event.type) {
        case "observability.alignment_alert":
          this.pushAlert(chatId, event.properties)
          break
        case "session.status":
          this.handleStatus(chatId, sessionID, event.properties)
          break
      }
    })
  }
}
```

### 3.5 Card Builder

```typescript
class CardBuilder {
  // 偏离告警卡片
  buildAlertCard(alert: AlignmentAlertPayload) {
    return {
      header: { title: `⚠️ Agent 可能偏离目标`, template: "red" },
      elements: [
        { tag: "div", text: { tag: "plain_text", content: alert.reason } },
        { tag: "div", text: { tag: "plain_text", content: alert.suggestion } },
      ],
      actions: [
        { tag: "button", text: "暂停任务", value: JSON.stringify({ action: "suspend", sessionID }) },
        { tag: "button", text: "忽略", value: JSON.stringify({ action: "ignore" }) },
      ],
    }
  }

  // 追问卡片
  buildQuestionCard(question: string, options: Array<{label, description}>) {
    return {
      header: { title: "🤔 Agent 需要你的决定", template: "blue" },
      elements: [
        { tag: "div", text: { tag: "plain_text", content: question } },
      ],
      actions: options.map((opt, i) => ({
        tag: "button",
        text: opt.label,
        value: JSON.stringify({ action: "resume", sessionID, selected: opt.label }),
      })),
    }
  }
}
```

---

## 四、文件结构

```
packages/feishu-gateway/          # 新建独立包
├── package.json
├── src/
│   ├── index.ts                  # 入口，启动 Gateway
│   ├── client/
│   │   └── feishu-ws.ts          # 飞书 WebSocket Client
│   ├── router/
│   │   ├── message-router.ts     # 消息路由（命令 vs 任务）
│   │   └── command-handler.ts    # /help /status /cancel /retry
│   ├── bridge/
│   │   ├── session-manager.ts    # open_id ↔ sessionID 映射
│   │   └── event-bridge.ts       # Helix Event Bus → 飞书消息
│   ├── cards/
│   │   ├── card-builder.ts       # 交互式卡片生成器
│   │   └── templates/            # 卡片模板
│   └── config.ts                 # 环境变量读取 (FEISHU_APP_ID, HELIX_URL, etc.)
├── .env.example
└── README.md
```

---

## 五、配置与启动

### 环境变量 (.env)

```bash
# 飞书
FEISHU_APP_ID=cli_xxxxxxxxxxxxx
FEISHU_APP_SECRET=your_app_secret_here
FEISHU_DOMAIN=feishu          # feishu 国内 / lark 国际

# Helix
HELIX_URL=http://localhost:3000
HELIX_WS_URL=ws://localhost:3000
HELIX_WORK_DIR=/home/user/projects/default
HELIX_MODEL_PROVIDER=mimo
HELIX_MODEL=mimo-v2.5-pro

# 可选：安全
FEISHU_ALLOWED_USERS=ou_xxx,ou_yyy   # 用户白名单
```

### 启动

```bash
# 一键启动（推荐）
./start-feishu.sh

# 或手动启动
# 1. 先启动 Helix
MIMOCODE_SERVER_PASSWORD=test123 mimo serve --port 3095

# 2. 再启动飞书 Gateway
cd packages/feishu-gateway
HELIX_URL=http://localhost:3095 bun run src/index.ts
```

---

## 六、内置命令

| 命令 | 功能 |
|------|------|
| `/help` | 显示帮助 |
| `/status` | 查看当前任务状态 |
| `/cancel` | 取消当前任务 (POST /resume action=abandon) |
| `/retry` | 重新执行上一次失败的任务 |
| `/model gpt-4o` | 切换执行模型 |
| `/diff` | 查看当前 Diff |

---

## 七、安全性

| 层级 | 措施 |
|------|------|
| 传输 | 飞书 WebSocket 自带 TLS 加密 |
| 认证 | SDK 自动处理 token 刷新 |
| 用户白名单 | `FEISHU_ALLOWED_USERS` 限制可用的飞书用户 |
| 群聊控制 | 默认仅响应用户 @消息；可配置 `groupRespondMode: "mention" | "always" | "off"` |
| 操作确认 | 高危操作（如取消任务）使用飞书交互式卡片二次确认 |
| 限流 | 每用户 5 分钟内最多下发 10 个任务 |
| 自适应超时 | 基础 3 分钟，裁判智能体根据偏离状态延长，最多 3 次，上限 15 分钟 |

---

## 八、和 Hermes/OpenClaw 方案对比

| | Hermes / OpenClaw | Helix × 飞书 Gateway |
|------|------|------|
| 连接方式 | 飞书 WebSocket SDK | 飞书 WebSocket SDK（相同） |
| 产品形态 | 聊天机器人 | 全自主任务执行引擎 |
| 响应模式 | 一问一答 | 下目标 → 自主执行 → 推结果 |
| 中途互动 | 无 | AskUserQuestion + 飞书卡片选项 |
| 偏离告警 | 无 | AlignmentAlert → 飞书推送 |
| 代码量 | 官方插件，一键安装 | Gateway 约 600 行（新写）+ 飞书侧配置（10 分钟） |
| 多模态 | 文字/图片/文件 | 文案 + 飞书卡片（后续可加图片） |
