#!/bin/bash

# 批量测试执行脚本
# 从 test-tasks.json 读取任务并执行

set -e

FEISHU_APP_ID="cli_a93062f0a3b8dcd6"
FEISHU_APP_SECRET="Qz9HTHq4tbrL5WRO3yk1W1cXeb66Lns3"
TESTER_ID="ou_c3f2d6c183eb99441d71532b1a56f1d2"
TASKS_FILE="test-tasks.json"
REPORT_FILE="test-report-batch.md"

# 检查 Gateway 是否运行
if ! curl -s http://127.0.0.1:3100/health > /dev/null 2>&1; then
    echo "❌ Gateway 未运行，请先启动"
    exit 1
fi

echo "✅ Gateway 运行正常"

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

# 读取任务
TASKS=$(cat "$TASKS_FILE")

# 初始化报告
cat > "$REPORT_FILE" << EOF
# 批量测试报告

生成时间: $(date)
测试任务数: 60 (简单: 20, 中等: 20, 复杂: 20)

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
    
    # 等待任务完成（最多 5 分钟）
    local elapsed=0
    local max_wait=300
    local last_output=""
    
    while [ $elapsed -lt $max_wait ]; do
        sleep 5
        elapsed=$((elapsed + 5))
        
        # 获取会话状态
        local sessions=$(curl -s "http://127.0.0.1:3100/session/list" \
            -u "mimocode:mimocode2024" 2>/dev/null)
        
        # 查找最新的会话
        local latest_session=$(echo "$sessions" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
        
        if [ -n "$latest_session" ] && [ "$latest_session" != "$session_id" ]; then
            session_id="$latest_session"
            echo "🔗 关联会话: $session_id"
        fi
        
        # 检查会话消息
        if [ -n "$session_id" ]; then
            local messages=$(curl -s "http://127.0.0.1:3100/session/$session_id/messages" \
                -u "mimocode:mimocode2024" 2>/dev/null)
            
            # 检查是否有最终输出
            local assistant_messages=$(echo "$messages" | grep -c '"role":"assistant"' || echo "0")
            local tool_calls=$(echo "$messages" | grep -c '"tool"' || echo "0")
            
            # 简单检查：如果有 assistant 消息且最近 30 秒没有新的工具调用，认为完成
            if [ "$assistant_messages" -gt 0 ]; then
                local last_update=$(echo "$messages" | grep -o '"updated":[0-9]*' | tail -1 | cut -d: -f2)
                local current_time=$(date +%s%3N)
                local time_diff=$(( (current_time - last_update) / 1000 ))
                
                if [ $time_diff -gt 30 ]; then
                    status="success"
                    result="任务完成"
                    break
                fi
            fi
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
    else
        TIMEOUT=$((TIMEOUT + 1))
        echo "⏰ 任务超时 (耗时: ${duration}s)"
        echo "| $difficulty | $id | $task | ⏰ 超时 | ${duration}s | $result |" >> "$REPORT_FILE"
    fi
    
    # 等待一段时间再执行下一个任务
    sleep 5
}

# 执行简单任务
echo ""
echo "🟢 开始执行简单任务 (20个)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in $(seq 1 20); do
    id=$(printf "S%02d" $i)
    task=$(echo "$TASKS" | grep -A2 "\"id\": \"$id\"" | grep "\"task\"" | cut -d'"' -f4)
    execute_task "$id" "$task" "简单"
done

# 执行中等任务
echo ""
echo "🟡 开始执行中等任务 (20个)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in $(seq 1 20); do
    id=$(printf "M%02d" $i)
    task=$(echo "$TASKS" | grep -A2 "\"id\": \"$id\"" | grep "\"task\"" | cut -d'"' -f4)
    execute_task "$id" "$task" "中等"
done

# 执行复杂任务
echo ""
echo "🔴 开始执行复杂任务 (20个)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

for i in $(seq 1 20); do
    id=$(printf "C%02d" $i)
    task=$(echo "$TASKS" | grep -A2 "\"id\": \"$id\"" | grep "\"task\"" | cut -d'"' -f4)
    execute_task "$id" "$task" "复杂"
done

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

## 分类统计

| 难度 | 任务数 | 成功 | 超时 | 成功率 |
|------|--------|------|------|--------|
| 简单 | 20 | - | - | - |
| 中等 | 20 | - | - | - |
| 复杂 | 20 | - | - | - |

## 问题分析

### 主要问题

1. **任务完成检测** - 部分任务可能因为超时被误判
2. **超时时间** - 5分钟可能不足以完成复杂任务
3. **状态判断** - 需要更精确的任务完成判断逻辑

### 改进建议

1. **增加超时时间** - 复杂任务可延长至 10-15 分钟
2. **优化检测逻辑** - 基于最终输出内容判断任务完成
3. **增加任务粒度** - 将复杂任务拆分为更小的子任务

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
