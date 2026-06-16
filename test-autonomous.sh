#!/bin/bash
# Helix 自主模式测试脚本
# 自动发送任务并监控执行，自动回答 AskUserQuestion

set -e

API_BASE="http://127.0.0.1:3095"
AUTH="mimocode:test123"
LOG_FILE="/tmp/autonomous-test-$(date +%Y%m%d-%H%M%S).log"
REPORT_FILE="/tmp/autonomous-test-report.md"

# 测试任务列表
declare -a TASKS=(
    "查看当前目录的项目结构，列出主要的包和模块"
    "检查 packages/feishu-gateway/src/config.ts 文件内容"
    "统计项目中 TypeScript 文件的数量"
    "查看 start-feishu.sh 脚本的内容"
    "检查 .gitignore 文件包含了哪些忽略规则"
)

# Groundtruth 预期结果
declare -a EXPECTED=(
    "应包含 packages/opencode, packages/feishu-gateway, packages/app 等包"
    "应包含飞书 App ID、App Secret、Helix URL 等配置项"
    "应返回一个数字，表示 TypeScript 文件数量"
    "应显示一键启动脚本的内容，包含 mimo serve 和 Gateway 启动逻辑"
    "应显示忽略 node_modules、dist、.env 等常见忽略规则"
)

echo "╔════════════════════════════════════════════╗"
echo "║   🧪 Helix 自主模式测试                    ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "📝 测试日志: $LOG_FILE"
echo "📊 测试报告: $REPORT_FILE"
echo ""

# 初始化报告
cat > "$REPORT_FILE" << 'EOF'
# Helix 自主模式测试报告

## 测试概览

| 项目 | 内容 |
|------|------|
| 测试时间 | TEST_TIME |
| 测试任务数 | 5 |
| 测试模式 | 完全自主（自动回答 AskUserQuestion） |

## 测试结果

| 任务 | 状态 | 耗时 | 结果摘要 |
|------|------|------|----------|
EOF

# 替换测试时间
sed -i '' "s/TEST_TIME/$(date '+%Y-%m-%d %H:%M:%S')/" "$REPORT_FILE"

# 统计
TOTAL=${#TASKS[@]}
PASSED=0
FAILED=0
TIMEOUT=0

# 自动回答 AskUserQuestion 的函数
auto_answer_question() {
    local session_id=$1
    local question=$2
    
    # 默认回答
    local answer="继续执行，不需要用户确认"
    
    # 发送回答
    curl -s -u "$AUTH" -X POST "$API_BASE/session/$session_id/resume" \
        -H 'Content-Type: application/json' \
        -d "{\"answer\": \"$answer\"}" > /dev/null 2>&1
    
    echo "  ✅ 自动回答: $answer" >> "$LOG_FILE"
}

# 执行单个测试任务
run_test() {
    local task_index=$1
    local task="${TASKS[$task_index]}"
    local expected="${EXPECTED[$task_index]}"
    local start_time=$(date +%s)
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📋 任务 $((task_index + 1))/$TOTAL: $task"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    echo "[$(date '+%H:%M:%S')] 开始任务: $task" >> "$LOG_FILE"
    
    # 创建 session
    local session_id=$(curl -s -u "$AUTH" -X POST "$API_BASE/session" \
        -H 'Content-Type: application/json' \
        -d "{\"title\": \"测试任务 $((task_index + 1))\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])" 2>/dev/null)
    
    if [ -z "$session_id" ]; then
        echo "❌ 创建 session 失败"
        echo "[$(date '+%H:%M:%S')] 创建 session 失败" >> "$LOG_FILE"
        echo "| $((task_index + 1)) | ❌ 失败 | - | 创建 session 失败 |" >> "$REPORT_FILE"
        FAILED=$((FAILED + 1))
        return
    fi
    
    echo "  Session ID: $session_id"
    echo "[$(date '+%H:%M:%S')] Session ID: $session_id" >> "$LOG_FILE"
    
    # 发送任务
    curl -s -u "$AUTH" -X POST "$API_BASE/session/$session_id/message" \
        -H 'Content-Type: application/json' \
        -d "{\"parts\":[{\"type\":\"text\",\"text\":\"$task\"}]}" > /dev/null 2>&1
    
    echo "[$(date '+%H:%M:%S')] 任务已发送" >> "$LOG_FILE"
    
    # 监控执行（最多等待 3 分钟）
    local max_wait=180
    local elapsed=0
    local result=""
    local status="running"
    
    while [ $elapsed -lt $max_wait ]; do
        sleep 5
        elapsed=$((elapsed + 5))
        
        # 获取最新消息
        local messages=$(curl -s -u "$AUTH" "$API_BASE/session/$session_id/message" 2>/dev/null)
        
        # 检查是否有 AskUserQuestion
        local has_ask=$(echo "$messages" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for msg in data:
        if msg.get('info', {}).get('role') == 'assistant':
            for p in msg.get('parts', []):
                if p.get('type') == 'tool' and p.get('tool') == 'AskUserQuestion':
                    print('yes')
                    sys.exit(0)
except:
    pass
print('no')
" 2>/dev/null)
        
        if [ "$has_ask" = "yes" ]; then
            echo "  ⏸️  检测到 AskUserQuestion，自动回答..."
            echo "[$(date '+%H:%M:%S')] 检测到 AskUserQuestion，自动回答" >> "$LOG_FILE"
            auto_answer_question "$session_id" ""
        fi
        
        # 检查是否有最终文本输出
        result=$(echo "$messages" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    for msg in reversed(data):
        if msg.get('info', {}).get('role') == 'assistant':
            for p in msg.get('parts', []):
                if p.get('type') == 'text' and p.get('text'):
                    print(p['text'][:500])
                    sys.exit(0)
except:
    pass
print('')
" 2>/dev/null)
        
        if [ -n "$result" ]; then
            status="completed"
            break
        fi
        
        # 显示进度
        echo "  ⏳ 等待中... (${elapsed}s)"
    done
    
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo ""
    echo "  📊 执行结果:"
    echo "  状态: $status"
    echo "  耗时: ${duration}s"
    echo ""
    
    if [ -n "$result" ]; then
        echo "  📝 输出预览:"
        echo "$result" | head -10 | sed 's/^/    /'
        echo ""
    fi
    
    echo "[$(date '+%H:%M:%S')] 任务完成: status=$status, duration=${duration}s" >> "$LOG_FILE"
    
    # 判断是否通过（简单检查：有输出就算通过）
    if [ "$status" = "completed" ] && [ -n "$result" ]; then
        echo "✅ 测试通过"
        echo "| $((task_index + 1)) | ✅ 通过 | ${duration}s | ${result:0:50}... |" >> "$REPORT_FILE"
        PASSED=$((PASSED + 1))
    elif [ "$status" = "completed" ]; then
        echo "⚠️ 任务完成但无输出"
        echo "| $((task_index + 1)) | ⚠️ 警告 | ${duration}s | 任务完成但无文本输出 |" >> "$REPORT_FILE"
        TIMEOUT=$((TIMEOUT + 1))
    else
        echo "❌ 测试超时"
        echo "| $((task_index + 1)) | ❌ 超时 | ${max_wait}s | 任务执行超时 |" >> "$REPORT_FILE"
        TIMEOUT=$((TIMEOUT + 1))
    fi
}

# 检查服务状态
echo "🔍 检查服务状态..."
if ! curl -s -u "$AUTH" "$API_BASE/global/health" > /dev/null 2>&1; then
    echo "❌ mimo serve 未运行，请先启动服务"
    exit 1
fi
echo "✅ mimo serve 运行正常"

# 执行测试
for i in "${!TASKS[@]}"; do
    run_test $i
done

# 生成报告摘要
cat >> "$REPORT_FILE" << EOF

## 统计摘要

| 指标 | 数值 |
|------|------|
| 总任务数 | $TOTAL |
| 通过 | $PASSED |
| 失败 | $FAILED |
| 超时 | $TIMEOUT |
| 通过率 | $((PASSED * 100 / TOTAL))% |

## 问题发现

EOF

# 添加问题发现
if [ $TIMEOUT -gt 0 ]; then
    echo "- ⚠️ $TIMEOUT 个任务超时，可能需要增加超时时间或优化执行效率" >> "$REPORT_FILE"
fi

if [ $FAILED -gt 0 ]; then
    echo "- ❌ $FAILED 个任务失败，需要检查错误日志" >> "$REPORT_FILE"
fi

echo "" >> "$REPORT_FILE"
echo "## 建议" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"
echo "- 对于需要外部依赖的任务，应在启动前检查环境" >> "$REPORT_FILE"
echo "- 对于复杂任务，可考虑增加超时时间" >> "$REPORT_FILE"
echo "- 建议添加更多监控指标，如工具调用次数、token 消耗等" >> "$REPORT_FILE"

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   📊 测试完成                               ║"
echo "╚════════════════════════════════════════════╝"
echo ""
echo "  总任务: $TOTAL"
echo "  ✅ 通过: $PASSED"
echo "  ❌ 失败: $FAILED"
echo "  ⏱️  超时: $TIMEOUT"
echo ""
echo "  📝 详细日志: $LOG_FILE"
echo "  📊 测试报告: $REPORT_FILE"
echo ""
