#!/bin/bash
# Helix Auto-Dev 服务启动脚本
# 确保 Helix Server 和 Gateway 在定时任务执行前运行
# 启动顺序: Server → 等待健康检查 → Gateway

set -e

PROJECT_ROOT="/Users/onetwo/Documents/trae_projects/Helix"
LOG_DIR="$HOME/.local/share/mimocode/log"
BUN="/Users/onetwo/.npm-global/bin/bun"
SERVER_PORT=3095
GATEWAY_PORT=3096
SERVER_PASSWORD=test123

# 检查并启动 Helix Server
check_helix_server() {
    if lsof -i :$SERVER_PORT > /dev/null 2>&1; then
        echo "✅ Helix Server 已运行 (port $SERVER_PORT)"
        return 0
    fi
    
    echo "🚀 启动 Helix Server..."
    MIMOCODE_HOME="$PROJECT_ROOT/.dev-home" \
    MIMOCODE_SKIP_MIGRATIONS=1 \
    MIMOCODE_SERVER_PASSWORD=$SERVER_PASSWORD \
    MIMOCODE_AUTONOMOUS=1 \
    "$BUN" run --cwd "$PROJECT_ROOT/packages/opencode" --conditions=browser src/index.ts serve --port $SERVER_PORT > /tmp/mimo-serve.log 2>&1 &
    
    # 等待 Server 健康检查通过
    echo "⏳ 等待 Helix Server 就绪..."
    for i in {1..30}; do
        if curl -s -u mimocode:$SERVER_PASSWORD http://127.0.0.1:$SERVER_PORT/global/health > /dev/null 2>&1; then
            echo "✅ Helix Server 启动成功 (等待 ${i}s)"
            return 0
        fi
        sleep 1
    done
    
    echo "❌ Helix Server 启动超时"
    return 1
}

# 检查并启动 Gateway
check_gateway() {
    if lsof -i :$GATEWAY_PORT > /dev/null 2>&1; then
        echo "✅ Gateway 已运行 (port $GATEWAY_PORT)"
        return 0
    fi
    
    echo "🚀 启动 Gateway..."
    HELIX_URL=http://localhost:$SERVER_PORT \
    MIMOCODE_SERVER_PASSWORD=$SERVER_PASSWORD \
    "$BUN" run --cwd "$PROJECT_ROOT/packages/feishu-gateway" src/index.ts > /tmp/feishu-gateway.log 2>&1 &
    
    # 等待 Gateway 健康检查通过
    echo "⏳ 等待 Gateway 就绪..."
    for i in {1..15}; do
        if curl -s http://localhost:$GATEWAY_PORT/api/health > /dev/null 2>&1; then
            echo "✅ Gateway 启动成功 (等待 ${i}s)"
            return 0
        fi
        sleep 1
    done
    
    echo "❌ Gateway 启动超时"
    return 1
}

# 主流程
echo "=========================================="
echo "  Helix Auto-Dev 服务检查"
echo "=========================================="

# 必须先启动 Server，Gateway 依赖它
check_helix_server
check_gateway

echo ""
echo "✅ 所有服务就绪"
echo "  Server:  http://localhost:$SERVER_PORT"
echo "  Gateway: http://localhost:$GATEWAY_PORT"
echo "=========================================="
