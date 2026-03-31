# TASK: Agent Harness v2 구현

## Plan/Design 문서
- Plan: `/Users/smith/projects/bscamp/docs/01-plan/features/agent-harness-v2.plan.md`
- Design: `/Users/smith/projects/bscamp/docs/02-design/features/agent-harness-v2.design.md`

## 구현 Feature (3개, 병렬 가능)

### Feature 1: living-context
- `.bkit/hooks/helpers/living-context-loader.sh` 신규 작성
- `.bkit/hooks/session-resume-check.sh` 수정 (Living Context 호출 추가)
- 세션 시작 시 PDCA 단계별 상류 문서 자동 로딩

### Feature 2: coo-harness
- `.bkit/hooks/helpers/coo-watchdog.sh` 신규 작성
- `.bkit/hooks/notify-completion.sh` 신규 작성 (Slack 알림)
- `.bkit/runtime/coo-state.json`, `coo-ack/`, `smith-report/`, `coo-answers/` 디렉토리 구조 생성
- COO ACK 5분 / 보고 15분 타임아웃 감시

### Feature 3: agent-dashboard-v2
- 기존 목업(`docs/mockups/dashboard.html`) 기반
- task-state JSON 연동, COO 게이트 상태, claude-peers 연결 상태 추가

## 완료 기준
- `living-context-loader.sh` 실행 시 context 파일 ≥ 4개 출력
- `notify-completion.sh` 실행 시 Slack API 200 응답
- `coo-watchdog.sh` 실행 시 타임아웃 감지 동작 확인
- 대시보드 목업 HTML 업데이트

## 완료 후
Plan/Design 대로 구현됐는지 Gap 분석 후 모찌(COO)한테 체인 보고.

## COO 의견
COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
Feature 1, 2 병렬로 팀원 나눠서 진행해도 됨.
