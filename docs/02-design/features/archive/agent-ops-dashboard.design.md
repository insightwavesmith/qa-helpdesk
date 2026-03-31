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
    brokerStatus: 'alive' | 'dead' | 'not_installed'  // broker /health 체크 결과
    brokerWarning?: string       // dead일 때 경고 메시지
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
  | { type: 'broker:status'; data: { status: 'alive' | 'dead' | 'not_installed'; warning?: string } }
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
| broker 프로세스 다운 | DB 존재 + `/health` 실패 → 경고 배너 "⚠ broker 프로세스 중단 — 새 메시지 수신 불가. 재시작: `bun ~/claude-peers-mcp/broker.ts`" + 메시지 패널은 기존 DB 데이터 표시 (stale 뱃지) |
| registry 없음 | 팀 현황 패널 "팀 미생성" |
| TASK 파일 0개 | 빈 칸반 + "진행 중인 TASK 없음" |
| pdca-status.json 파싱 실패 | PDCA 패널 에러 표시 |
| WebSocket 끊김 | 헤더에 "연결 끊김 🔴" + 3초 자동 재연결 |
| 파일 watcher 에러 | 10초 후 재시작, 실패 시 폴링 모드 전환 (5초 간격) |
| 포트 3847 사용중 | 시작 시 에러 메시지 + 대안 포트 제시 |
| Cloudflare Tunnel 끊김 | localhost 접속은 정상 유지 + 콘솔에 "터널 재연결 중..." 로그 |
| 외부 접속 시 인증 실패 | 401 + Basic Auth 프롬프트 (TUNNEL_AUTH 설정 시) |

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

### 6-6. registry-reader.test.ts (3건)

```typescript
// RR-1: 정상 파싱
test('teammate-registry.json 파싱 → TeamRegistry 타입', () => {
  const registry = readTeamRegistry(MOCK_REGISTRY_PATH)
  expect(registry!.teamName).toBe('CTO')
  expect(registry!.members).toHaveLength(3)
  expect(registry!.members[0]).toHaveProperty('state')
  expect(registry!.members[0]).toHaveProperty('paneId')
})

// RR-2: 파일 없음
test('registry 파일 없음 → null (크래시 아님)', () => {
  const registry = readTeamRegistry('/nonexistent/registry.json')
  expect(registry).toBeNull()
})

// RR-3: 팀원 state 분류 카운트
test('active/terminated/shutting_down 상태별 카운트 정확', () => {
  const registry = readTeamRegistry(MOCK_REGISTRY_MIXED_PATH)
  const states = registry!.members.map(m => m.state)
  expect(states.filter(s => s === 'active').length).toBe(2)
  expect(states.filter(s => s === 'terminated').length).toBe(1)
})
```

### 6-7. ws-integration.test.ts (6건) — WebSocket 실시간 push

```typescript
// WS-1: 연결 시 full:refresh 초기 데이터 수신
test('WebSocket 연결 → full:refresh 이벤트 + DashboardState 구조', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  const msg = await waitForMessage(ws)
  const event = JSON.parse(msg)
  expect(event.type).toBe('full:refresh')
  expect(event.data).toHaveProperty('pdca')
  expect(event.data).toHaveProperty('tasks')
  expect(event.data).toHaveProperty('teams')
  expect(event.data).toHaveProperty('messages')
  ws.close()
})

// WS-2: pdca-status.json 변경 → pdca:updated push
test('pdca-status.json 수정 → WS pdca:updated 이벤트', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws) // full:refresh 소비

  // 파일 변경 트리거
  const pdca = JSON.parse(readFileSync(PDCA_PATH, 'utf-8'))
  pdca.updatedAt = new Date().toISOString()
  writeFileSync(PDCA_PATH, JSON.stringify(pdca, null, 2))

  const msg = await waitForMessage(ws, 1000) // debounce 300ms + 여유
  const event = JSON.parse(msg)
  expect(event.type).toBe('pdca:updated')
  expect(event.data).toHaveProperty('features')
  ws.close()
})

// WS-3: TASK 파일 변경 → task:updated push
test('TASK .md 파일 수정 → WS task:updated 이벤트', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  appendFileSync(MOCK_TASK_PATH, '\n- [ ] 추가 항목')

  const msg = await waitForMessage(ws, 1000)
  const event = JSON.parse(msg)
  expect(event.type).toBe('task:updated')
  expect(event.data).toHaveProperty('checkboxes')
  ws.close()
})

// WS-4: registry 변경 → team:updated push
test('teammate-registry.json 수정 → WS team:updated 이벤트', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  const reg = JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'))
  reg.members[0].state = 'terminated'
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2))

  const msg = await waitForMessage(ws, 1000)
  const event = JSON.parse(msg)
  expect(event.type).toBe('team:updated')
  ws.close()
})

// WS-5: debounce — 300ms 내 5회 변경 → WS event 1회
test('300ms 내 파일 5회 변경 → WS push 1회만', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  const events: string[] = []
  ws.onmessage = (e) => events.push(e.data)

  for (let i = 0; i < 5; i++) {
    const pdca = JSON.parse(readFileSync(PDCA_PATH, 'utf-8'))
    pdca.notes = `change-${i}`
    writeFileSync(PDCA_PATH, JSON.stringify(pdca, null, 2))
  }

  await sleep(800) // debounce 300ms + 여유
  expect(events.length).toBe(1) // 5회 변경 → 1회 push
  ws.close()
})

// WS-6: 연결 끊김 → 재연결 → full:refresh
test('서버 재시작 후 클라이언트 재연결 → full:refresh', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  // 서버 측 연결 강제 종료 시뮬레이션
  ws.close()
  const ws2 = new WebSocket('ws://localhost:3847/ws')
  const msg = await waitForMessage(ws2)
  const event = JSON.parse(msg)
  expect(event.type).toBe('full:refresh')
  ws2.close()
})
```

### 6-8. broker-polling.test.ts (4건) — 브로커 DB 폴링 → WS push 연동

```typescript
// BP-1: 브로커 DB에 새 메시지 → message:new WS event
test('broker DB INSERT → WS message:new 이벤트', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws) // full:refresh 소비

  // broker DB에 직접 INSERT (테스트용)
  const db = new Database(BROKER_DB_PATH)
  db.run(`INSERT INTO messages (from_id, to_id, channel, body, delivered, created_at)
          VALUES ('PM-LEAD', 'CTO-LEAD', 'bscamp-team/v1',
          '{"type":"TASK_HANDOFF","payload":{"task":"TASK-TEST"}}', 0, datetime('now'))`)
  db.close()

  const msg = await waitForMessage(ws, 2000) // 폴링 간격 1초 + 여유
  const event = JSON.parse(msg)
  expect(event.type).toBe('message:new')
  expect(JSON.parse(event.data.body).type).toBe('TASK_HANDOFF')
  ws.close()
})

// BP-2: 메시지 delivered 마킹 → message:delivered WS event
test('broker DB delivered=1 마킹 → WS message:delivered 이벤트', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  const db = new Database(BROKER_DB_PATH)
  db.run(`INSERT INTO messages (from_id, to_id, channel, body, delivered, created_at)
          VALUES ('CTO-LEAD', 'PM-LEAD', 'bscamp-team/v1', '{"type":"ACK"}', 0, datetime('now'))`)
  const { id } = db.prepare('SELECT last_insert_rowid() as id').get() as any
  await sleep(1500)
  await waitForMessage(ws, 500) // message:new 소비

  db.run(`UPDATE messages SET delivered=1, delivered_at=datetime('now') WHERE id=?`, id)
  db.close()

  const msg = await waitForMessage(ws, 2000)
  const event = JSON.parse(msg)
  expect(event.type).toBe('message:delivered')
  expect(event.data.id).toBe(id)
  ws.close()
})

// BP-3: 폴링 중 DB 파일 삭제 → graceful 에러
test('broker DB 삭제 → 메시지 패널 null (크래시 아님)', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  await waitForMessage(ws)

  renameSync(BROKER_DB_PATH, BROKER_DB_PATH + '.bak')
  await sleep(2000) // 폴링 1~2회

  const res = await fetch('http://localhost:3847/api/messages')
  const data = await res.json()
  expect(data.recent).toBeNull()

  renameSync(BROKER_DB_PATH + '.bak', BROKER_DB_PATH) // 복원
  ws.close()
})

// BP-4: CC↔CC 메시지와 OpenClaw 메시지 구분
test('from_id 기반 발신자 역할 표시 (PM/CTO/MOZZI)', async () => {
  const db = new Database(BROKER_DB_PATH)
  db.run(`INSERT INTO messages (from_id, to_id, channel, body, delivered, created_at)
          VALUES ('MOZZI-abc', 'PM-LEAD', 'bscamp-team/v1',
          '{"type":"FEEDBACK","payload":{"text":"검토완료"}}', 1, datetime('now'))`)
  db.close()

  const res = await fetch('http://localhost:3847/api/messages')
  const data = await res.json()
  const mozziMsg = data.recent.find((m: any) => m.from_id.startsWith('MOZZI'))
  expect(mozziMsg).toBeDefined()
})

// BP-5: broker alive → 메시지 패널 정상 (brokerStatus: 'alive')
test('broker /health 응답 정상 → brokerStatus alive + 경고 없음', async () => {
  // broker가 localhost:7899에서 정상 응답하는 상태
  const res = await fetch('http://localhost:3847/api/dashboard')
  const data = await res.json()
  expect(data.messages.brokerStatus).toBe('alive')
  expect(data.messages.brokerWarning).toBeUndefined()
  expect(data.messages.recent).not.toBeNull()
})

// BP-6: broker dead → 경고 배너 + stale 데이터 표시
test('broker /health 실패 (프로세스 다운) → brokerStatus dead + 경고 메시지', async () => {
  // broker 프로세스 종료 시뮬레이션 (DB 파일은 그대로 남아있음)
  // 대시보드 서버가 localhost:7899/health fetch 실패 → dead 판정
  const originalBrokerUrl = process.env.BROKER_HEALTH_URL
  process.env.BROKER_HEALTH_URL = 'http://127.0.0.1:19999/health' // 존재하지 않는 포트

  try {
    const res = await fetch('http://localhost:3847/api/dashboard')
    const data = await res.json()
    expect(data.messages.brokerStatus).toBe('dead')
    expect(data.messages.brokerWarning).toContain('broker')
    // DB 데이터는 여전히 읽을 수 있어야 함 (stale)
    expect(data.messages.recent === null || Array.isArray(data.messages.recent)).toBe(true)
  } finally {
    process.env.BROKER_HEALTH_URL = originalBrokerUrl
  }
})
```

### 6-9. error-recovery.test.ts (3건) — 에러 복구 (섹션 4 커버)

```typescript
// ER-1: file watcher 에러 → 폴링 모드 전환
test('watcher 에러 발생 → 5초 폴링으로 폴백', async () => {
  const onFallback = vi.fn()
  const watcher = createFileWatcher(tmpDir, vi.fn(), {
    debounce: 300,
    onFallbackToPolling: onFallback,
  })

  // watcher 내부 에러 강제 발생 (권한 변경 등)
  watcher!.emit('error', new Error('EPERM'))
  await sleep(11000) // 10초 후 재시작 시도

  expect(onFallback).toHaveBeenCalled()
  watcher!.close()
})

// ER-2: partial JSON write → 마지막 유효값 유지
test('pdca-status.json partial write → 이전 값 유지 (깨진 JSON 무시)', async () => {
  const ws = new WebSocket('ws://localhost:3847/ws')
  const initial = await waitForMessage(ws)
  const initialData = JSON.parse(initial)

  // 깨진 JSON 쓰기
  writeFileSync(PDCA_PATH, '{"features": {')
  await sleep(500)

  // API가 마지막 유효값 반환하는지 확인
  const res = await fetch('http://localhost:3847/api/pdca')
  const data = await res.json()
  expect(data).not.toBeNull()
  expect(data.features).toBeDefined()

  ws.close()
})

// ER-3: 포트 충돌 → 에러 메시지
test('포트 3847 사용중 → EADDRINUSE 에러 + 대안 포트 메시지', async () => {
  // 더미 서버로 포트 선점
  const dummy = Bun.serve({ port: 3847, fetch: () => new Response('occupied') })

  try {
    const proc = Bun.spawn(['bun', 'tools/agent-dashboard/server.ts'], {
      stderr: 'pipe',
    })
    const stderr = await new Response(proc.stderr).text()
    expect(stderr).toContain('3847')
    expect(stderr).toMatch(/대안|alternative|다른 포트/)
  } finally {
    dummy.stop()
  }
})
```

### 커버리지 요약

| 테스트 파일 | 건수 | Wave | 비고 |
|------------|:----:|:----:|------|
| task-parser.test.ts | 5 | 1 | 기존 |
| pdca-reader.test.ts | 4 | 1 | 기존 |
| broker-reader.test.ts | 4 | 1 | 기존 |
| file-watcher.test.ts | 3 | 1 | 기존 |
| api-integration.test.ts | 4 | 2 | 기존 |
| registry-reader.test.ts | 3 | 1 | **추가** |
| ws-integration.test.ts | 6 | 3 | **추가 — 핵심** |
| broker-polling.test.ts | 6 | 3 | **추가 — 핵심 (BP-5,6 broker health)** |
| error-recovery.test.ts | 3 | 3 | **추가** |
| **합계** | **38** | | +18건 |

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
BROKER_HEALTH_URL=http://localhost:7899/health    # 브로커 health 엔드포인트
```

설정 안 하면 자동 감지 (cwd 기반).

### 8-1. 외부 접근 (Cloudflare Tunnel)

Smith님이 폰/다른 PC에서 대시보드를 실시간으로 보기 위한 구성.

**방안 비교:**

| 방안 | 장점 | 단점 | 우리 환경 |
|------|------|------|----------|
| **Cloudflare Tunnel** | 무료, HTTPS 자동, URL 고정 가능, WS 지원, 설치됨 | Cloudflare 계정 필요 | **cloudflared 이미 설치됨** |
| Tailscale | 같은 네트워크, 속도 빠름 | 미설치, 양쪽 기기 모두 설치 필요 | 미설치 |
| GCP Cloud Run | 어디서든 접근 | 인프라 추가, 비용, 로컬 파일 접근 불가 | **부적합** — 로컬 파일 의존 |
| ngrok | 간단 | URL 변동(무료), 유료 필요 | 불필요 — cloudflared 있음 |

**추천: Cloudflare Tunnel (Quick Tunnel)**

이유:
1. `/opt/homebrew/bin/cloudflared` **이미 설치됨** — 추가 설치 없음
2. `cloudflared tunnel --url http://localhost:3847` 한 줄로 실행
3. HTTPS 자동 적용 (폰 브라우저 호환)
4. WebSocket 네이티브 지원 (wss:// 자동 변환)
5. Quick Tunnel은 계정 없이도 동작 (임시 URL 발급)
6. Named Tunnel 설정 시 URL 고정 가능

**Quick Tunnel (즉시 사용):**
```bash
# 대시보드 서버 실행
bun run tools/agent-dashboard/server.ts &

# 터널 시작 — 임시 공개 URL 발급
cloudflared tunnel --url http://localhost:3847
# → https://xxxx-xxxx.trycloudflare.com (매번 변경)
```

**Named Tunnel (URL 고정 — 권장):**
```bash
# 1회 설정 (Cloudflare 계정 필요)
cloudflared tunnel login
cloudflared tunnel create agent-dashboard
cloudflared tunnel route dns agent-dashboard dashboard.bscamp.app  # 또는 원하는 서브도메인

# 실행
cloudflared tunnel run --url http://localhost:3847 agent-dashboard
# → https://dashboard.bscamp.app (고정)
```

**보안:**
- Quick Tunnel: URL 알면 누구나 접근 가능 → URL 공유 주의
- Named Tunnel: Cloudflare Access로 이메일 인증 추가 가능 (무료 50석)
- 대시보드 자체에 기본 인증(Basic Auth) 추가 권장:

```typescript
// server.ts — 기본 인증 미들웨어 (터널 모드일 때만)
app.use('*', async (c, next) => {
  if (!process.env.TUNNEL_AUTH) return next()
  const auth = c.req.header('Authorization')
  const expected = `Basic ${btoa(process.env.TUNNEL_AUTH)}`
  if (auth !== expected) {
    return c.text('Unauthorized', 401, {
      'WWW-Authenticate': 'Basic realm="Agent Dashboard"',
    })
  }
  return next()
})
```

```bash
# 인증 활성화
TUNNEL_AUTH=smith:비밀번호 bun run tools/agent-dashboard/server.ts
```

**WebSocket over Tunnel:**
- Cloudflare Tunnel은 WS를 네이티브 지원
- `ws://localhost:3847/ws` → `wss://dashboard.bscamp.app/ws` 자동 변환
- 클라이언트 app.js에서 프로토콜 자동 감지:

```javascript
// public/app.js — WS 연결 (localhost + tunnel 자동 대응)
const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:'
const ws = new WebSocket(`${wsProto}//${location.host}/ws`)
```

**모바일 반응형:**
- 768px 이하: 패널 세로 1열 스택
- 우선순위: PDCA 파이프라인 > 팀 현황 > TASK 보드 > 메시지 > 로그
- 통신 로그는 접힌 상태 (토글로 펼치기)

**서버 시작 스크립트 (통합):**
```bash
# tools/agent-dashboard/start.sh
#!/bin/bash
bun run tools/agent-dashboard/server.ts &
DASHBOARD_PID=$!

if command -v cloudflared &>/dev/null && [ "${TUNNEL:-}" = "1" ]; then
  echo "🌐 터널 시작..."
  cloudflared tunnel --url http://localhost:3847
fi

wait $DASHBOARD_PID
```

```bash
# 로컬만
bun run tools/agent-dashboard/server.ts

# 터널 포함
TUNNEL=1 bash tools/agent-dashboard/start.sh
```

### 8-2. Broker Health 모니터링

대시보드 서버가 broker 생존 여부를 주기적으로 확인.

```typescript
// lib/broker-health.ts
const HEALTH_INTERVAL = 10_000  // 10초마다 체크
const HEALTH_TIMEOUT = 3_000    // 3초 timeout

let brokerStatus: 'alive' | 'dead' | 'not_installed' = 'not_installed'

async function checkBrokerHealth(): Promise<'alive' | 'dead' | 'not_installed'> {
  const dbExists = existsSync(BROKER_DB_PATH)
  if (!dbExists) return 'not_installed'

  try {
    const res = await fetch(BROKER_HEALTH_URL, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    })
    return res.ok ? 'alive' : 'dead'
  } catch {
    return 'dead'  // DB 있지만 프로세스 다운
  }
}

// 10초 간격 폴링 + 상태 변경 시 WS push
setInterval(async () => {
  const prev = brokerStatus
  brokerStatus = await checkBrokerHealth()
  if (prev !== brokerStatus) {
    broadcastWs({
      type: 'broker:status',
      data: {
        status: brokerStatus,
        warning: brokerStatus === 'dead'
          ? '⚠ broker 프로세스 중단 — 새 메시지 수신 불가. 재시작: bun ~/claude-peers-mcp/broker.ts'
          : undefined,
      },
    })
  }
}, HEALTH_INTERVAL)
```

**UI 표시:**
- alive: 메시지 패널 정상 표시
- dead: 메시지 패널 상단에 경고 배너 (노란 배경 `#F59E0B`) + 기존 DB 데이터는 "(stale)" 뱃지로 표시
- not_installed: "MCP 미설치 — 메시지 모니터링 비활성"

---

## 9. 변경점

| 일자 | 내용 |
|------|------|
| 2026-03-28 | 초안 작성 — Plan + Design 동시 |
| 2026-03-28 | PM 검토 — TDD 18건 추가 (6-6~6-9), broker health (BP-5,6), 외부 접근 (8-1), broker health 모니터링 (8-2), 모바일 반응형, 데이터 모델 brokerStatus 필드 추가 |
