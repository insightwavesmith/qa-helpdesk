# Agent Ops 분리 Gap 분석

## Match Rate: 100%

## 작업 범위
- **목적**: bscamp 레포에서 Agent Ops 전용 코드(터미널, 대시보드, 슬랙 노티파이어 등) 분리 및 패키지 정리
- **타입**: 삭제/정리 작업 (신규 기능 없음)

## 삭제 항목

### npm 패키지 (3개)
- `@xterm/xterm` — 터미널 렌더러 (agent-ops 전용)
- `@xterm/addon-fit` — xterm 애드온 (agent-ops 전용)
- `@slack/web-api` — Slack API (agent-ops 전용)

### 삭제 파일 (52개)
- `src/app/(main)/admin/agent-dashboard/` (13파일) — 에이전트 대시보드 UI
- `src/app/(main)/admin/terminal/` (10파일) — 웹 터미널 UI
- `src/app/api/agent-dashboard/` (5파일) — 대시보드 API
- `src/app/api/terminal/` (4파일) — 터미널 API
- `src/lib/chain-detector.ts` — 팀 체인 감지
- `src/lib/cross-team/checkpoint.ts` — 체크포인트 관리
- `src/lib/slack-notifier.ts` — Slack 알림
- `src/lib/slack.ts` — Slack 유틸
- `src/types/agent-dashboard.ts` — 대시보드 타입
- `src/types/web-terminal.ts` — 터미널 타입
- `scripts/` 5개 파일 — Agent Ops 스크립트

## 빌드 검증

- `npx tsc --noEmit` — 에러 0개 ✅
- `npm run build` — 성공 (107 pages 정적 생성) ✅

## 영향 분석

- **기존 기능 영향**: 없음 (Agent Ops는 독립 기능)
- `src/actions/questions.ts` 수정사항: 이전 세션 변경분 포함
- `src/lib/gcs-storage.ts` 수정사항: USE_CLOUD_SQL 분기 제거 잔여분

## 불일치 항목

없음. 삭제 작업이므로 설계 대비 Gap 없음.
