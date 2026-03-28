# agent-ops-dashboard (에이전트 운영 대시보드) Plan

> 작성일: 2026-03-28
> 요청자: Smith님
> 프로세스 레벨: L2 (독립 UI + 로컬 서버)
> 상태: Plan

---

## 1. 배경

Smith님은 비개발자로서 에이전트팀(PM, CTO)을 운영한다.
현재 작업 현황 파악 방법:

- tmux pane 전환해서 하나씩 확인
- TASK 파일 직접 열어서 체크박스 확인
- 모찌에게 "지금 뭐해?" 물어보기
- `.pdca-status.json` 직접 열기

**문제**: 전체 그림이 안 보인다. 메시지가 잘 갔는지, 팀원이 뭘 하고 있는지, PDCA가 어디까지 왔는지 한눈에 안 보임.

---

## 2. 기능 요약

브라우저에서 `localhost:3847`로 접속하는 **로컬 미션 컨트롤 대시보드**.

| 패널 | 보여주는 것 |
|------|------------|
| **PDCA 파이프라인** | 피처별 Plan→Design→Do→Check→Act 진행률 + Match Rate |
| **팀 현황** | PM팀/CTO팀 멤버 상태 (active/idle/terminated) + 현재 작업 |
| **메시지 흐름** | Smith→mozzi→팀 메시지 전달 현황 + ACK 상태 + broker 생존 상태 |
| **TASK 보드** | 칸반 (대기/진행중/완료) + 소유팀 + 체크박스 진행률 |
| **통신 로그** | 크로스팀 메시지 실시간 피드 (최근 50건) |
| **Broker 상태** | broker 프로세스 alive/dead + 경고 배너 (dead 시 재시작 안내) |

---

## 3. 데이터 소스 (전부 로컬 파일)

| 소스 | 경로 | 제공 정보 |
|------|------|----------|
| PDCA 상태 | `docs/.pdca-status.json` | 피처별 phase, matchRate, notes |
| TASK 파일 | `.claude/tasks/TASK-*.md` | 소유팀, 체크박스, 의존성 |
| 팀원 레지스트리 | `.claude/runtime/teammate-registry.json` | 팀원 상태, 모델, 시작/종료 시간 |
| 팀 컨텍스트 | `.claude/runtime/team-context.json` | 현재 활성 팀 |
| MCP 브로커 DB | `~/claude-peers-mcp/peers.db` (SQLite) | 메시지 이력, 배달 상태, ACK |
| MCP 브로커 Health | `http://localhost:7899/health` | 브로커 프로세스 생존 여부 |
| 감사 로그 | `.bkit/audit/*.jsonl` | PDCA 이벤트, hook 실행 이력 |
| 세션 이력 | `.bkit/state/session-history.json` | 세션 시작/종료, 팀 식별 |

모든 데이터가 로컬 파일 — 외부 API 호출 없음.

---

## 4. 범위

### In Scope
- 로컬 웹 서버 (Bun + Hono)
- 실시간 파일 감시 (fs.watch → WebSocket push)
- 읽기 전용 대시보드 (수정 기능 없음)
- `localhost:3847` 접속 (기본)
- **Cloudflare Tunnel로 외부 접근** — 폰/다른 PC에서 대시보드 실시간 확인
- **모바일 반응형** — 폰에서도 주요 패널 정상 표시
- **Broker health 모니터링** — broker 프로세스 다운 시 경고 배너
- 라이트 모드, 한국어 UI, Pretendard 폰트

### Out of Scope
- TASK 생성/수정 기능 (읽기만)
- 메시지 발송 기능 (모니터링만)
- GCP 배포 (Cloudflare Tunnel로 충분)

---

## 5. 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 런타임 | **Bun** | 이미 claude-peers-mcp에서 사용, SQLite 내장 |
| 서버 | **Hono** | 경량, Bun 네이티브, 파일 서빙 |
| 프론트 | **Preact + HTM** | 빌드 없이 CDN import, 번들러 불필요 |
| 실시간 | **WebSocket** | 파일 변경 즉시 push |
| DB 접근 | **bun:sqlite** | claude-peers-mcp broker DB 직접 쿼리 |
| 스타일 | **Tailwind CDN** | 빌드 없이 사용 |

> bscamp(Next.js)와 완전 분리. `tools/agent-dashboard/`에 독립 배치.
> `bun run tools/agent-dashboard/server.ts`로 실행.

---

## 6. 성공 기준 (테스트 시나리오)

### Happy Path
- 서버 시작 → `localhost:3847` 접속 → 5개 패널 정상 렌더링
- `.pdca-status.json` 수정 → 2초 내 대시보드 자동 갱신
- TASK 파일 체크박스 변경 → 칸반 보드 즉시 반영
- `send_message` 실행 → 통신 로그에 1초 내 표시
- 팀원 spawn/terminate → 팀 현황 패널 즉시 반영

### Edge Cases (P0)
- broker DB 파일 없음 (MCP 미설치) → 메시지 패널 "MCP 미설정" 표시, 나머지 정상
- **broker 프로세스 다운 (DB는 존재)** → 경고 배너 "broker 중단" + stale 데이터 표시 + 재시작 안내
- TASK 파일 0개 → 빈 칸반 + "TASK 없음" 표시
- teammate-registry.json 없음 → 팀 현황 "팀 미생성" 표시
- `.pdca-status.json` 파싱 실패 → 에러 표시, 크래시 안 함

### Edge Cases (P1)
- 동시 파일 변경 100건 → debounce로 묶어서 1회 갱신
- WebSocket 끊김 → 자동 재연결 (3초 간격)
- 브라우저 탭 비활성 → 재활성 시 전체 새로고침
- **Cloudflare Tunnel 끊김** → localhost 접근은 정상, 터널 재시작 안내
- **폰 접속 시 레이아웃** → 패널 세로 스택, 핵심 정보 우선 표시

### Mock Data
- `tools/agent-dashboard/__tests__/fixtures/mock-pdca-status.json`
- `tools/agent-dashboard/__tests__/fixtures/mock-tasks/TASK-SAMPLE.md`
- `tools/agent-dashboard/__tests__/fixtures/mock-registry.json`
- `tools/agent-dashboard/__tests__/fixtures/mock-peers.db`

---

## 7. 의존성

| 의존 | 상태 | 필수 여부 |
|------|------|----------|
| agent-team-operations (Wave 0~3) | 구현 대기 | **선택** — 없어도 PDCA/TASK 패널은 동작 |
| claude-peers-mcp | 미설치 | **선택** — 없으면 메시지 패널만 비활성 |
| Bun 런타임 | 미확인 | **필수** |
| `.pdca-status.json` | 있음 | **필수** |
| `.claude/tasks/` | 있음 | **필수** |
| cloudflared | **설치됨** (`/opt/homebrew/bin/cloudflared`) | **선택** — 없으면 localhost만 |

> 의존성이 없는 항목은 graceful degradation — 해당 패널만 비활성.

---

## 8. 파일 구조 (예상)

```
tools/agent-dashboard/
├── server.ts              ← Hono 서버 + WebSocket + 파일 watcher
├── routes/
│   ├── api.ts             ← REST API (/api/pdca, /api/tasks, /api/teams, /api/messages)
│   └── ws.ts              ← WebSocket 핸들러
├── public/
│   ├── index.html          ← SPA 진입점 (Preact + HTM)
│   ├── app.js              ← 메인 앱 컴포넌트
│   ├── components/
│   │   ├── pdca-pipeline.js   ← PDCA 파이프라인 패널
│   │   ├── team-status.js     ← 팀 현황 패널
│   │   ├── message-flow.js    ← 메시지 흐름 패널
│   │   ├── task-board.js      ← TASK 칸반 보드
│   │   └── comm-log.js        ← 통신 로그 패널
│   └── styles.css          ← Tailwind 커스텀 + 디자인 시스템
├── lib/
│   ├── file-watcher.ts     ← fs.watch 래퍼 (debounce)
│   ├── task-parser.ts      ← TASK.md frontmatter + 체크박스 파싱
│   ├── pdca-reader.ts      ← pdca-status.json 읽기
│   ├── registry-reader.ts  ← teammate-registry.json 읽기
│   └── broker-reader.ts    ← peers.db SQLite 쿼리
├── __tests__/
│   ├── task-parser.test.ts        ← 5건
│   ├── pdca-reader.test.ts        ← 4건
│   ├── broker-reader.test.ts      ← 4건
│   ├── registry-reader.test.ts    ← 3건
│   ├── file-watcher.test.ts       ← 3건
│   ├── api-integration.test.ts    ← 4건
│   ├── ws-integration.test.ts     ← 6건 (WS 실시간 push)
│   ├── broker-polling.test.ts     ← 6건 (DB 폴링 + health check)
│   ├── error-recovery.test.ts     ← 3건
│   └── fixtures/
├── package.json
└── README.md
```

---

## 9. 프로세스 레벨 판단

- src/ 수정: **없음** (tools/ 독립)
- DB 변경: **없음** (읽기 전용)
- 인프라: **없음** (로컬 전용)
- 그러나 UI 구현 + 서버 로직 포함 → **L2**

L2 요구사항:
- [x] plan.md 필수
- [ ] design.md 필수 → 아래 작성
- [ ] Gap 분석 + tsc + build → 구현 후
- [ ] Match Rate 90%+ → 구현 후
