#!/usr/bin/env bash
# validate-design.sh — Design 없이 src/ 수정 차단 + 커밋 시 설계서 갱신 확인
# PreToolUse hook (Edit|Write + Bash):
#   1) Edit/Write: src/ 파일 수정 시 Design 문서 존재 + 최소 줄 수 확인 → 없으면 exit 2
#   2) Bash: git commit 시 관련 설계서 갱신 여부 확인 → 미갱신이면 exit 2
# exit 2 = 차단 (게이트), 에러 시 기본값 = exit 2 (안전 실패)

# 안전 실패: 스크립트 에러 시 차단
trap 'echo "❌ [validate-design] hook 에러 발생 → 안전 차단" >&2; exit 2' ERR

# 팀원은 PDCA 게이팅 패스 (리더 전용 검증)
source "$(dirname "$0")/is-teammate.sh" 2>/dev/null
[ "$IS_TEAMMATE" = "true" ] && exit 0

INPUT=$(cat)

PROJECT_DIR="/Users/smith/projects/bscamp"
MIN_DESIGN_LINES=50

# tool_name 감지
TOOL_NAME=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_name', ''))
except:
    print('')
" 2>/dev/null)

# ─── Edit/Write 도구: src/ 수정 시 Design 문서 존재 + 줄 수 확인 ───
if [ "$TOOL_NAME" = "Edit" ] || [ "$TOOL_NAME" = "Write" ] || [ "$TOOL_NAME" = "MultiEdit" ]; then
    FILE=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', {})
    print(ti.get('file_path', '') or ti.get('path', '') or '')
except:
    print('')
" 2>/dev/null)

    # 절대 경로에서 프로젝트 경로 제거
    REL_FILE=$(echo "$FILE" | sed "s|${PROJECT_DIR}/||")

    # src/ 파일이 아니면 패스
    if ! echo "$REL_FILE" | grep -q "^src/"; then
        exit 0
    fi

    # 1. Design 문서 존재 확인
    DESIGN_FILES=$(find "$PROJECT_DIR/docs/02-design/features" -name "*.design.md" -type f 2>/dev/null)
    DESIGN_COUNT=$(echo "$DESIGN_FILES" | grep -c "." 2>/dev/null || echo 0)

    if [ "${DESIGN_COUNT:-0}" -eq 0 ]; then
        echo "❌ [PDCA 강제] Design 문서가 없습니다." >&2
        echo "docs/02-design/features/에 Design 문서를 먼저 작성하세요." >&2
        echo "Plan → Design → Do → Check → Act 순서를 지키세요." >&2
        source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
            notify_hook "🚫 [PDCA 게이트] Design 없이 src/ 수정 시도: $REL_FILE" "validate-design"
        exit 2
    fi

    # 2. 가장 최근 Design 문서의 최소 줄 수 확인 (빈 껍데기 방지)
    LATEST_DESIGN=$(echo "$DESIGN_FILES" | while read -r f; do
        [ -f "$f" ] && echo "$(stat -f %m "$f" 2>/dev/null || echo 0) $f"
    done | sort -rn | head -1 | cut -d' ' -f2-)

    if [ -n "$LATEST_DESIGN" ] && [ -f "$LATEST_DESIGN" ]; then
        LINE_COUNT=$(wc -l < "$LATEST_DESIGN" | tr -d ' ')
        if [ "${LINE_COUNT:-0}" -lt "$MIN_DESIGN_LINES" ]; then
            echo "❌ [PDCA 강제] Design 문서가 너무 짧습니다. (${LINE_COUNT}줄, 최소 ${MIN_DESIGN_LINES}줄)" >&2
            echo "파일: $(basename "$LATEST_DESIGN")" >&2
            echo "빈 껍데기 Design은 허용되지 않습니다. 내용을 채워주세요." >&2
            exit 2
        fi
    fi

    # 3. .pdca-status.json에서 design.done 확인 (있으면)
    PDCA_ROOT="$PROJECT_DIR/.pdca-status.json"
    if [ -f "$PDCA_ROOT" ]; then
        DESIGN_DONE=$(python3 -c "
import json, sys
try:
    with open('$PDCA_ROOT') as f:
        data = json.load(f)
    for key, val in data.items():
        if isinstance(val, dict) and 'design' in val:
            d = val['design']
            if isinstance(d, dict) and d.get('done') == True:
                print('true')
                sys.exit(0)
            elif isinstance(d, str):
                print('true')
                sys.exit(0)
    print('false')
except:
    print('unknown')
" 2>/dev/null)

        if [ "$DESIGN_DONE" = "false" ]; then
            echo "❌ [PDCA 강제] .pdca-status.json에서 design.done이 true인 feature가 없습니다." >&2
            echo "Design 작성 후 .pdca-status.json에 design.done: true를 등록하세요." >&2
            exit 2
        fi
    fi

    echo "✅ [PDCA] Design ${DESIGN_COUNT}건 확인 (최소 ${MIN_DESIGN_LINES}줄 검증 통과) → Do 진입 허용"
    exit 0
fi

# ─── Bash 도구: git commit 시 설계서 갱신 여부 확인 ───
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

# git commit이 아니면 패스
if ! echo "$COMMAND" | grep -q 'git commit'; then
    exit 0
fi

# docs/chore/style 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:)'; then
    exit 0
fi

# staged 파일 목록 (src/ 하위만)
STAGED_SRC=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep '^src/' || true)

if [ -z "$STAGED_SRC" ]; then
    exit 0
fi

# 전체 staged 파일 (설계서 포함 여부 확인용)
STAGED_ALL=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

# 기능→설계서 매핑 (bash 3.x 호환: 배열 기반)
PREFIXES="src/lib/protractor/ src/app/(main)/protractor/ src/app/api/cron/ src/app/(main)/admin/ src/actions/embed-pipeline src/app/api/protractor/"
DOCS="docs/02-design/features/protractor-refactoring.design.md docs/02-design/features/protractor-refactoring.design.md docs/02-design/features/cron-collection.design.md docs/02-design/features/admin-panel.design.md docs/02-design/features/content-pipeline.design.md docs/02-design/features/protractor-refactoring.design.md"

# 변경된 기능 영역 판별 + 설계서 체크
MISSING_DOCS=""
CHECKED_DOCS=""

set -- $PREFIXES
DOC_LIST=($DOCS)
i=0
for prefix in "$@"; do
    DESIGN_DOC="${DOC_LIST[$i]}"
    i=$((i + 1))

    # 이미 체크한 설계서는 스킵
    if echo "$CHECKED_DOCS" | grep -q "$DESIGN_DOC"; then
        continue
    fi

    # 이 prefix에 해당하는 staged 파일이 있는지
    if ! echo "$STAGED_SRC" | grep -q "^$prefix"; then
        continue
    fi

    CHECKED_DOCS="$CHECKED_DOCS $DESIGN_DOC"

    # 설계서 파일이 존재하지 않으면 패스 (신규 기능은 별도)
    if [ ! -f "$PROJECT_DIR/$DESIGN_DOC" ]; then
        continue
    fi

    # 설계서가 staged에 포함되어 있는지 확인
    if echo "$STAGED_ALL" | grep -q "^$DESIGN_DOC"; then
        continue
    fi

    # 설계서가 staged에 없음 → 차단
    MATCHED_FILES=$(echo "$STAGED_SRC" | grep "^$prefix" | head -3)
    MISSING_DOCS="$MISSING_DOCS\n  설계서 갱신 필요: $DESIGN_DOC"
    MISSING_DOCS="$MISSING_DOCS\n    변경된 파일: $(echo "$MATCHED_FILES" | tr '\n' ', ')"
done

if [ -n "$MISSING_DOCS" ]; then
    echo "⚠️ 설계서 갱신 누락 감지" >&2
    echo -e "$MISSING_DOCS" >&2
    echo "" >&2
    echo "src/ 파일이 변경되었지만 관련 설계서가 업데이트되지 않았습니다." >&2
    echo "설계서를 갱신한 후 다시 커밋하세요." >&2
    source "$PROJECT_DIR/.claude/hooks/notify-hook.sh" 2>/dev/null && \
        notify_hook "⚠️ [게이트 차단] 설계서 미갱신으로 commit 차단됨" "validate-design"
    exit 2
fi

exit 0
