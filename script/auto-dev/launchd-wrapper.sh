#!/bin/bash
# Wrapper script for launchd: ensures Helix Server + Gateway are running before scheduler
# Used by com.helix.auto-dev.plist

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Start services (idempotent — skips if already running)
bash "$SCRIPT_DIR/start-services.sh"

# 2. Run scheduler
exec /Users/onetwo/.npm-global/bin/bun run "$SCRIPT_DIR/scheduler.ts" "$@"
