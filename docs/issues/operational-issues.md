# 운영 이슈 트래킹

> 운영 중 발견되는 기술적 이슈들을 체계적으로 기록하고 추적하는 문서
> 
> 업데이트: 2026-04-01

## 🔴 Critical (즉시 해결 필요)

### OI-001: Agent Teams pane_index 할당 버그
- **발견일**: 2026-04-01
- **증상**: 팀원(backend-dev-3)이 pane 3에 있지만 validate-delegate.sh에서 pane 0(리더)으로 인식
- **영향**: 팀원의 src/ 파일 수정이 차단됨
- **원인**: Agent spawn 시 tmux pane_index 할당 로직 오류
- **임시 해결책**: 새로운 팀원 spawn으로 우회
- **근본 해결**: Agent Teams의 pane 할당 로직 수정 필요
- **상태**: 🔴 Open

### OI-002: Claude Code 에이전트 환경변수 유실 사고
- **발생일**: 2026-04-01 06:36
- **증상**: Cloud Run 환경변수 31개 → 1개로 급감
- **원인**: unified-bash-post 액터가 `--set-env-vars` 사용 시 기존 환경변수 전체 삭제
- **영향**: AI 기능, Slack 알림, SMS, 광고 연동 등 전체 서비스 마비
- **해결**: revision 48에서 환경변수 복구 완료
- **재발 방지**: CLAUDE.md 규칙 추가 필요 - `--set-env-vars` 금지, `--update-env-vars` 사용
- **상태**: ✅ Resolved

## 🟡 High (높은 우선순위)

### OI-003: 총가치각도기 Meta ODAX 레거시 호환성 문제
- **발견일**: 2026-04-01
- **증상**: 판매 캠페인 2개 중 1개만 분석, 중복률 0%
- **원인**: `OUTCOME_SALES` 필터만 사용, `CONVERSIONS`/`PRODUCT_CATALOG_SALES` 제외
- **배경**: Meta 2023년 ODAX 전환 후 레거시 캠페인 미호환
- **해결**: SALES_OBJECTIVES 배열로 3종 모두 포함하도록 수정 완료
- **추가 필요**: PAUSED 캠페인도 포함하는 effective_status 수정
- **상태**: 🟡 Partial (레거시 호환성 해결, PAUSED 미해결)

### OI-004: 답변검토 SQL NULL 처리 버그
- **발견일**: 2026-04-01
- **증상**: 답변대기 4개 중 2개만 표시
- **원인**: `is_approved = NULL` 값이 `.eq("is_approved", false)` 쿼리에서 제외
- **영향**: 일부 미승인 답변이 검토 목록에서 누락
- **해결**: 4개 파일에서 `.or("is_approved.eq.false,is_approved.is.null")` 수정 완료
- **상태**: ✅ Resolved

## 🟢 Medium (중간 우선순위)

### OI-005: Gemini API 키 유출 차단 사고
- **발생 기간**: 2026-03-31 10:04 ~ 2026-04-01 (복구 시점)
- **증상**: 모든 AI 답변 생성 불가
- **원인**: API 키 `AIzaSyBQZUTjVUeYiT1XLzkWZEjJ7cmSZEbtgus` 유출로 Google 차단
- **메시지**: "Your API key was reported as leaked. Please use another API key."
- **해결**: 새 API 키 `AIzaSyCVF...nQOrY4` 발급 및 적용 완료
- **영향**: AI 답변 4건 누락 → backfill로 재생성 완료
- **상태**: ✅ Resolved

### OI-006: 회원 role 권한 문제
- **발견일**: 2026-04-01
- **증상**: Smith님 계정에 답변검토 메뉴 미노출
- **원인**: profiles 테이블에서 Smith님 role이 "student"로 설정됨
- **해결**: DB에서 role을 "admin"으로 변경 완료
- **영향**: 관리자 기능 접근 불가
- **상태**: ✅ Resolved

## 📋 Known Issues (알려진 제약사항)

### KI-001: validate-delegate.sh hook 제약
- **설명**: 리더는 src/ 파일 직접 수정 불가, 팀원 위임 필수
- **용도**: delegate 패턴 강제
- **제약**: 긴급 상황에서 빠른 수정 어려움
- **우회**: 새 팀원 spawn 후 위임

### KI-002: Cloud Run 환경변수 설정 함정
- **위험**: `--set-env-vars`는 전체 대체, `--update-env-vars`는 부분 수정
- **권장**: 항상 `--update-env-vars` 사용
- **주의**: 자동화 스크립트에서 특히 주의 필요

### OI-007: validate-delegate.sh 우회 — Bash 파일 수정 전체 미감지
- **발견일**: 2026-04-01
- **증상**: 리더가 Bash로 파일 수정 시 validate-delegate.sh 완전 우회
- **원인**: validate-delegate.sh가 `Edit|Write` matcher에만 걸려있음. Bash 명령으로 파일 수정하면 해당 hook을 아예 안 탐
- **우회 가능 명령 (전부 차단 필요)**:
  - `sed -i` — 인라인 파일 수정
  - `awk '{...}' > file` — awk 출력 리다이렉트
  - `perl -i -pe` — perl 인라인 수정
  - `python3 -c "open('file','w').write(...)"` — python 파일 쓰기
  - `node -e "fs.writeFileSync(...)"` — node 파일 쓰기
  - `cat > file <<EOF` — heredoc 리다이렉트
  - `echo "..." > file` — echo 리다이렉트
  - `tee file` — tee 쓰기
  - `cp modified_file original_file` — 복사 덮어쓰기
  - `mv new_file original_file` — 이동 덮어쓰기
  - `dd of=file` — dd 쓰기
- **영향**: 리더가 src/, .bkit/hooks/ 등 모든 파일을 역할 경계 무시하고 수정 가능
- **해결 방향**: PreToolUse:Bash hook에 `bash-file-write-guard.sh` 신규 추가. 명령문에서 파일 쓰기 패턴 감지 → 대상 경로가 허용 목록 외면 차단
- **우선순위**: 🔴 Critical — 역할 경계(A0-3) 근본 우회 가능
- **상태**: 🔴 Open

### OI-008: Slack 완료 알림 우회 — 5가지 경로
- **발견일**: 2026-04-01
- **증상**: TASK 완료됐는데 Slack 알림이 안 올 수 있음
- **우회 경로**:
  1. `SLACK_BOT_TOKEN` 미설정/unset → 전송 조건문 스킵 (exit 0)
  2. 앞선 hook exit 2 → hook #6(notify-completion.sh)까지 안 도달
  3. git commit+push만 하고 TaskCompleted 안 걸기 → 9개 hook 전체 미실행
  4. curl 실패 (네트워크/타임아웃) → 조용히 exit 0
  5. Bash로 `unset SLACK_BOT_TOKEN` 실행 후 작업 → 이후 알림 전부 무효
- **근본 원인**: notify-completion.sh가 전송 실패해도 항상 exit 0. 강제성 없음
- **방어 전략 (못 막으면 잡는다)**:
  - **감시 크론**: 5분마다 git log vs Slack 알림 대조. 커밋 있는데 알림 없으면 → Smith님 DM
  - **토큰 보호**: SLACK_BOT_TOKEN을 시스템 레벨(/etc/environment)에 고정. unset 방지
  - **실패 재시도**: notify-completion.sh에서 전송 실패 시 `.bkit/runtime/slack-retry-queue.json`에 마커 → 크론이 재전송
  - **누락 감지 마커**: TaskCompleted 시 `/tmp/tc-{commit-hash}.marker` 생성, 크론이 Slack 전송 여부와 대조
- **우선순위**: 🔴 Critical — 완료 보고 누락 = Smith님이 진행 상황 파악 불가
- **상태**: 🔴 Open

### OI-009: MOCK_ 환경변수로 hook 검증 우회
- **발견일**: 2026-04-01
- **증상**: 테스트용 MOCK_ 변수가 프로덕션에서도 작동
- **우회 방법**:
  - `MOCK_CALLER_PANE=0` → pane-access-guard.sh가 리더로 인식 → 팀원 pane 접근 허용
  - `MOCK_CALLER_SESSION=sdk-cto` → 세션 위조
- **영향**: 비리더가 리더로 위장하여 팀원 pane 직접 접근 가능
- **해결 방향**: MOCK_ 변수를 `CI=true` 또는 `BKIT_TEST=true`일 때만 허용. 프로덕션에서는 무시
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-010: TaskCompleted hook 순서 문제 — quality-gate가 gap-analysis보다 먼저 실행
- **발견일**: 2026-04-01
- **증상**: task-quality-gate.sh(#2)가 gap-analysis.sh(#3)보다 먼저 실행
- **문제**: quality-gate가 Match Rate를 체크하는데, gap-analysis가 아직 안 돌았으면 이전 분석 결과(stale data)로 판단
- **영향**: 실제 Match Rate와 다른 결과로 통과/차단 가능
- **해결 방향**: hook 순서 변경 — gap-analysis.sh를 #2로, task-quality-gate.sh를 #3으로
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-011: team-context / peer-roles 파일 조작 가능
- **발견일**: 2026-04-01
- **증상**: `.bkit/runtime/` 하위 JSON 파일을 Bash로 직접 수정 가능
- **우회 방법**:
  - team-context.json의 `.team` 값 변경 → 체인 핸드오프 방향 조작
  - peer-roles.json 수정 → 다른 팀 세션에 메시지 전달
  - teammate-registry.json의 state 변경 → 좀비 팀원 은닉
- **영향**: 체인 핸드오프 방향 왜곡, 팀 상태 위조
- **해결 방향**: runtime JSON 파일에 체크섬(hash) 기록. hook 실행 시 체크섬 검증 → 불일치 시 차단
- **우선순위**: 🟢 Medium
- **상태**: 🔴 Open

### OI-012: validate-pdca.sh stale state 오탐
- **발견일**: 2026-04-01
- **증상**: pdca-status.json이 오래되면(30분+) 정상 작업도 차단
- **실제 사례**: 이번 세션에서 가이드 문서 작성 중 pdca-status.json 1883초 경과로 Bash 차단
- **문제**: Track B 작업(문서, 설정)도 Track A 기준으로 차단
- **해결 방향**: Track B 작업 경로(docs/, .bkit/, 외부 프로젝트)는 pdca 검증 스킵
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-013: webhook/broker 단일 장애점
- **발견일**: 2026-04-01
- **증상**: localhost:18789(COO webhook) 또는 localhost:7899(broker) 다운 시 체인 핸드오프 실패
- **현재 동작**: 실패해도 exit 0 → 조용히 넘어감. "ACTION_REQUIRED" 텍스트만 출력
- **문제**: 출력을 아무도 안 보면 체인 영구 끊김
- **해결 방향**: webhook 실패 시 Slack으로 fallback 알림("체인 핸드오프 실패, 수동 확인 필요")은 이미 구현. 하지만 Slack도 실패하면 `/tmp/chain-failed-{ts}.marker` 생성 → 크론 감지
- **우선순위**: 🟢 Medium
- **상태**: 🔴 Open

### OI-015: T 단계 미강제 — COO→팀 메시지 시 TASK 없이 전달 가능
- **발견일**: 2026-04-01
- **증상**: COO가 claude-peers send_message로 팀에 직접 지시 가능, TASK 파일 없이도 차단 안 됨
- **원인**: send_message에 TASK 존재/coo_approved 게이팅 훅 없음
- **영향**: T 단계(A0-1) 우회 — TASK 없이 팀 작업 시작 가능
- **해결 방향**: PreToolUse:Bash에 `validate-task-before-message.sh` 추가. send_message 감지 시 TASK 파일 + coo_approved 체크
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-016: Smith님 → 팀 세션 직접 접근 시 COO 리다이렉트 없음
- **발견일**: 2026-04-01
- **증상**: Smith님이 PM/CTO 세션에 직접 메시지 보내면 COO를 거치지 않고 팀이 바로 실행
- **원인**: 인바운드 메시지 라우팅 훅 없음. 팀 세션이 지시자 구분 없이 모든 메시지 처리
- **영향**: T-PDCA의 T 단계 전체 스킵 — 레벨 판단, 선행 문서 확인, 과거 결정 충돌 체크 누락
- **해결 방향**: 팀 세션에 SessionStart 또는 인바운드 메시지 훅 추가. Smith님 직접 지시 감지 시 COO 세션으로 자동 포워딩 + "COO를 거쳐야 합니다" 안내
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-017: COO→CTO 체인 핸드오프 시 Plan/Design 없이 통과
- **발견일**: 2026-04-01
- **증상**: COO가 TASK를 CTO에 넘겼을 때, Plan/Design 문서가 없어도 CTO 세션에서 작업 시작 가능
- **원인**: chain-handoff 시점에 Plan/Design 존재를 체크하는 게이트가 없음. validate-plan.sh와 validate-design.sh는 `src/` 파일 수정 시에만 작동 — TASK 수신 시점에서는 미검증
- **영향**: CTO가 Design 없이 구현 시작 → 나중에 커밋 시 차단 (비효율 — 작업 후 차단보다 수신 시 차단이 나음)
- **해결 방향**: pdca-chain-handoff.sh에서 CTO 전달 전 Plan/Design 파일 존재 체크 추가. L2/L3이면 둘 다 없으면 차단, L1이면 Design만 체크
- **우선순위**: 🟡 High
- **상태**: 🔴 Open

### OI-014: Hook 데드락 — 좀비 팀 복구 경로 없음
- **발견일**: 2026-04-01
- **증상**: 팀이 비정상 종료되면 합법적 복구 경로가 전부 차단됨
- **실제 사례**: CTO 리더 팀 "paused-fix" — config.json 사라졌는데 디렉토리 남음
- **데드락 체인**:
  1. 새 팀 생성? → "이미 paused-fix 팀 리딩 중" → 차단
  2. TeamDelete? → validate-pdca-before-teamdelete.sh → "PDCA 미완료" → 차단
  3. Write config.json? → validate-delegate.sh → "리더 파일 수정 금지" → 차단
  4. 유일한 탈출: Bash echo > config.json (OI-007 우회)
- **근본 원인**: hook들이 각자 독립적으로 차단만 하고, 복구 시나리오를 고려하지 않음
- **해결 방향**:
  - validate-pdca-before-teamdelete.sh에 **강제 종료 플래그** 추가: `FORCE_DELETE=true` 시 PDCA 검증 스킵
  - 또는 `.claude/teams/*/config.json` 경로를 validate-delegate.sh 허용 목록에 추가
  - 또는 `session-resume-check.sh`에서 config.json 없는 좀비 팀 자동 정리
- **우선순위**: 🔴 Critical — 리더가 작업 불가 상태에 빠짐
- **상태**: 🔴 Open

---

## 📊 통계 (2026-04-01 기준)

| 상태 | Critical | High | Medium | 총계 |
|------|:--------:|:----:|:------:|:----:|
| Open | 5 | 7 | 2 | 14 |
| Resolved | 1 | 1 | 4 | 6 |
| 총계 | 6 | 8 | 6 | 20 |

## 🏗️ 방어 아키텍처 (못 막으면 잡는다)

hook은 80%를 사전 차단. 나머지 20%는 크론 감시로 사후 감지.

```
[사전 차단 — hook 80%]
  PreToolUse:Bash      → 위험 명령, pane 접근, spawn 차단
  PreToolUse:Edit|Write → 역할 경계, Plan/Design 강제
  TaskCompleted         → Match Rate, Gap 분석, Slack 알림

[사후 감지 — 크론 20%]
  5분 크론:
    ① git log vs Slack 알림 대조 → 누락 감지 → Smith님 DM
    ② /tmp/chain-failed-*.marker 감지 → 재전송
    ③ /tmp/tc-*.marker vs Slack 대조 → 미보고 감지
    ④ teammate-registry.json 좀비 감지 → 정리 안내

  일일 크론:
    ⑤ runtime JSON 체크섬 검증 → 조작 감지
    ⑥ pdca-status.json vs git log → PDCA 상태 드리프트 감지
```

## 🔄 개선 우선순위

| 순위 | 이슈 | 작업 |
|:----:|------|------|
| 1 | OI-007 | bash-file-write-guard.sh 신규 hook |
| 2 | OI-008 | 크론 감시 + 실패 재시도 + 토큰 보호 |
| 3 | OI-010 | TaskCompleted hook 순서 변경 |
| 4 | OI-009 | MOCK_ 변수 프로덕션 차단 |
| 5 | OI-014 | 좀비 팀 복구 경로 + 강제 종료 플래그 |
| 6 | OI-012 | Track B pdca 스킵 로직 |
| 6 | OI-011, 013 | 체크섬 + 크론 fallback |
| 7 | OI-015 | COO→팀 메시지 시 TASK 강제 훅 |
| 8 | OI-016 | Smith→팀 직접 접근 COO 리다이렉트 |
| 9 | OI-017 | 체인 핸드오프 시 Plan/Design 게이트 |

---

## 업데이트 로그

- **2026-04-01**: 초기 문서 생성, 8건 이슈 등록
- **2026-04-01**: OI-007 추가 — Bash 파일 수정 우회 구멍 (11개 우회 패턴 목록화)
- **2026-04-01**: OI-008~013 추가 — Slack 우회, MOCK 변수, hook 순서, runtime 조작, stale state, 단일 장애점. 방어 아키텍처(80/20) 정의
- **2026-04-01**: OI-014 추가 — Hook 데드락 (좀비 팀 복구 경로 전부 차단, CTO 리더 실제 발생)
- **2026-04-01**: OI-015~017 추가 — T 단계 미강제(TASK 없이 팀 전달), Smith→팀 직접 접근 무게이팅, 체인 핸드오프 Plan/Design 미검증