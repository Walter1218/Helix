#!/bin/bash
# Helix Auto-Dev 服务启动脚本
# 确保 Helix Server 和 Gateway 在定时任务执行前运行

set -e

PROJECT_ROOT="/Users/onetwo/Documents/trae_projects/Helix"
LOG_DIR="$HOME/.local/share/mimocode/log"

# 检查并启动 Helix Server
check_helix_server() {
    if lsof -i :3095 > /dev/null 2>&1; then
        echo "✅ Helix Server 已运行 (port 3095)"
        return 0
    fi
    
    echo "🚀 启动 Helix Server..."
    cd "$PROJECT_ROOT"
    MIMOCODE_HOME="$PROJECT_ROOT/.dev-home" \
    MIMOCODE_SKIP_MIGRATIONS=1 \
    MIMOCODE_SERVER_PASSWORD=test123 \
    bun run --cwd packages/opencode --conditions=browser src/index.ts serve --port 3095 > /tmp/mimo-serve.log 2>&1 &
    
    sleep 5
    
    if lsof -i :3095 > /dev/null 2>&1; then
        echo "✅ Helix Server 启动成功"
    else
        echo "❌ Helix Server 启动失败"
        return 1
    fi
}

# 检查并启动 Gateway
check_gateway() {
    if lsof -i :3096 > /dev/null 2>&1; then
        echo "✅ Gateway 已运行 (port 3096)"
        return 0
    fi
    
    echo "🚀 启动 Gateway..."
    cd "$PROJECT_ROOT/packages/feishu-gateway"
    HELIX_URL=http://localhost:3095 \
    MIMOCODE_SERVER_PASSWORD=test123 \
    bun run src/index.ts > /tmp/feishu-gateway.log 2>&1 &
    
    sleep 3
    
    if lsof -i :3096 > /dev/null 2>&1; then
        echo "✅ Gateway 启动成功"
    else
        echo "❌ Gateway 启动失败"
        return 1
    fi
}

# 主流程
echo "=========================================="
echo "  Helix Auto-Dev 服务检查"
echo "=========================================="

check_helix_server
check_gateway

echo ""
echo "✅ 所有服务就绪"
echo "=========================================="
