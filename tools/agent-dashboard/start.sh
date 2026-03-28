#!/bin/bash
# start.sh — 대시보드 서버 시작 (+ 선택적 Cloudflare Tunnel)
#
# 사용법:
#   bun run tools/agent-dashboard/server.ts          # 로컬만
#   TUNNEL=1 bash tools/agent-dashboard/start.sh     # 터널 포함
#   TUNNEL_AUTH=smith:비밀번호 TUNNEL=1 bash tools/agent-dashboard/start.sh  # 인증 포함

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 대시보드 서버 시작..."
bun run "$SCRIPT_DIR/server.ts" &
DASHBOARD_PID=$!

# 서버 준비 대기
sleep 1

if [ "${TUNNEL:-}" = "1" ]; then
  if command -v cloudflared &>/dev/null; then
    echo "🌐 Cloudflare Tunnel 시작..."
    cloudflared tunnel --url http://localhost:3847
  else
    echo "⚠ cloudflared 미설치. 로컬 전용 모드."
  fi
fi

wait $DASHBOARD_PID
