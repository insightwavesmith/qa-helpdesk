#!/bin/bash
# pdca-single-source.sh — git commit 시 docs/.pdca-status.json(정본) → 나머지 2곳 자동 복사
# PreToolUse hook (Bash matcher): sync용이므로 항상 exit 0 (차단 안 함)
# 정본: docs/.pdca-status.json
# 복사 대상: .pdca-status.json (루트), .bkit/state/pdca-status.json

trap 'exit 0' ERR

INPUT=$(cat)

# INPUT에서 command 파싱
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('command', '') or '')
except:
    print('')
" 2>/dev/null)

# git commit 명령일 때만 실행
if ! echo "$COMMAND" | grep -qE "git commit"; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/bscamp"
SOURCE="$PROJECT_DIR/docs/.pdca-status.json"
TARGET_ROOT="$PROJECT_DIR/.pdca-status.json"
TARGET_BKIT="$PROJECT_DIR/.bkit/state/pdca-status.json"

# 정본 파일 없으면 패스
if [ ! -f "$SOURCE" ]; then
    exit 0
fi

# docs/.pdca-status.json → 루트 복사
cp "$SOURCE" "$TARGET_ROOT" 2>/dev/null

# docs/.pdca-status.json → .bkit/state/ 복사 (디렉토리 존재 시)
if [ -d "$PROJECT_DIR/.bkit/state" ]; then
    cp "$SOURCE" "$TARGET_BKIT" 2>/dev/null
fi

# 루트 파일 touch (validate-pdca.sh 30분 체크 통과용)
touch "$TARGET_ROOT" 2>/dev/null

echo "PDCA sync: docs/.pdca-status.json → 루트 + .bkit/state/ 복사 완료"
exit 0
