# Agent Harness v2 (에이전트 하네스 v2) Design

> 작성일: 2026-03-31
> Plan: `docs/01-plan/features/agent-harness-v2.plan.md`
> 기획서: `/Users/smith/.openclaw/workspace/docs/agent-team-structure-v2.md`
> 프로세스 레벨: L2

---

## 1. 시스템 아키텍처

```
┌──────────────────────────────────────────────────────────────────┐
│                   에이전트 하네스 v2 아키텍처                      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [세션 시작]                                                      │
│      │                                                           │
│      ▼                                                           │
│  session-resume-check.sh                                         │
│      │                                                           │
│      ├─→ living-context-loader.sh ─→ CONTEXT_FILES[] 생성         │
│      │                                                           │
│      └─→ 기존 5가지 체크 (미완료피처/좀비팀원/미할당TASK/pdca/좀비pane) │
│                                                                  │
│  [TASK 실행]                                                      │
│      │                                                           │
│      ├─→ detect-work-type.sh ─→ {TYPE}-{LEVEL} 분류              │
│      │                                                           │
│      ├─→ gate-init.sh ─→ task-state-{feature}.json 생성           │
│      │                                                           │
│      ├─→ gate-checker.sh ─→ 게이트 순차 판정                      │
│      │                                                           │
│      └─→ [TaskCompleted] ─→ pdca-chain-handoff.sh                │
│                                 │                                │
│                                 ▼                                │
│                          COMPLETION_REPORT                       │
│                                 │                                │
│                                 ▼                                │
│  [COO 수신]                                                      │
│      │                                                           │
│      ├─→ coo-ack/ JSON 생성 (5분 타임아웃)                        │
│      │                                                           │
│      ├─→ smith-report/ JSON 생성 (15분 타임아웃)                   │
│      │                                                           │
│      └─→ coo-watchdog.sh ─→ 타임아웃 감시 + Slack 알림             │
│                                                                  │
│  [대시보드]                                                       │
│      │                                                           │
│      ├─→ task-state-*.json 읽기                                   │
│      ├─→ coo-state.json 읽기                                     │
│      └─→ claude-peers 상태 읽기                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Feature 1: living-context 설계

### 2-1. living-context-loader.sh

**위치**: `.bkit/hooks/helpers/living-context-loader.sh`

**인터페이스**:
```bash
# 사용법
source .bkit/hooks/helpers/living-context-loader.sh
load_context "{feature}" "{phase}"
# 결과: CONTEXT_FILES 배열에 읽어야 할 파일 경로 목록
```

**로딩 규칙**:

| Phase | 로드 문서 |
|-------|----------|
| 모든 Phase | CLAUDE.md + ADR-001 + ADR-002 + SERVICE-VISION.md |
| plan | (불변규칙만) |
| design | + {feature}.plan.md |
| do | + {feature}.plan.md + {feature}.design.md |
| check | + {feature}.design.md |
| act | + {feature}.design.md + {feature}.analysis.md |

**추가 로딩**:
- 관련 postmortem: `docs/postmortem/` 에서 feature명 grep
- task-state JSON: `.bkit/runtime/task-state-{feature}.json`

**출력**: `echo "LIVING_CONTEXT: {N}개 문서 로드 대상"` + CONTEXT_FILES 배열

### 2-2. session-resume-check.sh 수정

**수정 위치**: 기존 `# ── 6. 요약 ──` 앞에 `# ── 7. Living Context ──` 추가

**수정 내용**:
```
1. pdca-status.json에서 primaryFeature + phase 추출
2. load_context 호출
3. 로드 대상 파일 목록 출력 (에이전트가 읽어야 할 가이드)
```

**주의**: 기존 로직(1~6번) 일체 수정 없음. 7번만 추가.

### 2-3. PDCA 오염 데이터 정리

**대상**: pdca-status.json에서 Plan/Design 없이 phase: "do"인 10건

```
helpers, .claude, creative-detail, bscamp, individual,
protractor, portfolio, account-prescription,
prescription-reanalysis, creatives
```

**처리**: `activeFeatures` 배열에서 제거 + `features` 객체에서 제거
**백업**: 정리 전 `pdca-status.json.bak` 생성

---

## 3. Feature 2: coo-harness 설계

### 3-1. COO 게이트 정의

| 게이트 | 트리거 | 타임아웃 | 판정 파일 | 실패 시 |
|--------|--------|---------|----------|--------|
| ACK | COMPLETION_REPORT 수신 | 5분 | `.bkit/runtime/coo-ack/{slug}.json` | Slack "COO 미응답" |
| Smith 보고 | ACK 완료 | 15분 | `.bkit/runtime/smith-report/{slug}.json` | Slack "보고 지연" |
| 검수 | 리더 검수 요청 (MKT) | 24시간 | `.bkit/runtime/approvals/{slug}-coo.json` | 자동 승인 + 경고 |
| 질의 응답 | 리더 TASK_QUERY | 30분 | `.bkit/runtime/coo-answers/{slug}-{ts}.json` | 리더 자율 진행 |
| TASK 배정 | TASK 정의 | - | `task-state-{feature}.json` 존재 + type 비어있지 않음 | 배정 차단 |

### 3-2. coo-watchdog.sh 설계

**위치**: `.bkit/hooks/helpers/coo-watchdog.sh`
**실행 주기**: pdca-cron-watcher.sh에서 1분 주기 호출

**로직**:
```
1. .bkit/runtime/chain-status-*.json 순회
2. 모든 게이트 done인데 coo-ack/ 파일 없음 → 경과 시간 계산
3. 경과 > 300초 (5분) → Slack 알림
4. coo-ack/ 존재 + smith-report/ 없음 → ACK 시각 기준 경과 계산
5. 경과 > 900초 (15분) → Slack 알림
6. debounce: 동일 TASK 재알림 쿨다운 30분
```

**Slack 알림 형식**:
```
⚠ COO 게이트 타임아웃
TASK: {task명}
게이트: {ACK/Smith보고}
경과: {분}분 {초}초
타임아웃: {5/15}분
```

### 3-3. coo-state.json 스키마

```json
{
  "version": "1.0",
  "role": "COO",
  "session": "mozzi-main",
  "status": "active|idle|waiting",
  "pendingAcks": [
    { "feature": "string", "receivedAt": "ISO8601", "deadline": "ISO8601" }
  ],
  "pendingReports": [
    { "feature": "string", "ackedAt": "ISO8601", "deadline": "ISO8601" }
  ],
  "pendingQueries": [
    { "feature": "string", "from": "string", "receivedAt": "ISO8601", "deadline": "ISO8601" }
  ],
  "lastActivity": "ISO8601",
  "metrics": {
    "avgAckTimeMs": "number",
    "avgReportTimeMs": "number",
    "missedAcks": "number",
    "missedReports": "number",
    "totalProcessed": "number"
  }
}
```

### 3-4. notify-completion.sh 설계

**위치**: `.bkit/hooks/notify-completion.sh`
**트리거**: TaskCompleted 이벤트 (settings.local.json에 이미 등록)

**로직**:
```
1. 환경변수에서 TASK 정보 추출
2. Slack API 호출 (채널: C0AN7ATS4DD)
   - curl -X POST https://slack.com/api/chat.postMessage
   - 토큰: SLACK_BOT_TOKEN 환경변수
3. HTTP 200 확인 → exit 0
4. 실패 → error-log.json에 기록 → exit 0 (알림 실패로 체인 차단하지 않음)
```

### 3-5. 디렉토리 구조

```
.bkit/runtime/
├── coo-ack/              # COO ACK 파일
│   └── {slug}.json
├── coo-answers/          # COO 질의 응답
│   └── {slug}-{timestamp}.json
├── smith-report/         # Smith님 보고 파일
│   └── {slug}.json
├── coo-state.json        # COO 상태 추적
└── task-state-{feature}.json  # 통합 TASK 상태
```

---

## 4. Feature 3: agent-dashboard-v2 설계

### 4-1. 신규 페이지 3개

| 페이지 | 라우트 | 데이터 소스 | 주요 컴포넌트 |
|--------|--------|-----------|-------------|
| COO 상태 | `/coo` | coo-state.json + coo-ack/*.json + smith-report/*.json | 메트릭 4개, 대기 게이트 테이블, 처리 이력, 자율 범위 표 |
| Living Context | `/context` | task-state-*.json + pdca-status.json | 메트릭 4개, 세션별 Context 테이블, 상류 캐스케이드 시각화 |
| Peers 연결 | `/peers` | claude-peers list_peers 결과 + 메시지 로그 | 메트릭 4개, Peer 목록 테이블, 메시지 피드 |

### 4-2. 신규 API 엔드포인트

| 메서드 | 경로 | 용도 | 데이터 소스 |
|--------|------|------|-----------|
| GET | `/api/coo/status` | COO 상태 + 메트릭 | coo-state.json |
| GET | `/api/coo/pending` | 대기 중 게이트 목록 | coo-ack/, smith-report/ 스캔 |
| GET | `/api/coo/history` | 최근 처리 이력 | coo-ack/, smith-report/ 시간순 정렬 |
| GET | `/api/context/sessions` | 세션별 Context 로딩 상태 | task-state-*.json |
| GET | `/api/context/cascade/:feature` | 특정 피처 상류 캐스케이드 | living-context-loader.sh 호출 |
| GET | `/api/peers/list` | Peer 목록 + 상태 | tmux list-sessions + peer-map.json |
| GET | `/api/peers/messages` | 최근 메시지 로그 | chain 메시지 로그 파일 |

### 4-3. task-state 통합 JSON 스키마

```json
{
  "version": "2.0",
  "task": "string (TASK명)",
  "feature": "string (feature slug)",
  "type": "string (DEV-L2, OPS-L0, MKT-L1 등)",
  "assignee": "string (tmux 세션명)",
  "pdca": {
    "currentPhase": "string",
    "previousPhase": "string|null",
    "phaseHistory": [
      { "phase": "string", "enteredAt": "ISO8601", "exitedAt": "ISO8601|null" }
    ]
  },
  "gates": {
    "{gate_name}": {
      "done": "boolean",
      "...gate_specific_fields": "..."
    }
  },
  "context": {
    "livingContextFiles": ["string (파일 경로)"],
    "lastContextLoadAt": "ISO8601|null"
  },
  "chain": {
    "currentStep": "string",
    "messages": [
      { "type": "string", "from": "string", "to": "string", "at": "ISO8601" }
    ]
  },
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### 4-4. detect-work-type.sh 설계

**위치**: `.bkit/hooks/helpers/detect-work-type.sh`

**분류 로직** (우선순위 순):
```
1. 커밋 메시지 fix:/hotfix: → DEV-L0
2. src/ 변경 + migration/auth/.env → DEV-L3
3. src/ 변경 → DEV-L2
4. .bkit/hooks/, Dockerfile, cloudbuild.yaml 변경 → OPS (L0~L2 세분화)
5. docs/marketing/, public/reports/ 변경 → MKT (L1~L2)
6. docs/adr/, 코드 변경 없음 → BIZ (L1~L2)
7. src/ 미변경 + 위 모두 해당 없음 → DEV-L1
```

**출력**: stdout에 `DEV-L2` 등 문자열 출력

### 4-5. gate-init.sh 설계

**위치**: `.bkit/hooks/helpers/gate-init.sh`

**입력**: `gate-init.sh {feature} {type-level}`
**출력**: `.bkit/runtime/task-state-{feature}.json` 생성

**로직**:
```
1. {type-level}에 따라 게이트 매트릭스 참조
2. 해당 유형에 필요한 게이트만 포함한 JSON 생성
3. 모든 게이트 done: false로 초기화
4. task-index.json에 엔트리 추가
```

### 4-6. error-classifier.sh 수정

**현재 문제**: 모든 에러가 unknown으로 분류

**수정 내용**:
```
에러 메시지 패턴 매칭:
- "tsc" | "typescript" → category: "type-error"
- "build" | "next build" → category: "build-error"
- "deploy" | "cloud run" → category: "deploy-error"
- "permission" | "EACCES" → category: "permission-error"
- "timeout" | "ETIMEDOUT" → category: "timeout-error"
- "rate limit" | "429" → category: "rate-limit"
- "git" | "merge conflict" → category: "git-error"
- 그 외 → category: "uncategorized" (unknown 대신)
```

---

## 5. 목업 현황

**파일**: `docs/mockups/dashboard.html` (v0.2.0)

v1 목업(v0.1.0)에서 v2 추가 완료:
- 사이드바: "v2 하네스" 섹션 (COO 상태, Living Context, Peers 연결)
- COO 상태 페이지: 메트릭 4개 + 대기 게이트 + 처리 이력 + 자율 범위
- Living Context 페이지: 메트릭 4개 + 세션별 상태 + 캐스케이드 시각화
- Peers 연결 페이지: 메트릭 4개 + Peer 목록 + 메시지 피드

---

## 6. 테스트 계획 (TDD 케이스)

> 모든 테스트는 bash 명령어로 검증 가능. `__tests__/agent-harness-v2/` 디렉토리에 스크립트 배치.
> 카테고리: 🟢 정상 / 🟡 경계값 / 🔴 실패·에러 / ⏱ 타임아웃

### Feature 1: living-context (12케이스)

| # | 카테고리 | 테스트 | bash 검증 명령 |
|---|:-------:|--------|---------------|
| T1-01 | 🟢 | do 단계: plan+design+불변규칙 로드 (7개) | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor-refactoring" "do" && [ ${#CONTEXT_FILES[@]} -ge 7 ]` |
| T1-02 | 🟢 | plan 단계: 불변규칙만 로드 (4개) | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "new-feature" "plan" && [ ${#CONTEXT_FILES[@]} -eq 4 ]` |
| T1-03 | 🟢 | design 단계: 불변규칙+plan 로드 | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor-refactoring" "design" && echo "${CONTEXT_FILES[@]}" | grep -q "plan.md"` |
| T1-04 | 🟢 | check 단계: design만 로드 (plan 미포함) | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor-refactoring" "check" && echo "${CONTEXT_FILES[@]}" | grep -q "design.md" && ! echo "${CONTEXT_FILES[@]}" | grep -q "plan.md"` |
| T1-05 | 🟢 | act 단계: design+analysis 로드 | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor-refactoring" "act" && echo "${CONTEXT_FILES[@]}" | grep -q "analysis.md"` |
| T1-06 | 🟢 | 관련 postmortem 자동 포함 | `echo "protractor" > /tmp/test-postmortem.md && source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor" "do" # postmortem grep 동작 확인` |
| T1-07 | 🟡 | plan.md 미존재 피처의 design 단계: 에러 없이 불변규칙만 | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "nonexistent-feature" "design" && [ ${#CONTEXT_FILES[@]} -ge 4 ] && [ $? -eq 0 ]` |
| T1-08 | 🟡 | SERVICE-VISION.md 미존재 시: 3개만 로드 (에러 없음) | `_SV="$HOME/.openclaw/workspace/SERVICE-VISION.md"; [ -f "$_SV" ] && mv "$_SV" "$_SV.bak"; source .bkit/hooks/helpers/living-context-loader.sh && load_context "test" "plan" && [ $? -eq 0 ]; [ -f "$_SV.bak" ] && mv "$_SV.bak" "$_SV"` |
| T1-09 | 🟡 | feature명에 특수문자/공백 포함 시 에러 없음 | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "my feature (v2)" "plan" && [ $? -eq 0 ]` |
| T1-10 | 🔴 | session-resume-check.sh: pdca-status.json 파손 시 graceful exit | `echo "invalid json" > /tmp/test-pdca.json && PDCA_FILE=/tmp/test-pdca.json bash .bkit/hooks/session-resume-check.sh; [ $? -eq 0 ]` |
| T1-11 | 🔴 | CONTEXT_FILES에 포함된 파일이 실제 존재하는지 전수 검증 | `source .bkit/hooks/helpers/living-context-loader.sh && load_context "protractor-refactoring" "do" && for f in "${CONTEXT_FILES[@]}"; do [ -f "$f" ] || echo "MISSING: $f"; done` |
| T1-12 | 🟢 | pdca-status.json 오염 데이터 정리 후 0건 | `jq '[.features | to_entries[] | select(.value.plan.done == false and .value.design.done == false and .value.phase == "do")] | length' .bkit/state/pdca-status.json | grep -q "^0$"` |

### Feature 2: coo-harness (14케이스)

| # | 카테고리 | 테스트 | bash 검증 명령 |
|---|:-------:|--------|---------------|
| T2-01 | 🟢 | ACK 파일 정상 생성 + 스키마 유효 | `echo '{"feature":"test","receivedAt":"2026-03-31T10:00:00Z","ackAt":"2026-03-31T10:01:00Z"}' > .bkit/runtime/coo-ack/test.json && jq '.feature' .bkit/runtime/coo-ack/test.json` |
| T2-02 | 🟢 | smith-report 파일 정상 생성 + 스키마 유효 | `echo '{"feature":"test","type":"DEV-L2","summary":"완료","matchRate":97,"commitHash":"abc123","reportedAt":"2026-03-31T10:05:00Z"}' > .bkit/runtime/smith-report/test.json && jq '.matchRate' .bkit/runtime/smith-report/test.json` |
| T2-03 | 🟢 | coo-state.json 초기 생성 + jq 파싱 | `jq '.version' .bkit/runtime/coo-state.json && jq '.metrics.missedAcks' .bkit/runtime/coo-state.json` |
| T2-04 | 🟢 | notify-completion.sh exit 0 (Slack 미설정이어도 차단 안 함) | `bash .bkit/hooks/notify-completion.sh 2>/dev/null; [ $? -eq 0 ]` |
| T2-05 | ⏱ | ACK 5분 초과: watchdog가 TIMEOUT 출력 | `mkdir -p .bkit/runtime/coo-ack; echo '{"task":"timeout-test","type":"DEV-L2","gates":{"commit":{"done":true},"deploy":{"done":true},"report":{"done":true}},"updated_at":"2026-03-31T00:00:00+09:00"}' > /tmp/chain-timeout-test.json && PROJECT_DIR=/Users/smith/projects/bscamp bash .bkit/hooks/helpers/coo-watchdog.sh 2>&1 | grep -q "TIMEOUT"` |
| T2-06 | ⏱ | ACK 3분 (5분 미만): watchdog가 알림 안 함 | `echo '{"task":"ok-test","type":"DEV-L2","gates":{"commit":{"done":true}},"updated_at":"'"$(date -u -v-3M +%Y-%m-%dT%H:%M:%S+09:00)"'"}' > /tmp/chain-ok-test.json && bash .bkit/hooks/helpers/coo-watchdog.sh 2>&1 | grep -cv "TIMEOUT"` |
| T2-07 | ⏱ | Smith 보고 15분 초과: watchdog가 보고 지연 출력 | `mkdir -p .bkit/runtime/coo-ack; echo '{"feature":"late-report","ackAt":"2026-03-31T00:00:00Z"}' > .bkit/runtime/coo-ack/late-report.json && bash .bkit/hooks/helpers/coo-watchdog.sh 2>&1 | grep -q "보고 지연"` |
| T2-08 | ⏱ | 질의 응답 30분 초과: 자율 진행 신호 | `echo '{"feature":"query-test","from":"sdk-cto","receivedAt":"2026-03-31T00:00:00Z"}' > .bkit/runtime/coo-state.json.query-test && bash .bkit/hooks/helpers/coo-watchdog.sh 2>&1 | grep -q "자율 진행"` |
| T2-09 | 🟡 | debounce: 동일 TASK 30분 내 재알림 차단 | `bash .bkit/hooks/helpers/coo-watchdog.sh > /tmp/wd1.txt 2>&1 && bash .bkit/hooks/helpers/coo-watchdog.sh > /tmp/wd2.txt 2>&1 && [ "$(grep -c TIMEOUT /tmp/wd2.txt)" -le "$(grep -c TIMEOUT /tmp/wd1.txt)" ]` |
| T2-10 | 🟡 | coo-ack/ 디렉토리 미존재 시 자동 생성 | `rm -rf .bkit/runtime/coo-ack && bash .bkit/hooks/helpers/coo-watchdog.sh 2>/dev/null; [ -d .bkit/runtime/coo-ack ]` |
| T2-11 | 🔴 | chain-status JSON 파손 시 graceful skip | `echo "not json" > /tmp/chain-broken.json && bash .bkit/hooks/helpers/coo-watchdog.sh 2>/dev/null; [ $? -eq 0 ]` |
| T2-12 | 🔴 | SLACK_BOT_TOKEN 미설정 시 notify-completion.sh exit 0 (차단 안 함) | `unset SLACK_BOT_TOKEN && bash .bkit/hooks/notify-completion.sh 2>/dev/null; [ $? -eq 0 ]` |
| T2-13 | 🔴 | coo-state.json 파손 시 watchdog graceful 처리 | `echo "broken" > .bkit/runtime/coo-state.json.bak && bash .bkit/hooks/helpers/coo-watchdog.sh 2>/dev/null; [ $? -eq 0 ]` |
| T2-14 | 🟢 | MKT 검수 24시간 미응답 → 자동 승인 verdict 생성 | `echo '{"feature":"mkt-test","verdict":null,"requestedAt":"2026-03-30T00:00:00Z"}' > .bkit/runtime/approvals/mkt-test-coo.json && bash .bkit/hooks/helpers/coo-watchdog.sh 2>&1 | grep -q "자동 승인"` |

### Feature 3: agent-dashboard-v2 (12케이스)

| # | 카테고리 | 테스트 | bash 검증 명령 |
|---|:-------:|--------|---------------|
| T3-01 | 🟢 | detect-work-type.sh: src/ 변경 → DEV-L2 | `echo "src/app/page.tsx" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "DEV-L2"` |
| T3-02 | 🟢 | detect-work-type.sh: fix: 커밋 → DEV-L0 | `COMMIT_MSG="fix: 긴급 버그" bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "DEV-L0"` |
| T3-03 | 🟢 | detect-work-type.sh: src/ + migration → DEV-L3 | `echo -e "src/app/page.tsx\nsrc/lib/migration.ts" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "DEV-L3"` |
| T3-04 | 🟢 | detect-work-type.sh: Dockerfile 변경 → OPS | `echo "Dockerfile" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "OPS"` |
| T3-05 | 🟢 | detect-work-type.sh: docs/marketing/ → MKT | `echo "docs/marketing/blog-post.md" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "MKT"` |
| T3-06 | 🟡 | detect-work-type.sh: src/ + Dockerfile 동시 변경 → DEV (우선순위 1) | `echo -e "src/app/page.tsx\nDockerfile" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "DEV"` |
| T3-07 | 🟡 | detect-work-type.sh: 변경 파일 0개 → DEV-L1 | `echo "" | bash .bkit/hooks/helpers/detect-work-type.sh 2>&1 | grep -q "DEV-L1"` |
| T3-08 | 🟢 | gate-init.sh DEV-L2: 6개 게이트 생성 (plan/design/dev/commit/deploy/report) | `bash .bkit/hooks/helpers/gate-init.sh "test-feat" "DEV-L2" && jq '.gates | keys | length' .bkit/runtime/task-state-test-feat.json | grep -q "^6$"` |
| T3-09 | 🟢 | gate-init.sh DEV-L0: 3개 게이트만 (commit/deploy/report) | `bash .bkit/hooks/helpers/gate-init.sh "hotfix-test" "DEV-L0" && jq '.gates | keys | length' .bkit/runtime/task-state-hotfix-test.json | grep -q "^3$"` |
| T3-10 | 🟡 | gate-init.sh: 동일 feature 재실행 시 기존 파일 덮어쓰기 방지 | `bash .bkit/hooks/helpers/gate-init.sh "dup-test" "DEV-L2" && bash .bkit/hooks/helpers/gate-init.sh "dup-test" "DEV-L2" 2>&1 | grep -q "이미 존재"` |
| T3-11 | 🔴 | error-classifier.sh: "tsc error" → type-error 분류 | `echo '{"message":"tsc error TS2345"}' | bash .bkit/hooks/helpers/error-classifier.sh 2>&1 | grep -q "type-error"` |
| T3-12 | 🔴 | error-classifier.sh: 빈 메시지 → uncategorized (unknown 아님) | `echo '{"message":""}' | bash .bkit/hooks/helpers/error-classifier.sh 2>&1 | grep -q "uncategorized" && ! echo '{"message":""}' | bash .bkit/hooks/helpers/error-classifier.sh 2>&1 | grep -q "unknown"`
