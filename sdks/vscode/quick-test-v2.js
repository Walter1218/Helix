/**
 * 快速验证测试环境 v2
 * 支持流式响应和真实的 Helix 服务器
 */

const http = require('http');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3095',
  timeout: 30000, // 增加超时时间，因为 AI 响应可能需要较长时间
  useMockServer: false // 是否使用 mock 服务器
};

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 发送 HTTP 请求（支持流式响应）
function makeRequest(endpoint, options = {}) {
  return new Promise((resolve, reject) => {
    const url = `${TEST_CONFIG.baseUrl}${endpoint}`;
    const timeoutId = setTimeout(() => {
      reject(new Error('请求超时'));
    }, TEST_CONFIG.timeout);
    
    const req = http.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      let chunks = [];
      
      // 处理流式响应
      res.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        chunks.push(chunkStr);
        data += chunkStr;
        
        // 尝试解析 JSON 响应
        try {
          const jsonData = JSON.parse(data);
          clearTimeout(timeoutId);
          resolve({
            status: res.statusCode,
            data: jsonData,
            isStream: false
          });
        } catch (e) {
          // 继续接收数据
        }
      });
      
      res.on('end', () => {
        clearTimeout(timeoutId);
        
        // 如果还没有解析过响应，尝试解析完整数据
        if (chunks.length > 0) {
          try {
            const jsonData = JSON.parse(data);
            resolve({
              status: res.statusCode,
              data: jsonData,
              isStream: false
            });
          } catch (e) {
            // 返回原始数据
            resolve({
              status: res.statusCode,
              data: data,
              isStream: true,
              chunks: chunks
            });
          }
        } else {
          resolve({
            status: res.statusCode,
            data: null,
            isStream: false
          });
        }
      });
    });
    
    req.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    
    req.end();
  });
}

// 测试用例
async function runQuickTests() {
  console.log('🚀 开始快速验证测试 v2...\n');
  
  // 测试 1: 检查服务器是否运行
  try {
    console.log('1. 检查服务器状态...');
    const response = await makeRequest('/session');
    if (response.status === 200) {
      console.log('   ✅ 服务器运行正常');
      results.passed++;
      results.tests.push({ name: '服务器状态', status: 'passed' });
    } else {
      throw new Error(`服务器响应异常: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ 服务器未运行: ${error.message}`);
    results.failed++;
    results.tests.push({ name: '服务器状态', status: 'failed', error: error.message });
    console.log('\n请先启动 Helix 服务器或 Mock 服务器');
    return;
  }
  
  // 测试 2: 创建会话
  try {
    console.log('2. 测试创建会话...');
    const response = await makeRequest('/session', {
      method: 'POST',
      body: { title: '快速测试会话 v2' }
    });
    
    if (response.status === 200 && response.data && response.data.id) {
      console.log(`   ✅ 会话创建成功: ${response.data.id}`);
      results.passed++;
      results.tests.push({ name: '创建会话', status: 'passed', sessionId: response.data.id });
      
      // 保存会话 ID 用于后续测试
      global.testSessionId = response.data.id;
    } else {
      throw new Error('会话创建失败');
    }
  } catch (error) {
    console.log(`   ❌ 创建会话失败: ${error.message}`);
    results.failed++;
    results.tests.push({ name: '创建会话', status: 'failed', error: error.message });
  }
  
  // 测试 3: 发送消息（处理流式响应）
  try {
    console.log('3. 测试发送消息...');
    const sessionId = global.testSessionId || 'session-default';
    const response = await makeRequest(`/session/${sessionId}/message`, {
      method: 'POST',
      body: {
        parts: [{ type: 'text', text: '你好，请简单介绍一下自己' }],
        agent: 'ask'
      }
    });
    
    if (response.status === 200) {
      console.log('   ✅ 消息发送成功');
      results.passed++;
      results.tests.push({ name: '发送消息', status: 'passed' });
      
      // 显示响应内容
      if (response.data && response.data.parts) {
        console.log('   📝 响应内容:');
        response.data.parts.forEach((part, index) => {
          if (part.type === 'text') {
            console.log(`      ${index + 1}. ${part.text.substring(0, 100)}...`);
          } else if (part.type === 'tool') {
            console.log(`      ${index + 1}. [工具调用] ${part.tool}`);
          }
        });
      } else if (response.isStream) {
        console.log('   📝 收到流式响应');
      }
    } else {
      throw new Error(`消息发送失败: ${response.status}`);
    }
  } catch (error) {
    console.log(`   ❌ 发送消息失败: ${error.message}`);
    results.failed++;
    results.tests.push({ name: '发送消息', status: 'failed', error: error.message });
  }
  
  // 测试 4: 获取会话列表
  try {
    console.log('4. 测试获取会话列表...');
    const response = await makeRequest('/session?limit=10');
    
    if (response.status === 200 && Array.isArray(response.data)) {
      console.log(`   ✅ 获取会话列表成功: ${response.data.length} 个会话`);
      results.passed++;
      results.tests.push({ name: '获取会话列表', status: 'passed', count: response.data.length });
    } else {
      throw new Error('获取会话列表失败');
    }
  } catch (error) {
    console.log(`   ❌ 获取会话列表失败: ${error.message}`);
    results.failed++;
    results.tests.push({ name: '获取会话列表', status: 'failed', error: error.message });
  }
  
  // 测试 5: 测试不同模式
  const modes = ['ask', 'build', 'plan'];
  for (const mode of modes) {
    try {
      console.log(`5.${modes.indexOf(mode) + 1} 测试 ${mode} 模式...`);
      const sessionId = global.testSessionId || 'session-default';
      
      const prompts = {
        ask: '什么是 JavaScript？',
        build: '写一个简单的 Hello World 函数',
        plan: '制定一个学习 TypeScript 的计划'
      };
      
      const response = await makeRequest(`/session/${sessionId}/message`, {
        method: 'POST',
        body: {
          parts: [{ type: 'text', text: prompts[mode] || `测试 ${mode} 模式` }],
          agent: mode
        }
      });
      
      if (response.status === 200) {
        console.log(`   ✅ ${mode} 模式测试通过`);
        results.passed++;
        results.tests.push({ name: `${mode} 模式`, status: 'passed' });
      } else {
        throw new Error(`${mode} 模式测试失败: ${response.status}`);
      }
    } catch (error) {
      console.log(`   ❌ ${mode} 模式测试失败: ${error.message}`);
      results.failed++;
      results.tests.push({ name: `${mode} 模式`, status: 'failed', error: error.message });
    }
  }
  
  // 输出测试结果
  console.log('\n📊 测试结果汇总:');
  console.log(`   ✅ 通过: ${results.passed}`);
  console.log(`   ❌ 失败: ${results.failed}`);
  console.log(`   📈 成功率: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(2)}%`);
  
  if (results.failed > 0) {
    console.log('\n❌ 失败的测试:');
    results.tests.filter(t => t.status === 'failed').forEach(test => {
      console.log(`   - ${test.name}: ${test.error}`);
    });
  }
  
  console.log('\n🎉 快速验证测试完成！');
  
  // 清理测试会话
  if (global.testSessionId) {
    try {
      await makeRequest(`/session/${global.testSessionId}`, { method: 'DELETE' });
      console.log('🧹 测试会话已清理');
    } catch (error) {
      console.log('⚠️  清理测试会话失败:', error.message);
    }
  }
  
  return results;
}

// 运行测试
if (require.main === module) {
  runQuickTests().catch(console.error);
}

module.exports = { runQuickTests };
