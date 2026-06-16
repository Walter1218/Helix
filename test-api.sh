#!/bin/bash
# 直接调用 Helix API 批量测试

set -e

HELIX_URL="http://localhost:3095"
AUTH=$(echo -n "mimocode:test123" | base64)
REPORT="test-report.md"
TASKS_FILE="test-tasks.json"

# 初始化报告
cat > "$REPORT" << 'EOF'
# Helix 自主模式测试报告

| ID | 难度 | 任务 | 状态 | 耗时 | 输出摘要 |
|----|------|------|------|------|----------|
EOF

TOTAL=0 PASS=0 FAIL=0 TIMEOUT=0

run_task() {
    local id=$1 level=$2 task=$3
    TOTAL=$((TOTAL+1))
    
    echo "[$TOTAL] $id: $task"
    
    # 创建 session
    local sid=$(curl -s -X POST "$HELIX_URL/session" \
        -H "Authorization: Basic $AUTH" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"test-$id\"}" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -z "$sid" ]; then
        echo "  ❌ 创建 session 失败"
        echo "| $id | $level | $task | ❌ 失败 | - | session创建失败 |" >> "$REPORT"
        FAIL=$((FAIL+1))
        return
    fi
    
    # 发送任务
    curl -s -X POST "$HELIX_URL/session/$sid/message" \
        -H "Authorization: Basic $AUTH" \
        -H "Content-Type: application/json" \
        -d "{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"$task\"}]}" > /dev/null
    
    # 轮询等待完成（最多5分钟）
    local start=$(date +%s)
    local max_wait=300
    local output=""
    local status="timeout"
    
    while [ $(($(date +%s) - start)) -lt $max_wait ]; do
        sleep 5
        
        # 获取消息
        local messages=$(curl -s "$HELIX_URL/session/$sid/message" -H "Authorization: Basic $AUTH")
        
        # 检查是否有完成的 assistant 消息（带 text 输出）
        local completed_text=$(echo "$messages" | grep -o '"text":"[^"]*"' | tail -1 | cut -d'"' -f4)
        local has_completed=$(echo "$messages" | grep -o '"completed":[0-9]*' | tail -1)
        
        if [ -n "$has_completed" ] && [ -n "$completed_text" ] && [ ${#completed_text} -gt 10 ]; then
            output="$completed_text"
            status="pass"
            break
        fi
        
        # 检查是否超时错误
        if echo "$messages" | grep -q "任务执行超时"; then
            status="timeout"
            output="任务执行超时"
            break
        fi
    done
    
    local elapsed=$(($(date +%s) - start))
    
    if [ "$status" = "pass" ]; then
        PASS=$((PASS+1))
        local summary=$(echo "$output" | head -c 80 | tr '\n' ' ')
        echo "  ✅ 通过 (${elapsed}s)"
        echo "| $id | $level | $task | ✅ 通过 | ${elapsed}s | $summary |" >> "$REPORT"
    else
        TIMEOUT=$((TIMEOUT+1))
        echo "  ⏰ 超时 (${elapsed}s)"
        echo "| $id | $level | $task | ⏰ 超时 | ${elapsed}s | - |" >> "$REPORT"
    fi
}

# 读取任务并执行
echo "=========================================="
echo " Helix 自主模式批量测试"
echo "=========================================="
echo ""

# 简单任务（取前5个）
echo "▶ 简单任务"
run_task "S01" "简单" "查看当前目录结构"
run_task "S02" "简单" "统计项目中 TypeScript 文件数量"
run_task "S03" "简单" "查看 README.md 文件内容"
run_task "S04" "简单" "列出 packages 目录下的所有包"
run_task "S05" "简单" "查看 package.json 中的 scripts"

# 中等任务（取前5个）
echo ""
echo "▶ 中等任务"
run_task "M01" "中等" "查看 packages/feishu-gateway/src/config.ts 文件内容"
run_task "M02" "中等" "查看 packages/opencode/src 目录结构"
run_task "M03" "中等" "统计 packages/opencode/src 中的 TypeScript 文件数量"
run_task "M04" "中等" "查看 start-feishu.sh 脚本内容"
run_task "M05" "中等" "查看 packages/app 目录结构"

# 复杂任务（取前5个）
echo ""
echo "▶ 复杂任务"
run_task "C01" "复杂" "查看 tushare 相关的 duckdb 数据库文件列表"
run_task "C02" "复杂" "检查 tushare_toplist.duckdb 数据库中的表结构"
run_task "C03" "复杂" "查看 tushare_warehouse 目录结构"
run_task "C07" "复杂" "查看 tushare_toplist.duckdb 中的数据行数"
run_task "C09" "复杂" "查看 a_share_warehouse.duckdb 中的表列表"

# 汇总
echo ""
echo "=========================================="
echo " 测试完成"
echo "=========================================="
echo " 总计: $TOTAL | 通过: $PASS | 超时: $TIMEOUT | 失败: $FAIL"
echo " 通过率: $((PASS * 100 / TOTAL))%"
echo ""
echo " 报告: $REPORT"

# 写入汇总
cat >> "$REPORT" << EOF

## 汇总

| 指标 | 数值 |
|------|------|
| 总任务 | $TOTAL |
| 通过 | $PASS |
| 超时 | $TIMEOUT |
| 失败 | $FAIL |
| 通过率 | $((PASS * 100 / TOTAL))% |
EOF
