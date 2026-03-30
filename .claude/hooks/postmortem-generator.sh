#!/bin/bash
# postmortem-generator.sh — postmortem 문서 자동 생성
# 사용: bash postmortem-generator.sh "이슈 설명" [category] [severity]
# 예시: bash postmortem-generator.sh "team-context 병렬 충돌" chain critical

PROJECT_DIR="/Users/smith/projects/bscamp"
PM_DIR="$PROJECT_DIR/docs/postmortem"
INDEX_FILE="$PM_DIR/index.json"

DESCRIPTION="${1:?사용법: postmortem-generator.sh \"이슈 설명\" [category] [severity]}"
CATEGORY="${2:-process}"
SEVERITY="${3:-warning}"

# 슬러그 생성
SLUG=$(echo "$DESCRIPTION" | sed 's/[^a-zA-Z0-9가-힣 ]//g' | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | cut -c1-50)
DATE=$(date +%Y-%m-%d)
TIME=$(date +%H:%M:%S)
FILENAME="${DATE}-${SLUG}.md"
FILEPATH="$PM_DIR/$FILENAME"

# 디렉토리 생성
mkdir -p "$PM_DIR" 2>/dev/null

# 다음 PM ID 계산
if [ -f "$INDEX_FILE" ]; then
    LAST_ID=$(jq -r '.postmortems[-1].id // "PM-000"' "$INDEX_FILE" 2>/dev/null)
    NEXT_NUM=$(( ${LAST_ID##PM-} + 1 ))
else
    NEXT_NUM=1
fi
PM_ID=$(printf "PM-%03d" "$NEXT_NUM")

# 자동 수집: 최근 git diff
RECENT_FILES=$(git -C "$PROJECT_DIR" diff --name-only HEAD~3..HEAD 2>/dev/null | head -10 | tr '\n' ', ' | sed 's/,$//')

# 자동 수집: 최근 에러 (hook 로그)
RECENT_ERRORS=""
if [ -f "$PROJECT_DIR/.claude/runtime/hook-errors.log" ]; then
    RECENT_ERRORS=$(tail -5 "$PROJECT_DIR/.claude/runtime/hook-errors.log" 2>/dev/null)
fi

# 템플릿 생성
cat > "$FILEPATH" <<PMEOF
---
id: ${PM_ID}
date: ${DATE}
severity: ${SEVERITY}
category: ${CATEGORY}
status: open
prevention_tdd: []
---

# ${DESCRIPTION}

## 1. 사고 요약
> ${DATE} ${TIME} — ${DESCRIPTION}

감지 방법: {수동 기입}
영향 시간: {수동 기입}

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| ${TIME} | 문제 감지 |
| | {수동: 분석 시작} |
| | {수동: 수정 완료} |

## 3. 영향 범위
- **영향 파일**: ${RECENT_FILES:-{수동 기입}}
- **영향 기능**: {수동 필수}
- **사용자 영향**: {수동 필수: 없음 / 기능 저하 / 서비스 장애}
- **데이터 영향**: {수동 필수: 없음 / 조회 불가 / 데이터 유실}

## 4. 근본 원인 (5 Whys)
1. Why: {수동 필수}
2. Why: {수동 필수}
3. Why:
4. Why:
5. Why:

**근본 원인 한 줄**: {수동 필수}

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| | {수동} | |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | {수동 필수} | hook/rule/process | {파일:테스트명} | pending |

## 7. 교훈
- {수동 필수}

## 8. 검증
- [ ] 재발 방지책 TDD 작성 완료
- [ ] TDD 전체 Green 확인
- [ ] CLAUDE.md 또는 hook에 규칙 반영
- [ ] status → resolved 변경
PMEOF

# index.json 업데이트
if [ ! -f "$INDEX_FILE" ]; then
    echo '{"postmortems":[],"categories":["migration","chain","deployment","config","permission","data-loss","performance","security","infra","process"],"stats":{"total":0,"resolved":0,"open":0,"lastUpdated":""}}' > "$INDEX_FILE"
fi

# jq로 항목 추가
jq --arg id "$PM_ID" \
   --arg date "$DATE" \
   --arg slug "$SLUG" \
   --arg title "$DESCRIPTION" \
   --arg sev "$SEVERITY" \
   --arg cat "$CATEGORY" \
   '.postmortems += [{
     "id": $id,
     "date": $date,
     "slug": $slug,
     "title": $title,
     "severity": $sev,
     "category": $cat,
     "status": "open",
     "preventionTdd": [],
     "relatedFiles": [],
     "tags": []
   }] |
   .stats.total = (.postmortems | length) |
   .stats.open = ([.postmortems[] | select(.status == "open")] | length) |
   .stats.resolved = ([.postmortems[] | select(.status == "resolved")] | length) |
   .stats.lastUpdated = $date' "$INDEX_FILE" > "${INDEX_FILE}.tmp" && \
   mv "${INDEX_FILE}.tmp" "$INDEX_FILE"

echo "✅ Postmortem 생성: $FILEPATH"
echo "   ID: $PM_ID | 심각도: $SEVERITY | 분류: $CATEGORY"
echo "   다음 단계: 파일을 열어 {수동 필수} 항목을 채우세요."
