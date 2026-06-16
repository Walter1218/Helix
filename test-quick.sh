#!/bin/bash

# 快速测试脚本 - 每个难度运行一个任务

set -e

# 飞书凭证从环境变量或 .env 文件读取
FEISHU_APP_ID=${FEISHU_APP_ID:-""}
FEISHU_APP_SECRET=${FEISHU_APP_SECRET:-""}
TESTER_ID=${TESTER_ID:-""}

# 如果环境变量为空，尝试从 .env 文件读取
if [ -z "$FEISHU_APP_ID" ] && [ -f ".env" ]; then
    source .env
fi

if [ -z "$FEISHU_APP_ID" ] || [ -z "$FEISHU_APP_SECRET" ] || [ -z "$TESTER_ID" ]; then
    echo "❌ 请设置环境变量: FEISHU_APP_ID, FEISHU_APP_SECRET, TESTER_ID"
    exit 1
fi
REPORT_FILE="test-report-quick.md"

# 检查 Gateway 是否运行
if ! ps aux | grep -q "[b]un run src/index.ts"; then
    echo "❌ Gateway 未运行，请先启动"
    exit 1
fi

echo "✅ Gateway 进程运行中"

# 获取 Tenant Access Token
echo "🔑 获取 Tenant Access Token..."
TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\": \"$FEISHU_APP_ID\", \"app_secret\": \"$FEISHU_APP_SECRET\"}" | \
    grep -o '"tenant_access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TENANT_TOKEN" ]; then
    echo "❌ 获取 Token 失败"
    exit 1
fi

echo "✅ Token: ${TENANT_TOKEN:0:20}..."

# 初始化报告
cat > "$REPORT_FILE" << EOF
# 快速测试报告

生成时间: $(date)
测试任务数: 3 (简单: 1, 中等: 1, 复杂: 1)

## 测试结果

| 难度 | 任务ID | 任务描述 | 状态 | 耗时 | 备注 |
|------|--------|----------|------|------|------|
EOF

# 统计变量
TOTAL=0
SUCCESS=0
FAILED=0
TIMEOUT=0

# 执行测试任务
execute_task() {
    local id="$1"
    local task="$2"
    local difficulty="$3"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 任务 $id: $task"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    local start_time=$(date +%s)
    local session_id=""
    local status="pending"
    local result=""
    
    # 发送任务
    local response=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
        -H "Authorization: Bearer $TENANT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"receive_id\": \"$TESTER_ID\", \"msg_type\": \"text\", \"content\": \"{\\\"text\\\": \\\"$task\\\"}\"}")
    
    local message_id=$(echo "$response" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)
    
    if [ -z "$message_id" ]; then
        echo "❌ 发送消息失败"
        echo "| $difficulty | $id | $task | ❌ 失败 | - | 发送失败 |" >> "$REPORT_FILE"
        FAILED=$((FAILED + 1))
        return 1
    fi
    
    echo "📤 消息已发送: $message_id"
    
    # 等待任务完成（最多 3 分钟）
    local elapsed=0
    local max_wait=180
    
    while [ $elapsed -lt $max_wait ]; do
        sleep 5
        elapsed=$((elapsed + 5))
        
        # 检查 Gateway 日志
        local logs=$(tail -20 /tmp/helix-gateway.log 2>/dev/null || echo "")
        
        # 检查是否有任务完成的标志
        if echo "$logs" | grep -q "任务完成"; then
            status="success"
            result="任务完成"
            break
        fi
        
        # 检查是否有错误
        if echo "$logs" | grep -q "错误\|error\|失败"; then
            local error=$(echo "$logs" | grep -E "错误|error|失败" | tail -1)
            status="failed"
            result="$error"
            break
        fi
        
        echo "⏳ 等待中... (${elapsed}s / ${max_wait}s)"
    done
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    if [ "$status" = "pending" ]; then
        status="timeout"
        result="超时"
    fi
    
    TOTAL=$((TOTAL + 1))
    
    if [ "$status" = "success" ]; then
        SUCCESS=$((SUCCESS + 1))
        echo "✅ 任务完成 (耗时: ${duration}s)"
        echo "| $difficulty | $id | $task | ✅ 成功 | ${duration}s | $result |" >> "$REPORT_FILE"
    elif [ "$status" = "failed" ]; then
        FAILED=$((FAILED + 1))
        echo "❌ 任务失败 (耗时: ${duration}s)"
        echo "| $difficulty | $id | $task | ❌ 失败 | ${duration}s | $result |" >> "$REPORT_FILE"
    else
        TIMEOUT=$((TIMEOUT + 1))
        echo "⏰ 任务超时 (耗时: ${duration}s)"
        echo "| $difficulty | $id | $task | ⏰ 超时 | ${duration}s | $result |" >> "$REPORT_FILE"
    fi
    
    # 等待一段时间再执行下一个任务
    echo "⏸️  等待 10 秒..."
    sleep 10
}

# 执行简单任务
echo ""
echo "🟢 执行简单任务..."
execute_task "S01" "查看当前目录结构" "简单"

# 执行中等任务
echo ""
echo "🟡 执行中等任务..."
execute_task "M01" "查看 packages/feishu-gateway/src/config.ts 文件内容" "中等"

# 执行复杂任务
echo ""
echo "🔴 执行复杂任务..."
execute_task "C01" "查看 tushare 相关的 duckdb 数据库文件列表" "复杂"

# 生成报告摘要
echo ""
echo "📊 生成测试报告..."

cat >> "$REPORT_FILE" << EOF

## 测试摘要

| 指标 | 数值 |
|------|------|
| 总任务数 | $TOTAL |
| 成功任务 | $SUCCESS |
| 超时任务 | $TIMEOUT |
| 失败任务 | $FAILED |
| 成功率 | $(( SUCCESS * 100 / TOTAL ))% |

## 测试环境

- Gateway: http://127.0.0.1:3100
- MiMo Serve: http://127.0.0.1:3095
- 测试时间: $(date)
- 操作系统: $(uname -s) $(uname -r)

---

*报告生成时间: $(date)*
EOF

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 测试完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "总任务数: $TOTAL"
echo "成功任务: $SUCCESS"
echo "超时任务: $TIMEOUT"
echo "失败任务: $FAILED"
echo "成功率: $(( SUCCESS * 100 / TOTAL ))%"
echo ""
echo "📄 详细报告已保存到: $REPORT_FILE"
echo ""
