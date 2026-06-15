## 🧬 Helix 独创架构 (Autonomous Loop & Evolution)

> 📖 **深入阅读**：[Helix 核心架构设计与演进白皮书](docs/architecture/helix_core_architecture.md) | [Helix 能力补全路线图](docs/architecture/helix_capability_roadmap.md) | [终极自我演进闭环](docs/testing/beta_evolution_loop.md) | [使用与集成](docs/USAGE.md)

### 核心能力全景图（2026.06）

```
                         ┌──────────────────────────────────┐
                         │    IM Gateway (飞书/Slack/钉钉)    │
                         │    packages/feishu-gateway/       │
                         └──────────────┬───────────────────┘
                                        │ WebSocket / HTTP
┌───────────────────────────────────────┼───────────────────────────────────────┐
│                              Helix Engine                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │ L3 接入层     │  │ L2 控制层     │  │ L1 记忆层     │  │ L0 安全层          │ │
│  │              │  │              │  │              │  │                   │ │
│  │ MCP Server   │  │ Hybrid FSM   │  │ FTS5 + Vec   │  │ Shadow Worktree   │ │
│  │ HTTP + SSE   │  │ Judge Agent  │  │ Hybrid RAG   │  │ ToolInterceptor   │ │
│  │ SDK          │  │ AlignGuard   │  │ MemoryDecay  │  │ WorktreeGC        │ │
│  │ Event Bus    │  │ AskQuestion  │  │ Multi-LLM    │  │ Screenshot(视觉)   │ │
│  │ Trace 埋点    │  │ ProObserver  │  │ Embedding    │  │ VFSOverlay        │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └───────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 1. 认知与防爆破架构 (Cognition & Guardrails)
- **Hybrid FSM + Judge Agent**：宏观目标拆解为 Task DAG，宿主代码严格控制主干流转。内建**裁判智能体**防止模型"修改测试用例"投机取巧。
- **Shadow Worktree**：`git worktree` 开辟不可见影子目录，所有操作在隔离环境中试错，验证通过后才输出干净 Patch。
- **ToolInterceptor**：web-tree-sitter AST 级命令防火墙，拦截 `rm -rf /`、`curl` 外发等高危操作。
- **Screenshot（多模态视觉）**：Agent 自动截图进行视觉分析（需 MiMo 2.5 vision 或 Claude/GPT-4o）。
- **VFSOverlay**：Copy-on-Write 轻量文件覆盖层，>500MB 自动降级。

### 2. 记忆与检索增强 (Memory & RAG)
- **FTS5 BM25 关键词检索**：SQLite 全文索引，精确匹配函数名/Task ID/错误码。
- **Vector RAG（语义检索）**：本地 LM Studio embedding (`nomic-embed-text-v1.5`, 768 维)，38ms/条，`sqlite-vec` 扩展实现 BM25 + Vector 混合检索（0.6/0.4 权重），区分度 0.34。
- **Memory Decay**：基于 AST Hash 的记忆代谢，关联文件变更时自动降权过期规则。
- **可配置开关**：`mimocode.json` 中 `memory.vector.enabled` 控制，默认关闭。
- **多模型 Provider**：`mimocode.json` 配置任意 OpenAI-compatible 模型（DeepSeek/Groq/OpenRouter/Anthropic/Gemini/Ollama），零代码接入。

### 3. 可观测性与自纠偏 (Observability & Alignment)
- **AlignmentGuard**：实时监听全量 Event Bus，检测文件漂移/兔子洞/分心操作，`AlignmentAlert` 异步广播 + inbox 自我纠偏。
- **ProgressObserver**：空闲检测 + 死循环检测 + 硬超时兜底，按任务复杂度（COMP/AST/HEAL/ENV/PLAN/ROLL）分级配置阈值。
- **Trace 全链路埋点**：`processor.ts`（工具调用+FSM流转）、`bash.ts`（防火墙拦截）、`worktree`（影子树创建）、`memory-decay`（规则代谢）等全部接入 `TraceNodeEvent`。

### 4. 终极自我演进数据飞轮 (The Flywheel)
- **Phase 1: 坚壁清野**：HeuristicFilter 剔除 OOM/超时；ProgressObserver 拦截死循环/空闲 Trace。
- **Phase 2: 敏捷进化**：离线优化器 (`optimize_prompt.ts`) 读取失败 Trace 编译候选规则；语义 Hash 降权过期规则。
- **Phase 3: 微调降本**：海量轨迹 → Chosen/Rejected JSONL (`export_dpo.ts`)，含 Judge 验证门。

### 5. 外部集成 (Integration)
- **MCP Server**：7 个标准 Tool（`run_goal`/`get_trace`/`get_alerts`/`suspend`/`resume`/`read/write_agents_md`），接入 Claude Desktop/Cursor/OpenCopilot。
- **HTTP API + SSE Event Bus**：`POST /api/session` 创建、`POST /:sessionID/resume` 恢复、SSE 事件流订阅。
- **飞书 IM Gateway**：`packages/feishu-gateway/` 通过 WebSocket 长连接接入飞书，下发任务 + 推送偏离告警/追问卡片/结果。不需公网 IP。
- **AskUserQuestion**：Agent 主动追问用户，挂起 FSM 等待回答，HTTP resume 端点。飞书通过交互式卡片实现。

### 6. 安全与权限
- Agent 无权修改测试用例文件；如认为测试有误须挂起 FSM 申请 `Request_Goal_Revision`。
- 飞书 Gateway 支持用户白名单 + 群聊响应策略。
- `disabled_providers`/`enabled_providers` 控制可用模型池。

---

## 🛡️ 架构演进与知识兼容

- **引擎与知识库物理隔离**：编译只打包执行逻辑，不覆盖 `AGENTS.md`、SQLite、Trace 数据。
- **热更新**：引擎启动时动态读取规则和依赖图谱，数据飞轮产出的新规则无需重编译。
- **Schema 迁移**：通过 Drizzle migration 自动增量升级数据库；`AGENTS.md` 自然语言抗架构变动。
- **记忆代谢**：语义 Hash 机制自动降权过期规则，后台 `dream` 任务清理僵尸知识。

---

## 🖥️ MiMoCode 底座能力 (交互模式)

- 内置 `build`/`plan`/`compose` 等多智能体协作
- 基于 SQLite FTS5 的持久化记忆引擎 (Episodic + Semantic)
- `/dream` (记忆提炼) 和 `/distill` (工作流打包) 交互命令
- 流式语音输入 (TenVAD，需 MiMo 登录)

---

## 🛠 启动与调度

## 🛠 第三方安装与配置

### 1. 编译

```bash
bun install && bun run packages/opencode/script/build.ts
```

### 2. 配置 LLM 提供商

```bash
# 复制配置模板到用户目录
cp mimocode.example.json ~/.config/mimocode/mimocode.json

# 设置你的 API Key 环境变量（二选一）
# 方式 A: MiMo（推荐，OAuth 浏览器登录）
mimo auth login

# 方式 B: 手动设置环境变量
export MIMO_API_KEY="your-api-key"
```

配置模板 `mimocode.example.json` 内含 MiMo / DeepSeek / OpenAI / Anthropic 的配置示例，按需取消注释即可。支持任意 `/v1/chat/completions` 协议的服务。

### 3. 启动

```bash
mimo                                # TUI 交互式终端
mimo run "重构 src/types.ts"          # Headless 单次执行
mimo server --port 3000              # HTTP API 守护进程
```

### 4. 可选：飞书 IM Gateway

```bash
cd packages/feishu-gateway && cp .env.example .env && bun run src/index.ts
```
详见 [飞书 Gateway 设计文档](docs/integration/feishu_gateway_design.md)。

内置 ProgressObserver 按复杂度分级超时 (COMP 30min / AST/HEAL 15min / ENV 10min / PLAN/ROLL 5min)。

### 交互模式

```bash
mimo                    # TUI 交互式终端
mimo run "任务描述"       # Headless 单次执行
mimo server --port 3000  # HTTP API 守护进程
```

### 飞书 Gateway

```bash
cd packages/feishu-gateway && cp .env.example .env && bun run src/index.ts
```

### 定时调度 (macOS/Linux)

```bash
./script/dogfooding/setup_local_cron.sh   # 开启本地 Cron (launchd)
# 或 CI: .github/workflows/daily-evolution-loop.yml
```

---

## 📂 产出位置

- **Trace 轨迹**：`.dogfooding/success_traces/*.json` / `failed_traces/*.json`
- **提炼规则**：`AGENTS.md`
- **DPO 数据集**：`.dogfooding/dpo_dataset/*.jsonl`
- **记忆库**：`~/.mimocode/data/memory/` (SQLite FTS5 + sqlite-vec)