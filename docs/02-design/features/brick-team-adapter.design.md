# Design: Brick Team Adapter (MCP 기반 TASK 전달 + 팀원 수명관리)

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-pdca-preset.design.md (Team 섹션), brick-backend-api.design.md (Team API), harness-patterns.md
> Smith님 결정: tmux send-keys → MCP(claude-peers) 전환, persistent/ephemeral 팀원 구분

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | tmux send-keys 기반 TASK 전달을 MCP(claude-peers) 기반으로 전환 + 팀원 수명관리 체계화 |
| **핵심 변경** | adapter_config 확장, MCP 전달 흐름, persistent/ephemeral 팀원, idle_policy |
| **현행 문제** | tmux send-keys = fire-and-forget (전달 확인 불가), 팀원 수명 = 수동 관리 |
| **수정 범위** | team.py 모델, claude_agent_teams.py 어댑터, 신규 MCP 브릿지 |
| **TDD** | TA-001 ~ TA-030 (30건) |

---

## 1. 현행 문제 분석

### 1.1 tmux send-keys의 한계

```python
# 현행: claude_agent_teams.py:29-38
cmd = ["tmux", "send-keys", "-t", self.session,
       f"TASK: {block.what}", "Enter"]
proc = await asyncio.create_subprocess_exec(*cmd)
await proc.communicate()
```

| 문제 | 영향 |
|------|------|
| **Fire-and-forget** | 전달 성공 여부 불명. tmux 세션이 없으면 조용히 실패 |
| **전달 확인 없음** | 상대가 TASK를 읽었는지, 수락했는지 알 수 없음 |
| **세션 의존** | tmux 세션명이 정확해야 함. 세션 없으면 무조건 실패 |
| **구조화 불가** | 텍스트 문자열만 전달. 메타데이터(우선순위, 참조 문서) 전달 불가 |
| **hook 접근 불가** | Bash hook에서 MCP 직접 호출 불가 → ACTION_REQUIRED 패턴으로 우회 |

### 1.2 팀원 수명관리의 현행 상태

```
현행:
  TeamCreate → 팀원 생성 (수동)
  ... 작업 ...
  TeammateIdle → hook이 감지 → 수동으로 TeamDelete 호출
  → auto-shutdown.sh 3단계: shutdown_pending → kill-pane → done

문제:
  - persistent/ephemeral 구분 없음 → 모든 팀원을 수동 종료
  - idle 감지 후 정리까지 시간차 발생 (토큰 낭비)
  - 팀원 재시작 로직 없음
```

---

## 2. adapter_config 확장

### 2.1 TeamDefinition 모델 확장

```python
# brick/brick/models/team.py — 확장

@dataclass
class TeammateSpec:
    """팀원 1명의 명세."""
    name: str                          # "frontend-dev", "design-reader"
    role: str = "developer"            # "leader", "developer", "researcher"
    model: str = "opus"                # "opus", "sonnet", "haiku"
    lifetime: str = "ephemeral"        # "persistent" | "ephemeral"
    permitted_tools: list[str] = field(default_factory=list)  # HP-003

@dataclass
class IdlePolicy:
    """TeammateIdle 이벤트 처리 정책."""
    action: str = "terminate"          # "terminate" | "suspend" | "keep"
    timeout_seconds: int = 300         # idle 후 action까지 대기 시간 (초)
    notify_before: bool = True         # action 실행 전 리더에 알림

@dataclass
class CommunicationConfig:
    """TASK 전달 방식 설정."""
    method: str = "mcp"                # "mcp" | "tmux" | "webhook"
    peer_discovery: str = "auto"       # "auto" | "manual"
    # MCP 전용
    protocol: str = "bscamp-team/v1"   # 메시지 프로토콜 (기존 핸드오프와 동일)
    ack_required: bool = True          # 수신 확인 필수 여부
    ack_timeout: int = 30              # 수신 확인 대기 (초)
    retry_count: int = 3               # 전달 실패 시 재시도
    # tmux 폴백
    fallback_to_tmux: bool = True      # MCP 실패 시 tmux 폴백

@dataclass
class TeamDefinition:
    """확장된 팀 정의."""
    block_id: str
    adapter: str                       # "claude_agent_teams" | "human" | "webhook"
    config: dict = field(default_factory=dict)
    # 신규 필드
    communication: CommunicationConfig = field(default_factory=CommunicationConfig)
    teammates: list[TeammateSpec] = field(default_factory=list)
    idle_policy: IdlePolicy = field(default_factory=IdlePolicy)
    max_depth: int = 2                 # HP-002: 팀 깊이 제한
```

### 2.2 YAML 표현

```yaml
# .bkit/teams/cto-team.yaml
kind: Team
name: cto-team
spec:
  display_name: "개발팀"
  adapter: claude_agent_teams
  adapter_config:
    session: sdk-cto
    role: CTO_LEADER
    max_depth: 2

  communication:
    method: mcp                      # MCP(claude-peers) 사용
    ack_required: true               # 수신 확인 필수
    ack_timeout: 30
    retry_count: 3
    fallback_to_tmux: true           # MCP 실패 시 tmux 폴백

  teammates:
    - name: backend-dev
      role: developer
      model: opus
      lifetime: persistent           # CTO와 수명 동일
      permitted_tools:
        - Read
        - Write
        - Edit
        - Bash
        - Grep
        - Glob
        - Think

    - name: frontend-dev
      role: developer
      model: opus
      lifetime: persistent
      permitted_tools:
        - Read
        - Write
        - Edit
        - Bash
        - Grep
        - Glob
        - Think

    - name: code-reviewer
      role: researcher
      model: sonnet
      lifetime: ephemeral            # TASK 끝나면 자동 종료
      permitted_tools:
        - Read
        - Grep
        - Glob
        - Think

  idle_policy:
    action: terminate                # ephemeral → 종료, persistent → suspend
    timeout_seconds: 300             # 5분 idle 후 action
    notify_before: true
```

---

## 3. MCP 기반 TASK 전달 흐름

### 3.1 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Brick Engine                          │
│                                                         │
│  WorkflowExecutor                                       │
│       │                                                 │
│       ▼                                                 │
│  ClaudeAgentTeamsAdapter                                │
│       │                                                 │
│       ├─── method: mcp ────→ MCPBridge ──→ claude-peers │
│       │                        │                        │
│       │                   list_peers()                   │
│       │                   send_message()                 │
│       │                   check_messages()               │
│       │                        │                        │
│       │                   ┌────▼────┐                   │
│       │                   │ Peer DB │                   │
│       │                   └────┬────┘                   │
│       │                        │                        │
│       │                   ┌────▼─────────┐              │
│       │                   │ Target Agent │              │
│       │                   │ (sdk-cto)    │              │
│       │                   └──────────────┘              │
│       │                                                 │
│       └─── fallback: tmux ──→ tmux send-keys (기존)     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 3.2 MCP 전달 시퀀스

```
Engine.start_block(block)
  │
  ├─ 1. Peer Discovery
  │    └─ MCPBridge.find_peer(session="sdk-cto", role="CTO_LEADER")
  │        ├─ peer-map.json 조회 (캐시)
  │        ├─ list_peers(scope="repo") 호출
  │        └─ summary 매칭: "CTO_LEADER | bscamp | ..."
  │
  ├─ 2. 구조화 메시지 생성
  │    └─ {
  │         "protocol": "bscamp-team/v1",
  │         "type": "BLOCK_TASK",
  │         "block_id": "do",
  │         "what": "설계 기반 구현 + 테스트",
  │         "context": { "feature": "signup-fix", "workflow_id": "..." },
  │         "artifacts_expected": ["src/**/*.ts"],
  │         "gate_conditions": ["tsc --noEmit", "npm run build"],
  │         "priority": "P1",
  │         "ack_required": true
  │       }
  │
  ├─ 3. send_message(to_id=peer_id, message=JSON)
  │
  ├─ 4. ACK 대기 (ack_timeout: 30초)
  │    ├─ check_messages() 폴링 (5초 간격, 최대 6회)
  │    ├─ ACK 수신 → execution_id 기록 → 정상 진행
  │    └─ 타임아웃 → retry_count 소진 → fallback_to_tmux
  │
  └─ 5. 실패 처리
       ├─ MCP 전달 실패 + fallback=true → tmux send-keys (기존 방식)
       └─ MCP 전달 실패 + fallback=false → block.failed 이벤트
```

### 3.3 MCPBridge 클래스

```python
# brick/brick/adapters/mcp_bridge.py (신규)

class MCPBridge:
    """claude-peers MCP 서버와의 브릿지. 직접 호출이 아닌 broker HTTP API 사용."""

    def __init__(self, broker_port: int = 7899, cache_dir: Path = None):
        self.broker_url = f"http://localhost:{broker_port}"
        self.cache_dir = cache_dir or Path(".bkit/runtime")
        self._peer_cache: dict[str, str] = {}  # session → peer_id

    async def find_peer(self, session: str, role: str) -> str | None:
        """Peer 탐색: 캐시 → peer-map.json → broker API → summary 매칭."""

        # 1단계: 메모리 캐시
        if session in self._peer_cache:
            return self._peer_cache[session]

        # 2단계: peer-map.json (hook이 자동 갱신)
        peer_map = self.cache_dir / "peer-map.json"
        if peer_map.exists():
            data = json.loads(peer_map.read_text())
            for peer_id, info in data.items():
                if info.get("session") == session:
                    self._peer_cache[session] = peer_id
                    return peer_id

        # 3단계: broker API (list_peers)
        try:
            async with aiohttp.ClientSession() as http:
                resp = await http.post(
                    f"{self.broker_url}/list-peers",
                    json={"scope": "repo"},
                )
                if resp.status == 200:
                    peers = await resp.json()
                    for peer in peers:
                        summary = peer.get("summary", "")
                        if role in summary and session in summary:
                            self._peer_cache[session] = peer["id"]
                            return peer["id"]
        except Exception:
            pass

        return None

    async def send_task(
        self,
        peer_id: str,
        message: dict,
        ack_required: bool = True,
        ack_timeout: int = 30,
    ) -> tuple[bool, str | None]:
        """TASK 메시지 전송. (성공 여부, execution_id 또는 에러)"""
        try:
            async with aiohttp.ClientSession() as http:
                resp = await http.post(
                    f"{self.broker_url}/send-message",
                    json={
                        "to_id": peer_id,
                        "text": json.dumps(message, ensure_ascii=False),
                    },
                )
                if resp.status != 200:
                    return False, f"broker 응답 {resp.status}"

            if not ack_required:
                return True, message.get("execution_id")

            # ACK 폴링
            return await self._wait_ack(
                message.get("execution_id", ""),
                timeout=ack_timeout,
            )
        except Exception as e:
            return False, str(e)

    async def _wait_ack(
        self, execution_id: str, timeout: int, poll_interval: int = 5
    ) -> tuple[bool, str | None]:
        """ACK 메시지 대기. check_messages 폴링."""
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                async with aiohttp.ClientSession() as http:
                    resp = await http.post(f"{self.broker_url}/check-messages")
                    if resp.status == 200:
                        messages = await resp.json()
                        for msg in messages:
                            body = json.loads(msg.get("text", "{}"))
                            if (body.get("type") == "BLOCK_TASK_ACK"
                                and body.get("execution_id") == execution_id):
                                return True, execution_id
            except Exception:
                pass
            await asyncio.sleep(poll_interval)
        return False, "ACK 타임아웃"
```

### 3.4 메시지 프로토콜

기존 `bscamp-team/v1` 프로토콜을 확장:

| 메시지 타입 | 방향 | 용도 |
|-----------|------|------|
| `BLOCK_TASK` | Engine→Agent | 블록 실행 요청 |
| `BLOCK_TASK_ACK` | Agent→Engine | 수신 확인 |
| `BLOCK_PROGRESS` | Agent→Engine | 진행률 보고 |
| `BLOCK_COMPLETED` | Agent→Engine | 완료 보고 (artifacts 포함) |
| `BLOCK_FAILED` | Agent→Engine | 실패 보고 (error 포함) |
| `TEAMMATE_IDLE` | Agent→Engine | 팀원 idle 알림 |
| `TEAMMATE_SHUTDOWN` | Engine→Agent | 팀원 종료 요청 |

```json
// BLOCK_TASK
{
  "protocol": "bscamp-team/v1",
  "type": "BLOCK_TASK",
  "execution_id": "do-1712345678",
  "block_id": "do",
  "what": "설계 기반 구현 + 테스트",
  "context": {
    "feature": "signup-fix",
    "workflow_id": "signup-fix-1712345678",
    "design_path": "docs/02-design/features/signup-fix.design.md",
    "reject_reason": null
  },
  "artifacts_expected": ["src/**/*.ts", "__tests__/**/*.test.ts"],
  "gate_conditions": ["npx tsc --noEmit", "npm run build", "npx vitest run"],
  "permitted_tools": ["Read", "Write", "Edit", "Bash", "Grep", "Glob", "Think"],
  "priority": "P1"
}

// BLOCK_TASK_ACK
{
  "protocol": "bscamp-team/v1",
  "type": "BLOCK_TASK_ACK",
  "execution_id": "do-1712345678",
  "accepted": true
}

// BLOCK_COMPLETED
{
  "protocol": "bscamp-team/v1",
  "type": "BLOCK_COMPLETED",
  "execution_id": "do-1712345678",
  "artifacts": ["src/app/signup/page.tsx", "src/app/signup/actions.ts"],
  "metrics": {"lines_changed": 142, "test_count": 8}
}
```

---

## 4. 팀원 수명관리

### 4.1 Persistent vs Ephemeral

| 속성 | Persistent | Ephemeral |
|------|-----------|-----------|
| **수명** | 리더와 동일 (세션 전체) | TASK 시작~완료 (1회) |
| **예시** | backend-dev, frontend-dev | design-reader, code-reviewer |
| **컨텍스트** | 유지 (이전 대화 기억) | 없음 (매번 새로 시작) |
| **idle 시** | suspend (중단, 메모리 유지) | terminate (종료, 자원 회수) |
| **재시작** | resume (중단에서 복귀) | 새로 생성 |
| **비용** | 높음 (상시 대기 토큰) | 낮음 (필요할 때만) |

### 4.2 수명 흐름

```
Persistent 팀원:
  TeamCreate ──→ active ──→ TASK ──→ idle ──→ suspend ──→ TASK ──→ active ──→ ...
                                                │                         │
                                          idle_policy:              resume()
                                          timeout 5분 후
                                          suspend

Ephemeral 팀원:
  TeamCreate ──→ active ──→ TASK ──→ idle ──→ terminate ──→ (삭제)
                                        │
                                  idle_policy:
                                  timeout 1분 후
                                  terminate
```

### 4.3 Engine 수명관리 로직

```python
# brick/brick/engine/lifecycle.py (신규)

class TeammateLifecycleManager:
    """팀원 수명 관리. idle 감지 → 정책 적용."""

    def __init__(self, adapter: ClaudeAgentTeamsAdapter):
        self.adapter = adapter
        self._timers: dict[str, float] = {}  # member_name → idle_since

    async def on_teammate_idle(self, member_name: str, team_def: TeamDefinition):
        """TeammateIdle 이벤트 핸들러."""
        spec = self._find_spec(member_name, team_def)
        if not spec:
            return

        policy = team_def.idle_policy
        self._timers[member_name] = time.time()

        # 타임아웃 대기
        await asyncio.sleep(policy.timeout_seconds)

        # 타이머가 리셋됐으면 (새 TASK가 들어왔으면) 무시
        if self._timers.get(member_name, 0) != self._timers[member_name]:
            return

        if policy.notify_before:
            await self._notify_leader(member_name, spec.lifetime, policy.action)

        if spec.lifetime == "ephemeral":
            # 항상 terminate
            await self.adapter.terminate_member(member_name)
        elif spec.lifetime == "persistent":
            if policy.action == "suspend":
                await self.adapter.suspend_member(member_name)
            elif policy.action == "terminate":
                await self.adapter.terminate_member(member_name)
            # action == "keep" → 아무것도 안 함

    def on_task_assigned(self, member_name: str):
        """TASK 배정 시 idle 타이머 리셋."""
        self._timers.pop(member_name, None)

    def _find_spec(self, name: str, team_def: TeamDefinition) -> TeammateSpec | None:
        for spec in team_def.teammates:
            if spec.name == name:
                return spec
        return None

    async def _notify_leader(self, member_name: str, lifetime: str, action: str):
        """리더에게 idle 알림."""
        # MCPBridge를 통해 리더에 알림
        pass
```

### 4.4 idle_policy 적용 매트릭스

| lifetime | idle_policy.action | 결과 |
|---------|-------------------|------|
| persistent | keep | 아무것도 안 함 (비용 주의) |
| persistent | suspend | 팀원 중단 (컨텍스트 유지, 리소스 해제) |
| persistent | terminate | 팀원 종료 (컨텍스트 소실, 비권장) |
| ephemeral | * | 항상 terminate (lifetime이 우선) |

---

## 5. ClaudeAgentTeamsAdapter 수정

### 5.1 start_block 수정

```python
# brick/brick/adapters/claude_agent_teams.py — 수정

class ClaudeAgentTeamsAdapter(TeamAdapter, TeamManagementAdapter):

    def __init__(self, config: dict | None = None, root_dir: str = "."):
        config = config or {}
        self.root_dir = Path(root_dir)
        self.session = config.get("session", "default")
        self.broker_port = config.get("broker_port", 7899)
        self.peer_role = config.get("peer_role", "CTO_LEADER")
        self.team_context_dir = Path(config.get("team_context_dir", ".bkit/runtime"))

        # 신규: communication config
        comm = config.get("communication", {})
        self.comm_method = comm.get("method", "mcp")
        self.ack_required = comm.get("ack_required", True)
        self.ack_timeout = comm.get("ack_timeout", 30)
        self.retry_count = comm.get("retry_count", 3)
        self.fallback_to_tmux = comm.get("fallback_to_tmux", True)

        # 신규: MCP 브릿지
        self.mcp = MCPBridge(broker_port=self.broker_port, cache_dir=self.team_context_dir)

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"{block.id}-{int(time.time())}"

        if self.comm_method == "mcp":
            success = await self._start_via_mcp(block, context, execution_id)
            if success:
                return execution_id
            if self.fallback_to_tmux:
                return await self._start_via_tmux(block, execution_id)
            raise RuntimeError(f"MCP 전달 실패: {block.id}")

        return await self._start_via_tmux(block, execution_id)

    async def _start_via_mcp(
        self, block: Block, context: dict, execution_id: str
    ) -> bool:
        """MCP(claude-peers)를 통한 TASK 전달."""
        peer_id = await self.mcp.find_peer(self.session, self.peer_role)
        if not peer_id:
            return False

        message = {
            "protocol": "bscamp-team/v1",
            "type": "BLOCK_TASK",
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": context,
            "artifacts_expected": block.done.artifacts,
        }

        for attempt in range(self.retry_count):
            success, result = await self.mcp.send_task(
                peer_id, message,
                ack_required=self.ack_required,
                ack_timeout=self.ack_timeout,
            )
            if success:
                return True
            # 재시도 전 peer_id 캐시 무효화
            self.mcp._peer_cache.pop(self.session, None)
            peer_id = await self.mcp.find_peer(self.session, self.peer_role)
            if not peer_id:
                break

        return False

    async def _start_via_tmux(self, block: Block, execution_id: str) -> str:
        """기존 tmux send-keys 방식 (폴백)."""
        cmd = [
            "tmux", "send-keys", "-t", self.session,
            f"TASK: {block.what}", "Enter",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()
        return execution_id

    # 신규: 팀원 수명관리 메서드

    async def suspend_member(self, member_name: str) -> bool:
        """Persistent 팀원 중단. 컨텍스트 유지, 리소스 해제."""
        registry = self._load_registry()
        if member_name in registry:
            registry[member_name]["state"] = "suspended"
            self._save_registry(registry)
            return True
        return False

    async def terminate_member(self, member_name: str) -> bool:
        """팀원 종료. TeamDelete 호출."""
        registry = self._load_registry()
        if member_name in registry:
            registry[member_name]["state"] = "terminated"
            self._save_registry(registry)
            # 실제 종료는 auto-shutdown.sh의 3단계 절차 활용
            state_file = self.team_context_dir / f"shutdown-{member_name}.json"
            state_file.write_text(json.dumps({"action": "terminate", "member": member_name}))
            return True
        return False

    async def resume_member(self, member_name: str) -> bool:
        """Suspended 팀원 복귀."""
        registry = self._load_registry()
        if member_name in registry and registry[member_name]["state"] == "suspended":
            registry[member_name]["state"] = "active"
            self._save_registry(registry)
            return True
        return False

    def _load_registry(self) -> dict:
        path = self.team_context_dir / "teammate-registry.json"
        if path.exists():
            return json.loads(path.read_text())
        return {}

    def _save_registry(self, data: dict):
        path = self.team_context_dir / "teammate-registry.json"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
```

### 5.2 check_status 확장

```python
async def check_status(self, execution_id: str) -> AdapterStatus:
    # 기존: 파일 기반 폴링
    state_file = self.team_context_dir / f"task-state-{execution_id}.json"
    if state_file.exists():
        data = json.loads(state_file.read_text())
        return AdapterStatus(
            status=data.get("status", "running"),
            progress=data.get("progress"),
            message=data.get("message"),
        )

    # 신규: MCP 메시지 기반 상태 확인
    if self.comm_method == "mcp":
        status = await self._check_via_mcp(execution_id)
        if status:
            return status

    return AdapterStatus(status="running")

async def _check_via_mcp(self, execution_id: str) -> AdapterStatus | None:
    """BLOCK_COMPLETED/BLOCK_PROGRESS/BLOCK_FAILED 메시지 확인."""
    try:
        async with aiohttp.ClientSession() as http:
            resp = await http.post(f"{self.mcp.broker_url}/check-messages")
            if resp.status == 200:
                for msg in await resp.json():
                    body = json.loads(msg.get("text", "{}"))
                    if body.get("execution_id") != execution_id:
                        continue
                    if body["type"] == "BLOCK_COMPLETED":
                        # 파일에도 기록 (이중 저장)
                        self._save_task_state(execution_id, "completed", body)
                        return AdapterStatus(
                            status="completed",
                            message=body.get("message"),
                        )
                    elif body["type"] == "BLOCK_FAILED":
                        self._save_task_state(execution_id, "failed", body)
                        return AdapterStatus(
                            status="failed",
                            message=body.get("error"),
                        )
                    elif body["type"] == "BLOCK_PROGRESS":
                        return AdapterStatus(
                            status="running",
                            progress=body.get("progress"),
                            message=body.get("message"),
                        )
    except Exception:
        pass
    return None
```

---

## 6. tmux → MCP 마이그레이션

### 6.1 단계적 전환

```
Phase 1 (현재):   tmux only
Phase 2 (전환기): MCP 기본 + tmux 폴백 (fallback_to_tmux: true)
Phase 3 (안정):   MCP only + tmux 폴백 제거 (fallback_to_tmux: false)
```

### 6.2 Phase 2 설정

```yaml
# 기존 팀을 MCP로 전환
communication:
  method: mcp
  fallback_to_tmux: true    # Phase 2: 폴백 유지
  ack_required: true
  ack_timeout: 30
```

### 6.3 호환성 보장

| 기존 코드 | MCP 전환 후 |
|----------|-----------|
| `tmux send-keys -t sdk-cto "TASK: ..."` | `send_message(peer_id, BLOCK_TASK)` |
| `task-state-{id}.json` 파일 폴링 | MCP 메시지 + 파일 이중 체크 |
| `C-c` 시그널 | `TEAMMATE_SHUTDOWN` 메시지 + C-c 폴백 |
| `auto-shutdown.sh` 3단계 | TeammateLifecycleManager + auto-shutdown.sh 공존 |

### 6.4 hook 변경 최소화

기존 hook은 그대로 유지. Engine이 MCP를 사용하고, hook은 안전망으로 남음:

| hook | 변경 |
|------|------|
| `enforce-teamcreate.sh` | 변경 없음 — Agent spawn 차단 유지 |
| `pane-access-guard.sh` | Phase 3에서 비활성화 (MCP 사용 시 pane 직접 접근 없음) |
| `auto-shutdown.sh` | 변경 없음 — terminate 실행 시 여전히 사용 |
| `registry-update.sh` | teammates 필드 읽어 lifetime 기록 추가 |
| `agent-state-sync.sh` | idle 감지 후 Engine에 TEAMMATE_IDLE 메시지 전달 추가 |

---

## 7. DB 영향

### 7.1 brick_teams 테이블 활용

기존 `brick_teams` 테이블의 JSON 필드를 활용:

```typescript
// adapter_config JSON 확장
{
  session: "sdk-cto",
  role: "CTO_LEADER",
  max_depth: 2,
  permitted_tools: ["Read", "Write", ...],
  communication: { method: "mcp", ack_required: true, ... },
  idle_policy: { action: "terminate", timeout_seconds: 300, ... }
}

// members JSON 확장
[
  { name: "backend-dev", role: "developer", model: "opus",
    lifetime: "persistent", permitted_tools: [...] },
  { name: "frontend-dev", role: "developer", model: "opus",
    lifetime: "persistent", permitted_tools: [...] }
]
```

새 테이블 추가 없음. 기존 JSON 필드만 활용.

---

## 8. TDD 케이스

### MCP TASK 전달

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| TA-001 | MCPBridge.find_peer — peer-map.json에서 session 매칭 | §3.3 | peer_id 반환 |
| TA-002 | MCPBridge.find_peer — peer-map 없을 때 broker API 폴백 | §3.3 | summary 매칭 |
| TA-003 | MCPBridge.find_peer — peer 없으면 None | §3.3 | None 반환 |
| TA-004 | MCPBridge.send_task — 정상 전달 + ACK 수신 | §3.3 | (True, execution_id) |
| TA-005 | MCPBridge.send_task — ACK 타임아웃 | §3.3 | (False, "ACK 타임아웃") |
| TA-006 | MCPBridge.send_task — broker 미응답 | §3.3 | (False, 에러 메시지) |
| TA-007 | start_block method=mcp — 정상 전달 | §5.1 | execution_id 반환 |
| TA-008 | start_block method=mcp 실패 + fallback=true → tmux 전달 | §5.1 | tmux 폴백 성공 |
| TA-009 | start_block method=mcp 실패 + fallback=false → RuntimeError | §5.1 | 예외 발생 |
| TA-010 | start_block method=tmux — 기존 동작 유지 | §5.1 | tmux send-keys 호출 |

### 메시지 프로토콜

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| TA-011 | BLOCK_TASK 메시지 필수 필드 검증 | §3.4 | protocol, type, block_id, what 존재 |
| TA-012 | BLOCK_TASK_ACK 메시지 파싱 | §3.4 | accepted=true, execution_id 일치 |
| TA-013 | BLOCK_COMPLETED 메시지 → AdapterStatus(completed) | §5.2 | status="completed" |
| TA-014 | BLOCK_FAILED 메시지 → AdapterStatus(failed) | §5.2 | status="failed" |
| TA-015 | retry_count 소진 후 실패 | §3.2 | 3회 재시도 후 False |

### 팀원 수명관리

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| TA-016 | ephemeral 팀원 idle → terminate (idle_policy 무관) | §4.4 | state="terminated" |
| TA-017 | persistent 팀원 idle + action=suspend → suspend | §4.4 | state="suspended" |
| TA-018 | persistent 팀원 idle + action=keep → 상태 유지 | §4.4 | state="active" |
| TA-019 | persistent 팀원 idle + action=terminate → terminate | §4.4 | state="terminated" |
| TA-020 | suspended 팀원 resume → active | §5.1 | state="active" |
| TA-021 | TASK 배정 시 idle 타이머 리셋 | §4.3 | 타이머 제거 |
| TA-022 | idle_policy.timeout_seconds 준수 | §4.3 | 5분 후 action |
| TA-023 | idle_policy.notify_before=true → 리더 알림 후 action | §4.3 | 알림 + action |

### adapter_config 확장

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| TA-024 | TeammateSpec lifetime="persistent" 파싱 | §2.1 | lifetime 필드 |
| TA-025 | TeammateSpec lifetime="ephemeral" 파싱 | §2.1 | lifetime 필드 |
| TA-026 | CommunicationConfig method="mcp" 기본값 | §2.1 | method="mcp" |
| TA-027 | IdlePolicy action="terminate" 기본값 | §2.1 | action="terminate" |
| TA-028 | YAML에서 TeamDefinition 풀 파싱 | §2.2 | 전체 필드 검증 |

### 마이그레이션 호환

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| TA-029 | communication 미설정 → 기본값 mcp | §6.2 | method="mcp" |
| TA-030 | 기존 config (communication 없음) → tmux 동작 유지 | §6.3 | 하위 호환 |

### TDD 매핑 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §3 MCP 전달 | TA-001~10 | 10 |
| §3.4 프로토콜 | TA-011~15 | 5 |
| §4 수명관리 | TA-016~23 | 8 |
| §2 모델 확장 | TA-024~28 | 5 |
| §6 마이그레이션 | TA-029~30 | 2 |
| **합계** | | **30** |

**Gap 0%**: MCP 전달, 프로토콜, 수명관리, 모델 확장, 호환성 전부 TDD 존재.

---

## 9. 파일 구조

```
brick/brick/
├── models/
│   └── team.py                      # (수정) TeammateSpec, IdlePolicy, CommunicationConfig 추가
├── adapters/
│   ├── claude_agent_teams.py        # (수정) MCP 전달 + 수명관리 메서드
│   └── mcp_bridge.py               # (신규) MCPBridge 클래스
├── engine/
│   └── lifecycle.py                 # (신규) TeammateLifecycleManager
└── tests/
    └── test_team_adapter.py         # (신규) TA-001~030 TDD
```

---

## 10. 관련 문서

| 문서 | 경로 |
|------|------|
| PDCA 프리셋 Design | docs/02-design/features/brick-pdca-preset.design.md |
| Brick 백엔드 API | docs/02-design/features/brick-backend-api.design.md |
| 하네스 패턴 | docs/05-reference/harness-patterns.md |
| 상태 동기화 Design | docs/02-design/features/brick-cli-state-sync.design.md |
| Brick 원본 설계 | docs/02-design/features/brick-dashboard.design.md |
