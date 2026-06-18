/**
 * 快速验证测试环境
 * 用于检查测试环境是否正常工作
 */

const http = require('http');

// 测试配置
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3095',
  timeout: 5000
};

// 测试结果
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

// 发送 HTTP 请求
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
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        clearTimeout(timeoutId);
        try {
          const jsonData = JSON.parse(data);
          resolve({
            status: res.statusCode,
            data: jsonData
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data
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
  console.log('🚀 开始快速验证测试...\n');
  
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
    console.log('\n请先启动 Mock 服务器: node test-server.js');
    return;
  }
  
  // 测试 2: 创建会话
  try {
    console.log('2. 测试创建会话...');
    const response = await makeRequest('/session', {
      method: 'POST',
      body: { title: '快速测试会话' }
    });
    
    if (response.status === 200 && response.data.id) {
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
  
  // 测试 3: 发送消息
  try {
    console.log('3. 测试发送消息...');
    const sessionId = global.testSessionId || 'session-default';
    const response = await makeRequest(`/session/${sessionId}/message`, {
      method: 'POST',
      body: {
        parts: [{ type: 'text', text: '测试消息' }],
        agent: 'ask'
      }
    });
    
    if (response.status === 200 && response.data.parts) {
      console.log('   ✅ 消息发送成功');
      results.passed++;
      results.tests.push({ name: '发送消息', status: 'passed' });
    } else {
      throw new Error('消息发送失败');
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
  const modes = ['ask', 'build', 'plan', 'compose', 'loop', 'max'];
  for (const mode of modes) {
    try {
      console.log(`5.${modes.indexOf(mode) + 1} 测试 ${mode} 模式...`);
      const sessionId = global.testSessionId || 'session-default';
      const response = await makeRequest(`/session/${sessionId}/message`, {
        method: 'POST',
        body: {
          parts: [{ type: 'text', text: `测试 ${mode} 模式` }],
          agent: mode
        }
      });
      
      if (response.status === 200 && response.data.parts) {
        console.log(`   ✅ ${mode} 模式测试通过`);
        results.passed++;
        results.tests.push({ name: `${mode} 模式`, status: 'passed' });
      } else {
        throw new Error(`${mode} 模式测试失败`);
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
