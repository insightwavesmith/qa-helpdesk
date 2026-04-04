# Brick 오픈소스 플랫폼 Design (Phase 2~4)

> **피처**: brick-opensource-platform (멀티유저 + SkyOffice + 배포)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-opensource-platform.md
> **선행 Design**: `brick-3axis-plugin.design.md` (Phase 1: 3축 플러그인 + claude_local)
> **레퍼런스**: Mission Control (RBAC/멀티유저/WebSocket), Paperclip (에이전트 등록 패턴)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **비전** | "세상 모든 사람이 쓰는 3×3 워크플로우 엔진" |
| **범위** | Phase 2~4 (멀티유저 → 멀티플레이어 → 배포) |
| **Phase 1** | `brick-3axis-plugin.design.md`로 **완료** (TDD 35건, 불변식 10건, 파일 7건) |
| **제약** | TeamAdapter ABC 불변, 기존 어댑터 무수정, 프리셋 7개 regression 금지 |

### 결과 요약

| 지표 | Phase 2 | Phase 3 | Phase 4 | **합계** |
|------|---------|---------|---------|---------|
| **TDD** | 18건 | 8건 | 7건 | **33건** |
| **불변식** | 4건 | 2건 | 2건 | **8건** |
| **파일** | 8건 | 4건 | 5건 | **17건** |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **문제** | 브릭 엔진이 단일 사용자/로컬 전용 → 팀에서 같이 못 씀, 배포 어려움 |
| **해결** | 멀티유저 인증 + RBAC + SkyOffice 실시간 가시화 + Docker/pip 원클릭 배포 |
| **기능/UX** | 역할별 접근제어, 에이전트 자동등록, SkyOffice에서 에이전트 활동 실시간 관찰, `pip install brick-engine` |
| **핵심 가치** | 설치형 오픈소스 → 누구든 자기 환경에서 팀 단위 3×3 워크플로우 운용 가능 |

### Phase 의존 관계

```
Phase 1 ──→ Phase 2 ──→ Phase 3 ──→ Phase 4
(플러그인)   (멀티유저)   (멀티플레이어) (배포)
│            │            │            │
│ 완료       │ Phase 1    │ Phase 2    │ Phase 1~3
│ (별도문서) │ 필요       │ 필요       │ 안정화 후
```

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

"Phase 1(3축 플러그인) 위에 3단계를 추가한다. (2) 멀티유저 + RBAC → 같이 쓸 수 있게, (3) SkyOffice 연동 → 하나의 세계에서 에이전트 활동을 볼 수 있게, (4) pip install + Docker → 바로 설치 가능."

### Step 2: 영향범위

| Phase | 변경 범위 | 신규 파일 | 수정 파일 |
|-------|----------|----------|----------|
| 2 | 인증/인가 계층 + DB 스키마 | 6 | 2 |
| 3 | SkyOffice Room + 엔진 브릿지 | 3 | 1 |
| 4 | CLI + Docker + 저장소 추상화 | 4 | 1 |

### Step 3: 선행 조건

- Phase 1 완료 ✅ (`brick-3axis-plugin.design.md` — TDD 35건, 불변식 10건)
- Mission Control auth.ts 분석 ✅ (User model + RBAC + session cookie + API key)
- Mission Control websocket.ts 분석 ✅ (gateway protocol + heartbeat + reconnect)
- Mission Control schema.sql 분석 ✅ (agents 테이블 패턴)

### Step 4: 의존성

- Phase 2: Phase 1의 AdapterRegistry 필요 (에이전트 자동등록 API)
- Phase 3: Phase 2의 workspace_id + user 인증 필요
- Phase 4: Phase 1~3 안정화 후

### Step 5: 방법 도출

| 참고 | 가져올 것 | 가져오지 않을 것 |
|------|----------|----------------|
| **Mission Control** | User model, RBAC 3-tier, session cookie, API key auth, requireRole(), agents 테이블 패턴, heartbeat | gateway protocol, device identity, proxy auth, Google Sign-In, Ed25519 서명 |
| **Paperclip** | `PAPERCLIP_AGENT_ID` env 주입 패턴 (에이전트 자동등록) | skills, session resume, billing/quota, drizzle ORM |

### Step 6: 팀원 배정

- PM: Design (이 문서)
- CTO → backend-dev: Phase 2 (인증/DB/API)
- CTO → frontend-dev: Phase 3 (SkyOffice)
- CTO → infra: Phase 4 (Docker + CLI)

---

# Phase 2: 멀티유저 + 인증

## 2-A. User 모델

Mission Control `auth.ts:35-51` 패턴을 브릭에 맞게 단순화:

```python
# brick/brick/auth/models.py

@dataclass
class BrickUser:
    id: int
    username: str
    display_name: str
    role: Literal["admin", "operator", "viewer"]
    workspace_id: int
    created_at: float
    updated_at: float
    last_login_at: float | None = None
```

### Mission Control과의 차이

| Mission Control | 브릭 | 이유 |
|----------------|------|------|
| `tenant_id` + `workspace_id` | `workspace_id`만 | 멀티테넌트 불필요 (설치형) |
| `provider: local\|google\|proxy` | `local`만 (1차) | Google/Proxy는 Phase 4 이후 |
| `agent_api_keys` 별도 테이블 | `api_keys` 통합 | 에이전트와 사용자 키를 하나로 |
| bcrypt + progressive rehash | scrypt 고정 | Python hashlib.scrypt 기본 |

### Role 체계

Mission Control `ROLE_LEVELS` (auth.ts:613) 패턴 그대로:

| Role | 수준 | 할 수 있는 것 |
|------|------|-------------|
| **admin** | 2 | 전체 관리: 사용자 CRUD, 워크스페이스 설정, 어댑터 등록 |
| **operator** | 1 | 워크플로우 실행/중단, 블록 승인, 에이전트 관리 |
| **viewer** | 0 | 읽기 전용: 워크플로우 상태 조회, 로그 열람 |

```python
ROLE_LEVELS = {"viewer": 0, "operator": 1, "admin": 2}

def require_role(user: BrickUser, min_role: str) -> bool:
    return ROLE_LEVELS.get(user.role, -1) >= ROLE_LEVELS[min_role]
```

## 2-B. DB 스키마 (SQLite)

Mission Control `schema.sql` 패턴을 참고하되 브릭 도메인에 맞게:

```sql
-- 워크스페이스
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 사용자
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    workspace_id INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login_at INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 세션
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- API 키 (사용자 + 에이전트 통합)
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_type TEXT NOT NULL DEFAULT 'user',  -- user | agent
    owner_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["viewer"]',  -- JSON array
    expires_at INTEGER,
    revoked_at INTEGER,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 등록된 에이전트
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    adapter_type TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',  -- offline | idle | busy | error
    last_heartbeat INTEGER,
    config TEXT,  -- JSON
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(name, workspace_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
```

## 2-C. 인증 미들웨어

Mission Control `getUserFromRequest()` (auth.ts:412-549) 패턴을 Python/FastAPI로:

```python
# brick/brick/auth/middleware.py

async def authenticate_request(request: Request) -> BrickUser | None:
    """
    인증 우선순위 (Mission Control 패턴):
    1. 세션 쿠키 (brick_session)
    2. API 키 (X-API-Key 헤더 또는 Authorization: Bearer)
    3. 개발 모드 (BRICK_DEV_MODE=1 → admin 자동)
    """
    # 1. 세션 쿠키
    session_token = request.cookies.get("brick_session")
    if session_token:
        user = validate_session(session_token)
        if user:
            return user

    # 2. API 키
    api_key = extract_api_key(request)
    if api_key:
        user = validate_api_key(api_key)
        if user:
            return user

    # 3. 개발 모드
    if os.getenv("BRICK_DEV_MODE") == "1":
        return BrickUser(id=0, username="dev", display_name="Developer",
                        role="admin", workspace_id=1,
                        created_at=0, updated_at=0)

    return None
```

### 세션 관리

Mission Control `createSession()` (auth.ts:136-161) 패턴:

```python
# brick/brick/auth/session.py
import hashlib
import secrets

SESSION_DURATION = 7 * 24 * 3600  # 7일

def create_session(user_id: int, workspace_id: int, ip: str | None = None) -> str:
    """세션 생성 — raw token 반환, DB에는 SHA-256 해시만 저장."""
    token = secrets.token_hex(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    expires_at = int(time.time()) + SESSION_DURATION
    # DB INSERT: token_hash, user_id, workspace_id, expires_at, ip
    return token

def validate_session(token: str) -> BrickUser | None:
    """세션 검증 — token → SHA-256 → DB 조회 → JOIN users."""
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    # DB SELECT: user_sessions JOIN users WHERE token_hash AND expires_at > now
    return user_or_none
```

### 비밀번호 처리

```python
# brick/brick/auth/password.py
import hashlib
import os

def hash_password(password: str) -> str:
    """scrypt 해싱 — Python hashlib 기본."""
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt:{salt.hex()}:{dk.hex()}"

def verify_password(password: str, stored: str) -> bool:
    """저장된 해시와 비교."""
    _, salt_hex, dk_hex = stored.split(":")
    salt = bytes.fromhex(salt_hex)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return dk.hex() == dk_hex

def authenticate_user(username: str, password: str) -> BrickUser | None:
    """
    Mission Control auth.ts:218-265 패턴.
    사용자 미존재 시에도 dummy hash 실행 (타이밍 공격 방어).
    """
    user_row = db_get_user(username)
    if user_row is None:
        # 타이밍 공격 방어: 존재하지 않는 사용자도 같은 시간 소요
        verify_password(password, DUMMY_HASH)
        return None
    if not verify_password(password, user_row.password_hash):
        return None
    return BrickUser(...)
```

### 인증 경로별 정리

| 경로 | 인증 방식 | 대상 |
|------|----------|------|
| 브라우저 → Express → Python | `brick_session` 쿠키 | 대시보드 사용자 |
| 에이전트 → Python API | `X-API-Key` 헤더 | claude_local, webhook 등 |
| Express → Python (내부) | `X-Brick-Internal-Key` | 서버 간 통신 (기존 유지) |

## 2-D. 에이전트 자동등록 API

Paperclip `PAPERCLIP_AGENT_ID` + `PAPERCLIP_API_URL` env 주입 패턴 참고.
claude_local 어댑터 (Phase 1)가 subprocess 실행 시 env에 `BRICK_API_URL` + `BRICK_AGENT_TOKEN`을 주입하면, Claude Code 세션 내에서 등록 API를 호출할 수 있다.

```
에이전트 시작 → env에서 BRICK_API_URL 발견
→ POST /api/brick/agents/register {name, adapter_type, capabilities}
→ 200 OK {agent_id, heartbeat_interval}
→ 주기적 POST /api/brick/agents/{id}/heartbeat
```

### Express API 라우트

```
POST   /api/brick/agents/register      — 에이전트 자동등록 (operator+)
GET    /api/brick/agents                — 등록된 에이전트 목록 (viewer+)
DELETE /api/brick/agents/:id            — 에이전트 등록 해제 (admin)
POST   /api/brick/agents/:id/heartbeat — 하트비트 (에이전트 자신)
```

### 하트비트 → 오프라인 전환

Mission Control `agents` 테이블 패턴 (schema.sql:23-35):
- `last_heartbeat` 필드를 heartbeat API가 갱신
- 스케줄러가 3분마다 `last_heartbeat < now - 180` → `status = 'offline'`

## 2-E. RBAC 적용 범위

| API 엔드포인트 | 최소 role | 비고 |
|---------------|----------|------|
| `GET /engine/status/*` | viewer | 조회 |
| `GET /engine/health` | viewer | 조회 |
| `POST /engine/start` | operator | 워크플로우 실행 |
| `POST /engine/complete-block` | operator | 블록 완료 처리 |
| `POST /engine/suspend/*` | operator | 중단 |
| `POST /engine/cancel/*` | operator | 취소 |
| `POST /engine/retry-adapter` | operator | 어댑터 재시도 |
| `POST /api/brick/agents/register` | operator | 에이전트 등록 |
| `DELETE /api/brick/agents/:id` | admin | 에이전트 삭제 |
| `POST /api/users` | admin | 사용자 생성 |
| `PUT /api/users/:id/role` | admin | 역할 변경 |

## 2-F. 워크스페이스 격리

```python
# 모든 쿼리에 workspace_id 필터 적용
def get_workflows(user: BrickUser) -> list:
    """사용자의 workspace에 속한 워크플로우만 반환."""
    return db.query("SELECT * FROM workflows WHERE workspace_id = ?", user.workspace_id)
```

---

# Phase 3: SkyOffice 멀티플레이어

## 3-A. Player 스키마 확장

```typescript
// SkyOffice server/rooms/schema/OfficeState.ts — 확장

export class Player extends Schema {
    // 기존 (변경 금지)
    @type('string') name = ''
    @type('number') x = 705
    @type('number') y = 500
    @type('string') anim = 'adam_idle_down'

    // 신규: 에이전트 연결
    @type('string') agentId = ''           // brick agents 테이블 ID
    @type('string') role = ''              // CTO, PM, QA 등
    @type('string') status = ''            // idle, working, reviewing
    @type('string') currentTask = ''       // 현재 작업 설명
    @type('string') currentBlockId = ''    // 워크플로우 블록 ID
}
```

## 3-B. 에이전트 ↔ 캐릭터 매핑

```
에이전트 등록 (Phase 2 API)
    │
    ├─ agents 테이블에 INSERT
    │
    └─ SkyOffice Room에 Player 자동 생성
        ├─ agentId = agent.id
        ├─ name = agent.name
        ├─ role = agent.adapter_config.role
        └─ 위치 = 역할별 기본 위치 (Plan방, Do방 등)
```

## 3-C. 실시간 상태 동기화

브릭 엔진 → SkyOffice 단방향 이벤트 스트림:

```
엔진 EventBus
    │
    ├─ block.started   → Player.status = "working",  Player.currentBlockId = block_id
    ├─ block.completed → Player.status = "idle",     Player.currentBlockId = ""
    ├─ block.failed    → Player.status = "error"
    └─ workflow.completed → 전원 idle
```

### 연결 방식

SkyOffice는 Colyseus 기반이므로 Mission Control `websocket.ts` 수준의 복잡한 gateway protocol은 불필요. HTTP push로 단순화:

```
브릭 Python EventBus
    → HTTP POST /api/skyoffice/sync  (Express 경유)
        → Colyseus Room.broadcast("brick_event", {type, data})
            → 모든 클라이언트에 실시간 전달
```

SkyOffice와 브릭은 별도 프로세스이므로 HTTP 기반 push가 가장 단순.

### Mission Control 참고 범위

| Mission Control 코드 | 참고 | 적용 |
|---------------------|------|------|
| `websocket.ts:36-46` GatewayFrame | 이벤트 구조 | `BrickEvent(type, payload)` |
| `event-bus.ts` EventEmitter 패턴 | 이벤트 발행 | Python `EventBus` 클래스 |
| heartbeat ping/pong | ❌ 불필요 | HTTP push이므로 |

## 3-D. 방(Room) 매핑

| 워크플로우 블록 type | SkyOffice 방 | 에이전트 이동 위치 |
|---------------------|-------------|-----------------|
| plan | Plan방 | (200, 300) |
| design | Design방 | (400, 300) |
| do | Do방 (개발실) | (600, 300) |
| check | QA방 | (800, 300) |
| act | Act방 | (1000, 300) |

## 3-E. workspace → Room 매핑

```
workspace_id = 1 → Room "brick-ws-1"
workspace_id = 2 → Room "brick-ws-2"
```

- 같은 workspace의 에이전트만 같은 Room에 입장
- 다른 workspace 에이전트는 다른 Room → 격리

---

# Phase 4: 배포/패키징

## 4-A. CLI 진입점

```bash
pip install brick-engine
brick init          # .bkit/ 초기화 + 기본 프리셋 생성
brick start         # Python(3202) + Express(3200) + React(3201) 기동
brick start --no-ui # API만 (headless)
```

### pyproject.toml

```toml
[project]
name = "brick-engine"
version = "0.1.0"
description = "3x3 Workflow Engine — Gate, Link, Adapter plugin architecture"

[project.scripts]
brick = "brick.cli:main"

[project.optional-dependencies]
postgres = ["asyncpg"]
```

## 4-B. 저장소 추상화

현재: SQLite + 파일시스템 고정.
목표: 인터페이스 추상화로 PostgreSQL/S3 교체 가능.

```python
# brick/brick/storage/base.py

class StorageBackend(ABC):
    @abstractmethod
    async def save_workflow(self, workflow_id: str, data: dict) -> None: ...
    @abstractmethod
    async def load_workflow(self, workflow_id: str) -> dict | None: ...
    @abstractmethod
    async def list_active(self) -> list[str]: ...

class SqliteStorage(StorageBackend): ...      # 기본 (현재)
class PostgresStorage(StorageBackend): ...    # 선택 (asyncpg)
```

## 4-C. Docker 원클릭

Mission Control `docker-compose.yml` 패턴 참고:

```yaml
# docker-compose.yml
version: '3.8'
services:
  brick-engine:
    build: ./brick
    ports:
      - "3202:3202"
    environment:
      - BRICK_DB_PATH=/data/brick.db
      - BRICK_RUNTIME_DIR=/data/runtime
    volumes:
      - brick-data:/data
      - ./presets:/app/presets:ro

  brick-dashboard:
    build: ./dashboard
    ports:
      - "3200:3200"
      - "3201:3201"
    environment:
      - BRICK_ENGINE_URL=http://brick-engine:3202
    depends_on:
      - brick-engine

volumes:
  brick-data:
```

## 4-D. 프리셋 config 표준화

현재 `session: sdk-pm` 하드코딩 → `role: PM` 기반 매칭:

```yaml
# Before
do:
  adapter: claude_agent_teams
  config:
    session: sdk-cto
    role: CTO_LEADER

# After (Phase 4)
do:
  adapter: claude_local
  config:
    role: CTO              # agents 테이블에서 role="CTO" 매칭
    model: claude-opus-4-6
    dangerouslySkipPermissions: true
    env:
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

---

# TDD 케이스 (33건)

## Phase 2: 멀티유저 + 인증 (18건)

### 사용자/세션 (AU-01 ~ AU-07)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AU-01** | test_au01_create_user — createUser → DB에 사용자 생성 | users 테이블 row 존재, password_hash 평문 아님 |
| **AU-02** | test_au02_authenticate_valid — authenticateUser(정상) → BrickUser 반환 | role, workspace_id 정확 |
| **AU-03** | test_au03_authenticate_wrong_pw — authenticateUser(틀린 비번) → None | 타이밍 공격 방어 (dummy hash 사용) |
| **AU-04** | test_au04_create_session — createSession → token 반환 + DB 저장 | token_hash 저장 (raw token 아님) |
| **AU-05** | test_au05_validate_session — validateSession(유효) → BrickUser | session join user |
| **AU-06** | test_au06_validate_expired — validateSession(만료) → None | expires_at < now |
| **AU-07** | test_au07_destroy_session — destroySession → DB 삭제 | 해당 token row 없음 |

### RBAC (AU-08 ~ AU-12)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AU-08** | test_au08_viewer_get — viewer → GET /engine/status → 200 | 읽기 허용 |
| **AU-09** | test_au09_viewer_post_blocked — viewer → POST /engine/start → 403 | 실행 거부 |
| **AU-10** | test_au10_operator_start — operator → POST /engine/start → 200 | 실행 허용 |
| **AU-11** | test_au11_operator_delete_blocked — operator → DELETE /api/brick/agents/:id → 403 | admin만 가능 |
| **AU-12** | test_au12_admin_all — admin → 모든 API → 200 | 전체 허용 |

### API 키 (AU-13 ~ AU-15)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AU-13** | test_au13_apikey_valid — X-API-Key 헤더 → 유효 키 → 인증 성공 | BrickUser 반환 |
| **AU-14** | test_au14_apikey_expired — X-API-Key 헤더 → 만료/폐기 키 → 401 | None |
| **AU-15** | test_au15_apikey_scopes — API 키의 scopes → role 변환 | ["operator"] → role="operator" |

### 에이전트 등록 (AU-16 ~ AU-18)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AU-16** | test_au16_agent_register — POST /agents/register → 에이전트 생성 | agents 테이블 row, status=idle |
| **AU-17** | test_au17_agent_heartbeat — POST /agents/:id/heartbeat → last_heartbeat 갱신 | 타임스탬프 업데이트 |
| **AU-18** | test_au18_agent_offline — heartbeat 3분 미수신 → status=offline | 스케줄러가 자동 전환 |

## Phase 3: SkyOffice 멀티플레이어 (8건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **SK-01** | test_sk01_player_schema — Player 스키마에 agentId/role/status 존재 | Schema 필드 접근 가능 |
| **SK-02** | test_sk02_agent_player_create — 에이전트 등록 → Room에 Player 생성 | Room.state.players에 entry |
| **SK-03** | test_sk03_block_started — block.started → Player.status="working" | Room broadcast 수신 |
| **SK-04** | test_sk04_block_completed — block.completed → Player.status="idle" | 상태 복귀 |
| **SK-05** | test_sk05_room_mapping — block 타입별 방 이동 | Player.x, y 변경 |
| **SK-06** | test_sk06_agent_offline_remove — 에이전트 offline → Player 제거 | Room에서 삭제 |
| **SK-07** | test_sk07_workspace_isolation — workspace_id 다른 에이전트 → 별도 Room | Room 격리 |
| **SK-08** | test_sk08_broadcast — 다수 클라이언트 동시 접속 → 전부 상태 수신 | broadcast 검증 |

## Phase 4: 배포/패키징 (7건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **PK-01** | test_pk01_brick_init — `brick init` → .bkit/ 디렉토리 생성 | presets/, runtime/ 존재 |
| **PK-02** | test_pk02_brick_start — `brick start` → 3개 서버 기동 | 포트 3200, 3201, 3202 리스닝 |
| **PK-03** | test_pk03_brick_headless — `brick start --no-ui` → API만 기동 | 3202만 리스닝 |
| **PK-04** | test_pk04_sqlite_roundtrip — SqliteStorage.save/load 라운드트립 | 저장 → 로드 동일 |
| **PK-05** | test_pk05_postgres_roundtrip — PostgresStorage.save/load 라운드트립 | asyncpg 연결 성공 |
| **PK-06** | test_pk06_docker_compose — docker-compose up → 전체 기동 | health check 통과 |
| **PK-07** | test_pk07_role_config_match — role: CTO config → agents 테이블 매칭 | 적합 에이전트 선택 |

---

# 불변식 (8건)

## Phase 2 (4건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-P2-1** | password 평문 저장 금지 | DB에 password_hash만 존재 |
| **INV-P2-2** | session token 평문 저장 금지 | DB에 token_hash만 존재 (Mission Control 패턴) |
| **INV-P2-3** | role 계층: viewer < operator < admin | ROLE_LEVELS dict 불변 |
| **INV-P2-4** | BRICK_DEV_MODE=1 아닐 때 인증 우회 불가 | middleware 검증 |

## Phase 3 (2건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-P3-1** | SkyOffice 기존 Player 필드 변경 없음 | name, x, y, anim 그대로 |
| **INV-P3-2** | workspace_id 다른 에이전트 Room 격리 | cross-workspace 접근 불가 |

## Phase 4 (2건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-P4-1** | StorageBackend 인터페이스 SQLite/Postgres 동일 | ABC 계약 |
| **INV-P4-2** | 기존 .bkit/ 구조 호환 | brick init이 기존 구조 파괴 안 함 |

---

# 레퍼런스 매핑 상세

## Mission Control → 브릭 매핑

| Mission Control 코드 | 브릭 적용 | Phase |
|---------------------|----------|-------|
| `auth.ts:35-51` User interface | `BrickUser` dataclass | 2 |
| `auth.ts:100` SESSION_DURATION 7일 | `SESSION_DURATION = 7 * 24 * 3600` | 2 |
| `auth.ts:136-161` createSession (token hash) | `create_session()` (token_hash 저장) | 2 |
| `auth.ts:164-200` validateSession (JOIN) | `validate_session()` | 2 |
| `auth.ts:218-265` authenticateUser (dummy hash) | `authenticate_user()` (타이밍 방어) | 2 |
| `auth.ts:412-549` getUserFromRequest (3중 인증) | `authenticate_request()` (쿠키→API키→dev) | 2 |
| `auth.ts:613` ROLE_LEVELS | `ROLE_LEVELS` dict | 2 |
| `auth.ts:619-631` requireRole | `require_role()` | 2 |
| `schema.sql:23-35` agents table | `agents` table (status, last_heartbeat 패턴) | 2 |
| `websocket.ts:36-46` GatewayFrame | `BrickEvent` (type+payload) | 3 |
| `websocket.ts:147-193` heartbeat ping/pong | 에이전트 heartbeat API | 2 |

## Paperclip → 브릭 매핑

| Paperclip 코드 | 브릭 적용 | Phase |
|---------------|----------|-------|
| `server-utils.ts:231-249` buildPaperclipEnv | `_build_env()` BRICK_* 주입 | 2 |

---

# 파일 목록 (17건)

## Phase 2 (8건)

| 파일 | 유형 |
|------|------|
| `brick/brick/auth/__init__.py` | **신규** |
| `brick/brick/auth/models.py` | **신규** |
| `brick/brick/auth/middleware.py` | **신규** |
| `brick/brick/auth/session.py` | **신규** |
| `brick/brick/auth/password.py` | **신규** |
| `brick/brick/auth/schema.sql` | **신규** |
| `brick/brick/dashboard/routes/auth_routes.py` | **신규** |
| `brick/brick/dashboard/routes/agent_routes.py` | **신규** |

## Phase 3 (4건)

| 파일 | 유형 |
|------|------|
| `SkyOffice/server/rooms/schema/OfficeState.ts` | 수정 |
| `brick/brick/integrations/skyoffice_bridge.py` | **신규** |
| `dashboard/server/routes/brick/skyoffice.ts` | **신규** |
| `brick/brick/engine/event_bus.py` | 수정 (SkyOffice hook 추가) |

## Phase 4 (5건)

| 파일 | 유형 |
|------|------|
| `brick/brick/cli.py` | **신규** |
| `brick/brick/storage/base.py` | **신규** |
| `brick/brick/storage/sqlite.py` | **신규** |
| `brick/pyproject.toml` | **신규** |
| `docker-compose.yml` | **신규** |

---

# 기존 Design과의 관계

| Design | 관계 |
|--------|------|
| **brick-3axis-plugin** | Phase 1 상세 설계. 이 문서의 선행. |
| **brick-agent-abstraction** | Phase 1-D(claude_local)에 흡수. brick-3axis-plugin에 포함. |
| brick-bugfix-sprint1 | 충돌 없음 |
| brick-sprint2-engine-sync | 충돌 없음 |
| brick-engine-100pct | 충돌 없음 |
| brick-3x3-gap-fill | Phase 1 링크 레지스트리로 자연 흡수 |
