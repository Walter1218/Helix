# Trace 日志覆盖验证报告

**测试时间**: 2026-06-18 19:35  
**测试环境**: Helix IDE (helix-ide 分支)  
**日志文件**: `.dev-home/data/log/2026-06-18T113123.log`

## 测试结果

| 模式 | 状态 | Agent | Tokens | 耗时 |
|------|------|-------|--------|------|
| Ask | ✅ 通过 | ask | 13,243 | ~7s |
| Build | ✅ 通过 | build | 21,897 | ~5s |
| Loop | ✅ 通过 | loop | 21,784 | ~5s |

## Trace 覆盖分析

### 1. Agent 模块 (`service=agent`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `agent.state.init` - 代理状态初始化
- `agent.state.ready` - 代理就绪（包含代理数量和列表）
- `agent.get.not_found` - 代理查找失败警告（预期行为，"main" 是内部标识符）

**示例日志**:
```
INFO  2026-06-18T11:33:09 +5ms service=agent agent.state.init
INFO  2026-06-18T11:33:09 +37ms service=agent total=16 primary=ask,build,max,plan,compose,loop subagent=general,explore,judge,title,summary,compaction,checkpoint-writer,dream,distill,translator agent.state.ready
```

### 2. Tool 模块 (`service=tool`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `tool.init.done` - 工具初始化完成
- `tool.execute.start` - 工具执行开始（包含工具名、会话ID、参数）
- `tool.execute.completed` - 工具执行完成（包含耗时、输出长度、是否截断）

**示例日志**:
```
INFO  2026-06-18T11:35:35 +92ms service=tool tool=write sessionID=ses_1257c2f23ffetALLqQslAvA6Zi messageID=msg_eda83d0e3001mCT7f5ZgNNm9cG callID=call_12b9f552998e4ce68af7d1b3 agent=build argsKeys=["content","filePath"] tool.execute.start
INFO  2026-06-18T11:35:35 +1ms service=tool tool=write sessionID=ses_1257c2f23ffetALLqQslAvA6Zi duration=7 outputLen=24 tool.execute.completed
```

### 3. Provider 模块 (`service=provider`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `provider.getModel.resolved` - 模型解析成功
- `provider.getLanguage.resolving` - 语言模型解析中
- `provider.getLanguage.resolved` - 语言模型解析成功
- `provider.getSDK` - SDK 加载

**示例日志**:
```
INFO  2026-06-18T11:33:09 +0ms service=provider providerID=mimo modelID=mimo-auto provider.getModel.resolved
INFO  2026-06-18T11:33:09 +0ms service=provider providerID=mimo modelID=mimo-auto provider.getLanguage.resolving
INFO  2026-06-18T11:33:09 +2ms service=provider status=completed duration=2 providerID=mimo getSDK
```

### 4. Memory 模块 (`service=memory`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `memory.reconcile.start` - 记忆协调开始
- `memory.reconcile.completed` - 记忆协调完成（包含索引数、剪枝数、嵌入数）

**示例日志**:
```
INFO  2026-06-18T11:31:24 +1ms service=memory memory.reconcile.start
INFO  2026-06-18T11:31:24 +25ms service=memory indexed=0 pruned=0 embedded=0 memory.reconcile.completed
```

### 5. Trace Reporter 模块 (`service=trace-reporter`)

**覆盖状态**: ⚠️ 部分覆盖

**关键日志点**:
- `trace.event.received` - 追踪事件接收（DEBUG 级别）
- `trace.getTraces` - 获取追踪（DEBUG 级别）
- `trace.emit` - 追踪发射

**说明**: Trace Reporter 日志主要在 DEBUG 级别，当前日志级别为 INFO，因此未显示。这是预期行为，因为追踪事件频繁，DEBUG 级别可避免日志过多。

### 6. Session 模块 (`service=session`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `session.created` - 会话创建
- `session.prompt` - 会话提示（包含步骤和循环状态）
- `session.processor` - 会话处理
- `session.prompt.classification=final` - 会话完成

**示例日志**:
```
INFO  2026-06-18T11:35:25 +0ms service=session id=ses_1257c4b72ffeQoDX3mrthDL950 ... created
INFO  2026-06-18T11:35:25 +0ms service=session.prompt session.id=ses_1257c4b72ffeQoDX3mrthDL950 step=0 loop
INFO  2026-06-18T11:35:32 +0ms service=session.prompt session.id=ses_1257c4b72ffeQoDX3mrthDL950 classification=final exiting loop
```

### 7. LLM 模块 (`service=llm`)

**覆盖状态**: ✅ 已覆盖

**关键日志点**:
- `llm.stream` - LLM 流式调用（包含 providerID、modelID、agent、mode）

**示例日志**:
```
INFO  2026-06-18T11:35:25 +0ms service=llm providerID=mimo modelID=mimo-auto session.id=ses_1257c4b72ffeQoDX3mrthDL950 small=false agent=ask mode=primary stream
```

## Trace 链路完整性

### Ask 模式完整链路
1. `session.created` → 会话创建
2. `server.request` → HTTP 请求接收
3. `session.prompt` → 提示处理开始
4. `session.processor` → 消息处理
5. `llm.stream` → LLM 流式调用
6. `session.prompt.classification=final` → 处理完成

### Build 模式完整链路
1. `session.created` → 会话创建
2. `server.request` → HTTP 请求接收
3. `session.prompt` → 提示处理开始
4. `session.processor` → 消息处理
5. `llm.stream` → LLM 流式调用
6. `tool.execute.start` → 工具执行开始
7. `tool.execute.completed` → 工具执行完成
8. `session.prompt.classification=final` → 处理完成

### Loop 模式完整链路
1. `session.created` → 会话创建
2. `server.request` → HTTP 请求接收
3. `session.prompt` → 提示处理开始
4. `session.processor` → 消息处理
5. `llm.stream` → LLM 流式调用
6. `session.prompt.classification=final` → 处理完成

## 改进建议

### 1. 增加 Agent 生命周期日志
当前 `agent.ts` 中的 `generate` 函数日志未在测试中触发。建议：
- 在 `agent.get` 成功时添加 INFO 级别日志
- 在 `agent.list` 时添加 INFO 级别日志

### 2. 增加 Provider 错误日志
当前 Provider 模块缺少错误场景日志。建议：
- 在模型解析失败时添加 ERROR 级别日志
- 在 SDK 加载失败时添加 ERROR 级别日志

### 3. 增加 Memory 搜索日志
当前 Memory 模块缺少搜索操作日志。建议：
- 在 `memory.search` 开始时添加 INFO 级别日志
- 在 `memory.search` 完成时添加 INFO 级别日志（包含结果数量）

### 4. 统一日志格式
建议统一日志格式，包含以下字段：
- `timestamp` - 时间戳
- `level` - 日志级别
- `service` - 服务名
- `operation` - 操作名
- `sessionID` - 会话 ID（可选）
- `duration` - 耗时（可选）
- `status` - 状态（可选）

## 结论

**Trace 覆盖率**: 85% (6/7 模块完全覆盖)

**关键路径覆盖**:
- ✅ 会话创建
- ✅ HTTP 请求处理
- ✅ LLM 流式调用
- ✅ 工具执行
- ✅ 会话完成
- ⚠️ Agent 生成（部分覆盖）
- ⚠️ Trace Reporter（DEBUG 级别）

**总体评估**: Trace 系统已基本满足问题定位和迭代需求，关键路径均有日志覆盖。建议补充 Agent 生命周期和 Memory 搜索日志以达到 100% 覆盖。
