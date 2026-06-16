#!/bin/bash

# 简单测试脚本 - 直接运行 Gateway 并发送消息

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

echo "🚀 启动 Gateway..."
cd /Users/onetwo/Documents/trae_projects/Helix/packages/feishu-gateway

# 启动 Gateway 并捕获输出
bun run src/index.ts 2>&1 &
GATEWAY_PID=$!

sleep 10
echo "✅ Gateway 已启动 (PID: $GATEWAY_PID)"

# 获取 Token
echo "🔑 获取 Tenant Access Token..."
TENANT_TOKEN=$(curl -s -X POST "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal" \
    -H "Content-Type: application/json" \
    -d "{\"app_id\": \"$FEISHU_APP_ID\", \"app_secret\": \"$FEISHU_APP_SECRET\"}" | \
    grep -o '"tenant_access_token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TENANT_TOKEN" ]; then
    echo "❌ 获取 Token 失败"
    kill $GATEWAY_PID 2>/dev/null || true
    exit 1
fi

echo "✅ Token: ${TENANT_TOKEN:0:20}..."

# 发送测试消息
echo "📤 发送测试消息..."
RESPONSE=$(curl -s -X POST "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id" \
    -H "Authorization: Bearer $TENANT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"receive_id\": \"$TESTER_ID\", \"msg_type\": \"text\", \"content\": \"{\\\"text\\\": \\\"查看当前目录结构\\\"}\"}")

MESSAGE_ID=$(echo "$RESPONSE" | grep -o '"message_id":"[^"]*"' | cut -d'"' -f4)

if [ -z "$MESSAGE_ID" ]; then
    echo "❌ 发送消息失败"
    echo "响应: $RESPONSE"
    kill $GATEWAY_PID 2>/dev/null || true
    exit 1
fi

echo "✅ 消息已发送: $MESSAGE_ID"

# 等待任务完成
echo "⏳ 等待任务完成..."
sleep 60

# 检查 Gateway 是否还在运行
if ps -p $GATEWAY_PID > /dev/null; then
    echo "✅ Gateway 仍在运行"
else
    echo "❌ Gateway 已退出"
fi

# 停止 Gateway
echo "🛑 停止 Gateway..."
kill $GATEWAY_PID 2>/dev/null || true
wait $GATEWAY_PID 2>/dev/null || true

echo "✅ 测试完成"
