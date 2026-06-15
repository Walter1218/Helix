#!/bin/bash
# 自动加载用户的环境变量，确保 bun 等命令可用
source ~/.bash_profile 2>/dev/null || true
source ~/.zshrc 2>/dev/null || true
source ~/.nvm/nvm.sh 2>/dev/null || true

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_DIR"

echo "========================================"
echo "🕒 $(date): 开始执行数据飞轮闭环..."
echo "========================================"

echo "▶ Step 1: 扩充每日测试用例"
bun run script/dogfooding/generate_cases.ts --daily-expand

echo "▶ Step 2: 跑测并产生脏数据 Trace (Phase 1)"
bun run script/dogfooding/beta_evolution_loop.ts

echo "▶ Step 3: 启动离线优化器提取规则 (Phase 2)"
bun run script/dogfooding/optimize_prompt.ts

echo "▶ Step 4: 导出最新的 DPO 偏好对齐数据集 (Phase 3)"
bun run script/dogfooding/export_dpo.ts

echo "✅ $(date): 今日飞轮闭环执行完毕！"
