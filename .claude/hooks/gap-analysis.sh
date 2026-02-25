#!/bin/bash
# gap-analysis.sh — git commit 전 TASK.md 대비 gap 분석
# PreToolUse hook: Bash 도구에서 git commit 실행 시 자동 체크

# stdin에서 hook 입력 읽기
INPUT=$(cat)

# tool_input에서 command 추출
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# git commit이 아니면 패스 (exit 0 = 허용)
if ! echo "$COMMAND" | grep -q 'git commit'; then
    exit 0
fi

# docs/chore 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:|ci:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"

# TASK.md 존재 확인
TASK_FILES=$(find "$PROJECT_DIR" -maxdepth 1 -name "TASK*.md" -type f 2>/dev/null)
if [ -z "$TASK_FILES" ]; then
    exit 0
fi

# 현재 TASK.md에서 T 항목 추출
ACTIVE_TASK=""
for f in $TASK_FILES; do
    # 가장 최근 수정된 TASK 파일 사용
    if [ -z "$ACTIVE_TASK" ] || [ "$f" -nt "$ACTIVE_TASK" ]; then
        ACTIVE_TASK="$f"
    fi
done

if [ -z "$ACTIVE_TASK" ]; then
    exit 0
fi

# T항목 수 세기
TOTAL_TASKS=$(grep -cE '^## T[0-9]+\.' "$ACTIVE_TASK" 2>/dev/null || echo "0")

if [ "$TOTAL_TASKS" -eq 0 ]; then
    exit 0
fi

# staged 파일 수 확인
STAGED_COUNT=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | wc -l | tr -d ' ')

if [ "$STAGED_COUNT" -eq 0 ]; then
    exit 0
fi

# gap 분석: 각 T항목의 핵심 파일이 staged에 있는지 체크
TASK_NAME=$(basename "$ACTIVE_TASK")
MISSING=""
FOUND=0

while IFS= read -r line; do
    TASK_ID=$(echo "$line" | grep -oE 'T[0-9]+')
    # T항목에서 언급된 파일 경로 추출
    TASK_SECTION=$(sed -n "/^## ${TASK_ID}\./,/^## T[0-9]/p" "$ACTIVE_TASK" 2>/dev/null | head -30)
    
    # 해당 섹션에서 .ts/.tsx 파일 언급 확인
    MENTIONED_FILES=$(echo "$TASK_SECTION" | grep -oE '[a-zA-Z0-9_/-]+\.(ts|tsx)' | sort -u)
    
    if [ -n "$MENTIONED_FILES" ]; then
        HAS_MATCH=false
        for mf in $MENTIONED_FILES; do
            if cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep -q "$mf"; then
                HAS_MATCH=true
                break
            fi
        done
        if $HAS_MATCH; then
            FOUND=$((FOUND + 1))
        else
            MISSING="$MISSING\n  - $TASK_ID: 관련 파일이 staged에 없음 ($MENTIONED_FILES)"
        fi
    else
        FOUND=$((FOUND + 1))
    fi
done < <(grep -E '^## T[0-9]+\.' "$ACTIVE_TASK" 2>/dev/null)

# 결과 판정
if [ -n "$MISSING" ]; then
    echo "GAP 분석 경고 ($TASK_NAME): $FOUND/$TOTAL_TASKS 태스크 반영됨"
    echo -e "미반영 항목:$MISSING"
    echo ""
    echo "이 태스크들의 관련 파일이 커밋에 포함되지 않았습니다."
    echo "빠뜨린 게 맞다면 구현 후 다시 커밋하세요."
    # exit 2 = 차단 (사용자에게 경고 후 진행 여부 묻기)
    exit 2
fi

# 전부 반영됨
echo "GAP 분석 통과: $FOUND/$TOTAL_TASKS 태스크 모두 반영됨"
exit 0
