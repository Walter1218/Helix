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
  
  # 检查退出原因
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    wait $SERVER_PID
    EXIT_CODE=$?
    echo "❌ mimo serve 退出 (code: $EXIT_CODE)"
    if [ $EXIT_CODE -eq 137 ]; then
      echo "   原因: 被 SIGKILL 终止 (可能是内存不足)"
    elif [ $EXIT_CODE -eq 143 ]; then
      echo "   原因: 被 SIGTERM 终止"
    fi
  fi
  
  if ! kill -0 $GW_PID 2>/dev/null; then
    wait $GW_PID
    EXIT_CODE=$?
    echo "❌ Gateway 退出 (code: $EXIT_CODE)"
  fi
  
  kill $SERVER_PID $GW_PID 2>/dev/null || true
  wait $SERVER_PID $GW_PID 2>/dev/null || true
  echo "✅ 已停止"
}

trap cleanup EXIT INT TERM

echo "╔════════════════════════════════════════════╗"
echo "║   🦞 Helix × 飞书 IM 一键启动              ║"
echo "╚════════════════════════════════════════════╝"
echo ""

# 检查并清理端口占用
kill_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "⚠️  端口 $port 被占用，正在清理..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "✅ 端口 $port 已释放"
  fi
}

kill_port $PORT
kill_port 3000  # Gateway 可能用的端口

# 清理已有的 Gateway 进程
kill_existing_gateway() {
  local pids=$(pgrep -f "bun.*src/index.ts" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "⚠️  发现已运行的 Gateway 进程，正在清理..."
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
    echo "✅ 已清理旧 Gateway 进程"
  fi
}

kill_existing_gateway

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
echo "⏳ 等待 mimo serve 就绪..."
for i in {1..30}; do
  if curl -s -u mimocode:$MIMOCODE_SERVER_PASSWORD http://127.0.0.1:$PORT/global/health >/dev/null 2>&1; then
    echo "✅ mimo serve 已就绪 (等待 ${i}s)"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ mimo serve 启动超时"
    exit 1
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
