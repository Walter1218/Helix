# 📖 Helix 使用与集成说明书 (User & Integration Guide)

Helix 被设计为一个**可插拔的内核 (Pluggable Kernel)**，它不仅仅是一个 CLI 命令行工具，更是一个可以作为守护进程 (Daemon) 被其他程序（如 IDE、企业后台系统、或 CI 管道）无缝接入的**引擎服务**。

本指南涵盖了从单机安装使用，到作为底层引擎被其他程序接入的完整说明。

---

## 1. 安装与初始化 (Installation)

Helix 是一个终端原生的 Node/Bun 应用。在使用前，需要配置好宿主环境。

### 1.1 从源码安装与编译（开发者模式）
如果您想体验完整的“数据飞轮”特性或对核心基建进行二次开发：
```bash
# 1. 确保已安装 Bun (https://bun.sh)
curl -fsSL https://bun.sh/install | bash

# 2. 克隆项目并安装依赖
git clone <helix-repo-url> && cd Helix
bun install

# 3. 编译核心引擎
bun run packages/opencode/script/build.ts
```

### 1.2 一键安装（用户模式）
如果仅作为交互式 AI 编程助手使用：
```bash
curl -fsSL https://mimo.xiaomi.com/install | bash
# 或通过 npm
npm install -g @mimo-ai/cli
```

### 1.3 配置 LLM 提供商（必读）

编译完成后，需要配置模型提供商才能使用。Helix 默认使用 MiMo 模型，也支持接入 DeepSeek / OpenAI / Anthropic / Ollama 等任意 OpenAI-compatible 服务。

**Step 1：复制配置模板**

```bash
cp mimocode.example.json ~/.config/mimocode/mimocode.json
```

**Step 2：设置 API Key（二选一）**

```bash
# 方式 A: MiMo OAuth 浏览器登录（推荐）
mimo auth login

# 方式 B: 设置环境变量
export MIMO_API_KEY="your-api-key"
```

配置文件说明：

- `~/.config/mimocode/mimocode.json` 是全局用户配置，不在项目目录内，**不会被 Git 追踪**
- 所有 `apiKey` 字段建议使用 `${ENV_VAR}` 语法引用环境变量，避免明文硬编码
- 模板 `mimocode.example.json` 内含 DeepSeek / OpenAI / Anthropic 的注释配置，按需取消注释即可
- 更多 Provider 配置见本页 §2.1

**验证**：

```bash
mimo models list          # 查看已加载的模型
mimo run "echo hello"     # 快速验证引擎是否正常
```

---

## 2. 基础使用 (How to Use)

Helix 提供了两种截然不同的使用模式，分别针对“交互式辅助”和“全自动工程”：

### 模式 A：交互式 TUI (Terminal UI) 模式
最传统的用法，将 Helix 作为一个聪明的 AI 编程结对伙伴。
```bash
# 在您的任意项目根目录下执行
mimo
```
- **智能体切换**：按 `Tab` 键可以在不同的智能体 (`build`, `plan`, `compose`) 之间切换。
- **语音输入**：支持流式语音输入（通过 `/voice` 唤起）。
- **知识提取**：支持手动执行 `/dream` (提取知识) 和 `/distill` (固化规则)。

### 模式 B：Headless (无头) CLI 模式
这也是我们**数据飞轮**所依赖的核心模式。您可以通过单行命令让 Helix 在后台接管并完成指定任务，无需进入 UI 界面。内置 **ProgressObserver（智能进程观测者）**，能实时检测子进程是否陷入空闲或死循环，按需 kill，不会误杀正常运行中的任务：
```bash
# 执行单次宏观任务，完成后自动退出
mimo run "重构 src/types.ts 中的接口，并修复项目中所有受影响的文件"

# 绕过权限弹窗（全自动执行，适用于 CI 或后台定时任务）
mimo run "..." --dangerously-skip-permissions
```

---

### 2.1 配置 LLM Provider (模型供应商)

Helix 基于 Vercel AI SDK，**天然支持任何 `/v1/chat/completions` 协议的模型服务**。通过 `mimocode.json` 配置即可接入。

#### 方式 A：OpenAI-compatible 协议（零代码，最常用）

绝大多数第三方模型都实现了 OpenAI 的 `/v1/chat/completions`。只需在项目根目录的 `mimocode.json` 中添加一段配置：

```json
{
  "provider": {
    "my-llm": {
      "name": "My LLM Provider",
      "env": ["MY_API_KEY"],
      "options": {
        "baseURL": "https://api.my-llm.com/v1",
        "apiKey": "${MY_API_KEY}"
      },
      "models": {
        "my-model": {
          "name": "My Model",
          "limit": { "context": 128000, "output": 8192 }
        }
      }
    }
  }
}
```

然后在终端设置环境变量后启动：
```bash
export MY_API_KEY="sk-xxx"
mimo run "..."  # Helix 自动使用 my-llm/my-model
```

关键字段说明：

| 字段 | 必填 | 说明 |
|------|------|------|
| `provider.{id}.options.baseURL` | 是 | API 端点，必须以 `/v1` 结尾 |
| `provider.{id}.options.apiKey` | 是 | API Key，支持 `${ENV_VAR}` 语法引用环境变量 |
| `provider.{id}.env` | 否 | 声明依赖的环境变量名，Helix 启动时自动读取 |
| `provider.{id}.models` | 是 | 模型定义，`id` 为调用时使用的名称 |
| `provider.{id}.models.{id}.limit.context` | 否 | 上下文窗口大小（Token 数）|
| `provider.{id}.npm` | 否 | SDK 包名，不写默认使用 `@ai-sdk/openai-compatible` |

#### 方式 B：指定 AI SDK Provider 包（原生协议）

如果目标模型有专属的 `@ai-sdk/*` 包（如 Anthropic 的 Messages API、Google Gemini），指定 `npm` 字段即可：

```json
{
  "provider": {
    "anthropic": {
      "name": "Anthropic",
      "npm": "@ai-sdk/anthropic",
      "env": ["ANTHROPIC_API_KEY"],
      "options": { "apiKey": "${ANTHROPIC_API_KEY}" },
      "models": {
        "claude-sonnet-4-20250514": { "name": "Claude Sonnet 4" }
      }
    }
  }
}
```

#### 常见提供商配置速查

| Provider | `baseURL` | `npm` | 视觉 |
|----------|-----------|-------|------|
| **OpenAI** | `https://api.openai.com/v1` | 不写 | ✅ |
| **DeepSeek** | `https://api.deepseek.com/v1` | 不写 | ❌ |
| **Groq** | `https://api.groq.com/openai/v1` | 不写 | ❌ |
| **Together AI** | `https://api.together.xyz/v1` | 不写 | ✅ |
| **Fireworks** | `https://api.fireworks.ai/inference/v1` | 不写 | ✅ |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `@openrouter/ai-sdk-provider` | ✅ |
| **Anthropic** | 不写 | `@ai-sdk/anthropic` | ✅ |
| **Google Gemini** | 不写 | `@ai-sdk/google` | ✅ |
| **Ollama (本地)** | `http://localhost:11434/v1` | 不写 | ✅ |
| **LM Studio (本地)** | `http://localhost:1234/v1` | 不写 | ✅ |
| **vLLM (本地)** | `http://localhost:8000/v1` | 不写 | ✅ |

#### 方式 C：禁用非 MiMo 提供商（MIMO-ONLY 模式）

如果只希望使用小米 MiMo 模型，可以在 `mimocode.json` 顶部设置：
```json
{
  "disabled_providers": ["openai", "anthropic", "google", ...]
}
```

或启用白名单：
```json
{
  "enabled_providers": ["mimo"]
}
```

#### 验证配置

### 2.2 配置 Vector RAG（语义检索增强）

Helix 支持在 BM25 关键词检索之上叠加本地 embedding 语义搜索，实现混合检索。

```json
{
  "memory": {
    "vector": {
      "enabled": true,
      "api_url": "http://localhost:1234/v1/embeddings",
      "model": "text-embedding-nomic-embed-text-v1.5"
    }
  }
}
```

前提：确保 LM Studio（或其他 OpenAI-compatible embedding 服务）在运行。

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `memory.vector.enabled` | `false` | 开启混合检索（BM25 + Vector） |
| `memory.vector.api_url` | `http://localhost:1234/v1/embeddings` | Embedding API 端点 |
| `memory.vector.model` | `text-embedding-nomic-embed-text-v1.5` | 模型名 (768 维, 38ms/条) |

### 2.3 飞书 IM Gateway

`packages/feishu-gateway/` 是独立 Bun 包，通过飞书 WebSocket 长连接（无需公网 IP）将 Helix 变成飞书任务机器人。

飞书侧：创建企业自建应用 → 开启机器人 → 权限导入 im:message 等 → 事件订阅选"使用长连接" → 发布 → 拿 App ID/Secret。

启动：
```bash
# 终端1: 启动 Helix
mimo server --port 3000

# 终端2: 配置并启动飞书 Gateway
cd packages/feishu-gateway
cp .env.example .env
# 编辑 .env, 填入 FEISHU_APP_ID + FEISHU_APP_SECRET
bun run src/index.ts
```

详见 [设计文档](docs/integration/feishu_gateway_design.md)。



```bash
# 查看 Helix 当前加载了哪些 Provider 和模型
mimo models list
```

---

## 3. 外部程序集成与通讯 (Integration & Communication)

如果您想将 Helix 强大的“影子沙箱”和“自动演进”能力接入到自己的产品中，我们提供了以下 4 种标准的集成与通讯协议：

### 接入方式一：通过 SDK 接入 (Node.js/TypeScript)
如果您在编写另一个 Node.js/Bun 程序，可以直接使用 Helix 提供的 `@mimo-ai/sdk` (位于 `packages/sdk/js`) 与其通讯。

**适用场景**：构建基于 Helix 的企业内部自动化发版机器人、代码审查机器人。

```typescript
import { HelixClient } from "@mimo-ai/sdk/v2";

const client = new HelixClient({ baseUrl: "http://localhost:3000" });

// 启动一个新的会话，设定宏观目标
const session = await client.sessions.create({
  directory: "/path/to/your/project",
  goal: "Implement login API"
});

// 监听状态流转与 Trace (事件总线)
client.events.subscribe(session.id, (event) => {
  if (event.type === 'observability.trace_node') {
    console.log("Agent Thought/Action:", event.data);
  }
});
```

### 接入方式二：HTTP REST API 与 WebSocket
当您通过 `mimo server` 或 SDK 唤起后台进程时，Helix 会在本地暴露一套标准的 HTTP API (基于 `src/server/routes`)。

**适用场景**：跨语言集成（如用 Python/Go/Rust 编写的后台调度系统）。
- **HTTP API**: 可用于管理工作区、下发任务 (`/api/session/create`)、干预 FSM 状态、提供权限许可 (`/api/permission/grant`)。
- **WebSocket (Event Bus)**: 用于实时接收全链路追踪日志 (`TraceReporter` 输出)、Pty 终端输出流，以及接收“裁判智能体”的驳回信息。

### 接入方式三：LSP (Language Server Protocol)
Helix 底层内置了 LSP 支持 (`src/lsp/index.ts`)。
**适用场景**：将 Helix 深度集成到自定义 IDE（如 NeoVim, Zed 或 Cursor）中，作为 Language Server 提供代码补全、诊断修复和悬停分析。

### 接入方式四：MCP (Model Context Protocol)
Helix 支持最新的 MCP 协议 (`src/mcp/index.ts`)。
**适用场景**：允许外部的 LLM 应用（如 Claude Desktop）作为客户端连接到 Helix 引擎。外部应用可以利用 Helix 的 `Shadow Worktree` (影子工作区) 和 `AST 动态依赖图谱` 作为强大的上下文提供者和绝对安全的执行沙箱。

---

## 4. 给开发者的建议：如何驯服 Helix

当您将 Helix 作为底层引擎接入到您自己的系统中时，请务必注意以下几点工程实践：

1. **注入强约束 (AGENTS.md)**：通过在项目根目录动态生成或写入 `AGENTS.md`，您可以给 Helix 设定不可逾越的铁律（例如“绝对不能删除 `src/legacy` 目录”或“必须使用 TailwindCSS”）。
2. **信任影子沙箱 (Shadow Worktree)**：不要害怕在后台通过无头模式让 Helix 运行高危重构任务。它的底层机制保证了所有的修改都在不可见的分支里折腾，失败了会自动被 `WorktreeGC` 抹除，**只有宏观目标验证成功了，才会向您的主工作区输出干净的 Patch**。
3. **倾听 Event Bus**：在集成时，请务必通过 WebSocket 订阅它的 Trace 事件。不要只看最终的返回结果，Helix 在过程中的“反思 (Reflection)”、“碰壁”和“重试 (Retry)”日志，往往包含了非常有价值的代码库健康度指标。
