#!/bin/bash

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LOG_FILE="$PROJECT_DIR/.dogfooding/daily_evolution.log"
PLIST_PATH="$HOME/Library/LaunchAgents/com.helix.flywheel.plist"

echo "=================================================="
echo "🚀 启动 Helix 本地自动化定时任务 (使用 launchd)"
echo "=================================================="
echo "项目路径: $PROJECT_DIR"
echo "日志文件: $LOG_FILE"
echo "plist 路径: $PLIST_PATH"

# 1. 确保日志目录存在
mkdir -p "$PROJECT_DIR/.dogfooding"

# 2. 生成 launchd plist 文件
cat << EOF > "$PLIST_PATH"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.helix.flywheel</string>
    <key>ProgramArguments</key>
    <array>
        <string>$HOME/.bun/bin/bun</string>
        <string>run</string>
        <string>$PROJECT_DIR/script/dogfooding/beta_evolution_loop.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.bun/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
    </dict>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>11</integer>
        <key>Minute</key>
        <integer>50</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>$LOG_FILE</string>
    <key>StandardErrorPath</key>
    <string>$LOG_FILE</string>
    <key>RunAtLoad</key>
    <false/>
    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
EOF

# 3. 卸载旧版本（如果存在）
launchctl unload "$PLIST_PATH" 2>/dev/null

# 4. 加载新任务
launchctl load "$PLIST_PATH"

echo "=================================================="
echo "🎉 配置成功！"
echo ""
echo "您可以通过以下命令管理定时任务："
echo "  查看状态: launchctl list | grep com.helix"
echo "  卸载任务: launchctl unload $PLIST_PATH"
echo "  手动触发: launchctl start com.helix.flywheel"
echo ""
echo "到了 11:50 后，您可以通过以下命令实时查看飞轮运转日志："
echo "  tail -f $LOG_FILE"
echo ""
echo "说明: launchd 是 macOS 原生的任务调度器，不需要 Full Disk Access，"
echo "      比 crontab 更稳定可靠。"
echo "=================================================="