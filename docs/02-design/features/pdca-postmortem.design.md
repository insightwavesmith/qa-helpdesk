# PDCA Postmortem Process (회고 자동화) 설계서

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | PDCA Postmortem Process (회고 자동화) |
| 작성일 | 2026-03-30 |
| 프로세스 레벨 | L2 (hooks/scripts 수정, src/ 미수정) |
| 배경 | 문제 터지면 MEMORY.md 수동 교훈만 → 구조화 없음 → 같은 실수 반복 |

| 관점 | 내용 |
|------|------|
| **Problem** | 회고가 수동+비구조적. RET-001~004가 있지만 (1) 자동 생성 안 됨 (2) 필수 항목 강제 없음 (3) 재발 방지책→TDD 연결 없음 (4) 다음 TASK 시작 전 리뷰 강제 없음 → 같은 실수 반복 |
| **Solution** | hook 기반 자동 postmortem 생성 + 필수 항목 검증 + TDD 추적 + TASK 시작 전 리뷰 게이트 |
| **Function UX Effect** | 사고 발생 → 구조화된 postmortem 자동 생성 → 재발 방지책 TDD 반영 추적 → 다음 TASK에서 교훈 강제 리뷰 |
| **Core Value** | "같은 실수 두 번 안 한다"를 시스템으로 보장 |

---

## 현재 상태 분석

### AS-IS: 수동 회고

```
문제 발생
  → 리더가 기억나면 docs/retrospective/{date}-{issue}.md 수동 작성
  → README.md에 RET-xxx 수동 추가
  → MEMORY.md에 feedback 수동 저장
  → 다음 세션에서 CLAUDE.md "세션 시작 필수 읽기"에 의존
  → ⚠️ 안 읽으면 그만 → 같은 실수 반복
```

### 현재 문제점

| # | 문제 | 예시 |
|---|------|------|
| 1 | 자동 생성 없음 | 사고 후 리더가 직접 postmortem 파일 만들어야 함 |
| 2 | 필수 항목 강제 없음 | RET-001은 상세하지만 RET-002~003은 원인/재발방지 부실 |
| 3 | 재발방지 → TDD 연결 없음 | "마이그레이션 3단계 분할" 규칙만 있고 이를 검증하는 TDD 없음 |
| 4 | 다음 TASK 리뷰 강제 없음 | CLAUDE.md에 "회고 읽어라"만 있고 hook 강제 아님 |
| 5 | 분류 체계 없음 | RET-001~004 번호만, 카테고리/심각도/상태 없음 |

---

## TO-BE: 자동화된 회고 루프

```
문제 발생 (hook exit 2, build 실패, 런타임 에러, Smith님 보고)
  │
  ├─ 자동 감지: error-classifier.sh severity=critical
  │   또는 수동 트리거: /postmortem {이슈명}
  │
  ▼
postmortem-generator.sh
  → docs/postmortem/{YYYY-MM-DD}-{issue-slug}.md 자동 생성
  → 필수 항목 템플릿 채움 (컨텍스트 자동 수집)
  → postmortem-index.json 업데이트
  │
  ▼
리더/팀원이 수동으로 빈 항목 채움
  (원인 분석, 재발 방지책, TDD 케이스 명시)
  │
  ▼
postmortem-validator.sh (PreToolUse hook)
  → 다음 TASK 시작 전 최근 postmortem 리뷰 강제
  → 미완성 postmortem 있으면 경고
  → 재발 방지 TDD가 실제로 존재하는지 확인
  │
  ▼
재발 방지 완료 → postmortem status: resolved
```

---

## 1. Postmortem 문서 자동 생성

### 1-1. 트리거 조건

| 트리거 | 감지 방법 | 자동/수동 |
|--------|----------|----------|
| hook exit 2 반복 (3회+) | error-classifier → HOOK_GATE 3회 이상 | 자동 제안 |
| build 실패 후 수정 | task-quality-gate.sh exit 2 → 이후 재성공 | 자동 제안 |
| Match Rate 급락 (20%+ 하락) | match-rate-parser → 이전 대비 비교 | 자동 제안 |
| Smith님 직접 보고 | Slack/대화에서 "문제", "사고", "버그" 언급 | 수동 |
| 리더 판단 | 리더가 `/postmortem {이슈명}` 실행 | 수동 |
| error-classifier critical | severity=critical 감지 | 자동 제안 |

**"자동 제안"**: postmortem 파일을 자동 생성하되, exit 2로 차단하지 않음. 리더에게 "postmortem 작성 권장" 메시지만 출력.

### 1-2. 파일 구조

```
docs/postmortem/
├── index.json                          ← 전체 인덱스 (자동 갱신)
├── 2026-03-26-query-builder.md         ← 기존 RET-001 이관
├── 2026-03-30-team-context-collision.md ← 오늘 사례
├── 2026-03-30-approval-no-notify.md    ← 오늘 사례
├── 2026-03-30-deploy-blocked.md        ← 오늘 사례
├── 2026-03-30-dashboard-sync-loop.md   ← 오늘 사례
└── 2026-03-30-vercel-gcs-confusion.md  ← 오늘 사례
```

기존 `docs/retrospective/` → `docs/postmortem/`으로 이관. `docs/retrospective/README.md`는 `docs/postmortem/index.json`으로 대체.

### 1-3. index.json 스키마

```json
{
  "postmortems": [
    {
      "id": "PM-001",
      "date": "2026-03-26",
      "slug": "query-builder",
      "title": "쿼리빌더 Big Bang 마이그레이션 장애",
      "severity": "critical",
      "category": "migration",
      "status": "resolved",
      "preventionTdd": ["__tests__/hooks/chain-e2e-realworld.test.ts"],
      "relatedFiles": ["src/lib/query-builder.ts"],
      "tags": ["big-bang", "runtime-qa", "126-files"]
    }
  ],
  "categories": [
    "migration", "chain", "deployment", "config", "permission",
    "data-loss", "performance", "security", "infra", "process"
  ],
  "stats": {
    "total": 6,
    "resolved": 1,
    "open": 5,
    "lastUpdated": "2026-03-30"
  }
}
```

---

## 2. Postmortem 템플릿 + 필수 항목

### 2-1. 템플릿

```markdown
---
id: PM-{NNN}
date: {YYYY-MM-DD}
severity: {critical|warning|info}
category: {category}
status: open
prevention_tdd: []
---

# {제목}

## 1. 사고 요약
> 한 줄: 무엇이, 언제, 어디서 발생했는가.

{자동 채움: 날짜, 감지 트리거, 에러 메시지}

## 2. 타임라인
| 시각 | 이벤트 |
|------|--------|
| {자동: 감지 시각} | {자동: 트리거 이벤트} |
| | {수동: 분석 시작} |
| | {수동: 수정 완료} |

## 3. 영향 범위
- **영향 파일**: {자동: git diff --name-only 또는 에러 관련 파일}
- **영향 기능**: {수동 필수}
- **사용자 영향**: {수동 필수: 없음 / 기능 저하 / 서비스 장애}
- **데이터 영향**: {수동 필수: 없음 / 조회 불가 / 데이터 유실}

## 4. 근본 원인 (5 Whys)
1. Why: {수동 필수}
2. Why: {수동 필수}
3. Why: {수동 — 선택}
4. Why: {수동 — 선택}
5. Why: {수동 — 선택}

**근본 원인 한 줄**: {수동 필수}

## 5. 수정 내용
| 파일 | 변경 | 커밋 |
|------|------|------|
| {자동: git diff files} | {수동} | {수동: 커밋 해시} |

## 6. 재발 방지책
| # | 방지책 | 유형 | TDD 케이스 | 상태 |
|---|--------|------|-----------|------|
| 1 | {수동 필수} | hook/rule/process | {파일:테스트명} | pending |

## 7. 교훈
- {수동 필수: 한 줄 교훈}

## 8. 검증
- [ ] 재발 방지책 TDD 작성 완료
- [ ] TDD 전체 Green 확인
- [ ] CLAUDE.md 또는 hook에 규칙 반영
- [ ] status → resolved 변경
```

### 2-2. 필수 항목 정의

| 섹션 | 필수 여부 | 자동 채움 | 검증 방법 |
|------|----------|----------|----------|
| 사고 요약 | **필수** | 부분 (트리거 정보) | 비어있으면 미완성 |
| 타임라인 | **필수** | 감지 시각만 | 최소 2행 |
| 영향 범위 | **필수** | git diff 파일 | "사용자 영향" 비어있으면 미완성 |
| 근본 원인 | **필수** | 없음 | Why 최소 2개 + 한 줄 요약 |
| 수정 내용 | **필수** | git diff 파일 | 최소 1행 |
| 재발 방지책 | **필수** | 없음 | 최소 1건 + TDD 케이스 명시 |
| 교훈 | **필수** | 없음 | 비어있으면 미완성 |
| 검증 체크리스트 | **필수** | 템플릿 | 전부 체크 시 resolved |

---

## 3. 재발 방지 → TDD 연결 구조

### 3-1. 설계 원리

재발 방지책이 "규칙" 으로만 존재하면 잊혀진다. **TDD로 코드화**해야 시스템이 강제한다.

```
재발 방지책 (문서)
  → TDD 케이스 (코드)
    → CI/hook에서 자동 실행
      → 위반 시 exit 2 차단
```

### 3-2. prevention-tdd-tracker.sh (신규 헬퍼)

postmortem의 `prevention_tdd` 필드와 실제 TDD 파일을 대조하는 스크립트:

```bash
#!/bin/bash
# prevention-tdd-tracker.sh — 재발 방지 TDD 존재 확인
# 사용: bash prevention-tdd-tracker.sh
# 반환: TRACKER_MISSING (누락 건수), TRACKER_DETAILS (상세)

PROJECT_DIR="/Users/smith/projects/bscamp"
INDEX_FILE="$PROJECT_DIR/docs/postmortem/index.json"

[ ! -f "$INDEX_FILE" ] && { TRACKER_MISSING=0; return 0 2>/dev/null || exit 0; }

TRACKER_MISSING=0
TRACKER_DETAILS=""

# index.json에서 open 상태 + prevention_tdd 있는 항목 순회
while IFS= read -r ENTRY; do
    PM_ID=$(echo "$ENTRY" | jq -r '.id')
    PM_SLUG=$(echo "$ENTRY" | jq -r '.slug')
    PM_STATUS=$(echo "$ENTRY" | jq -r '.status')

    # resolved는 스킵
    [ "$PM_STATUS" = "resolved" ] && continue

    # prevention_tdd 배열 순회
    TDD_FILES=$(echo "$ENTRY" | jq -r '.preventionTdd[]? // empty' 2>/dev/null)
    [ -z "$TDD_FILES" ] && {
        TRACKER_MISSING=$((TRACKER_MISSING + 1))
        TRACKER_DETAILS="${TRACKER_DETAILS}\n  ${PM_ID} (${PM_SLUG}): prevention_tdd 미지정"
        continue
    }

    for TDD_FILE in $TDD_FILES; do
        if [ ! -f "$PROJECT_DIR/$TDD_FILE" ]; then
            TRACKER_MISSING=$((TRACKER_MISSING + 1))
            TRACKER_DETAILS="${TRACKER_DETAILS}\n  ${PM_ID}: TDD 파일 미존재 — $TDD_FILE"
        fi
    done
done < <(jq -c '.postmortems[]' "$INDEX_FILE" 2>/dev/null)

export TRACKER_MISSING TRACKER_DETAILS
```

### 3-3. TDD 매핑 예시 (오늘 사례)

| Postmortem | 재발 방지책 | TDD 케이스 |
|-----------|-----------|-----------|
| PM-002 team-context-collision | resolver로 팀별 분리 | `chain-context.test.ts:CC-5` (병렬 팀 독립) |
| PM-003 approval-no-notify | send-keys 리더 알림 | `approval-gate.test.ts:P1-1` (send-keys 호출) |
| PM-004 deploy-blocked | 배포 화이트리스트 | `deploy-authority.test.ts:P3-1` (리더 허용) |
| PM-005 dashboard-sync-loop | GCS 직접 + md5 비교 | `dashboard-sync.test.ts:P4-1` (변경 시만) |
| PM-006 vercel-gcs-confusion | CLAUDE.md + memory 규칙 | `chain-e2e.test.ts` (환경 검증) |

---

## 4. TASK 시작 전 Postmortem 리뷰 강제

### 4-1. postmortem-review-gate.sh (신규 hook)

**위치**: PreToolUse(Bash) hook — `npm run`, `npx`, `next` 명령 시 1회 체크.

```bash
#!/bin/bash
# postmortem-review-gate.sh — TASK 시작 전 최근 postmortem 리뷰 강제
# PreToolUse(Bash) hook: 세션 1회만 실행
# exit 0 = 가이드만 (차단 아님), 정보 제공

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(data.get('tool_input', {}).get('command', ''))
except:
    print('')
" 2>/dev/null)

PROJECT_DIR="/Users/smith/projects/bscamp"
MARKER="/tmp/.claude-postmortem-reviewed-$(date +%Y%m%d)"

# 이미 리뷰했으면 패스
[ -f "$MARKER" ] && exit 0

# 개발 명령만 체크
echo "$COMMAND" | grep -qE '(npm run|npx |next |node )' || exit 0

INDEX_FILE="$PROJECT_DIR/docs/postmortem/index.json"
[ ! -f "$INDEX_FILE" ] && { touch "$MARKER"; exit 0; }

# open 상태 postmortem 확인
OPEN_COUNT=$(jq -r '[.postmortems[] | select(.status == "open")] | length' "$INDEX_FILE" 2>/dev/null || echo 0)
RECENT=$(jq -r '[.postmortems[] | select(.status == "open")] | sort_by(.date) | reverse | .[0] // empty' "$INDEX_FILE" 2>/dev/null)

if [ "$OPEN_COUNT" -gt 0 ] && [ -n "$RECENT" ]; then
    RECENT_ID=$(echo "$RECENT" | jq -r '.id')
    RECENT_TITLE=$(echo "$RECENT" | jq -r '.title')
    RECENT_DATE=$(echo "$RECENT" | jq -r '.date')
    RECENT_SLUG=$(echo "$RECENT" | jq -r '.slug')
    RECENT_CATEGORY=$(echo "$RECENT" | jq -r '.category')

    echo "=== 📋 Postmortem 리뷰 필요 (${OPEN_COUNT}건 미해결) ===" >&2
    echo "" >&2
    echo "최근: ${RECENT_ID} — ${RECENT_TITLE} (${RECENT_DATE})" >&2
    echo "분류: ${RECENT_CATEGORY}" >&2
    echo "파일: docs/postmortem/${RECENT_DATE}-${RECENT_SLUG}.md" >&2
    echo "" >&2

    # prevention TDD 추적
    source "$PROJECT_DIR/.claude/hooks/helpers/prevention-tdd-tracker.sh" 2>/dev/null
    if [ "${TRACKER_MISSING:-0}" -gt 0 ]; then
        echo "⚠️ 재발 방지 TDD 누락 ${TRACKER_MISSING}건:" >&2
        echo -e "$TRACKER_DETAILS" >&2
        echo "" >&2
    fi

    echo "현재 TASK와 관련된 postmortem이 있으면 반드시 읽고 시작하세요." >&2
    echo "관련 교훈이 이번 작업에 적용되는지 확인 후 진행하세요." >&2
    echo "" >&2
fi

# 관련성 판단 보조: 현재 TASK 파일에서 키워드 추출 → postmortem 매칭
ACTIVE_TASK=$(ls -t "$PROJECT_DIR/.claude/tasks"/TASK-*.md 2>/dev/null | head -1)
if [ -n "$ACTIVE_TASK" ] && [ -f "$INDEX_FILE" ]; then
    # TASK 내용에서 키워드 추출 (파일명, 기능명)
    TASK_KEYWORDS=$(grep -oE '(migration|auth|chain|deploy|hook|context|sync|dashboard|approval)' "$ACTIVE_TASK" 2>/dev/null | sort -u | tr '\n' '|' | sed 's/|$//')
    if [ -n "$TASK_KEYWORDS" ]; then
        RELATED=$(jq -r --arg kw "$TASK_KEYWORDS" '[.postmortems[] | select(.tags[]? | test($kw; "i"))] | .[].id' "$INDEX_FILE" 2>/dev/null)
        if [ -n "$RELATED" ]; then
            echo "🔗 현재 TASK와 관련된 postmortem:" >&2
            echo "$RELATED" | while read -r PM_ID; do
                echo "  - $PM_ID" >&2
            done
            echo "" >&2
        fi
    fi
fi

# 마커 생성 (세션 1회)
touch "$MARKER"
exit 0
```

### 4-2. 매칭 로직: TASK ↔ Postmortem 연관성

| TASK 키워드 | 매칭 Postmortem | 표시 |
|------------|----------------|------|
| `migration`, `마이그레이션` | PM-001 (query-builder) | 🔗 관련 postmortem |
| `chain`, `체인`, `handoff` | PM-002 (team-context) | 🔗 관련 postmortem |
| `deploy`, `배포` | PM-004 (deploy-blocked) | 🔗 관련 postmortem |
| `sync`, `dashboard` | PM-005 (dashboard-sync) | 🔗 관련 postmortem |

### 4-3. 강제 수준

| 수준 | 동작 | 근거 |
|------|------|------|
| **L1 가이드** (채택) | 경고 메시지 출력 + exit 0 | 차단하면 모든 Bash 명령이 막혀서 생산성 저하 |
| L2 차단 | exit 2 | 과도함 — 모든 작업이 멈춤 |

**결정: L1 가이드**. 이유:
- pre-read-context.sh와 동일 패턴 (가이드만, 차단 안 함)
- 세션 당 1회만 실행 (마커 파일)
- 관련 postmortem이 있을 때만 상세 표시

---

## 5. postmortem-generator.sh (자동 생성기)

### 5-1. 스크립트 설계

```bash
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
```

### 5-2. postmortem-validator.sh (완성도 검증)

```bash
#!/bin/bash
# postmortem-validator.sh — postmortem 필수 항목 완성도 검증
# 사용: bash postmortem-validator.sh [파일경로]
# 미지정 시 docs/postmortem/ 전체 open 항목 검증

PROJECT_DIR="/Users/smith/projects/bscamp"
PM_DIR="$PROJECT_DIR/docs/postmortem"

validate_postmortem() {
    local FILE="$1"
    local ERRORS=0
    local PM_ID=$(grep -oE 'id: PM-[0-9]+' "$FILE" | head -1 | awk '{print $2}')
    local STATUS=$(grep -oE 'status: [a-z]+' "$FILE" | head -1 | awk '{print $2}')

    [ "$STATUS" = "resolved" ] && return 0

    # 필수 항목 체크
    grep -q '{수동 필수}' "$FILE" && {
        UNFILLED=$(grep -c '{수동 필수}' "$FILE")
        echo "  ⚠️ $PM_ID: 미작성 필수 항목 ${UNFILLED}건"
        ERRORS=$((ERRORS + UNFILLED))
    }

    # 근본 원인 최소 2개
    WHY_COUNT=$(grep -cE '^[0-9]+\. Why: .+[^}]$' "$FILE" 2>/dev/null || echo 0)
    [ "$WHY_COUNT" -lt 2 ] && {
        echo "  ⚠️ $PM_ID: 근본 원인 ${WHY_COUNT}/2 (최소 2개 필수)"
        ERRORS=$((ERRORS + 1))
    }

    # 재발 방지책 최소 1건
    PREVENT_COUNT=$(grep -cE '^\| [0-9]+ \|' "$FILE" 2>/dev/null || echo 0)
    # 헤더 행 제외
    PREVENT_COUNT=$((PREVENT_COUNT > 0 ? PREVENT_COUNT : 0))
    [ "$PREVENT_COUNT" -lt 1 ] && {
        echo "  ⚠️ $PM_ID: 재발 방지책 0건 (최소 1건 필수)"
        ERRORS=$((ERRORS + 1))
    }

    # TDD 케이스 지정 여부
    TDD_EMPTY=$(grep -cE 'prevention_tdd: \[\]' "$FILE" 2>/dev/null || echo 0)
    [ "$TDD_EMPTY" -gt 0 ] && {
        echo "  ⚠️ $PM_ID: prevention_tdd 미지정"
        ERRORS=$((ERRORS + 1))
    }

    return $ERRORS
}

# 실행
TOTAL_ERRORS=0
if [ -n "$1" ]; then
    validate_postmortem "$1"
    TOTAL_ERRORS=$?
else
    for PM_FILE in "$PM_DIR"/*.md; do
        [ -f "$PM_FILE" ] || continue
        [ "$(basename "$PM_FILE")" = "README.md" ] && continue
        validate_postmortem "$PM_FILE"
        TOTAL_ERRORS=$((TOTAL_ERRORS + $?))
    done
fi

if [ "$TOTAL_ERRORS" -eq 0 ]; then
    echo "✅ 모든 postmortem 완성도 OK"
else
    echo "❌ 미완성 항목 ${TOTAL_ERRORS}건 — 채워주세요"
fi
```

---

## 6. 오늘 사례 5건 — Postmortem 초안

### PM-002: team-context 병렬 충돌

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-30 |
| **심각도** | critical |
| **분류** | chain |
| **사고** | CTO/PM/COO 3팀이 단일 `team-context.json` 공유 → TeamDelete가 파일 삭제 → 직후 pdca-chain-handoff가 context 없어서 exit 0 → 체인 실전 동작률 0% |
| **근본 원인** | (1) 병렬 팀 = 단일 파일 구조 설계 결함 (2) TeamDelete가 rm 사용 (아카이빙 아님) (3) hook 실행 순서에서 삭제→참조 의존성 미고려 |
| **수정** | team-context-resolver.sh (팀별 파일 분리) + 아카이빙 (rm→mv) + 9개 hook resolver 통일 (e4c41dc) |
| **재발 방지 TDD** | `chain-context.test.ts:CC-5` (병렬 독립), `CC-6` (아카이빙), `CC-7` (아카이브 체인 참조) |
| **교훈** | 병렬 에이전트가 공유하는 파일은 반드시 분리 설계. 삭제 대신 아카이빙. |

### PM-003: 승인 요청 리더 미전달

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-30 |
| **심각도** | warning |
| **분류** | process |
| **사고** | 팀원이 `.claude/` 수정 시 approval-handler가 pending 파일 생성하지만, 리더가 pending 디렉토리를 폴링하지 않아 알 수 없음 → 팀원 stuck |
| **근본 원인** | (1) approval-handler가 파일 생성만 하고 알림 안 함 (2) 리더 폴링 메커니즘 미설계 (3) "리더가 알아서 확인할 것" 가정 |
| **수정** | chain-100-percent 설계의 문제 1번 — notify_leader_approval() tmux send-keys |
| **재발 방지 TDD** | `approval-gate.test.ts:P1-1` (send-keys 호출), `P1-2` (tmux 없는 환경) |
| **교훈** | 차단 후 알림이 없으면 차단은 교착이 된다. 차단→알림→해제가 세트. |

### PM-004: 리더 배포 명령어 차단

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-30 |
| **심각도** | warning |
| **분류** | permission |
| **사고** | validate-delegate.sh가 리더의 src/ 수정을 차단하는 것은 맞지만, 별도 인프라 명령어 권한 구분 없음 → 기존 피드백 memory에 "리더도 gcloud 금지"로 기록 → 배포 자체가 불가능한 상태로 고착 |
| **근본 원인** | (1) "리더=코드 안 씀" 원칙을 "리더=아무것도 안 함"으로 과확장 (2) 코드 수정 차단과 인프라 명령어 차단을 구분하지 않음 |
| **수정** | chain-100-percent 설계의 문제 3번 — validate-deploy-authority.sh |
| **재발 방지 TDD** | `deploy-authority.test.ts:P3-1~P3-6` |
| **교훈** | 권한 규칙은 정확한 범위 지정이 필수. "금지"의 범위가 모호하면 정당한 작업까지 차단. |

### PM-005: dashboard-sync 무한 커밋 루프

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-30 |
| **심각도** | critical |
| **분류** | infra |
| **사고** | dashboard-sync-loop.sh가 매분 git commit+push → 7,396건 커밋 생성 + GitHub Actions 메일 폭탄 |
| **근본 원인** | (1) state 동기화를 git으로 구현한 설계 결함 (2) 변경 감지 없이 무조건 commit (3) 실행 간격이 1분 (과도) (4) 정지 메커니즘 없음 (무한 루프) |
| **수정** | 스크립트 삭제 완료. chain-100-percent 설계의 문제 4번 — GCS 직접 업로드 + md5 비교 |
| **재발 방지 TDD** | `dashboard-sync.test.ts:P4-1` (변경 시만), `P4-2` (미변경 스킵) |
| **교훈** | 자동 실행 스크립트에는 반드시: (1) 변경 감지 (2) 실행 간격 제한 (3) 정지 메커니즘. git commit을 자동화하면 안 된다. |

### PM-006: Vercel/GCS 환경 혼동

| 항목 | 내용 |
|------|------|
| **날짜** | 2026-03-30 |
| **심각도** | warning |
| **분류** | config |
| **사고** | ADR-002에 "프론트: Vercel" 기재, 하지만 실제 배포는 Cloud Run. CLAUDE.md, 설계 문서, 에이전트 대화에서 Vercel 언급 반복 → 잘못된 환경 기준으로 설계/배포 시도 |
| **근본 원인** | (1) ADR-002 미업데이트 (Vercel→Cloud Run 전환 후 문서 갱신 안 함) (2) memory에 "Vercel 사용 안 함" 기록했지만 ADR이 정본(source of truth)이라 혼동 (3) 에이전트가 ADR을 우선 참조 |
| **수정** | feedback_no_vercel_mention.md + project_not_vercel.md 메모리 추가. ADR-002 업데이트 필요. |
| **재발 방지 TDD** | 해당 없음 (문서 정합성 이슈) — 대신 hook에서 "vercel" 문자열 감지 시 경고 |
| **교훈** | 인프라 전환 후 ADR 즉시 업데이트 필수. 정본 문서가 틀리면 모든 하위 판단이 틀린다. |

---

## 7. 기존 docs/retrospective/ 이관 계획

| AS-IS | TO-BE |
|-------|-------|
| `docs/retrospective/README.md` | `docs/postmortem/index.json` (자동 관리) |
| `docs/retrospective/2026-03-26-query-builder-postmortem.md` | `docs/postmortem/2026-03-26-query-builder.md` (PM-001) |
| CLAUDE.md "세션 시작 필수 읽기 4번" | `docs/postmortem/` 경로로 변경 |

이관 시 기존 내용을 새 템플릿 포맷으로 재구성:
- RET-001~004 → PM-001 (query-builder에 통합, 이미 상세함)
- `docs/retrospective/` 폴더는 삭제하지 않고 `→ docs/postmortem/으로 이관됨` 안내 추가

---

## 8. Hook 등록 + 설정

### settings.local.json 변경

```json
{
    "hooks": {
        "PreToolUse": [
            {
                "matcher": "Bash",
                "hooks": [
                    // 기존 7개...
                    { "type": "command", "command": ".claude/hooks/postmortem-review-gate.sh" }
                ]
            }
        ]
    }
}
```

---

## 전체 수정 파일 총괄

| # | 파일 | 변경 | 변경량 |
|---|------|------|--------|
| 1 | `.claude/hooks/postmortem-generator.sh` | **신규** — 자동 생성기 | ~100줄 |
| 2 | `.claude/hooks/postmortem-review-gate.sh` | **신규** — TASK 시작 전 리뷰 게이트 | ~80줄 |
| 3 | `.claude/hooks/helpers/postmortem-validator.sh` | **신규** — 완성도 검증 | ~60줄 |
| 4 | `.claude/hooks/helpers/prevention-tdd-tracker.sh` | **신규** — TDD 존재 확인 | ~40줄 |
| 5 | `docs/postmortem/index.json` | **신규** — postmortem 인덱스 | ~50줄 |
| 6 | `docs/postmortem/2026-03-26-query-builder.md` | 이관 — RET-001 재구성 | ~80줄 |
| 7 | `docs/postmortem/2026-03-30-team-context-collision.md` | **신규** — PM-002 | ~50줄 |
| 8 | `docs/postmortem/2026-03-30-approval-no-notify.md` | **신규** — PM-003 | ~50줄 |
| 9 | `docs/postmortem/2026-03-30-deploy-blocked.md` | **신규** — PM-004 | ~50줄 |
| 10 | `docs/postmortem/2026-03-30-dashboard-sync-loop.md` | **신규** — PM-005 | ~50줄 |
| 11 | `docs/postmortem/2026-03-30-vercel-gcs-confusion.md` | **신규** — PM-006 | ~50줄 |
| 12 | `.claude/settings.local.json` | Bash hook 추가 | ~1줄 |
| 13 | `CLAUDE.md` | "세션 시작 필수 읽기" 경로 업데이트 | ~2줄 |
| | **합계** | 신규 11 + 수정 2 = **13파일** | **~663줄** |

---

## 전체 TDD 케이스 총괄

| 기능 | ID 범위 | 케이스 수 | 테스트 파일 |
|------|---------|----------|------------|
| postmortem-generator | PG-1 ~ PG-5 | 5건 | `__tests__/hooks/postmortem-generator.test.ts` **신규** |
| postmortem-validator | PV-1 ~ PV-4 | 4건 | `__tests__/hooks/postmortem-validator.test.ts` **신규** |
| prevention-tdd-tracker | PT-1 ~ PT-4 | 4건 | `__tests__/hooks/prevention-tdd-tracker.test.ts` **신규** |
| postmortem-review-gate | PR-1 ~ PR-5 | 5건 | `__tests__/hooks/postmortem-review-gate.test.ts` **신규** |
| | **합계** | **18건** | 신규 4파일 |

### TDD 상세

| ID | 시나리오 | 기대 결과 |
|----|---------|-----------|
| PG-1 | generator 실행 시 파일 생성 | docs/postmortem/{date}-{slug}.md 존재 |
| PG-2 | generator 실행 시 index.json 갱신 | postmortems 배열에 신규 항목 추가 |
| PG-3 | PM ID 자동 증가 | PM-001 → PM-002 순번 |
| PG-4 | 중복 슬러그 | 같은 날 같은 이름 → 파일 덮어쓰기 (경고) |
| PG-5 | 인자 없이 실행 | 에러 메시지 + exit 1 |
| PV-1 | 미완성 postmortem 감지 | "{수동 필수}" 포함 → 미완성 보고 |
| PV-2 | 완성된 postmortem | 모든 필수 항목 채움 → OK |
| PV-3 | resolved 상태 스킵 | status: resolved → 검증 스킵 |
| PV-4 | Why 1개만 작성 | 최소 2개 미달 → 경고 |
| PT-1 | TDD 파일 존재 | prevention_tdd 파일 실제 존재 → OK |
| PT-2 | TDD 파일 미존재 | prevention_tdd 파일 없음 → MISSING 1건 |
| PT-3 | prevention_tdd 비어있음 | [] → MISSING 1건 |
| PT-4 | resolved는 스킵 | status: resolved → 검증 안 함 |
| PR-1 | open postmortem 있을 때 경고 | 경고 메시지 출력 + exit 0 |
| PR-2 | open postmortem 없을 때 | 메시지 없음 + exit 0 |
| PR-3 | TASK 키워드 매칭 | TASK에 "chain" → PM-002 관련 표시 |
| PR-4 | 세션 중복 실행 방지 | 마커 파일 있으면 스킵 |
| PR-5 | index.json 미존재 | 마커 생성 + exit 0 |

---

## 구현 순서 (권장)

| 순서 | 항목 | 이유 |
|------|------|------|
| 1 | postmortem-generator.sh + index.json | 기반 인프라 — 나머지 모두 의존 |
| 2 | 오늘 사례 5건 postmortem 생성 (PM-002~006) | generator 실전 검증 + 즉시 가치 |
| 3 | postmortem-validator.sh | 생성된 문서 완성도 검증 |
| 4 | prevention-tdd-tracker.sh | 재발 방지 TDD 추적 |
| 5 | postmortem-review-gate.sh + settings 등록 | 다음 TASK 리뷰 강제 |
| 6 | 기존 retrospective 이관 (PM-001) | 정리 |

---

## 검증 기준

- [ ] 문제 발생 시 자동 postmortem 문서 생성 ✅ (postmortem-generator.sh)
- [ ] 필수 항목: 원인, 영향, 수정, 재발 방지 ✅ (템플릿 + validator)
- [ ] 재발 방지→TDD 반영 체크 ✅ (prevention-tdd-tracker.sh)
- [ ] 다음 TASK 시작 전 최근 postmortem 리뷰 강제 ✅ (review-gate.sh)
- [ ] 오늘 사례 5건 ✅ (PM-002~006 초안)
