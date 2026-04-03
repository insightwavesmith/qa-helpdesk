# Brick 통합 상태 보고서

> 분석일: 2026-04-03
> 분석 범위: Python Engine + Express API + React Frontend
> 분석자: brick-analyst (CTO 팀원)

## 1. Express API 라우트 현황

### 라우트 목록 (파일별)

#### block-types.ts (4개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 1 | GET | /api/brick/block-types | brickBlockTypes | ✅ 구현완료 |
| 2 | POST | /api/brick/block-types | brickBlockTypes | ✅ 구현완료 |
| 3 | PUT | /api/brick/block-types/:name | brickBlockTypes | ✅ 구현완료 |
| 4 | DELETE | /api/brick/block-types/:name | brickBlockTypes | ✅ 구현완료 |

#### teams.ts (10개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 5 | GET | /api/brick/teams | brickTeams | ✅ 구현완료 |
| 6 | POST | /api/brick/teams | brickTeams | ✅ 구현완료 |
| 7 | GET | /api/brick/teams/:id | brickTeams | ✅ 구현완료 |
| 8 | PUT | /api/brick/teams/:id | brickTeams | ✅ 구현완료 |
| 9 | DELETE | /api/brick/teams/:id | brickTeams | ✅ 구현완료 |
| 10 | GET | /api/brick/teams/:id/members | brickTeams (JSON field) | ✅ 구현완료 |
| 11 | PUT | /api/brick/teams/:id/skills | brickTeams | ✅ 구현완료 |
| 12 | GET | /api/brick/teams/:id/mcp | brickTeams (JSON field) | ✅ 구현완료 |
| 13 | PUT | /api/brick/teams/:id/model | brickTeams | ✅ 구현완료 |
| 14 | GET | /api/brick/teams/:id/status | brickTeams | ✅ 구현완료 |

#### links.ts (5개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 15 | GET | /api/brick/link-types | — (하드코딩 6종) | ✅ 구현완료 |
| 16 | GET | /api/brick/links?workflowId | brickLinks | ✅ 구현완료 |
| 17 | POST | /api/brick/links | brickLinks | ✅ 구현완료 (DAG 순환 검증 포함) |
| 18 | PUT | /api/brick/links/:id | brickLinks | ✅ 구현완료 |
| 19 | DELETE | /api/brick/links/:id | brickLinks | ✅ 구현완료 |

#### presets.ts (8개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 20 | GET | /api/brick/presets | brickPresets | ✅ 구현완료 |
| 21 | POST | /api/brick/presets | brickPresets | ✅ 구현완료 |
| 22 | GET | /api/brick/presets/:id | brickPresets | ✅ 구현완료 |
| 23 | PUT | /api/brick/presets/:id | brickPresets | ✅ 구현완료 (isCore 보호) |
| 24 | DELETE | /api/brick/presets/:id | brickPresets | ✅ 구현완료 (isCore 보호) |
| 25 | GET | /api/brick/presets/:id/export | brickPresets | ✅ 구현완료 |
| 26 | POST | /api/brick/presets/import | brickPresets | ✅ 구현완료 |
| 27 | POST | /api/brick/presets/:presetId/apply | brickPresets | ✅ 구현완료 |

#### executions.ts (5개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 28 | POST | /api/brick/executions | brickExecutions + brickExecutionLogs | ✅ 구현완료 (ThinkLog 발행) |
| 29 | POST | /api/brick/executions/:id/pause | brickExecutions + brickExecutionLogs | ✅ 구현완료 |
| 30 | GET | /api/brick/executions/:id | brickExecutions | ✅ 구현완료 |
| 31 | GET | /api/brick/executions/:id/logs | brickExecutionLogs | ✅ 구현완료 |
| 32 | POST | /api/brick/executions/:id/blocks/:blockId/complete | brickExecutions + brickExecutionLogs | ✅ 구현완료 |

#### workflows.ts (2개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 33 | POST | /api/brick/workflows/:workflowId/resume | brickExecutions + brickExecutionLogs | ✅ 구현완료 |
| 34 | POST | /api/brick/workflows/:workflowId/cancel | brickExecutions + brickExecutionLogs | ✅ 구현완료 |

#### gates.ts (2개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 35 | GET | /api/brick/gates/:gateId/result | brickGateResults | ✅ 구현완료 |
| 36 | POST | /api/brick/gates/:gateId/override | brickGateResults | ✅ 구현완료 |

#### learning.ts (3개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 37 | GET | /api/brick/learning/proposals | brickLearningProposals | ✅ 구현완료 |
| 38 | POST | /api/brick/learning/:id/approve | brickLearningProposals | ✅ 구현완료 |
| 39 | POST | /api/brick/learning/:id/reject | brickLearningProposals | ✅ 구현완료 |

#### system.ts (1개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 40 | GET | /api/brick/system/invariants | — | ⚠️ Placeholder (하드코딩 OK 응답, 실제 검증 없음) |

#### review.ts (2개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 41 | POST | /api/brick/review/:executionId/:blockId/approve | brickGateResults | ✅ 구현완료 |
| 42 | POST | /api/brick/review/:executionId/:blockId/reject | brickGateResults | ✅ 구현완료 |

#### notify.ts (1개)

| # | Method | Path | DB 테이블 | 상태 |
|---|--------|------|----------|------|
| 43 | POST | /api/brick/notify/test | — | ❌ Placeholder (console.log만, 실제 알림 발송 없음) |

#### websocket.ts (WebSocket)

| # | Protocol | Path | 상태 |
|---|----------|------|------|
| 44 | WS | /api/brick/ws | ⚠️ 부분구현 (연결/해제 동작하나, broadcast() 호출처 없음) |

### 요약
- 전체: **44개** (REST 43 + WebSocket 1)
- ✅ 구현완료: **40개**
- ⚠️ 부분구현: **2개** (system/invariants — placeholder, websocket — broadcast 미연결)
- ❌ stub/미구현: **1개** (notify/test — 실제 알림 로직 없음)
- 별도 유틸: executor.ts (ThinkLog 발행 + 블록 시작/완료 헬퍼)

---

## 2. Seed 연결 상태

### seed-brick.ts 분석
경로: `dashboard/server/db/seed-brick.ts`

내보내는 함수 4개:
- `seedBrickBlockTypes(db)` — 내장 블록 타입 10종 (plan, design, implement, test, review, deploy, monitor, rollback, custom, notify)
- `seedPdcaTeams(db)` — PDCA 팀 3개 (pm-team, cto-team, coo-team)
- `seedPdcaPresets(db)` — PDCA 프리셋 4개 (t-pdca-l0~l3)
- `seedAll(db)` — 위 3개 통합 호출

### seed.ts에서 호출 여부
경로: `dashboard/server/db/seed.ts`

seed.ts는 **seed-brick.ts를 import하지 않는다.** 완전히 독립적인 시드 파일이다.

seed.ts 시드 대상:
- `workflowChains` — PDCA 체인 12개 (DEV-L0~L3, OPS-L0~L2, MKT-L1~L2, BIZ-L1~L2 + default-pdca)
- `workflowSteps` — 체인별 스텝
- `agents` — 에이전트 7명
- `routines` — 반복작업 5개

### 연결 상태
❌ **미연결** — seed.ts에서 seed-brick.ts 함수를 호출하지 않음.

필요 조치:
```typescript
// seed.ts에 추가 필요
import { seedAll as seedBrick } from './seed-brick.js';

export function seed() {
  // 기존 시드 로직...
  
  // Brick 시드 추가
  seedBrick(db);
}
```

또는 앱 초기화 시 seed-brick.ts의 `seedAll()`을 별도로 호출하는 로직이 필요.

---

## 3. Python 엔진 ↔ Express API 연결

### 엔진 구조

```
brick/brick/
├── __init__.py
├── cli.py                  # CLI 진입점 (Python dashboard 기동)
├── adapters/               # 실행 어댑터 (8개)
│   ├── base.py             # TeamAdapter ABC
│   ├── claude_agent_teams.py  # Claude Agent Teams 연동
│   ├── claude_code.py      # Claude Code 직접 실행
│   ├── codex.py            # Codex 연동
│   ├── human.py            # 수동 실행
│   ├── human_management.py # 수동 관리
│   ├── management.py       # 관리 어댑터
│   ├── mcp_bridge.py       # claude-peers MCP 브릿지
│   └── webhook.py          # HTTP 웹훅 어댑터
├── engine/                 # 코어 엔진 (7개 모듈)
│   ├── state_machine.py    # 상태 머신
│   ├── executor.py         # 워크플로우 실행 + PresetLoader
│   ├── event_bus.py        # 이벤트 버스
│   ├── checkpoint.py       # 체크포인트 저장
│   ├── condition_evaluator.py # 조건 평가
│   ├── learning.py         # 학습 엔진
│   ├── lifecycle.py        # 라이프사이클 관리
│   ├── task_queue.py       # 태스크 큐
│   └── validator.py        # 유효성 검증
├── gates/                  # Gate 실행기
├── links/                  # Link 타입 구현 (순차/병렬/경쟁/분기/크론/반복)
├── models/                 # 데이터 모델 (Block, Link, Team, Workflow, Event)
├── presets/                # YAML 프리셋
├── schema/                 # JSON Schema
├── dashboard/              # **별도 FastAPI 대시보드** (Express와 독립)
│   ├── server.py           # FastAPI 앱 (/api/v1/* prefix)
│   ├── file_store.py       # 파일 기반 저장소
│   ├── validation_pipeline.py
│   ├── event_bridge.py
│   ├── routes/             # FastAPI 라우터
│   └── models/             # Pydantic 모델
└── tests/                  # 테스트 (28개 파일)
```

### 연결 방식
❌ **직접 연결 없음** — Python 엔진과 Express API는 완전히 독립된 두 시스템이다.

| 구성 요소 | 기술 스택 | API prefix | 저장소 | 포트 |
|-----------|----------|-----------|--------|------|
| Express Dashboard | Node.js + Express + Drizzle ORM | `/api/brick/*` | SQLite (better-sqlite3) | Next.js 서버 포트 |
| Python Dashboard | Python + FastAPI | `/api/v1/*` | 파일 시스템 (.bkit/) | 별도 포트 |
| Python Engine | Python (asyncio) | — | 메모리 + 체크포인트 파일 | — |

### 연결점 분석

1. **MCPBridge** (`adapters/mcp_bridge.py`): claude-peers broker (localhost:7899)를 통해 Claude 세션 간 메시지 전달. Express API와 무관.

2. **WebhookAdapter** (`adapters/webhook.py`): 임의 HTTP 엔드포인트로 웹훅 전송 가능. Express API를 타겟으로 설정하면 연결 가능하나, 현재 **설정된 URL 없음**.

3. **Python Dashboard** (`dashboard/server.py`): 자체 FastAPI 앱으로 Express Dashboard와 동일 도메인을 다루지만 **별도 프로세스, 별도 저장소**. 데이터 공유 없음.

4. **Express executor.ts** (`dashboard/server/brick/engine/executor.ts`): Express 내부의 블록 실행 유틸. Python 엔진과 무관한 별도 구현.

### 브릿지 필요 사항

Python 엔진 → Express API 연결을 위해 다음 중 하나가 필요:

1. **WebhookAdapter 설정**: Python 팀 어댑터에 Express API URL을 설정 (e.g., `http://localhost:3000/api/brick/executions`)
2. **Event Bridge 확장**: Python `event_bridge.py`가 Express WebSocket(`/api/brick/ws`)에 이벤트 전달
3. **공유 DB 레이어**: Python 엔진이 SQLite를 직접 읽거나, Express API를 HTTP 클라이언트로 호출

---

## 4. 프론트 Hooks ↔ API 매칭

### useBlockTypes.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 | 비고 |
|---|----------|---------|-----------|------|------|
| 1 | useBlockTypes | GET /api/brick/block-types | ✅ | ✅ | |
| 2 | useCreateBlockType | POST /api/brick/block-types | ✅ | ✅ | |
| 3 | useUpdateBlockType | PUT /api/brick/block-types/:id | ⚠️ | ⚠️ | Hook은 `:id`로 호출, 백엔드는 `:name` 파라미터 |
| 4 | useDeleteBlockType | DELETE /api/brick/block-types/:id | ⚠️ | ⚠️ | Hook은 `:id`로 호출, 백엔드는 `:name` 파라미터 |

### useTeams.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 | 비고 |
|---|----------|---------|-----------|------|------|
| 5 | useTeams | GET /api/brick/teams | ✅ | ✅ | |
| 6 | useCreateTeam | POST /api/brick/teams | ✅ | ✅ | |
| 7 | useDeleteTeam | DELETE /api/brick/teams/:id | ✅ | ✅ | |
| 8 | useTeamMembers | GET /api/brick/teams/:id/members | ✅ | ✅ | |
| 9 | useAddMember | POST /api/brick/teams/:id/members | ❌ | ❌ | **API 미존재** — 백엔드에 POST members 라우트 없음 |
| 10 | useRemoveMember | DELETE /api/brick/teams/:id/members/:memberId | ❌ | ❌ | **API 미존재** — 백엔드에 DELETE member 라우트 없음 |
| 11 | useUpdateSkill | PUT /api/brick/teams/:id/skills | ✅ | ✅ | |
| 12 | useConfigureMcp | PUT /api/brick/teams/:id/mcp | ❌ | ❌ | **API 미존재** — 백엔드는 GET만 있고 PUT 없음 |
| 13 | useSetModel | PUT /api/brick/teams/:id/model | ✅ | ✅ | |
| 14 | useTeamStatus | GET /api/brick/teams/:id/status | ✅ | ✅ | |

### useLinks.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 15 | useLinkTypes | GET /api/brick/link-types | ✅ | ✅ |
| 16 | useLinks | GET /api/brick/links?workflowId | ✅ | ✅ |
| 17 | useCreateLink | POST /api/brick/links | ✅ | ✅ |
| 18 | useUpdateLink | PUT /api/brick/links/:id | ✅ | ✅ |
| 19 | useDeleteLink | DELETE /api/brick/links/:id | ✅ | ✅ |

### usePresets.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 20 | usePresets | GET /api/brick/presets | ✅ | ✅ |
| 21 | useCreatePreset | POST /api/brick/presets | ✅ | ✅ |
| 22 | useExportPreset | GET /api/brick/presets/:id/export | ✅ | ✅ |
| 23 | useImportPreset | POST /api/brick/presets/import | ✅ | ✅ |
| 24 | useApplyPreset | POST /api/brick/presets/:presetId/apply | ✅ | ✅ |

### useExecutions.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 25 | useStartExecution | POST /api/brick/executions | ✅ | ✅ |
| 26 | usePauseExecution | POST /api/brick/executions/:id/pause | ✅ | ✅ |
| 27 | useResumeExecution | POST /api/brick/workflows/:workflowId/resume | ✅ | ✅ |
| 28 | useCancelExecution | POST /api/brick/workflows/:workflowId/cancel | ✅ | ✅ |
| 29 | useExecutionStatus | GET /api/brick/executions/:id | ✅ | ✅ |
| 30 | useExecutionLogs | GET /api/brick/executions/:id/logs | ✅ | ✅ |

### useGates.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 31 | useGateResult | GET /api/brick/gates/:gateId/result | ✅ | ✅ |
| 32 | useOverrideGate | POST /api/brick/gates/:gateId/override | ✅ | ✅ |

### useLearning.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 33 | useLearningProposals | GET /api/brick/learning/proposals | ✅ | ✅ |
| 34 | useApproveProposal | POST /api/brick/learning/:id/approve | ✅ | ✅ |
| 35 | useRejectProposal | POST /api/brick/learning/:id/reject | ✅ | ✅ |

### useSystem.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 36 | useInvariants | GET /api/brick/system/invariants | ✅ | ⚠️ Placeholder |

### useBrickLiveUpdates.ts

| # | Hook 함수 | 호출 API | 백엔드 존재 | 상태 |
|---|----------|---------|-----------|------|
| 37 | useBrickLiveUpdates | WS /api/brick/ws | ✅ | ⚠️ 연결 가능하나 서버→클라 이벤트 발행 미구현 |

### 불일치 목록

**Hook 있는데 API 없음 (3건):**
1. `useAddMember` → POST /api/brick/teams/:id/members — **라우트 미구현**
2. `useRemoveMember` → DELETE /api/brick/teams/:id/members/:memberId — **라우트 미구현**
3. `useConfigureMcp` → PUT /api/brick/teams/:id/mcp — **라우트 미구현** (GET만 존재)

**파라미터 불일치 (2건):**
4. `useUpdateBlockType` — Hook은 `id`로 호출, 백엔드는 `name` 파라미터
5. `useDeleteBlockType` — Hook은 `id`로 호출, 백엔드는 `name` 파라미터

**API 있는데 Hook 없음 (4건):**
1. PUT /api/brick/presets/:id — 프리셋 수정 API 존재하나 Hook 없음
2. DELETE /api/brick/presets/:id — 프리셋 삭제 API 존재하나 Hook 없음
3. PUT /api/brick/teams/:id — 팀 수정 API 존재하나 전체 수정 Hook 없음 (부분 수정 Hook만 존재)
4. POST /api/brick/notify/test — 알림 테스트 API 존재하나 Hook 없음

---

## 5. 종합 판정

### 통합 준비도

| 영역 | 상태 | 점수 |
|------|------|------|
| Express API | 43개 REST + 1 WS. 40/44 완전 구현 | ⭐⭐⭐⭐ (90%) |
| Seed 연결 | seed-brick.ts ↔ seed.ts 미연결 | ⭐⭐ (별도 호출 필요) |
| Python ↔ Express | **완전 미연결**. 두 독립 시스템 | ⭐ (브릿지 필요) |
| Frontend ↔ API | 37개 Hook 중 32개 정상 매칭 | ⭐⭐⭐⭐ (86%) |

### 우선 조치 사항

1. **[긴급] Hook ↔ API 불일치 수정 (3건)**
   - `POST /api/brick/teams/:id/members` 라우트 추가 (useAddMember 대응)
   - `DELETE /api/brick/teams/:id/members/:memberId` 라우트 추가 (useRemoveMember 대응)
   - `PUT /api/brick/teams/:id/mcp` 라우트 추가 (useConfigureMcp 대응)

2. **[긴급] 파라미터 불일치 수정 (2건)**
   - `useUpdateBlockType` — Hook에서 `:id` 대신 `:name` 사용하도록 수정, 또는 백엔드를 `:id` 기반으로 변경
   - `useDeleteBlockType` — 동일

3. **[중요] seed-brick.ts 연결**
   - seed.ts 또는 앱 초기화 시 `seedAll()` 호출 추가
   - 현재 Brick 테이블 시드가 실행되지 않으면 블록 타입/팀/프리셋이 비어있음

4. **[중요] WebSocket 이벤트 발행 연결**
   - `broadcast()` 함수는 존재하나, 실제 호출하는 코드 없음
   - 실행/게이트/팀 변경 시 broadcast 호출 추가 필요

5. **[중요] 시스템 불변식 실제 검증 구현**
   - `GET /api/brick/system/invariants`가 하드코딩 OK 반환
   - 실제 DB 정합성 검증 로직 필요

6. **[중요] 알림 시스템 실제 구현**
   - `POST /api/brick/notify/test`가 console.log만 수행
   - Slack/이메일 등 실제 알림 전송 로직 필요

7. **[장기] Python 엔진 ↔ Express API 브릿지**
   - 현재 두 시스템이 완전 독립. 최소한 WebhookAdapter로 Express API 호출하거나, EventBridge로 WebSocket 연결 필요
   - 또는 Python 엔진을 Express 엔진(executor.ts)으로 대체하는 방향 검토
