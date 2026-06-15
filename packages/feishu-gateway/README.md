# Helix × 飞书 IM Gateway

将 Helix 全自主工程引擎接入飞书，用户在飞书中下发宏观任务，Helix 在后台沙箱中自主执行并通过飞书实时推送进展。

## 快速开始

### 1. 飞书侧配置

1. 打开 [open.feishu.cn](https://open.feishu.cn) → 创建**企业自建应用**
2. **应用能力** → 开启「机器人」
3. **权限管理** → 批量导入：

```json
{
  "scopes": {
    "tenant": [
      "im:message",
      "im:message:send_as_bot",
      "im:message.p2p_msg:readonly",
      "im:message.group_at_msg:readonly",
      "im:resource",
      "contact:user.id:readonly"
    ]
  }
}
```

4. **事件订阅** → 选择「使用长连接」→ 添加事件 `im.message.receive_v1`
5. **版本管理与发布** → 创建版本 → 发布
6. 复制 App ID (格式 `cli_xxx`) + App Secret

### 2. Gateway 配置

```bash
cd packages/feishu-gateway
cp .env.example .env
# 编辑 .env，填入 App ID / App Secret
```

### 3. 启动

```bash
# 终端 1: 启动 Helix
mimo server --port 3000

# 终端 2: 启动飞书 Gateway
cd packages/feishu-gateway
bun run src/index.ts
```

### 4. 测试

在飞书里搜索你的应用名 → 发消息：
```
重构 src/types.ts 的类型定义
```

## 支持的消息流

| 流 | 方向 | 说明 |
|------|------|------|
| 下发任务 | 飞书 → Helix | 用户发消息 → 创建 Session → Agent 自主执行 |
| 偏离告警 | Helix → 飞书 | AlignmentGuard 检测偏离 → 推送告警卡片 |
| 中途追问 | Helix → 飞书 → Helix | Agent 调用 AskUserQuestion → 飞书选项卡片 → 用户选择 → Resume |
| 结果推送 | Helix → 飞书 | 任务完成 → 推送结果卡片 |

## 内置命令

| 命令 | 功能 |
|------|------|
| `/help` | 查看帮助 |
| `/status` | 当前任务状态 |
| `/cancel` | 取消当前任务 |

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `FEISHU_APP_ID` | ✅ | 飞书应用 App ID |
| `FEISHU_APP_SECRET` | ✅ | 飞书应用 App Secret |
| `FEISHU_DOMAIN` | ❌ | `feishu`(国内) / `lark`(国际)，默认 feishu |
| `HELIX_URL` | ❌ | Helix 地址，默认 http://localhost:3000 |
| `HELIX_WORK_DIR` | ❌ | 任务工作目录，默认当前目录 |
| `FEISHU_ALLOWED_USERS` | ❌ | 用户白名单(open_id)，逗号分隔 |
| `FEISHU_GROUP_MODE` | ❌ | 群聊模式: mention/always/off，默认 mention |
