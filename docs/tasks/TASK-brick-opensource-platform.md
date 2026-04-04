# TASK: brick-opensource-platform

**담당**: PM (sdk-pm)
**산출물**: docs/02-design/features/brick-opensource-platform.design.md
**레벨**: L2 Design
**우선순위**: P0
**선행 TASK 흡수**: TASK-brick-3axis-plugin.md, TASK-brick-agent-abstraction.md → 이 TASK에 통합

---

## COO 6단계 사고

### Step 1. 재해석
"브릭 3×3축 워크플로우 엔진을 오픈소스로 배포해서 누구든 설치하고, 확장하고, 같이 쓸 수 있게 한다."

세부 요구:
- 3축(Gate/Link/Adapter) 전부 플러그인으로 확장 가능
- tmux 의존 제거 (어떤 환경에서든 동작)
- Claude 단일 에이전트 + Agent Teams 둘 다 지원
- 다른 사람이 들어와서 볼 수 있어야 함 (멀티유저)
- 같이 일할 수 있어야 함 (에이전트팀 공유)
- 하나의 세계(SkyOffice)에 다른 팀원의 에이전트가 들어올 수 있어야 함

### Step 2. 영향범위
엔진 전체 + Express API + DB + 인증 + SkyOffice 연동

### Step 3. 선행 확인
- 3×3 자유도 100% 달성 (engine-100pct + 3x3-gap-fill 완료, TDD 62/62 PASS)
- Paperclip 코드 검토 완료 (`/Users/smith/projects/paperclip`)
- Mission Control 코드 검토 완료 (`/Users/smith/projects/mission-control`)

### Step 4. 과거 결정
- Smith님: "세상 모든 사람이 썼으면 한다" (SaaS 방향)
- Smith님: "A(오픈소스 설치형) 먼저, B(SaaS) 나중"
- Smith님: "Paperclip 코드 읽고 우리가 직접 구현할 때 편하게"
- Smith님: "하나의 세계에 다른 사람이 들어와서 볼 수 있어야 한다"

### Step 5. 옵션 검토
- Paperclip: 어댑터 실행 패턴 우수, Gate/Link 개념 없음
- Mission Control: RBAC/멀티테넌시/WebSocket 우수, 워크플로우 엔진 약함
- CrewAI/AutoGen: 프레임워크 패러다임 (YAML 기반 아님), 참고 불필요
- Vibe Island: 클로즈드소스, 개념만 참고

### Step 6. 판단
Paperclip(어댑터) + Mission Control(인프라) 코드를 레퍼런스로, 브릭 3축 위에 오픈소스 플랫폼 구축.

---

## 전체 기능 분류

### 🟢 Phase 1: 3축 플러그인 + tmux 제거 (핵심, 최우선)

#### 1-A. Gate Registry (Brick 축)
**현재**: `gate/base.py` — `match handler.type` 하드코딩 7개
**목표**: dict 기반 레지스트리, 외부 Gate 타입 추가 가능
```python
gate_registry.register("my-gate", MyGateHandler)
```
- 빌트인 7종 자동 등록
- `PresetValidator`가 레지스트리에서 동적 조회
- **배낄 곳**: 없음 (브릭 고유). 직접 구현.
- **변경 파일**: `gates/base.py`, `engine/preset_validator.py`

#### 1-B. Link Registry (Link 축)
**현재**: `state_machine.py` — `elif link.type ==` 하드코딩 6개
**목표**: dict 기반 레지스트리, 외부 Link 타입 추가 가능
```python
link_registry.register("my-link", MyLinkHandler)
```
- 빌트인 6종 자동 등록
- `PresetValidator`가 레지스트리에서 동적 조회
- **배낄 곳**: 없음 (브릭 고유). 직접 구현.
- **변경 파일**: `engine/state_machine.py`, `engine/preset_validator.py`

#### 1-C. Adapter Registry (Team 축)
**현재**: `engine_bridge.py` — `adapter_pool` dict 하드코딩 4개
**목표**: 자동 발견 + 등록
```python
adapter_registry.register("my-agent", MyAdapter)
```
- 빌트인 4종 자동 등록
- **배낄 곳**: 없음 (패턴 단순). 직접 구현.
- **변경 파일**: `dashboard/routes/engine_bridge.py`

#### 1-D. claude_local 어댑터 (신규, tmux 제거)
**현재**: `claude_agent_teams.py` — tmux send-keys 의존
**목표**: `asyncio.create_subprocess_exec`로 Claude Code CLI 직접 실행
- 단일 에이전트: 기본
- Agent Teams: `config.env: {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"}`
- `--dangerously-skip-permissions` 옵션
- stdout 스트리밍 → 상태 업데이트

**배낄 곳 (Paperclip):**
| 파일 | 내용 | 난이도 |
|---|---|---|
| `packages/adapters/claude-local/src/server/execute.ts` | subprocess 실행 전체 패턴 | ✅ 핵심 |
| `packages/adapter-utils/src/server-utils.ts` | `runChildProcess` 유틸 | ✅ 복붙 수준 |
| `packages/adapter-utils/src/types.ts` | `AdapterExecutionContext`, `AdapterExecutionResult` 인터페이스 | ✅ 참고 |
| `packages/adapters/claude-local/src/server/skills.ts` | skills symlink 관리 | ✅ 참고 |

**핵심 코드 (execute.ts에서 배낄 것):**
```typescript
// L232-234: config.env를 환경변수로 주입
for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
}

// L320: dangerouslySkipPermissions 처리
const dangerouslySkipPermissions = asBoolean(config.dangerouslySkipPermissions, false);

// L422: CLI args 빌드
if (dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
```

---

### 🟡 Phase 2: 멀티유저 + 인증 (같이 쓸 수 있게)

#### 2-A. 사용자/워크스페이스 모델
**현재**: 없음. DB에 user_id/tenant_id 전무.
**목표**: workspace 단위 격리 + 사용자별 role

**배낄 곳 (Mission Control):**
| 파일 | 내용 |
|---|---|
| `src/lib/auth.ts` | User 인터페이스 (`id, username, role, workspace_id, tenant_id`) |
| `src/lib/schema.sql` | users/sessions/workspaces 테이블 구조 |
| `src/lib/session-cookie.ts` | 세션 쿠키 인증 |
| `src/lib/google-auth.ts` | Google Sign-In + admin 승인 워크플로우 |

**Mission Control User 모델 (그대로 참고):**
```typescript
interface User {
  id: number;
  username: string;
  display_name: string;
  role: 'admin' | 'operator' | 'viewer';
  workspace_id: number;
  tenant_id: number;
  provider: 'local' | 'google' | 'proxy';
}
```

#### 2-B. RBAC (역할 기반 접근 제어)
**현재**: `NODE_ENV=development`이면 전부 통과, 프로덕션은 API Key 1개
**목표**: admin(전체)/operator(실행+승인)/viewer(읽기만)

**배낄 곳 (Mission Control):**
| 파일 | 내용 |
|---|---|
| `src/lib/auth.ts` | `authenticateRequest()` — 세션/API Key/프록시 3중 인증 |
| `src/lib/password.ts` | bcrypt + rehash 체크 |
| `src/lib/rate-limit.ts` | API rate limiting |

#### 2-C. 에이전트 자동등록 API
**현재**: DB에 직접 INSERT만 가능. 에이전트가 자기 자신을 등록하는 경로 없음.
**목표**: `POST /api/brick/agents/register` — 에이전트가 시작할 때 자동 등록

**배낄 곳 (Paperclip):**
- heartbeat 기반 자동 등록 패턴
- `PAPERCLIP_AGENT_ID`, `PAPERCLIP_COMPANY_ID` 환경변수 주입 → 에이전트가 API 호출

---

### 🔵 Phase 3: SkyOffice 멀티플레이어 (하나의 세계)

#### 3-A. 에이전트 ↔ 캐릭터 연결
**현재**: SkyOffice Player = `{name, x, y, anim}` — 에이전트 개념 없음
**목표**: Player 스키마에 `agentId, role, status, currentTask` 추가
- 에이전트가 워크플로우 실행 시 → 해당 캐릭터가 해당 방(Plan/Do/QA)으로 이동
- 상태 표시: "Plan 중", "코딩 중", "리뷰 대기"

**배낄 곳**: 없음. SkyOffice Colyseus 코드 직접 확장.
**참고**: `/Users/smith/projects/SkyOffice/server/rooms/schema/OfficeState.ts`
```typescript
// 현재
export class Player extends Schema {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
}
// 추가 필요
// @type('string') agentId = ''
// @type('string') role = ''
// @type('string') status = ''
// @type('string') currentTask = ''
```

#### 3-B. 다른 팀원 에이전트 입장
**현재**: Room에 인원 제한 없음 (Colyseus), 비밀번호 보호 가능
**목표**: 워크스페이스 멤버의 에이전트가 자동으로 Room에 입장
- workspace_id 기반 Room 매핑
- 에이전트 시작 → Colyseus Room에 Player 자동 생성

**배낄 곳**: 없음. 직접 구현.

#### 3-C. 실시간 상태 동기화
**현재**: SkyOffice ↔ 브릭 엔진 연결 없음
**목표**: 엔진 WebSocket → SkyOffice Room → 모든 클라이언트에 브로드캐스트

**배낄 곳 (Mission Control):**
| 파일 | 내용 |
|---|---|
| `src/lib/websocket.ts` | WebSocket 서버 구현 |
| `src/lib/use-server-events.ts` | SSE 클라이언트 훅 |
| `src/lib/event-bus.ts` | 이벤트 버스 패턴 |

---

### 🟤 Phase 4: 배포/패키징 (pip install)

#### 4-A. CLI 진입점
**현재**: 수동 래퍼 스크립트 (`/tmp/brick_server.py`)
**목표**: `pip install brick-engine && brick start`

#### 4-B. 저장소 추상화
**현재**: SQLite + 파일시스템 고정
**목표**: SQLite/PostgreSQL 선택 + 파일/S3 선택

**배낄 곳 (Paperclip):**
| 파일 | 내용 |
|---|---|
| `packages/db/drizzle.config.ts` | PostgreSQL drizzle 설정 |
| `packages/db/src/client.ts` | postgres.js 클라이언트 |
| `packages/db/src/migrate.ts` | 마이그레이션 런타임 |

#### 4-C. Docker 원클릭
**배낄 곳 (Mission Control):**
| 파일 | 내용 |
|---|---|
| `docker-compose.yml` | 기본 배포 |
| `docker-compose.hardened.yml` | 프로덕션 강화 |
| `install.sh` | 원클릭 설치 스크립트 |

#### 4-D. 프리셋 config 표준화
**현재**: `session: sdk-pm` 하드코딩
**목표**: `role: PM` 또는 `agent_id: auto` 기반 매칭

---

## 레퍼런스 코드 경로 (반드시 읽을 것)

### Paperclip (`/Users/smith/projects/paperclip`)
| 파일 | 읽는 이유 |
|---|---|
| `packages/adapter-utils/src/types.ts` | 어댑터 인터페이스 전체 |
| `packages/adapters/claude-local/src/server/execute.ts` | subprocess 실행 핵심 |
| `packages/adapter-utils/src/server-utils.ts` | runChildProcess 유틸 |
| `packages/adapters/claude-local/src/server/skills.ts` | skills 관리 |
| `packages/db/src/client.ts` | PostgreSQL 연결 |

### Mission Control (`/Users/smith/projects/mission-control`)
| 파일 | 읽는 이유 |
|---|---|
| `src/lib/auth.ts` | RBAC + 멀티유저 인증 전체 |
| `src/lib/schema.sql` | DB 스키마 (users/sessions/workspaces) |
| `src/lib/session-cookie.ts` | 세션 쿠키 구현 |
| `src/lib/google-auth.ts` | Google Sign-In |
| `src/lib/websocket.ts` | WebSocket 실시간 |
| `src/lib/event-bus.ts` | 이벤트 버스 |
| `src/lib/skill-registry.ts` | Skills Hub |
| `src/lib/schedule-parser.ts` | 자연어 스케줄링 |
| `docker-compose.yml` | Docker 배포 |

### SkyOffice (`/Users/smith/projects/SkyOffice`)
| 파일 | 읽는 이유 |
|---|---|
| `server/rooms/SkyOffice.ts` | Room 구조 + 멀티플레이어 |
| `server/rooms/schema/OfficeState.ts` | Player 스키마 확장 포인트 |

---

## 제약
1. TeamAdapter ABC 변경 금지
2. 기존 어댑터 건드리지 말 것 (하위호환)
3. 기존 프리셋 7개 regression 금지
4. 엔진 코어 로직 변경 최소화
5. SkyOffice Colyseus 기본 구조 유지

---

## 완료 기준
- Phase 1~4 전체 포함 Design 문서 작성
- 각 Phase별 TDD 케이스 명시
- COO 검토 후 Smith님 보고

**COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.**
