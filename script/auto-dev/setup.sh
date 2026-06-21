#!/bin/bash
# Helix Auto-Dev Scheduler Setup
# 安装/卸载 macOS launchd 定时任务

set -e

LABEL="com.helix.auto-dev"
PLIST_SRC="$(dirname "$0")/com.helix.auto-dev.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/.local/share/mimocode/log"

usage() {
    echo "Usage: $0 [install|uninstall|status|run]"
    echo ""
    echo "Commands:"
    echo "  install   - 安装定时任务 (每天凌晨2点执行)"
    echo "  uninstall - 卸载定时任务"
    echo "  status    - 查看任务状态"
    echo "  run       - 立即执行一次"
}

install() {
    echo "Installing auto-dev scheduler..."
    
    # 创建日志目录
    mkdir -p "$LOG_DIR"
    
    # 复制 plist 文件
    cp "$PLIST_SRC" "$PLIST_DST"
    
    # 加载任务
    launchctl load "$PLIST_DST"
    
    echo "✅ Installed successfully"
    echo "   Schedule: Daily at 2:00 PM"
    echo "   Logs: $LOG_DIR/auto-dev-launchd.log"
}

uninstall() {
    echo "Uninstalling auto-dev scheduler..."
    
    # 卸载任务
    launchctl unload "$PLIST_DST" 2>/dev/null || true
    
    # 删除 plist 文件
    rm -f "$PLIST_DST"
    
    echo "✅ Uninstalled successfully"
}

status() {
    echo "=== Auto-Dev Scheduler Status ==="
    echo ""
    
    if [ -f "$PLIST_DST" ]; then
        echo "Status: Installed"
        echo "Schedule: Daily at 2:00 PM"
        echo ""
        echo "Recent logs:"
        tail -5 "$LOG_DIR/auto-dev-launchd.log" 2>/dev/null || echo "  No logs yet"
    else
        echo "Status: Not installed"
    fi
    
    echo ""
    echo "=== Roadmap Tasks ==="
    if [ -f ".mimocode/roadmap.json" ]; then
        cat ".mimocode/roadmap.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for m in data.get('milestones', []):
    pending = sum(1 for t in m.get('tasks', []) if t.get('status') == 'pending')
    done = sum(1 for t in m.get('tasks', []) if t.get('status') == 'done')
    total = len(m.get('tasks', []))
    print(f\"  {m['id']}: {m['name']} [{done}/{total} done, {pending} pending]\")
"
    fi
}

run() {
    echo "Running auto-dev scheduler once..."
    cd "$(dirname "$0")/../.."
    bun run script/auto-dev/scheduler.ts --once
}

case "${1:-}" in
    install)
        install
        ;;
    uninstall)
        uninstall
        ;;
    status)
        status
        ;;
    run)
        run
        ;;
    *)
        usage
        exit 1
        ;;
esac
