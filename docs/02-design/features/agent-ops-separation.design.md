# Agent Ops 프로젝트 분리 설계서

> 작성일: 2026-03-25
> 설계자: CTO Lead
> Plan: docs/01-plan/features/agent-ops-separation.plan.md

## 1. 데이터 모델

Agent Ops는 bscamp DB를 직접 사용하지 않음. GCS JSON/JSONL로 상태 관리.

| 데이터 | 저장소 | 경로 |
|--------|--------|------|
| 팀 상태 | GCS | `agent-ops/{team}/state.json` |
| 체크포인트 | GCS | `agent-ops/{team}/checkpoint.json` |
| 소통 로그 | GCS | `agent-ops/logs/comm.jsonl` |
| 백그라운드 작업 | GCS | `agent-ops/background/tasks.json` |
| PDCA 상태 | GCS | `agent-ops/pdca-status.json` |
| 슬랙 로그 | GCS | `agent-ops/slack/events.jsonl` |

**DB 의존**: `profiles` 테이블 (admin role 확인용) — Firebase Auth UID 기반 조회 1건.

## 2. API 설계

### 새 프로젝트 라우트 구조
```
agent-ops/src/app/
├── api/
│   ├── dashboard/              ← (기존 agent-dashboard → dashboard)
│   │   ├── route.ts            GET: 전체 상태
│   │   ├── team/[teamId]/route.ts  GET/PUT: 팀 상세
│   │   ├── log/route.ts        GET/POST: 소통 로그
│   │   ├── background/[taskId]/route.ts  GET/PUT
│   │   └── slack/notify/route.ts  POST: 슬랙 알림
│   └── terminal/
│       ├── sessions/route.ts   GET: 세션 목록
│       ├── sessions/[id]/input/route.ts  POST
│       ├── sessions/[id]/history/route.ts  GET
│       └── slack-log/route.ts  GET
└── (main)/
    └── dashboard/
        ├── page.tsx            메인 (3탭: 대시보드/터미널/PDCA)
        └── components/         13 컴포넌트
```

## 3. 컴포넌트 구조

### 이동 + 경로 변경 맵
```
bscamp                                → agent-ops
─────────────────────────────────────────────────────
src/app/(main)/admin/agent-dashboard/  → src/app/(main)/dashboard/
src/app/(main)/admin/terminal/         → (삭제, dashboard 내 TerminalTab으로 통합)
src/app/api/agent-dashboard/           → src/app/api/dashboard/
src/app/api/terminal/                  → src/app/api/terminal/
src/types/agent-dashboard.ts           → src/types/dashboard.ts
src/types/web-terminal.ts              → src/types/terminal.ts
src/lib/slack-notifier.ts              → src/lib/slack-notifier.ts
src/lib/slack.ts                       → src/lib/slack.ts
src/lib/cross-team/checkpoint.ts       → src/lib/checkpoint.ts
src/lib/chain-detector.ts              → src/lib/chain-detector.ts
scripts/idle-detector.mjs              → scripts/idle-detector.mjs
scripts/chain-watcher.mjs              → scripts/chain-watcher.mjs
scripts/terminal-ws-server.mjs         → scripts/terminal-ws-server.mjs
scripts/lib/gcs-agent-ops.mjs          → scripts/lib/gcs.mjs
scripts/session-resume.mjs             → scripts/session-resume.mjs
```

### 공유 의존성 복제
```
bscamp                    → agent-ops (경량 복제)
────────────────────────────────────────────────
src/lib/db/index.ts       → src/lib/db.ts (profiles 조회용, 단순화)
src/lib/gcs-storage.ts    → src/lib/gcs.ts (agent-ops prefix 하드코딩)
src/lib/firebase/auth.ts  → src/lib/auth.ts (getCurrentUser만)
src/lib/firebase/admin.ts → src/lib/firebase-admin.ts
```

## 4. 에러 처리

기존과 동일 — API Route에서 401/403/500 응답.

## 5. 구현 순서

### Wave 1: 프로젝트 초기화 (backend-dev)
- [ ] `/Users/smith/projects/agent-ops/` 디렉토리 생성
- [ ] `npx create-next-app@latest agent-ops --typescript --tailwind --app --src-dir`
- [ ] package.json에 의존성 추가: `@xterm/xterm`, `@xterm/addon-fit`, `@slack/web-api`, `@google-cloud/storage`, `firebase-admin`
- [ ] tsconfig, tailwind.config 복사
- [ ] 공유 의존성 4파일 복제 + 경량화

### Wave 2: 코드 이동 (backend-dev)
- [ ] 타입 2파일 복사 + 경로 수정
- [ ] API 라우트 9파일 복사 + import 경로 수정
- [ ] lib 4파일 복사
- [ ] 스크립트 5파일 복사
- [ ] 페이지 + 컴포넌트 24파일 복사 + import 수정

### Wave 3: 빌드 검증
- [ ] `npx tsc --noEmit` — 에러 0
- [ ] `npm run build` — 성공
- [ ] localhost:3001에서 대시보드 동작 확인

### Wave 4: bscamp 정리 (별도 TASK)
- [ ] 분리된 52파일 삭제
- [ ] 사이드바 링크 외부 URL로 변경
- [ ] bscamp tsc + build 확인
