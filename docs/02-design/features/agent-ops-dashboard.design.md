# agent-ops-dashboard (에이전트 운영 대시보드) 설계서

> 작성일: 2026-03-28
> Plan: docs/01-plan/features/agent-ops-dashboard.plan.md
> 상태: Design
> 프로세스 레벨: L2
> 포트: localhost:3847

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트팀 미션 컨트롤 대시보드 — 로컬 웹 UI |
| **작성일** | 2026-03-28 |
| **파일 수** | 신규 ~15개 (tools/agent-dashboard/) |
| **핵심** | PDCA 파이프라인 + 팀 현황 + 메시지 흐름 + TASK 보드 + 통신 로그 |
| **스택** | Bun + Hono + Preact(HTM) + WebSocket + bun:sqlite |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 팀 상태/메시지/PDCA 진행률이 파일 열어야 보임. 전체 그림 파악 불가 |
| **Solution** | localhost:3847 접속 → 5개 패널 실시간 대시보드 |
| **Function UX Effect** | 브라우저 한 탭으로 전체 에이전트팀 운영 상황 실시간 모니터링 |
| **Core Value** | Smith님의 운영 가시성 확보 + 병목 즉시 발견 |

---

## 1. 데이터 모델

### 1-1. PDCA 상태 (docs/.pdca-status.json 그대로 사용)

```typescript
interface PdcaFeature {
  phase: 'plan' | 'designing' | 'implementing' | 'checking' | 'completed'
  plan: { team: string; done: boolean; doc: string; at: string | null }
  design: { team: string; done: boolean; doc: string; at: string | null }
  do: { team: string; done: boolean; commit: string | null; at: string | null }
  check: { team: string; done: boolean; doc: string; matchRate: number | null }
  act: { done: boolean; commit: string | null; deployedAt?: string | null }
  notes: string
  updatedAt: string
}

interface PdcaStatus {
  features: Record<string, PdcaFeature>
  updatedAt: string
  notes: string
}
```

### 1-2. TASK 파일 파싱 결과

```typescript
interface TaskFile {
  filename: string           // TASK-AGENT-TEAM-OPS.md
  frontmatter: {
    team: string             // PM | CTO
    session: string          // sdk-pm | sdk-cto
    created: string          // 2026-03-28
    status: 'pending' | 'in-progress' | 'completed' | 'blocked'
    owner: string            // leader | teammate-name
    dependsOn?: string[]
  }
  title: string              // # 제목
  checkboxes: {
    total: number
    checked: number
    items: { text: string; done: boolean }[]
  }
}
```

### 1-3. 팀원 레지스트리 (.claude/runtime/teammate-registry.json)

```typescript
interface TeammateEntry {
  agentId: string
  name: string
  role: string               // backend-dev | frontend-dev | qa-engineer
  model: string              // claude-opus-4-6 | claude-sonnet-4-6
  state: 'active' | 'shutting_down' | 'terminated'
  spawnedAt: string
  terminatedAt: string | null
  currentTask: string | null  // TASK 파일명
  paneId: string             // tmux pane ID
}

interface TeamRegistry {
  teamName: string
  members: TeammateEntry[]
  updatedAt: string
}
```

### 1-4. MCP 브로커 메시지 (peers.db SQLite)

```sql
-- claude-peers-mcp broker 테이블 (읽기 전용)
CREATE TABLE messages (
  id INTEGER PRIMARY KEY,
  from_id TEXT,           -- 'PM-LEAD' | 'CTO-LEAD' | 'MOZZI'
  to_id TEXT,             -- 수신자 peer ID
  channel TEXT,           -- 'bscamp-team/v1'
  body TEXT,              -- JSON: { type, payload, ack_required, ... }
  delivered INTEGER,      -- 0 | 1
  created_at TEXT,        -- ISO timestamp
  delivered_at TEXT
);

CREATE TABLE peers (
  id TEXT PRIMARY KEY,    -- peer ID
  summary TEXT,           -- set_summary 값
  last_seen TEXT
);
```

### 1-5. 대시보드 집계 타입

```typescript
interface DashboardState {
  pdca: PdcaStatus
  tasks: TaskFile[]
  teams: {
    pm: TeamRegistry | null
    cto: TeamRegistry | null
  }
  messages: {
    recent: BrokerMessage[]      // 최근 50건
    undelivered: number          // 미배달 건수
    pendingAck: BrokerMessage[]  // ACK 대기 중
  }
  lastUpdated: string
}
```

---

## 2. API 설계

### 2-1. REST API (Hono)

| Method | Endpoint | 응답 | 설명 |
|--------|----------|------|------|
| GET | `/api/pdca` | `PdcaStatus` | PDCA 전체 상태 |
| GET | `/api/tasks` | `TaskFile[]` | 전체 TASK 목록 (파싱됨) |
| GET | `/api/teams` | `{ pm, cto }` | 팀별 레지스트리 |
| GET | `/api/messages` | `{ recent, undelivered, pendingAck }` | 메시지 현황 |
| GET | `/api/dashboard` | `DashboardState` | 전체 통합 (초기 로드용) |
| GET | `/health` | `{ ok: true, uptime }` | 헬스체크 |

### 2-2. WebSocket (`/ws`)

서버 → 클라이언트 push:

```typescript
type WsEvent =
  | { type: 'pdca:updated'; data: PdcaStatus }
  | { type: 'task:updated'; data: TaskFile }
  | { type: 'task:created'; data: TaskFile }
  | { type: 'team:updated'; data: { team: string; registry: TeamRegistry } }
  | { type: 'message:new'; data: BrokerMessage }
  | { type: 'message:delivered'; data: { id: number } }
  | { type: 'full:refresh'; data: DashboardState }  // 재연결 시
```

파일 변경 → debounce 300ms → WebSocket push.

---

## 3. 컴포넌트 구조

### 3-0. 레이아웃

```
┌──────────────────────────────────────────────────────┐
│  🎯 에이전트 미션 컨트롤          [연결 상태] [갱신 시각]  │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─ PDCA 파이프라인 ─────────────────────────────┐  │
│  │ feature-1: [Plan ✅]→[Design ✅]→[Do 🔄]→...  │  │
│  │ feature-2: [Plan ✅]→[Design ⬜]→...           │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ 팀 현황 ──────────┐ ┌─ 메시지 흐름 ──────────┐  │
│  │ PM팀               │ │ Smith → mozzi ✅       │  │
│  │  ├ PM리더: active   │ │ mozzi → PM리더 ✅ ACK  │  │
│  │  ├ researcher: idle │ │ mozzi → CTO리더 ⏳     │  │
│  │ CTO팀              │ │ PM → CTO: 핸드오프 ✅   │  │
│  │  ├ CTO리더: active  │ │                        │  │
│  │  ├ backend: active  │ │ 미배달: 0건             │  │
│  │  └ qa: terminated   │ │ ACK대기: 1건            │  │
│  └────────────────────┘ └────────────────────────┘  │
│                                                      │
│  ┌─ TASK 보드 ───────────────────────────────────┐  │
│  │ 대기(3)      │ 진행중(2)     │ 완료(5)        │  │
│  │ ┌─────────┐ │ ┌─────────┐  │ ┌─────────┐   │  │
│  │ │TASK-OPS │ │ │TASK-MCP │  │ │TASK-CLEAN│   │  │
│  │ │PM ██░░░ │ │ │CTO █████│  │ │CTO ✅    │   │  │
│  │ └─────────┘ │ └─────────┘  │ └─────────┘   │  │
│  └───────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ 통신 로그 (최근) ────────────────────────────┐  │
│  │ 19:35 PM→CTO  TASK_HANDOFF  "TASK-MCP-..." ✅ │  │
│  │ 19:34 CTO→PM  COMPLETION    "Wave 1 완료"  ✅ │  │
│  │ 19:30 PM→MOZ  STATUS        "Design 확정"  ✅ │  │
│  └───────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 3-1. PdcaPipeline (pdca-pipeline.js)

피처별 가로 파이프라인 바.

```
Props: { features: Record<string, PdcaFeature> }

각 피처 → 5단계 노드 (Plan→Design→Do→Check→Act)
- 완료: ✅ 초록 배경
- 진행중: 🔄 주황 배경 + 펄스 애니메이션
- 대기: ⬜ 회색
- Check 단계: matchRate 표시 (90%+ 초록, 미만 빨강)
```

### 3-2. TeamStatus (team-status.js)

팀별 트리 구조.

```
Props: { pm: TeamRegistry | null, cto: TeamRegistry | null }

각 팀원:
- active: 🟢 + 현재 TASK 표시
- idle: 🟡
- shutting_down: 🟠
- terminated: ⚫
- 모델 뱃지: Opus(보라) / Sonnet(파랑)
```

### 3-3. MessageFlow (message-flow.js)

방향 그래프로 메시지 전달 시각화.

```
Props: { recent: BrokerMessage[], undelivered: number, pendingAck: BrokerMessage[] }

노드: Smith, mozzi, PM리더, CTO리더
엣지: 메시지 방향 + 상태
- 전달완료: 실선 초록
- 미배달: 점선 빨강
- ACK 대기: 점선 주황

상단 요약:
- 미배달 N건 (빨간 뱃지)
- ACK 대기 N건 (주황 뱃지)
```

### 3-4. TaskBoard (task-board.js)

3열 칸반 보드.

```
Props: { tasks: TaskFile[] }

열 분류:
- 대기: status === 'pending'
- 진행중: status === 'in-progress'
- 완료: status === 'completed'

카드:
- 제목 (TASK명)
- 소유팀 뱃지 (PM/CTO)
- 체크박스 진행률 바 (checked/total)
- 의존성 표시 (dependsOn → 화살표)
```

### 3-5. CommLog (comm-log.js)

실시간 메시지 피드 (최근 50건).

```
Props: { messages: BrokerMessage[] }

각 행:
- 시각 (HH:MM)
- 발신→수신
- 메시지 타입 뱃지 (TASK_HANDOFF/COMPLETION/URGENT/...)
- 내용 요약 (body.payload.notes 앞 50자)
- 배달 상태 아이콘
```

---

## 4. 에러 처리

| 상황 | 처리 |
|------|------|
| broker DB 없음 | 메시지 패널 "MCP 미설치 — 메시지 모니터링 비활성" |
| registry 없음 | 팀 현황 패널 "팀 미생성" |
| TASK 파일 0개 | 빈 칸반 + "진행 중인 TASK 없음" |
| pdca-status.json 파싱 실패 | PDCA 패널 에러 표시 |
| WebSocket 끊김 | 헤더에 "연결 끊김 🔴" + 3초 자동 재연결 |
| 파일 watcher 에러 | 10초 후 재시작, 실패 시 폴링 모드 전환 (5초 간격) |
| 포트 3847 사용중 | 시작 시 에러 메시지 + 대안 포트 제시 |

---

## 5. 구현 순서 체크리스트

### Wave 1: 서버 + 데이터 리더 (기반)

```
□ W1-1: tools/agent-dashboard/ 디렉토리 + package.json + tsconfig
□ W1-2: lib/pdca-reader.ts — pdca-status.json 파싱
□ W1-3: lib/task-parser.ts — TASK.md frontmatter + 체크박스 파싱
□ W1-4: lib/registry-reader.ts — teammate-registry.json 읽기
□ W1-5: lib/broker-reader.ts — peers.db SQLite 쿼리 (없으면 null 반환)
□ W1-6: lib/file-watcher.ts — fs.watch 래퍼 (debounce 300ms)
□ W1-7: server.ts — Hono 서버 + REST API 5개 + 정적 파일 서빙
□ W1-8: routes/ws.ts — WebSocket 핸들러 + 파일 watcher 연동
```

### Wave 2: 프론트엔드 (UI)

```
□ W2-1: public/index.html — Preact+HTM CDN, Tailwind CDN, 레이아웃 쉘
□ W2-2: public/app.js — WebSocket 연결 + 상태 관리 + 라우팅
□ W2-3: public/components/pdca-pipeline.js — 파이프라인 시각화
□ W2-4: public/components/team-status.js — 팀원 트리
□ W2-5: public/components/message-flow.js — 메시지 방향 그래프
□ W2-6: public/components/task-board.js — 칸반 보드
□ W2-7: public/components/comm-log.js — 통신 로그 피드
□ W2-8: public/styles.css — 디자인 시스템 (#F75D5D, Pretendard)
```

### Wave 3: 검증

```
□ W3-1: TDD 테스트 (아래 섹션 6)
□ W3-2: mock 데이터로 전체 UI 스크린샷 확인
□ W3-3: 실제 프로젝트 데이터로 E2E 확인
□ W3-4: Gap 분석 → docs/03-analysis/agent-ops-dashboard.analysis.md
```

---

## 6. TDD 테스트 설계

### 6-1. task-parser.test.ts (5건)

```typescript
// TP-1: YAML frontmatter 정상 파싱
test('YAML frontmatter에서 team, status, owner 추출', () => {
  const result = parseTask(MOCK_TASK_MD)
  expect(result.frontmatter.team).toBe('CTO')
  expect(result.frontmatter.status).toBe('pending')
})

// TP-2: 체크박스 카운트
test('체크박스 total/checked 정확히 카운트', () => {
  const result = parseTask(MOCK_TASK_WITH_CHECKBOXES)
  expect(result.checkboxes.total).toBe(10)
  expect(result.checkboxes.checked).toBe(6)
})

// TP-3: frontmatter 없는 파일
test('frontmatter 없는 TASK → 기본값 반환', () => {
  const result = parseTask('# 제목만 있는 파일\n내용')
  expect(result.frontmatter.team).toBe('unknown')
})

// TP-4: dependsOn 배열 파싱
test('dependsOn YAML 배열 파싱', () => {
  const result = parseTask(MOCK_TASK_WITH_DEPS)
  expect(result.frontmatter.dependsOn).toEqual(['TASK-A', 'TASK-B'])
})

// TP-5: 빈 파일
test('빈 파일 → 에러 없이 빈 결과', () => {
  const result = parseTask('')
  expect(result.title).toBe('')
  expect(result.checkboxes.total).toBe(0)
})
```

### 6-2. pdca-reader.test.ts (4건)

```typescript
// PR-1: 정상 파싱
test('pdca-status.json 정상 파싱 → PdcaStatus 타입', () => {
  const status = readPdcaStatus(MOCK_PDCA_PATH)
  expect(status.features['agent-team-operations'].phase).toBe('implementing')
})

// PR-2: 파일 없음
test('파일 없음 → null 반환 (크래시 아님)', () => {
  const status = readPdcaStatus('/nonexistent/path.json')
  expect(status).toBeNull()
})

// PR-3: 잘못된 JSON
test('잘못된 JSON → null + 에러 로그', () => {
  const status = readPdcaStatus(MOCK_INVALID_JSON_PATH)
  expect(status).toBeNull()
})

// PR-4: matchRate 숫자 검증
test('matchRate가 숫자면 그대로, null이면 null', () => {
  const status = readPdcaStatus(MOCK_PDCA_PATH)
  const feat = status!.features['slack-notification']
  expect(feat.check.matchRate).toBeNull()
})
```

### 6-3. broker-reader.test.ts (4건)

```typescript
// BR-1: 최근 메시지 50건 조회
test('최근 메시지 50건 DESC 정렬', () => {
  const msgs = getRecentMessages(MOCK_DB_PATH, 50)
  expect(msgs.length).toBeLessThanOrEqual(50)
  expect(msgs[0].created_at >= msgs[1].created_at).toBe(true)
})

// BR-2: 미배달 건수
test('delivered=0인 메시지 카운트', () => {
  const count = getUndeliveredCount(MOCK_DB_PATH)
  expect(count).toBeGreaterThanOrEqual(0)
})

// BR-3: DB 파일 없음
test('peers.db 없음 → null (크래시 아님)', () => {
  const msgs = getRecentMessages('/nonexistent/peers.db', 50)
  expect(msgs).toBeNull()
})

// BR-4: ACK 대기 메시지
test('ack_required=true + delivered=1 + ack 없는 메시지 필터', () => {
  const pending = getPendingAckMessages(MOCK_DB_PATH)
  pending?.forEach(m => {
    const body = JSON.parse(m.body)
    expect(body.ack_required).toBe(true)
  })
})
```

### 6-4. file-watcher.test.ts (3건)

```typescript
// FW-1: 파일 변경 감지
test('파일 수정 → onChange 콜백 호출', async () => {
  const onChange = vi.fn()
  const watcher = createFileWatcher(tmpDir, onChange)
  writeFileSync(join(tmpDir, 'test.json'), '{}')
  await sleep(500)
  expect(onChange).toHaveBeenCalled()
  watcher.close()
})

// FW-2: debounce 동작
test('300ms 내 5회 변경 → 콜백 1회만', async () => {
  const onChange = vi.fn()
  const watcher = createFileWatcher(tmpDir, onChange, { debounce: 300 })
  for (let i = 0; i < 5; i++) writeFileSync(join(tmpDir, 'test.json'), `${i}`)
  await sleep(500)
  expect(onChange).toHaveBeenCalledTimes(1)
  watcher.close()
})

// FW-3: 존재하지 않는 경로
test('없는 경로 → 에러 없이 null 반환', () => {
  const watcher = createFileWatcher('/nonexistent/path', vi.fn())
  expect(watcher).toBeNull()
})
```

### 6-5. API 통합 테스트 (4건)

```typescript
// API-1: /api/dashboard 전체 반환
test('GET /api/dashboard → DashboardState 구조', async () => {
  const res = await app.request('/api/dashboard')
  const data = await res.json()
  expect(data).toHaveProperty('pdca')
  expect(data).toHaveProperty('tasks')
  expect(data).toHaveProperty('teams')
  expect(data).toHaveProperty('messages')
})

// API-2: /api/tasks TASK 파싱 결과
test('GET /api/tasks → TaskFile[] 배열', async () => {
  const res = await app.request('/api/tasks')
  const tasks = await res.json()
  expect(Array.isArray(tasks)).toBe(true)
})

// API-3: /health 응답
test('GET /health → { ok: true }', async () => {
  const res = await app.request('/health')
  expect(res.status).toBe(200)
})

// API-4: broker 없을 때 messages null
test('broker DB 없으면 messages 필드 null', async () => {
  const res = await app.request('/api/messages')
  const data = await res.json()
  // broker 미설치 환경에서는 null
  expect(data.recent === null || Array.isArray(data.recent)).toBe(true)
})
```

### 커버리지 요약

| 테스트 파일 | 건수 | Wave |
|------------|:----:|:----:|
| task-parser.test.ts | 5 | 1 |
| pdca-reader.test.ts | 4 | 1 |
| broker-reader.test.ts | 4 | 1 |
| file-watcher.test.ts | 3 | 1 |
| api-integration.test.ts | 4 | 2 |
| **합계** | **20** | |

---

## 7. 디자인 시스템 적용

| 항목 | 값 |
|------|-----|
| Primary | `#F75D5D` (진행중 뱃지, 액센트) |
| Hover | `#E54949` |
| 성공 | `#22C55E` (완료, 전달완료) |
| 경고 | `#F59E0B` (ACK 대기, idle) |
| 에러 | `#EF4444` (미배달, 실패) |
| 배경 | `#FFFFFF` (라이트 모드) |
| 카드 배경 | `#F9FAFB` |
| 폰트 | Pretendard |
| 모서리 | `rounded-lg` (8px) |
| 그림자 | `shadow-sm` |

---

## 8. 실행 방법

```bash
# 설치
cd tools/agent-dashboard
bun install

# 실행
bun run server.ts
# → http://localhost:3847

# 개발 모드 (hot reload)
bun --watch run server.ts
```

### 환경변수 (선택)

```bash
DASHBOARD_PORT=3847                              # 기본 포트
BSCAMP_ROOT=/Users/smith/projects/bscamp         # 프로젝트 루트
BROKER_DB_PATH=~/claude-peers-mcp/peers.db       # MCP 브로커 DB
```

설정 안 하면 자동 감지 (cwd 기반).

---

## 9. 변경점

| 일자 | 내용 |
|------|------|
| 2026-03-28 | 초안 작성 — Plan + Design 동시 |
