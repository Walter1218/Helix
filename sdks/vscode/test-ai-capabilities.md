# Helix AI 能力全链路 Mock 测试方案

## 测试目标

验证 Helix AI 能力的全链路调用，包括：
1. 会话管理（创建、切换、删除）
2. 消息发送与响应
3. 不同模式下的 AI 能力
4. 工具调用可视化
5. 权限管理
6. 流式响应处理

## 测试模式与复杂度

### 1. Ask 模式
- **简单任务**：回答简单问题
- **中等任务**：解释技术概念
- **复杂任务**：分析代码并提供优化建议

### 2. Build 模式
- **简单任务**：生成简单函数
- **中等任务**：创建完整组件
- **复杂任务**：实现多文件功能模块

### 3. Plan 模式
- **简单任务**：制定单步计划
- **中等任务**：创建多步骤执行计划
- **复杂任务**：设计系统架构方案

### 4. Compose 模式
- **简单任务**：重构单个函数
- **中等任务**：跨文件重构
- **复杂任务**：系统级重构

### 5. Loop 模式
- **简单任务**：单次迭代优化
- **中等任务**：多轮迭代改进
- **复杂任务**：自适应迭代优化

### 6. Max 模式
- **简单任务**：并行处理简单任务
- **中等任务**：多智能体协作
- **复杂任务**：全能力并行执行

## 测试用例设计

### 测试用例 1：会话管理
```javascript
// 创建会话
const session = await fetchApi('/session', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ title: 'Test Session' })
});

// 获取会话列表
const sessions = await fetchApi('/session?limit=10');

// 切换会话
const messages = await fetchApi(`/session/${sessionId}/message`);

// 删除会话
await fetchApi(`/session/${sessionId}`, { method: 'DELETE' });
```

### 测试用例 2：Ask 模式测试
```javascript
// 简单任务
const simpleResponse = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '什么是 TypeScript？' }],
    agent: 'ask'
  })
});

// 中等任务
const mediumResponse = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '解释 React Hooks 的工作原理' }],
    agent: 'ask'
  })
});

// 复杂任务
const complexResponse = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '分析这段代码的性能瓶颈并提供优化方案：\n```javascript\nfunction processData(data) {\n  return data.map(item => {\n    return item.values.filter(v => v > 10).reduce((a, b) => a + b, 0);\n  });\n}\n```' }],
    agent: 'ask'
  })
});
```

### 测试用例 3：Build 模式测试
```javascript
// 简单任务
const simpleBuild = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '创建一个计算斐波那契数列的函数' }],
    agent: 'build'
  })
});

// 中等任务
const mediumBuild = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '实现一个带分页的用户列表组件' }],
    agent: 'build'
  })
});

// 复杂任务
const complexBuild = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '构建一个完整的待办事项应用，包含增删改查、状态管理和本地存储' }],
    agent: 'build'
  })
});
```

### 测试用例 4：Plan 模式测试
```javascript
// 简单任务
const simplePlan = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '制定代码重构计划' }],
    agent: 'plan'
  })
});

// 中等任务
const mediumPlan = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '设计微服务架构方案' }],
    agent: 'plan'
  })
});

// 复杂任务
const complexPlan = await fetchApi(`/session/${sessionId}/message`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    parts: [{ type: 'text', text: '规划大型系统迁移方案，包括数据库迁移、API重构、前端升级' }],
    agent: 'plan'
  })
});
```

### 测试用例 5：工具调用测试
```javascript
// 模拟工具调用响应
const toolCallResponse = {
  parts: [
    { type: 'text', text: '我将使用工具来分析代码...' },
    {
      type: 'tool',
      tool: 'read_file',
      state: 'completed',
      input: { path: 'src/index.ts' },
      output: '文件内容...'
    }
  ]
};

// 验证工具调用渲染
renderToolCall(toolCallResponse.parts[1]);
```

### 测试用例 6：权限管理测试
```javascript
// 模拟权限请求
const permissionRequest = {
  id: 'perm-1',
  tool: 'write_file',
  description: '写入文件 src/new-file.ts',
  input: { path: 'src/new-file.ts', content: '...' }
};

// 批准权限
await fetchApi(`/permission/${permissionRequest.id}/reply`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ approved: true, always: false })
});

// 拒绝权限
await fetchApi(`/permission/${permissionRequest.id}/reply`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ approved: false, always: false })
});
```

## 验收标准

### 功能验收
- [ ] 会话创建、切换、删除正常工作
- [ ] 所有 6 种模式都能正常发送消息并接收响应
- [ ] 不同复杂度的任务都能得到适当处理
- [ ] 工具调用可视化正常显示
- [ ] 权限请求和响应正常工作
- [ ] 流式响应正常处理

### 性能验收
- [ ] 简单任务响应时间 < 2 秒
- [ ] 中等任务响应时间 < 5 秒
- [ ] 复杂任务响应时间 < 10 秒
- [ ] 流式响应实时更新

### 错误处理验收
- [ ] 网络错误显示友好提示
- [ ] API 限流显示明确信息
- [ ] 权限拒绝正确处理
- [ ] 会话不存在时优雅降级

## 测试执行步骤

1. **准备阶段**
   - 启动 Helix 服务
   - 配置测试环境
   - 准备测试数据

2. **执行阶段**
   - 运行会话管理测试
   - 运行各模式测试
   - 运行工具调用测试
   - 运行权限管理测试

3. **验证阶段**
   - 检查响应格式
   - 验证功能完整性
   - 评估性能指标

4. **报告阶段**
   - 生成测试报告
   - 记录问题和建议
   - 更新文档

## 测试工具

- **前端测试**：浏览器开发者工具
- **API 测试**：curl / Postman
- **自动化测试**：自定义测试脚本
- **性能监控**：浏览器性能面板

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 网络不稳定 | 测试中断 | 实现重试机制 |
| API 限流 | 测试失败 | 添加延迟和重试 |
| 权限问题 | 功能受限 | 配置测试权限 |
| 数据污染 | 测试不准确 | 使用隔离测试环境 |

## 后续改进

1. **自动化测试**：将手动测试转换为自动化测试
2. **覆盖率提升**：增加更多边界条件测试
3. **性能优化**：优化响应时间和资源使用
4. **监控集成**：添加实时监控和报警
