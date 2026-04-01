#!/bin/bash
# Block logger: 차단(exit 2) 시 자동 기록
_bl_trap() { local e=$?; [ "$e" = "2" ] && source "$(dirname "$0")/helpers/block-logger.sh" 2>/dev/null && log_block "차단" "destructive-detector" "${COMMAND:-unknown}" 2>/dev/null; exit $e; }
trap _bl_trap EXIT
# destructive-detector.sh — 위험 작업 자동 차단
# PreToolUse hook for Bash tool
# exit 0 = 허용, exit 2 = 차단

# V3: PID 역추적 자동 등록 (실패해도 계속)
source "$(dirname "$0")/helpers/hook-self-register.sh" 2>/dev/null
auto_register_peer 2>/dev/null

INPUT=$(cat)

# Bash tool의 command 필드만 파싱 (다른 tool은 무시)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    tool = data.get('tool_name', '')
    if tool != 'Bash':
        sys.exit(0)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

if [ -z "$COMMAND" ]; then
  exit 0
fi

# 패턴 1: rm -rf (재귀 강제 삭제)
if echo "$COMMAND" | grep -qE '\brm\s+(-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*)\s'; then
  echo "[destructive-detector] 차단: rm -rf 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   이 작업은 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 2: git push --force 또는 git push -f
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--force|-f)\b'; then
  echo "[destructive-detector] 차단: git push --force 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   force push는 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 3: git reset --hard
if echo "$COMMAND" | grep -qE 'git\s+reset\s+--hard\b'; then
  echo "[destructive-detector] 차단: git reset --hard 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   하드 리셋은 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 4: DROP TABLE 또는 DROP DATABASE (대소문자 무시)
if echo "$COMMAND" | grep -qiE 'DROP\s+(TABLE|DATABASE)\b'; then
  echo "[destructive-detector] 차단: DROP TABLE/DATABASE 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   DB 삭제 명령은 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 5: vercel env rm
if echo "$COMMAND" | grep -qE 'vercel\s+env\s+rm\b'; then
  echo "[destructive-detector] 차단: vercel env rm 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   Vercel 환경변수 삭제는 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 6: DELETE FROM without WHERE (전체 삭제)
if echo "$COMMAND" | grep -qiE 'DELETE\s+FROM\b' && ! echo "$COMMAND" | grep -qiE '\bWHERE\b'; then
  echo "[destructive-detector] 차단: WHERE 없는 DELETE FROM 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   WHERE 조건 없는 전체 삭제는 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 7: git branch -D (브랜치 강제 삭제)
if echo "$COMMAND" | grep -qE 'git\s+branch\s+.*\s-D\b'; then
  echo "[destructive-detector] 차단: git branch -D 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   브랜치 강제 삭제는 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

# 패턴 8: TRUNCATE (테이블 비우기, 대소문자 무시)
if echo "$COMMAND" | grep -qiE '\bTRUNCATE\s+(TABLE\s+)?\w+'; then
  echo "[destructive-detector] 차단: TRUNCATE 감지됨" >&2
  echo "   명령어: $COMMAND" >&2
  echo "   테이블 전체 비우기는 자동 차단됩니다. 긴급 핫픽스가 필요하면 Smith님이 직접 실행하세요." >&2
  exit 2
fi

exit 0
