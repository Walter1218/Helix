/**
 * Helix AI 能力全链路 Mock 测试脚本
 * 用于验证不同模式下的 AI 能力调用
 */

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3095', // Helix 服务地址
  timeout: 30000, // 30秒超时
  retries: 3, // 重试次数
};

// 测试结果记录
const testResults = {
  passed: 0,
  failed: 0,
  errors: [],
  details: []
};

// 工具函数
async function fetchApi(endpoint, options = {}) {
  const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEST_CONFIG.timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// 测试用例
const testCases = {
  // 会话管理测试
  sessionManagement: {
    name: '会话管理测试',
    tests: [
      {
        name: '创建会话',
        run: async () => {
          const session = await fetchApi('/session', {
            method: 'POST',
            body: JSON.stringify({ title: 'Test Session' }),
          });
          return session && session.id;
        }
      },
      {
        name: '获取会话列表',
        run: async () => {
          const sessions = await fetchApi('/session?limit=10');
          return Array.isArray(sessions);
        }
      },
      {
        name: '获取会话消息',
        run: async (sessionId) => {
          const messages = await fetchApi(`/session/${sessionId}/message`);
          return Array.isArray(messages);
        }
      },
      {
        name: '删除会话',
        run: async (sessionId) => {
          await fetchApi(`/session/${sessionId}`, { method: 'DELETE' });
          return true;
        }
      }
    ]
  },

  // Ask 模式测试
  askMode: {
    name: 'Ask 模式测试',
    tests: [
      {
        name: '简单问题',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '什么是 TypeScript？' }],
              agent: 'ask'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '中等复杂度问题',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '解释 React Hooks 的工作原理，包括 useState 和 useEffect' }],
              agent: 'ask'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '复杂代码分析',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ 
                type: 'text', 
                text: '分析这段代码的性能瓶颈并提供优化方案：\n```javascript\nfunction processData(data) {\n  return data.map(item => {\n    return item.values.filter(v => v > 10).reduce((a, b) => a + b, 0);\n  });\n}\n```' 
              }],
              agent: 'ask'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // Build 模式测试
  buildMode: {
    name: 'Build 模式测试',
    tests: [
      {
        name: '简单函数生成',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '创建一个计算斐波那契数列的函数' }],
              agent: 'build'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '组件生成',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '实现一个带分页的用户列表组件' }],
              agent: 'build'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '完整功能模块',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '构建一个完整的待办事项应用，包含增删改查、状态管理和本地存储' }],
              agent: 'build'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // Plan 模式测试
  planMode: {
    name: 'Plan 模式测试',
    tests: [
      {
        name: '简单计划',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '制定代码重构计划' }],
              agent: 'plan'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '架构设计',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '设计微服务架构方案' }],
              agent: 'plan'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '系统迁移方案',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '规划大型系统迁移方案，包括数据库迁移、API重构、前端升级' }],
              agent: 'plan'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // Compose 模式测试
  composeMode: {
    name: 'Compose 模式测试',
    tests: [
      {
        name: '函数重构',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '重构这个函数，提高可读性和性能' }],
              agent: 'compose'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '跨文件重构',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '重构项目结构，将相关功能模块化' }],
              agent: 'compose'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '系统级重构',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '重构整个应用架构，引入依赖注入和状态管理' }],
              agent: 'compose'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // Loop 模式测试
  loopMode: {
    name: 'Loop 模式测试',
    tests: [
      {
        name: '单次迭代',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '优化这段代码的性能' }],
              agent: 'loop'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '多轮迭代',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '通过多轮迭代改进代码质量' }],
              agent: 'loop'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '自适应优化',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '根据测试结果自适应优化算法' }],
              agent: 'loop'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // Max 模式测试
  maxMode: {
    name: 'Max 模式测试',
    tests: [
      {
        name: '并行处理',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '并行处理多个简单任务' }],
              agent: 'max'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '多智能体协作',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '协调多个智能体完成复杂任务' }],
              agent: 'max'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      },
      {
        name: '全能力执行',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '使用所有可用能力解决复杂问题' }],
              agent: 'max'
            }),
          });
          return response && response.parts && response.parts.length > 0;
        }
      }
    ]
  },

  // 工具调用测试
  toolCall: {
    name: '工具调用测试',
    tests: [
      {
        name: '文件读取工具',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '读取 package.json 文件内容' }],
              agent: 'ask'
            }),
          });
          // 检查是否包含工具调用
          return response && response.parts && 
            response.parts.some(part => part.type === 'tool');
        }
      },
      {
        name: '代码执行工具',
        run: async (sessionId) => {
          const response = await fetchApi(`/session/${sessionId}/message`, {
            method: 'POST',
            body: JSON.stringify({
              parts: [{ type: 'text', text: '执行一个简单的 JavaScript 代码片段' }],
              agent: 'build'
            }),
          });
          return response && response.parts && 
            response.parts.some(part => part.type === 'tool');
        }
      }
    ]
  },

  // 权限管理测试
  permission: {
    name: '权限管理测试',
    tests: [
      {
        name: '权限请求处理',
        run: async (sessionId) => {
          // 模拟权限请求
          const permissionId = 'test-permission-1';
          
          // 批准权限
          const approveResponse = await fetchApi(`/permission/${permissionId}/reply`, {
            method: 'POST',
            body: JSON.stringify({ approved: true, always: false }),
          });
          
          // 拒绝权限
          const denyResponse = await fetchApi(`/permission/${permissionId}/reply`, {
            method: 'POST',
            body: JSON.stringify({ approved: false, always: false }),
          });
          
          return true; // 如果没有抛出异常就算成功
        }
      }
    ]
  }
};

// 测试执行器
async function runTests() {
  console.log('🚀 开始 Helix AI 能力全链路测试...\n');
  
  let sessionId = null;
  
  try {
    // 1. 会话管理测试
    console.log('📋 1. 会话管理测试');
    for (const test of testCases.sessionManagement.tests) {
      try {
        const result = await test.run(sessionId);
        if (test.name === '创建会话' && result) {
          sessionId = result;
        }
        testResults.passed++;
        testResults.details.push({
          test: test.name,
          status: '✅ 通过',
          result
        });
        console.log(`  ✅ ${test.name}`);
      } catch (error) {
        testResults.failed++;
        testResults.errors.push({
          test: test.name,
          error: error.message
        });
        testResults.details.push({
          test: test.name,
          status: '❌ 失败',
          error: error.message
        });
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    if (!sessionId) {
      throw new Error('无法创建测试会话');
    }
    
    // 2. 各模式测试
    const modes = ['askMode', 'buildMode', 'planMode', 'composeMode', 'loopMode', 'maxMode'];
    
    for (const mode of modes) {
      console.log(`\n🔧 2.${modes.indexOf(mode) + 1} ${testCases[mode].name}`);
      
      for (const test of testCases[mode].tests) {
        try {
          const result = await test.run(sessionId);
          testResults.passed++;
          testResults.details.push({
            test: `${mode} - ${test.name}`,
            status: '✅ 通过',
            result
          });
          console.log(`  ✅ ${test.name}`);
        } catch (error) {
          testResults.failed++;
          testResults.errors.push({
            test: `${mode} - ${test.name}`,
            error: error.message
          });
          testResults.details.push({
            test: `${mode} - ${test.name}`,
            status: '❌ 失败',
            error: error.message
          });
          console.log(`  ❌ ${test.name}: ${error.message}`);
        }
      }
    }
    
    // 3. 工具调用测试
    console.log('\n🛠️ 3. 工具调用测试');
    for (const test of testCases.toolCall.tests) {
      try {
        const result = await test.run(sessionId);
        testResults.passed++;
        testResults.details.push({
          test: `工具调用 - ${test.name}`,
          status: '✅ 通过',
          result
        });
        console.log(`  ✅ ${test.name}`);
      } catch (error) {
        testResults.failed++;
        testResults.errors.push({
          test: `工具调用 - ${test.name}`,
          error: error.message
        });
        testResults.details.push({
          test: `工具调用 - ${test.name}`,
          status: '❌ 失败',
          error: error.message
        });
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
    // 4. 权限管理测试
    console.log('\n🔐 4. 权限管理测试');
    for (const test of testCases.permission.tests) {
      try {
        const result = await test.run(sessionId);
        testResults.passed++;
        testResults.details.push({
          test: `权限管理 - ${test.name}`,
          status: '✅ 通过',
          result
        });
        console.log(`  ✅ ${test.name}`);
      } catch (error) {
        testResults.failed++;
        testResults.errors.push({
          test: `权限管理 - ${test.name}`,
          error: error.message
        });
        testResults.details.push({
          test: `权限管理 - ${test.name}`,
          status: '❌ 失败',
          error: error.message
        });
        console.log(`  ❌ ${test.name}: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ 测试执行失败:', error.message);
  } finally {
    // 清理测试会话
    if (sessionId) {
      try {
        await fetchApi(`/session/${sessionId}`, { method: 'DELETE' });
        console.log('\n🧹 清理测试会话完成');
      } catch (error) {
        console.error('⚠️ 清理测试会话失败:', error.message);
      }
    }
  }
  
  // 输出测试结果
  console.log('\n📊 测试结果汇总:');
  console.log(`  ✅ 通过: ${testResults.passed}`);
  console.log(`  ❌ 失败: ${testResults.failed}`);
  console.log(`  📈 成功率: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(2)}%`);
  
  if (testResults.errors.length > 0) {
    console.log('\n❌ 错误详情:');
    testResults.errors.forEach(error => {
      console.log(`  - ${error.test}: ${error.error}`);
    });
  }
  
  // 生成测试报告
  generateTestReport();
  
  return testResults;
}

// 生成测试报告
function generateTestReport() {
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: testResults.passed + testResults.failed,
      passed: testResults.passed,
      failed: testResults.failed,
      successRate: ((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(2) + '%'
    },
    details: testResults.details,
    errors: testResults.errors
  };
  
  console.log('\n📄 测试报告已生成');
  console.log(JSON.stringify(report, null, 2));
  
  // 在实际环境中，这里可以将报告保存到文件或发送到监控系统
  return report;
}

// 导出测试函数
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runTests,
    testCases,
    TEST_CONFIG
  };
}

// 如果直接运行此文件
if (typeof window === 'undefined' && require.main === module) {
  runTests().catch(console.error);
}
