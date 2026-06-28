#!/bin/bash
# Wrapper script for launchd: ensures Helix Server + Gateway are running before scheduler
# Used by com.helix.auto-dev.plist
# All paths are absolute to avoid getcwd issues in launchd's restricted context.

set -euo pipefail

PROJECT_ROOT="/Users/onetwo/Documents/trae_projects/Helix"
AUTO_DEV_DIR="$PROJECT_ROOT/script/auto-dev"
BUN="/Users/onetwo/.npm-global/bin/bun"

# 1. Start services (idempotent — skips if already running)
bash "$AUTO_DEV_DIR/start-services.sh"

# 2. Run scheduler
exec "$BUN" run "$AUTO_DEV_DIR/scheduler.ts" "$@"
