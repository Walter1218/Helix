/**
 * Helix API Mock 服务器
 * 用于测试 AI 能力全链路调用
 */

const http = require('http');
const url = require('url');

// 模拟数据存储
const sessions = new Map();
const messages = new Map();
const permissions = new Map();

// 初始化模拟数据
function initMockData() {
  // 创建默认会话
  const defaultSession = {
    id: 'session-default',
    title: 'Default Session',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  sessions.set(defaultSession.id, defaultSession);
  messages.set(defaultSession.id, []);
}

// 模拟 AI 响应生成
function generateAIResponse(prompt, agent) {
  const responses = {
    ask: {
      simple: 'TypeScript 是 JavaScript 的超集，添加了静态类型系统。',
      medium: 'React Hooks 是 React 16.8 引入的新特性，允许在函数组件中使用状态和其他 React 特性。',
      complex: '这段代码存在性能瓶颈，主要在于嵌套的数组方法调用。建议使用 for 循环优化。'
    },
    build: {
      simple: '```javascript\nfunction fibonacci(n) {\n  if (n <= 1) return n;\n  return fibonacci(n - 1) + fibonacci(n - 2);\n}\n```',
      medium: '```jsx\nfunction UserList({ users, pageSize = 10 }) {\n  const [currentPage, setCurrentPage] = useState(1);\n  const startIndex = (currentPage - 1) * pageSize;\n  const endIndex = startIndex + pageSize;\n  const currentUsers = users.slice(startIndex, endIndex);\n  \n  return (\n    <div>\n      <ul>\n        {currentUsers.map(user => <li key={user.id}>{user.name}</li>)}\n      </ul>\n      <Pagination currentPage={currentPage} totalPages={Math.ceil(users.length / pageSize)} onChange={setCurrentPage} />\n    </div>\n  );\n}\n```',
      complex: '```javascript\nclass TodoApp {\n  constructor() {\n    this.todos = JSON.parse(localStorage.getItem(\'todos\') || \'[]\');\n    this.render();\n  }\n  \n  addTodo(text) {\n    this.todos.push({ id: Date.now(), text, completed: false });\n    this.save();\n    this.render();\n  }\n  \n  toggleTodo(id) {\n    const todo = this.todos.find(t => t.id === id);\n    if (todo) todo.completed = !todo.completed;\n    this.save();\n    this.render();\n  }\n  \n  deleteTodo(id) {\n    this.todos = this.todos.filter(t => t.id !== id);\n    this.save();\n    this.render();\n  }\n  \n  save() {\n    localStorage.setItem(\'todos\', JSON.stringify(this.todos));\n  }\n  \n  render() {\n    // 渲染逻辑\n  }\n}\n```'
    },
    plan: {
      simple: '## 代码重构计划\n\n1. **分析现有代码**\n   - 识别代码异味\n   - 确定重构范围\n\n2. **制定重构策略**\n   - 提取公共函数\n   - 简化复杂逻辑\n\n3. **执行重构**\n   - 逐步重构\n   - 保持功能不变\n\n4. **验证重构结果**\n   - 运行测试\n   - 代码审查',
      medium: '## 微服务架构设计方案\n\n### 服务拆分\n- **用户服务**：处理用户认证和授权\n- **产品服务**：管理产品信息\n- **订单服务**：处理订单逻辑\n- **支付服务**：处理支付流程\n\n### 通信方式\n- 同步：REST API\n- 异步：消息队列\n\n### 数据存储\n- 每个服务独立数据库\n- 共享数据通过 API 访问',
      complex: '## 大型系统迁移方案\n\n### 阶段一：准备阶段（2周）\n- 代码审查和风险评估\n- 制定回滚计划\n- 准备测试环境\n\n### 阶段二：数据库迁移（3周）\n- 数据库结构迁移\n- 数据迁移脚本\n- 数据验证\n\n### 阶段三：API 重构（4周）\n- 新 API 设计\n- 逐步替换旧 API\n- 兼容性处理\n\n### 阶段四：前端升级（3周）\n- 组件库升级\n- 状态管理重构\n- 性能优化\n\n### 阶段五：测试和上线（2周）\n- 集成测试\n- 性能测试\n- 灰度发布'
    },
    compose: {
      simple: '## 函数重构方案\n\n### 原始代码问题\n- 函数过长\n- 职责不单一\n- 命名不清晰\n\n### 重构步骤\n1. 提取子函数\n2. 重命名变量和函数\n3. 添加类型注解\n4. 优化算法',
      medium: '## 项目结构重构\n\n### 目标结构\n```\nsrc/\n├── components/     # UI 组件\n├── services/       # 业务逻辑\n├── utils/          # 工具函数\n├── types/          # 类型定义\n└── hooks/          # 自定义 Hook\n```\n\n### 重构步骤\n1. 创建新目录结构\n2. 移动文件到对应目录\n3. 更新导入路径\n4. 验证功能正常',
      complex: '## 系统架构重构\n\n### 架构模式\n- 采用分层架构\n- 引入依赖注入\n- 实现状态管理\n\n### 技术选型\n- **状态管理**：Redux Toolkit\n- **路由**：React Router v6\n- **UI 库**：Material-UI\n- **测试**：Jest + Testing Library\n\n### 实施计划\n1. 搭建基础架构\n2. 迁移核心功能\n3. 重构业务逻辑\n4. 性能优化'
    },
    loop: {
      simple: '## 性能优化迭代\n\n### 第一轮优化\n- 使用 memo 缓存计算结果\n- 避免不必要的重新渲染\n\n### 优化效果\n- 初始渲染时间：120ms → 80ms\n- 内存使用：减少 15%',
      medium: '## 多轮迭代改进\n\n### 迭代 1：代码质量\n- 添加 ESLint 规则\n- 修复代码异味\n\n### 迭代 2：性能优化\n- 实现虚拟滚动\n- 优化图片加载\n\n### 迭代 3：用户体验\n- 添加加载状态\n- 优化错误处理\n\n### 迭代 4：测试覆盖\n- 添加单元测试\n- 集成测试',
      complex: '## 自适应优化算法\n\n### 算法设计\n1. **数据收集**：收集性能指标\n2. **分析模式**：识别性能瓶颈\n3. **生成策略**：选择优化策略\n4. **执行优化**：应用优化方案\n5. **评估效果**：测量优化效果\n6. **调整参数**：根据效果调整参数\n\n### 优化策略\n- 缓存优化\n- 并行处理\n- 懒加载\n- 预计算'
    },
    max: {
      simple: '## 并行任务处理\n\n### 任务分配\n- 任务 A：数据处理（Worker 1）\n- 任务 B：文件读写（Worker 2）\n- 任务 C：网络请求（Worker 3）\n\n### 执行结果\n- 总耗时：2.3 秒\n- 并行效率：85%',
      medium: '## 多智能体协作\n\n### 智能体角色\n- **规划智能体**：制定执行计划\n- **执行智能体**：执行具体任务\n- **验证智能体**：验证执行结果\n\n### 协作流程\n1. 规划智能体制定计划\n2. 执行智能体并行执行\n3. 验证智能体验证结果\n4. 反馈和调整',
      complex: '## 全能力并行执行\n\n### 能力矩阵\n| 能力 | 状态 | 负载 |\n|------|------|------|\n| 代码生成 | 活跃 | 60% |\n| 测试执行 | 活跃 | 45% |\n| 文档生成 | 活跃 | 30% |\n| 性能分析 | 活跃 | 55% |\n\n### 执行策略\n- 动态负载均衡\n- 优先级调度\n- 故障转移'
    }
  };
  
  // 根据 prompt 内容选择响应复杂度
  let complexity = 'simple';
  if (prompt.includes('解释') || prompt.includes('设计') || prompt.includes('实现')) {
    complexity = 'medium';
  }
  if (prompt.includes('分析') || prompt.includes('规划') || prompt.includes('完整') || prompt.includes('复杂')) {
    complexity = 'complex';
  }
  
  const responseText = responses[agent]?.[complexity] || `这是对"${prompt}"的响应。`;
  
  return {
    parts: [
      { type: 'text', text: responseText }
    ]
  };
}

// 处理请求
function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const path = parsedUrl.pathname;
  const method = req.method;
  
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // 处理 OPTIONS 请求
  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 解析请求体
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });
  
  req.on('end', () => {
    try {
      const requestBody = body ? JSON.parse(body) : {};
      
      // 路由处理
      if (path === '/session' && method === 'POST') {
        // 创建会话
        const sessionId = 'session-' + Date.now();
        const session = {
          id: sessionId,
          title: requestBody.title || 'New Session',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        sessions.set(sessionId, session);
        messages.set(sessionId, []);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(session));
      } 
      else if (path === '/session' && method === 'GET') {
        // 获取会话列表
        const limit = parseInt(parsedUrl.query.limit) || 10;
        const sessionList = Array.from(sessions.values()).slice(0, limit);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessionList));
      }
      else if (path.match(/^\/session\/[^/]+$/) && method === 'GET') {
        // 获取单个会话
        const sessionId = path.split('/')[2];
        const session = sessions.get(sessionId);
        
        if (session) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(session));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
      }
      else if (path.match(/^\/session\/[^/]+$/) && method === 'DELETE') {
        // 删除会话
        const sessionId = path.split('/')[2];
        if (sessions.has(sessionId)) {
          sessions.delete(sessionId);
          messages.delete(sessionId);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ deleted: true }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
        }
      }
      else if (path.match(/^\/session\/[^/]+\/message$/) && method === 'GET') {
        // 获取会话消息
        const sessionId = path.split('/')[2];
        const sessionMessages = messages.get(sessionId) || [];
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sessionMessages));
      }
      else if (path.match(/^\/session\/[^/]+\/message$/) && method === 'POST') {
        // 发送消息
        const sessionId = path.split('/')[2];
        const session = sessions.get(sessionId);
        
        if (!session) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }
        
        const { parts, agent = 'ask' } = requestBody;
        const userMessage = {
          id: 'msg-' + Date.now(),
          role: 'user',
          parts: parts,
          timestamp: new Date().toISOString()
        };
        
        // 保存用户消息
        if (!messages.has(sessionId)) {
          messages.set(sessionId, []);
        }
        messages.get(sessionId).push(userMessage);
        
        // 生成 AI 响应
        const userText = parts.find(p => p.type === 'text')?.text || '';
        const aiResponse = generateAIResponse(userText, agent);
        
        const assistantMessage = {
          id: 'msg-' + Date.now(),
          role: 'assistant',
          parts: aiResponse.parts,
          timestamp: new Date().toISOString()
        };
        
        // 保存 AI 响应
        messages.get(sessionId).push(assistantMessage);
        
        // 模拟延迟
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(assistantMessage));
        }, 100 + Math.random() * 200);
      }
      else if (path.match(/^\/permission\/[^/]+\/reply$/) && method === 'POST') {
        // 处理权限请求
        const permissionId = path.split('/')[2];
        const { approved, always } = requestBody;
        
        permissions.set(permissionId, {
          id: permissionId,
          approved,
          always,
          timestamp: new Date().toISOString()
        });
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      }
      else if (path.match(/^\/session\/[^/]+\/abort$/) && method === 'POST') {
        // 中止会话
        const sessionId = path.split('/')[2];
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ aborted: true }));
      }
      else {
        // 404 处理
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (error) {
      console.error('Request handling error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  });
}

// 创建服务器
const server = http.createServer(handleRequest);

// 启动服务器
const PORT = process.env.PORT || 3095;
server.listen(PORT, () => {
  initMockData();
  console.log(`🚀 Helix Mock API 服务器已启动: http://localhost:${PORT}`);
  console.log(`📊 可用端点:`);
  console.log(`  POST   /session                    - 创建会话`);
  console.log(`  GET    /session                    - 获取会话列表`);
  console.log(`  GET    /session/:id                - 获取单个会话`);
  console.log(`  DELETE /session/:id                - 删除会话`);
  console.log(`  GET    /session/:id/message        - 获取消息`);
  console.log(`  POST   /session/:id/message        - 发送消息`);
  console.log(`  POST   /session/:id/abort          - 中止会话`);
  console.log(`  POST   /permission/:id/reply       - 处理权限请求`);
});

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n🛑 正在关闭服务器...');
  server.close(() => {
    console.log('✅ 服务器已关闭');
    process.exit(0);
  });
});

module.exports = server;
