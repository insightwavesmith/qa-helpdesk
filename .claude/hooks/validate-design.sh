#!/bin/bash
# validate-design.sh — src/ 변경 시 설계서 갱신 여부 체크
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

# git commit이 아니면 패스
if ! echo "$COMMAND" | grep -q 'git commit'; then
    exit 0
fi

# docs/chore/style 커밋은 패스
if echo "$COMMAND" | grep -qE '(docs:|chore:|style:)'; then
    exit 0
fi

PROJECT_DIR="/Users/smith/projects/qa-helpdesk"

# staged 파일 목록 (src/ 하위만)
STAGED_SRC=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null | grep '^src/' || true)

if [ -z "$STAGED_SRC" ]; then
    exit 0
fi

# 전체 staged 파일 (설계서 포함 여부 확인용)
STAGED_ALL=$(cd "$PROJECT_DIR" && git diff --cached --name-only 2>/dev/null)

# 기능→설계서 매핑
declare -A FEATURE_MAP
FEATURE_MAP["src/lib/protractor/"]="docs/02-design/features/protractor-refactoring.design.md"
FEATURE_MAP["src/app/(main)/protractor/"]="docs/02-design/features/protractor-refactoring.design.md"
FEATURE_MAP["src/app/api/cron/"]="docs/02-design/features/cron-collection.design.md"
FEATURE_MAP["src/app/(main)/admin/"]="docs/02-design/features/admin-panel.design.md"
FEATURE_MAP["src/actions/embed-pipeline"]="docs/02-design/features/content-pipeline.design.md"
FEATURE_MAP["src/app/api/protractor/"]="docs/02-design/features/protractor-refactoring.design.md"

# 변경된 기능 영역 판별 + 설계서 체크
MISSING_DOCS=""
CHECKED=()

for prefix in "${!FEATURE_MAP[@]}"; do
    DESIGN_DOC="${FEATURE_MAP[$prefix]}"

    # 이미 체크한 설계서는 스킵
    for checked in "${CHECKED[@]}"; do
        if [ "$checked" = "$DESIGN_DOC" ]; then
            continue 2
        fi
    done

    # 이 prefix에 해당하는 staged 파일이 있는지
    if ! echo "$STAGED_SRC" | grep -q "^$prefix"; then
        continue
    fi

    CHECKED+=("$DESIGN_DOC")

    # 설계서 파일이 존재하지 않으면 패스 (신규 기능은 별도)
    if [ ! -f "$PROJECT_DIR/$DESIGN_DOC" ]; then
        continue
    fi

    # 설계서가 staged에 포함되어 있는지 확인
    if echo "$STAGED_ALL" | grep -q "^$DESIGN_DOC"; then
        continue
    fi

    # 설계서가 staged에 없음 → 경고
    MATCHED_FILES=$(echo "$STAGED_SRC" | grep "^$prefix" | head -3)
    MISSING_DOCS="$MISSING_DOCS\n  설계서 갱신 필요: $DESIGN_DOC"
    MISSING_DOCS="$MISSING_DOCS\n    변경된 파일: $(echo "$MATCHED_FILES" | tr '\n' ', ')"
done

if [ -n "$MISSING_DOCS" ]; then
    echo "⚠️ 설계서 갱신 누락 감지"
    echo -e "$MISSING_DOCS"
    echo ""
    echo "src/ 파일이 변경되었지만 관련 설계서가 업데이트되지 않았습니다."
    echo "설계서를 갱신한 후 다시 커밋하세요."
    exit 2
fi

exit 0
