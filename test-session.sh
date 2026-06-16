#!/bin/bash
set -e

HELIX_URL="http://localhost:3095"
AUTH=$(echo -n "mimocode:test123" | base64)
REPORT="test-report-session.md"

cat > "$REPORT" << 'EOF'
# Helix 自主模式测试（同一 Session，有上下文记忆）

| ID | 难度 | 任务 | 状态 | 耗时 |
|----|------|------|------|------|
EOF

TOTAL=0 PASS=0 FAIL=0

run_task() {
    local id=$1 level=$2 task=$3
    TOTAL=$((TOTAL+1))
    echo "[$TOTAL/60] $id: $task"
    
    curl -s -X POST "$HELIX_URL/session/$SID/message" \
        -H "Authorization: Basic $AUTH" \
        -H "Content-Type: application/json" \
        -d "{\"role\":\"user\",\"parts\":[{\"type\":\"text\",\"text\":\"$task\"}]}" > /dev/null
    
    local start=$(date +%s)
    local max_wait=180
    local status="timeout"
    
    while [ $(($(date +%s) - start)) -lt $max_wait ]; do
        sleep 4
        local messages=$(curl -s "$HELIX_URL/session/$SID/message" -H "Authorization: Basic $AUTH")
        local has_completed=$(echo "$messages" | grep -o '"completed":[0-9]*' | tail -1)
        local has_text=$(echo "$messages" | grep -o '"type":"text"' | tail -1)
        
        if [ -n "$has_completed" ] && [ -n "$has_text" ]; then
            status="pass"
            break
        fi
    done
    
    local elapsed=$(($(date +%s) - start))
    
    if [ "$status" = "pass" ]; then
        PASS=$((PASS+1))
        echo "  ✅ ${elapsed}s"
        echo "| $id | $level | $task | ✅ | ${elapsed}s |" >> "$REPORT"
    else
        FAIL=$((FAIL+1))
        echo "  ⏰ ${elapsed}s"
        echo "| $id | $level | $task | ⏰ | ${elapsed}s |" >> "$REPORT"
    fi
}

echo "=========================================="
echo " 创建 Session（同一 Session 执行所有任务）"
echo "=========================================="

SID=$(curl -s -X POST "$HELIX_URL/session" \
    -H "Authorization: Basic $AUTH" \
    -H "Content-Type: application/json" \
    -d '{"title":"batch-test-60"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

echo "Session: $SID"
echo ""

echo "▶ 简单任务 (1/3)"
run_task "S01" "简单" "查看当前目录结构"
run_task "S02" "简单" "统计项目中 TypeScript 文件数量"
run_task "S03" "简单" "查看 README.md 文件内容"
run_task "S04" "简单" "查看 .gitignore 文件内容"
run_task "S05" "简单" "查看 package.json 文件内容"
run_task "S06" "简单" "列出 packages 目录下的所有包"
run_task "S07" "简单" "查看 tsconfig.json 配置"
run_task "S08" "简单" "查看 bun.lock 文件大小"
run_task "S09" "简单" "统计项目中 .md 文件数量"
run_task "S10" "简单" "查看 .editorconfig 文件内容"
run_task "S11" "简单" "查看 turbo.json 配置"
run_task "S12" "简单" "列出 scripts 目录下的脚本"
run_task "S13" "简单" "查看 bunfig.toml 配置"
run_task "S14" "简单" "统计项目中 .json 文件数量"
run_task "S15" "简单" "查看 LICENSE 文件内容"
run_task "S16" "简单" "列出 .github 目录结构"
run_task "S17" "简单" "查看 sst.config.ts 配置"
run_task "S18" "简单" "统计项目中 .sh 文件数量"
run_task "S19" "简单" "查看 flake.nix 配置"
run_task "S20" "简单" "列出 docs 目录结构"

echo ""
echo "▶ 中等任务 (2/3)"
run_task "M01" "中等" "查看 packages/feishu-gateway/src/config.ts 文件内容"
run_task "M02" "中等" "查看 packages/opencode/src 目录结构"
run_task "M03" "中等" "统计 packages/opencode/src 中的 TypeScript 文件数量"
run_task "M04" "中等" "查看 start-feishu.sh 脚本内容"
run_task "M05" "中等" "查看 packages/app 目录结构"
run_task "M06" "中等" "查看 packages/console 目录结构"
run_task "M07" "中等" "查看 packages/desktop 目录结构"
run_task "M08" "中等" "查看 packages/sdk 目录结构"
run_task "M09" "中等" "查看 packages/ui 目录结构"
run_task "M10" "中等" "查看 packages/shared 目录结构"
run_task "M11" "中等" "查看 packages/plugin 目录结构"
run_task "M12" "中等" "查看 packages/script 目录结构"
run_task "M13" "中等" "查看 packages/containers 目录结构"
run_task "M14" "中等" "查看 infra 目录结构"
run_task "M15" "中等" "查看 nix 目录结构"
run_task "M16" "中等" "查看 patches 目录内容"
run_task "M17" "中等" "查看 .husky 目录结构"
run_task "M18" "中等" "查看 .vscode 目录结构"
run_task "M19" "中等" "查看 .zed 目录结构"
run_task "M20" "中等" "查看 .mimocode 目录结构"

echo ""
echo "▶ 复杂任务 (3/3)"
run_task "C01" "复杂" "查看 tushare 相关的 duckdb 数据库文件列表"
run_task "C02" "复杂" "检查 tushare_toplist.duckdb 数据库中的表结构"
run_task "C03" "复杂" "检查 tushare_moneyflow.duckdb 数据库中的表结构"
run_task "C04" "复杂" "查看 tushare_warehouse 目录结构"
run_task "C05" "复杂" "检查本地是否安装了 tushare 库"
run_task "C06" "复杂" "检查 tushare 版本"
run_task "C07" "复杂" "查看 tushare_toplist.duckdb 中的数据行数"
run_task "C08" "复杂" "查看 tushare_moneyflow.duckdb 中的数据行数"
run_task "C09" "复杂" "查看 a_share_warehouse.duckdb 中的表列表"
run_task "C10" "复杂" "查看 a_share_warehouse.duckdb 中的数据行数"
run_task "C11" "复杂" "查看 tushare_daily.duckdb 中的表结构"
run_task "C12" "复杂" "查看 tushare_daily.duckdb 中的数据行数"
run_task "C13" "复杂" "统计所有 tushare 数据库的总数据量"
run_task "C14" "复杂" "查看 tushare 数据库中最新的数据日期"
run_task "C15" "复杂" "查看 tushare 数据库中最早的数据日期"
run_task "C16" "复杂" "检查 tushare 数据库中是否有招商银行(600036)的数据"
run_task "C17" "复杂" "检查 tushare 数据库中是否有平安银行(000001)的数据"
run_task "C18" "复杂" "查看 tushare 数据库中股票代码的分布情况"
run_task "C19" "复杂" "查看 tushare 数据库中交易日期的分布情况"
run_task "C20" "复杂" "检查 tushare 数据库中是否有缺失数据"

echo ""
echo "=========================================="
echo " 测试完成"
echo "=========================================="
echo " 总计: $TOTAL | 通过: $PASS | 失败: $FAIL"
echo " 通过率: $((PASS * 100 / TOTAL))%"
echo " 报告: $REPORT"

cat >> "$REPORT" << EOF

## 汇总

| 指标 | 数值 |
|------|------|
| 总任务 | $TOTAL |
| 通过 | $PASS |
| 失败 | $FAIL |
| 通过率 | $((PASS * 100 / TOTAL))% |
| Session | $SID |
EOF
