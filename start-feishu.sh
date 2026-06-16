#!/bin/bash
# 一键启动飞书 IM Gateway + Helix Server
# 用法: ./start-feishu.sh [port]

set -e

MIMOCODE_SERVER_PASSWORD=${MIMOCODE_SERVER_PASSWORD:-test123}
PORT=${1:-3095}
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

cleanup() {
  echo ""
  echo "🛑 正在停止服务..."
  kill $SERVER_PID $GW_PID 2>/dev/null || true
  wait $SERVER_PID $GW_PID 2>/dev/null || true
  echo "✅ 已停止"
}

trap cleanup EXIT INT TERM

echo "╔════════════════════════════════════════════╗"
echo "║   🦞 Helix × 飞书 IM 一键启动              ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查编译产物
BINARY="$PROJECT_ROOT/packages/opencode/dist/mimocode-darwin-arm64/bin/mimo"
if [ ! -f "$BINARY" ]; then
  echo "❌ 未找到编译产物: $BINARY"
  echo "   请先运行: bun run packages/opencode/script/build.ts --single"
  exit 1
fi

# 检查飞书配置
if [ ! -f "$PROJECT_ROOT/packages/feishu-gateway/.env" ]; then
  echo "❌ 未找到飞书配置: packages/feishu-gateway/.env"
  echo "   请先运行: cd packages/feishu-gateway && cp .env.example .env"
  exit 1
fi

echo "🚀 启动 mimo serve (port: $PORT)..."
MIMOCODE_SERVER_PASSWORD=$MIMOCODE_SERVER_PASSWORD \
  "$BINARY" serve --port $PORT &
SERVER_PID=$!

# 等待服务器就绪
for i in {1..10}; do
  if curl -s -u mimocode:$MIMOCODE_SERVER_PASSWORD http://127.0.0.1:$PORT/global/health >/dev/null 2>&1; then
    echo "✅ mimo serve 已就绪"
    break
  fi
  sleep 1
done

echo "🔗 启动飞书 Gateway..."
cd "$PROJECT_ROOT/packages/feishu-gateway"
HELIX_URL=http://localhost:$PORT \
MIMOCODE_SERVER_PASSWORD=$MIMOCODE_SERVER_PASSWORD \
  bun run src/index.ts &
GW_PID=$!

echo ""
echo "╔════════════════════════════════════════════╗"
echo "║   ✅ 服务已启动                             ║"
echo "║   mimo serve:  PID $SERVER_PID (port $PORT)        ║"
echo "║   Gateway:     PID $GW_PID                      ║"
echo "║                                            ║"
echo "║   按 Ctrl+C 停止所有服务                    ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 等待进程退出（任一退出则清理）
while kill -0 $SERVER_PID 2>/dev/null && kill -0 $GW_PID 2>/dev/null; do
  sleep 1
done
echo "⚠️ 有服务异常退出"
