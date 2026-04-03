# Brick 3×3 Gap Fill Design

> **피처**: brick-3x3-gap-fill (3×3 매트릭스 완전 자유도)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **선행**: brick-bugfix-sprint1, brick-sprint2-engine-sync, brick-engine-100pct (전부 구현 완료 전제)
> **근거**: docs/04-report/features/brick-engine-3x3-gap-analysis.report.md

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-3x3-gap-fill (3×3 매트릭스 완전 자유도) |
| **시작일** | 2026-04-04 |
| **빈 칸** | 4건 (Adapter 확장, cron 링크, compete finalize, 프리셋 검증) |

### 결과 요약

| 지표 | 값 |
|------|-----|
| **Gap Fill** | 4건 |
| **TDD 케이스** | 32건 (G1-01 ~ G1-32) |
| **불변식** | 12건 (INV-G1-1 ~ INV-G1-12) |
| **변경 파일** | 12건 (신규 3, 수정 9) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | Adapter 1/9만 실동작, cron/compete 미구현, 프리셋 검증 없음 → 3×3 자유도 불가 |
| **Solution** | webhook+human+claude_code 실연결, cron 스케줄러, compete 레이스, 프리셋 스키마 검증 |
| **Function UX Effect** | Plan(PM팀) → Design(PM팀) → Do(CTO팀) → QA(Codex) 같은 팀별 분업 워크플로우 가능 |
| **Core Value** | 블록마다 다른 팀이 다른 방식으로 일하는 3×3 자유도 완성 |

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

3개 Design(Sprint1+Sprint2+100%) 구현 후에도 남는 빈 칸 4개를 채워서 **"블록마다 다른 팀이 다른 도구로 일하고, 다양한 방식으로 연결되는"** 3×3 완전 자유도를 달성한다.

| # | Gap | 한 줄 정의 |
|---|-----|-----------|
| 1 | Adapter 확장 (P0) | webhook/human/claude_code 3종을 프로덕션 수준으로 |
| 2 | cron 링크 (P1) | 주기적 블록 재실행 (매일/매시간 자동) |
| 3 | compete finalize (P2) | 여러 팀 경쟁 → 1등만 통과, 나머지 취소 |
| 4 | 프리셋 스키마 검증 (P1) | 잘못된 YAML → 기동 전 차단 (런타임 에러 방지) |

### Step 2: 영향범위

```
Python 엔진 (6파일)
├── adapters/webhook.py        — HTTP 콜백 + 재시도 + 인증
├── adapters/human.py          — 대시보드 연동 + 타임아웃
├── adapters/claude_code.py    — MCP/tmux 실연결 + 상태 파일
├── engine/state_machine.py    — compete fan-out/finalize + cron dispatch
├── engine/executor.py         — PresetLoader 검증 + compete 모니터링
└── engine/cron_scheduler.py   — cron 스케줄러 (신규)

Express (2파일)
├── server/routes/brick/human-tasks.ts  — 수동 완료 API (신규)
└── server/routes/brick/index.ts        — human-tasks 라우트 등록

검증 (1파일)
└── engine/preset_validator.py — 프리셋 스키마 검증 (신규)

모델 (1파일)
└── engine/condition_evaluator.py — 파싱 실패 시 False 반환
```

### Step 3: 선행조건

| 선행 | 이유 |
|------|------|
| engine-100pct Phase B | adapter_failed 재시도가 있어야 새 어댑터들도 실패 복구 가능 |
| engine-100pct Phase D | ProcessManager가 있어야 Python 엔진 자동 기동 |
| Sprint1 Phase 1 | adapter_pool 주입 완료돼야 새 어댑터가 pool에 등록됨 |
| Sprint2 Step 2 | _monitor_block이 있어야 새 어댑터의 완료 감지 가능 |

### Step 4: 의존성 (4가지 항목 간)

```
[4. 프리셋 검증]                    ← 독립, 최우선 (다른 3개의 전제)
         │
[1. Adapter 확장]                   ← 검증 후, 3종 병렬 가능
         │
[3. compete finalize]               ← Adapter 복수 종이 있어야 의미
         │
[2. cron 링크]                      ← 독립, Adapter와 무관
```

**구현 순서**: Phase A (4) → Phase B (1+2 병렬) → Phase C (3)

### Step 5: 방법 도출

| # | 방법 | 대안 | 선택 이유 |
|---|------|------|----------|
| 1a | webhook: 기존 httpx 코드 강화 + callback URL | 새로 작성 | 이미 동작하는 코드 존재 |
| 1b | human: Express 엔드포인트 + eventBus 알림 | CLI만 | 대시보드에서 클릭으로 완료해야 UX |
| 1c | claude_code: MCPBridge(기존)로 peer 탐색 + tmux 폴백 | subprocess 직접 | claude_agent_teams 패턴 재사용. subprocess는 프로세스 추적 불가 |
| 2 | Python asyncio 기반 CronScheduler | OS crontab / node-cron | 엔진 내부에서 완결. 외부 의존 없음 |
| 3 | CompeteGroup 모델 + 첫 완료 시 나머지 cancel | 블록 복제 | 복제는 모델 변경 과다. 단일 블록에 다중 execution_id가 합리적 |
| 4 | PresetValidator 클래스 (로드 시 자동) | ValidationPipeline 재사용 | Pipeline은 대시보드 전용(BrickResource). 엔진은 raw YAML 검증 필요 |

### Step 6: 팀원 배정

| 항목 | 담당 | 이유 |
|------|------|------|
| webhook/human/claude_code | backend-dev | Python adapter 코드 |
| human-tasks Express API | backend-dev | Express 라우트 1개 |
| cron 스케줄러 | backend-dev | asyncio + state_machine 수정 |
| compete finalize | backend-dev | state_machine + executor 수정 |
| 프리셋 검증 | backend-dev | PresetLoader 내부 |
| TDD 전체 | backend-dev | 단일 담당자 |

---

## 1. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **기존 어댑터 인터페이스** | `TeamAdapter`: start_block, check_status, get_artifacts, cancel |
| **AdapterStatus** | status: running/completed/failed/waiting_human |
| **execution_id 규칙** | `{prefix}-{block.id}-{timestamp}` (staleness 감지용) |
| **상태 파일 규칙** | `.bkit/runtime/task-state-{execution_id}.json` |
| **engine-100pct와 충돌 금지** | block.adapter_failed, _checkpoint_lock, API Auth 모두 그대로 유지 |
| **LinkDefinition 모델** | teams: list[str], judge: dict, schedule: str — 현재 미파싱 |

---

## 2. Adapter 확장 — webhook (P0)

### 2.1 현재 상태

`webhook.py`에 httpx 기반 구현이 있다. config: `url`, `headers`, `timeout`(30s), `status_url`. `check_status`는 `status_url/{execution_id}` 폴링. 동작은 하지만 부족한 점:

| 부족 | 영향 |
|------|------|
| 콜백(callback) 미지원 | 폴링만 가능. 외부 서비스가 완료를 푸시할 수 없음 |
| HTTP 에러 매핑 없음 | 4xx/5xx → 무조건 실패. 재시도 판단 불가 |
| 인증 미지원 | Bearer token, API key 전송 불가 |
| 상태 파일 미작성 | EnginePoller 호환 불가 |

### 2.2 설계

**brick/brick/adapters/webhook.py** — 전면 강화:

```python
class WebhookAdapter(TeamAdapter):
    def __init__(self, config: dict | None = None):
        config = config or {}
        self.url = config.get("url", "")
        self.status_url = config.get("status_url", "")
        self.callback_url = config.get("callback_url", "")  # 외부→엔진 콜백
        self.headers = config.get("headers", {})
        self.timeout = config.get("timeout", 30)
        self.auth_type = config.get("auth_type", "")  # bearer | api_key | ""
        self.auth_value = config.get("auth_value", "")
        self.retry_on_status = config.get("retry_on_status", [502, 503, 504])
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"wh-{block.id}-{int(time.time())}"

        headers = {**self.headers}
        if self.auth_type == "bearer":
            headers["Authorization"] = f"Bearer {self.auth_value}"
        elif self.auth_type == "api_key":
            headers["X-API-Key"] = self.auth_value

        payload = {
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": context,
        }
        # callback_url이 있으면 포함 — 외부 서비스가 완료 시 이 URL로 POST
        if self.callback_url:
            payload["callback_url"] = self.callback_url

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(self.url, json=payload, headers=headers)

            if resp.status_code in self.retry_on_status:
                raise RuntimeError(f"Webhook 재시도 가능: HTTP {resp.status_code}")
            if resp.status_code >= 400:
                raise RuntimeError(f"Webhook 실패: HTTP {resp.status_code} — {resp.text[:200]}")

        # 상태 파일 초기화 (EnginePoller 호환)
        self._write_state(execution_id, {"status": "running", "started_at": time.time()})
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        # 1순위: 상태 파일 (콜백이 업데이트했을 수 있음)
        state = self._read_state(execution_id)
        if state and state.get("status") != "running":
            return AdapterStatus(
                status=state["status"],
                metrics=state.get("metrics"),
                artifacts=state.get("artifacts"),
                error=state.get("error"),
            )

        # 2순위: status_url 폴링
        if self.status_url:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                try:
                    resp = await client.get(f"{self.status_url}/{execution_id}")
                    if resp.status_code == 200:
                        data = resp.json()
                        status = data.get("status", "running")
                        if status != "running":
                            self._write_state(execution_id, data)
                        return AdapterStatus(
                            status=status,
                            metrics=data.get("metrics"),
                            artifacts=data.get("artifacts"),
                            error=data.get("error"),
                        )
                except httpx.HTTPError:
                    pass

        # 3순위: staleness 감지 (engine-100pct 패턴)
        try:
            start_ts = float(execution_id.rsplit("-", 1)[-1])
            if time.time() - start_ts > 600:
                return AdapterStatus(status="failed", error="Webhook 응답 타임아웃 (10분)")
        except (ValueError, IndexError):
            pass

        return AdapterStatus(status="running")

    async def cancel(self, execution_id: str) -> bool:
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state = self._read_state(execution_id)
        return state.get("artifacts", []) if state else []

    # --- 콜백 수신 (Express에서 호출) ---
    def receive_callback(self, execution_id: str, data: dict) -> None:
        """외부 서비스가 콜백으로 완료 알림 시 상태 파일 업데이트."""
        self._write_state(execution_id, {
            "status": data.get("status", "completed"),
            "metrics": data.get("metrics"),
            "artifacts": data.get("artifacts"),
            "error": data.get("error"),
        })

    def _write_state(self, execution_id: str, data: dict) -> None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None
```

### 2.3 콜백 엔드포인트

webhook adapter의 `callback_url`은 Express 쪽 엔드포인트를 가리킨다. 외부 서비스가 완료 시 이 URL로 POST하면 상태 파일이 업데이트되고, `_monitor_block`이 다음 폴링에서 완료를 감지한다.

**dashboard/server/routes/brick/webhook-callback.ts**에서 처리 (섹션 3의 human-tasks.ts와 함께 구현):

```typescript
app.post('/api/brick/webhook/callback/:executionId', requireBrickAuth, (req, res) => {
  const { executionId } = req.params;
  const stateFile = path.join('.bkit/runtime', `task-state-${executionId}.json`);
  fs.writeFileSync(stateFile, JSON.stringify({
    status: req.body.status || 'completed',
    metrics: req.body.metrics,
    artifacts: req.body.artifacts,
    error: req.body.error,
  }));
  res.json({ ok: true });
});
```

### 2.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-01 | `test_g1_01_webhook_start_block` | POST 전송 + 상태 파일 생성 | execution_id 반환, state=running |
| G1-02 | `test_g1_02_webhook_auth_bearer` | auth_type=bearer | Authorization 헤더 포함 |
| G1-03 | `test_g1_03_webhook_retry_on_502` | HTTP 502 응답 | RuntimeError 발생 → adapter_failed |
| G1-04 | `test_g1_04_webhook_callback_updates_state` | receive_callback 호출 | 상태 파일 completed로 업데이트 |
| G1-05 | `test_g1_05_webhook_check_status_poll` | status_url 폴링 | 외부 상태 반환 |

---

## 3. Adapter 확장 — human (P0)

### 3.1 현재 상태

`human.py`에 파일 기반 완료 체크가 있다. `start_block`이 stdout에 지시 출력, `check_status`가 `completions_dir/{execution_id}` 파일 존재 확인. 상태: `waiting_human` 또는 `completed`.

| 부족 | 영향 |
|------|------|
| stdout 출력만 | 대시보드에서 확인 불가 |
| 타임아웃 없음 | 영원히 waiting_human |
| 알림 없음 | Smith님이 승인 대기 중인지 모름 |

### 3.2 설계

**brick/brick/adapters/human.py** — 강화:

```python
class HumanAdapter(TeamAdapter):
    def __init__(self, config: dict | None = None):
        config = config or {}
        self.completions_dir = Path(config.get("completions_dir", ".bkit/runtime/human-completions"))
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))
        self.timeout_seconds = config.get("timeout_seconds", 86400)  # 24시간
        self.assignee = config.get("assignee", "smith")  # 담당자

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"hu-{block.id}-{int(time.time())}"

        # 상태 파일에 대기 정보 기록 (대시보드에서 조회 가능)
        self._write_state(execution_id, {
            "status": "waiting_human",
            "block_id": block.id,
            "what": block.what,
            "assignee": self.assignee,
            "started_at": time.time(),
            "timeout_at": time.time() + self.timeout_seconds,
            "context": {k: str(v)[:500] for k, v in context.items()},  # 요약
        })

        self.completions_dir.mkdir(parents=True, exist_ok=True)
        return execution_id

    async def check_status(self, execution_id: str) -> AdapterStatus:
        # 완료 파일 확인
        completion_file = self.completions_dir / execution_id
        if completion_file.exists():
            try:
                data = json.loads(completion_file.read_text())
            except json.JSONDecodeError:
                data = {}
            self._write_state(execution_id, {
                "status": "completed",
                "metrics": data.get("metrics", {}),
                "artifacts": data.get("artifacts", []),
            })
            return AdapterStatus(
                status="completed",
                metrics=data.get("metrics"),
                artifacts=data.get("artifacts"),
            )

        # 타임아웃 확인
        state = self._read_state(execution_id)
        if state and state.get("timeout_at"):
            if time.time() > state["timeout_at"]:
                return AdapterStatus(
                    status="failed",
                    error=f"수동 작업 타임아웃: {self.assignee}가 {self.timeout_seconds}초 내 완료하지 않음",
                )

        return AdapterStatus(status="waiting_human", message=f"대기 중: {self.assignee}")

    async def cancel(self, execution_id: str) -> bool:
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        completion_file = self.completions_dir / execution_id
        if completion_file.exists():
            try:
                data = json.loads(completion_file.read_text())
                return data.get("artifacts", [])
            except json.JSONDecodeError:
                pass
        return []

    def _write_state(self, execution_id: str, data: dict) -> None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data))

    def _read_state(self, execution_id: str) -> dict | None:
        path = self.runtime_dir / f"task-state-{execution_id}.json"
        if path.exists():
            return json.loads(path.read_text())
        return None
```

### 3.3 Express 수동 완료 API

**dashboard/server/routes/brick/human-tasks.ts** (신규):

```typescript
import { Express } from 'express';
import fs from 'fs';
import path from 'path';
import { eventBus } from '../../realtime/event-bus.js';

export function registerHumanTaskRoutes(app: Express): void {
  const completionsDir = path.resolve('.bkit/runtime/human-completions');
  const runtimeDir = path.resolve('.bkit/runtime');

  // 대기 중인 수동 작업 목록
  app.get('/api/brick/human/tasks', (req, res) => {
    if (!fs.existsSync(runtimeDir)) return res.json([]);

    const tasks = fs.readdirSync(runtimeDir)
      .filter(f => f.startsWith('task-state-hu-'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(runtimeDir, f), 'utf-8'));
        return { executionId: f.replace('task-state-', '').replace('.json', ''), ...data };
      })
      .filter(t => t.status === 'waiting_human');

    res.json(tasks);
  });

  // 수동 작업 완료
  app.post('/api/brick/human/complete/:executionId', (req, res) => {
    const { executionId } = req.params;
    const { metrics, artifacts } = req.body;

    fs.mkdirSync(completionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(completionsDir, executionId),
      JSON.stringify({ metrics: metrics || {}, artifacts: artifacts || [], completedAt: Date.now() }),
    );

    // eventBus로 알림 → WebSocket → 대시보드 즉시 갱신
    eventBus.emit('brick.human.completed', { executionId });
    res.json({ ok: true });
  });
}
```

### 3.4 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-06 | `test_g1_06_human_start_creates_state` | start_block | 상태 파일 생성, status=waiting_human |
| G1-07 | `test_g1_07_human_completion_file` | completions_dir에 파일 생성 | check_status → completed |
| G1-08 | `test_g1_08_human_timeout` | timeout_seconds 초과 | check_status → failed |
| G1-09 | `test_g1_09_human_tasks_api` | GET /api/brick/human/tasks | waiting_human 목록 반환 |
| G1-10 | `test_g1_10_human_complete_api` | POST /api/brick/human/complete | 완료 파일 생성 + eventBus |

---

## 4. Adapter 확장 — claude_code (P0)

### 4.1 현재 상태

`claude_code.py`는 `claude --print -m "TASK: ..."` subprocess를 fire-and-forget. `check_status`가 항상 `running` 반환. 프로세스 추적 없음.

### 4.2 설계

`claude_agent_teams` 패턴 재사용: MCPBridge로 peer 탐색 → tmux 폴백. 차이점은 **단일 에이전트** (팀이 아님).

**brick/brick/adapters/claude_code.py** — 전면 재작성:

```python
class ClaudeCodeAdapter(TeamAdapter):
    """
    단일 Claude Code 에이전트 어댑터.
    claude_agent_teams와 달리 팀 없이 단독 에이전트가 블록 실행.
    """
    def __init__(self, config: dict | None = None):
        config = config or {}
        self.session = config.get("session", "brick-claude")
        self.model = config.get("model", "")  # 미지정 시 기본 모델
        self.runtime_dir = Path(config.get("runtime_dir", ".bkit/runtime"))
        self.comm_method = config.get("method", "tmux")  # tmux | mcp
        self.mcp_broker_port = config.get("broker_port", 7899)
        self.mcp = MCPBridge(self.mcp_broker_port, str(self.runtime_dir))
        self.processes: dict[str, int] = {}  # execution_id → PID

    async def start_block(self, block: Block, context: dict) -> str:
        execution_id = f"cc-{block.id}-{int(time.time())}"

        if self.comm_method == "mcp":
            success = await self._start_via_mcp(block, context, execution_id)
            if not success:
                await self._start_via_tmux(block, context, execution_id)
        else:
            await self._start_via_tmux(block, context, execution_id)

        self._write_state(execution_id, {
            "status": "running",
            "block_id": block.id,
            "started_at": time.time(),
        })
        return execution_id

    async def _start_via_mcp(self, block: Block, context: dict, execution_id: str) -> bool:
        """MCP로 기동 중인 Claude Code 인스턴스에 작업 전달."""
        peer_id = await self.mcp.find_peer(role="CLAUDE_CODE")
        if not peer_id:
            return False

        message = json.dumps({
            "protocol": "bscamp-team/v1",
            "type": "BLOCK_TASK",
            "execution_id": execution_id,
            "block_id": block.id,
            "what": block.what,
            "context": {k: str(v)[:500] for k, v in context.items()},
        })

        success, _ = await self.mcp.send_task(peer_id, message, ack_timeout=30)
        return success

    async def _start_via_tmux(self, block: Block, context: dict, execution_id: str) -> None:
        """tmux 세션에서 Claude Code CLI 실행."""
        task_prompt = f"TASK: {block.what}"
        model_flag = f"--model {self.model}" if self.model else ""

        # tmux 세션 생성 (없으면)
        proc = await asyncio.create_subprocess_exec(
            "tmux", "has-session", "-t", self.session,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )
        await proc.wait()
        if proc.returncode != 0:
            create = await asyncio.create_subprocess_exec(
                "tmux", "new-session", "-d", "-s", self.session,
            )
            await create.wait()

        # Claude Code 실행 명령 전송
        cmd = f"claude {model_flag} -p \"{task_prompt}\""
        send = await asyncio.create_subprocess_exec(
            "tmux", "send-keys", "-t", self.session, cmd, "Enter",
        )
        await send.wait()

    async def check_status(self, execution_id: str) -> AdapterStatus:
        """상태 파일 기반 + staleness 감지."""
        state = self._read_state(execution_id)
        if state:
            status = state.get("status", "running")
            if status != "running":
                return AdapterStatus(
                    status=status,
                    metrics=state.get("metrics"),
                    artifacts=state.get("artifacts"),
                    error=state.get("error"),
                )

        # staleness (engine-100pct 패턴)
        try:
            start_ts = float(execution_id.rsplit("-", 1)[-1])
            if time.time() - start_ts > 600:
                return AdapterStatus(status="failed", error="Claude Code 응답 타임아웃")
        except (ValueError, IndexError):
            pass

        return AdapterStatus(status="running")

    async def cancel(self, execution_id: str) -> bool:
        """tmux 세션에 Ctrl+C 전송."""
        proc = await asyncio.create_subprocess_exec(
            "tmux", "send-keys", "-t", self.session, "C-c", "",
        )
        await proc.wait()
        self._write_state(execution_id, {"status": "failed", "error": "Cancelled"})
        return True

    async def get_artifacts(self, execution_id: str) -> list[str]:
        state = self._read_state(execution_id)
        return state.get("artifacts", []) if state else []

    def _write_state(self, eid: str, data: dict) -> None:
        p = self.runtime_dir / f"task-state-{eid}.json"
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(data))

    def _read_state(self, eid: str) -> dict | None:
        p = self.runtime_dir / f"task-state-{eid}.json"
        return json.loads(p.read_text()) if p.exists() else None
```

### 4.3 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-11 | `test_g1_11_claude_code_start_tmux` | start_block (tmux 모드) | tmux send-keys 호출 + 상태 파일 |
| G1-12 | `test_g1_12_claude_code_start_mcp` | start_block (mcp 모드) | MCPBridge.send_task 호출 |
| G1-13 | `test_g1_13_claude_code_check_status_file` | 상태 파일에 completed | AdapterStatus.status=completed |
| G1-14 | `test_g1_14_claude_code_cancel` | cancel 호출 | tmux C-c + 상태 파일 failed |
| G1-15 | `test_g1_15_claude_code_staleness` | 10분 초과 상태 파일 없음 | status=failed |

---

## 5. Adapter Pool 등록

3종의 어댑터를 `init_engine()`에서 adapter_pool에 등록해야 한다. Sprint1 BRK-QA-002에서 adapter_pool 주입이 설계됨 — 여기서는 pool 구성만 확장.

**brick/brick/dashboard/routes/engine_bridge.py** — `init_engine()` 수정:

```python
from brick.adapters.claude_agent_teams import ClaudeAgentTeamsAdapter
from brick.adapters.claude_code import ClaudeCodeAdapter
from brick.adapters.webhook import WebhookAdapter
from brick.adapters.human import HumanAdapter

def init_engine(root: str = ".bkit/") -> None:
    # ... 기존 코드 (Sprint1 수정 후) ...

    adapter_pool = {
        "claude_agent_teams": ClaudeAgentTeamsAdapter({}),
        "claude_code": ClaudeCodeAdapter({}),
        "webhook": WebhookAdapter({}),
        "human": HumanAdapter({}),
    }

    we = WorkflowExecutor(
        state_machine=sm, event_bus=eb, checkpoint=cs,
        gate_executor=ge, preset_loader=pl, validator=val,
        adapter_pool=adapter_pool,  # Sprint1에서 추가된 파라미터
    )
```

**동적 config**: 프리셋 YAML의 `teams.{block_id}.config`가 어댑터에 전달되어야 한다. 현재 executor는 `adapter_pool.get(adapter_name)`으로 가져오므로, 팀별 config는 `start_block`의 context에 포함.

**executor.py** — context에 team config 추가:

```python
# _execute_command StartBlockCommand 핸들러 (engine-100pct 설계에 추가)
team_def = instance.definition.teams.get(cmd.block_id)
team_config = team_def.config if team_def else {}

execution_id = await adapter.start_block(block_inst.block, {
    "workflow_id": instance.id,
    "block_id": cmd.block_id,
    "block_what": block_inst.block.what,
    "block_type": block_inst.block.type,
    "project_context": instance.context,
    "team_config": team_config,  # 프리셋 YAML의 팀별 설정
})
```

### 5.1 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-16 | `test_g1_16_adapter_pool_has_4_types` | init_engine 후 adapter_pool | 4종 모두 등록 |
| G1-17 | `test_g1_17_team_config_in_context` | start_block context | team_config 포함 |

---

## 6. cron 링크 구현 (P1)

### 6.1 현재 문제

`state_machine.py:229-230`에서 `cron` 링크 타입은 `pass`. 블록이 cron 아웃바운드만 가지면 dead-end.

`LinkDefinition.schedule`은 모델에 정의돼 있지만 PresetLoader가 파싱하지 않고, state_machine이 사용하지 않음.

### 6.2 설계: CronScheduler

cron은 "블록 완료 후 즉시 다음 블록"이 아니라 "지정된 스케줄에 다음 블록"이다. asyncio 기반 스케줄러가 워크플로우 수명 동안 유지.

**brick/brick/engine/cron_scheduler.py** (신규):

```python
import asyncio
import time
from dataclasses import dataclass
from croniter import croniter

@dataclass
class CronJob:
    workflow_id: str
    from_block_id: str
    to_block_id: str
    adapter: str
    schedule: str  # cron 표현식 (예: "0 0 * * *")
    max_runs: int
    run_count: int = 0

class CronScheduler:
    """워크플로우 내 cron 링크 스케줄링."""

    def __init__(self):
        self.jobs: dict[str, CronJob] = {}  # job_key → CronJob
        self._tasks: dict[str, asyncio.Task] = {}
        self._running = False

    def register(self, job: CronJob) -> None:
        """cron 링크에서 호출. _find_next_blocks가 cron 링크를 만나면 여기에 등록."""
        key = f"{job.workflow_id}:{job.from_block_id}:{job.to_block_id}"
        self.jobs[key] = job

    def unregister_workflow(self, workflow_id: str) -> None:
        """워크플로우 종료 시 해당 cron job 전부 제거."""
        to_remove = [k for k, j in self.jobs.items() if j.workflow_id == workflow_id]
        for k in to_remove:
            if k in self._tasks:
                self._tasks[k].cancel()
                del self._tasks[k]
            del self.jobs[k]

    def start(self, emit_callback) -> None:
        """스케줄러 시작. emit_callback(job)은 executor가 블록을 큐잉하는 함수."""
        self._running = True
        for key, job in self.jobs.items():
            if key not in self._tasks:
                self._tasks[key] = asyncio.create_task(
                    self._run_job(key, job, emit_callback)
                )

    def stop(self) -> None:
        """스케줄러 중지."""
        self._running = False
        for task in self._tasks.values():
            task.cancel()
        self._tasks.clear()

    async def _run_job(self, key: str, job: CronJob, emit_callback) -> None:
        """단일 cron job 실행 루프."""
        cron = croniter(job.schedule, time.time())

        while self._running and job.run_count < job.max_runs:
            next_run = cron.get_next(float)
            delay = next_run - time.time()
            if delay > 0:
                await asyncio.sleep(delay)

            if not self._running:
                break

            job.run_count += 1
            await emit_callback(job)
```

### 6.3 설계: state_machine 수정

**state_machine.py** — `_find_next_blocks`의 `cron` 케이스:

```python
elif link.type == "cron":
    # cron은 즉시 큐잉하지 않음 → 스케줄러에 등록
    if hasattr(self, 'cron_scheduler') and self.cron_scheduler:
        to_block = wf.blocks.get(link.to_block)
        self.cron_scheduler.register(CronJob(
            workflow_id=wf.id,
            from_block_id=block_id,
            to_block_id=link.to_block,
            adapter=to_block.adapter if to_block else "",
            schedule=link.schedule or "0 * * * *",  # 기본: 매시간
            max_runs=link.max_retries or 999,
        ))
    # next_ids에 추가하지 않음 — 스케줄러가 나중에 큐잉
```

### 6.4 설계: executor 연동

**executor.py** — CronScheduler 통합:

```python
class WorkflowExecutor:
    def __init__(self, ..., cron_scheduler: CronScheduler | None = None):
        # ...
        self.cron_scheduler = cron_scheduler or CronScheduler()
        self.state_machine.cron_scheduler = self.cron_scheduler  # state_machine에 전달

    async def start(self, preset_name, feature, task, ...):
        # ... 기존 시작 로직 ...

        # cron 스케줄러 시작
        self.cron_scheduler.start(emit_callback=self._cron_emit)

    async def _cron_emit(self, job: CronJob) -> None:
        """cron 트리거 시 블록 큐잉."""
        instance = self.checkpoint.load(job.workflow_id)
        if not instance or instance.status != WorkflowStatus.RUNNING:
            self.cron_scheduler.unregister_workflow(job.workflow_id)
            return

        block_inst = instance.blocks.get(job.to_block_id)
        if not block_inst:
            return

        # 블록 재큐잉
        async with self._checkpoint_lock:
            block_inst.status = BlockStatus.QUEUED
            block_inst.retry_count = 0
            instance.current_block_id = job.to_block_id
            self.checkpoint.save(instance.id, instance)

        # StartBlockCommand 실행
        await self._execute_command(instance, StartBlockCommand(
            block_id=job.to_block_id,
            adapter=job.adapter,
        ))
```

### 6.5 설계: PresetLoader에서 schedule 파싱

**executor.py** — `_parse_preset` 링크 파싱 부분:

```python
# 기존 (link 파싱, 약 line 120-131)
links.append(LinkDefinition(
    from_block=link["from"],
    to_block=link["to"],
    type=link.get("type", "sequential"),
    condition=link.get("condition", {}),
    max_retries=link.get("max_retries", 3),
    schedule=link.get("schedule", ""),     # cron 표현식 파싱 추가
    teams=link.get("teams", []),           # compete 팀 목록 파싱 추가
    judge=link.get("judge", {}),           # compete 심사 설정 파싱 추가
))
```

### 6.6 의존성: croniter

```
pip install croniter
```

`croniter`는 Python 표준 cron 표현식 파서. 경량 (의존성 없음).

### 6.7 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-18 | `test_g1_18_cron_register_job` | cron 링크 → 스케줄러 등록 | jobs에 등록됨, next_ids 비어있음 |
| G1-19 | `test_g1_19_cron_fires_on_schedule` | 1초 후 트리거 설정 | _cron_emit 호출 → 블록 QUEUED |
| G1-20 | `test_g1_20_cron_max_runs` | max_runs=2 | 2회 실행 후 중단 |
| G1-21 | `test_g1_21_cron_unregister_on_complete` | 워크플로우 완료 | cron job 전부 제거 |
| G1-22 | `test_g1_22_cron_schedule_parsed` | YAML에 schedule 필드 | LinkDefinition.schedule에 값 |

---

## 7. compete finalize (P2)

### 7.1 현재 문제

`_find_next_blocks`에서 compete는 `next_ids.append(link.to_block)`만 하고 끝. `link.teams`와 `link.judge`를 읽지 않음. parallel과 동일 동작.

### 7.2 설계: CompeteGroup

compete의 핵심: **같은 블록을 여러 팀이 경쟁 실행 → 1등 완료 시 나머지 취소**.

모델: `CompeteGroup` — 단일 블록에 대한 복수 실행 추적.

```python
@dataclass
class CompeteExecution:
    adapter: str
    execution_id: str | None = None
    status: str = "pending"  # pending | running | completed | cancelled

@dataclass
class CompeteGroup:
    block_id: str
    executions: list[CompeteExecution]
    winner: str | None = None  # 승자 adapter
```

### 7.3 설계: state_machine 수정

**state_machine.py** — `_find_next_blocks` compete 케이스:

```python
elif link.type == "compete":
    if link.teams:
        # compete: 여러 팀 경쟁 → CompeteCommand 발행
        commands.append(CompeteStartCommand(
            block_id=link.to_block,
            teams=link.teams,          # ["claude_agent_teams", "claude_code", ...]
            judge=link.judge or {},     # {"strategy": "first_complete"} 등
        ))
        # next_ids에 추가하지 않음 — CompeteStartCommand가 별도 처리
    else:
        # teams 미지정 → sequential과 동일 (하위호환)
        next_ids.append(link.to_block)
```

### 7.4 설계: executor CompeteStartCommand 처리

**executor.py** — `_execute_command`에 새 Command:

```python
elif isinstance(cmd, CompeteStartCommand):
    block_inst = instance.blocks.get(cmd.block_id)
    if not block_inst:
        return

    # CompeteGroup 생성
    compete_group = CompeteGroup(
        block_id=cmd.block_id,
        executions=[CompeteExecution(adapter=team) for team in cmd.teams],
    )

    # 각 팀으로 블록 시작
    for i, comp_exec in enumerate(compete_group.executions):
        adapter = self.adapter_pool.get(comp_exec.adapter)
        if not adapter:
            comp_exec.status = "failed"
            continue

        try:
            eid = await adapter.start_block(block_inst.block, {
                "workflow_id": instance.id,
                "block_id": cmd.block_id,
                "block_what": block_inst.block.what,
                "compete_index": i,
                "compete_total": len(cmd.teams),
                "project_context": instance.context,
            })
            comp_exec.execution_id = eid
            comp_exec.status = "running"
        except Exception:
            comp_exec.status = "failed"

    # 블록 상태 → RUNNING, compete_group을 metadata에 저장
    block_inst.status = BlockStatus.RUNNING
    block_inst.block.metadata["compete_group"] = asdict(compete_group)
    async with self._checkpoint_lock:
        self.checkpoint.save(instance.id, instance)

    # compete 전용 모니터링 시작
    asyncio.create_task(self._monitor_compete(instance, cmd.block_id))
```

### 7.5 설계: _monitor_compete

```python
async def _monitor_compete(self, instance: WorkflowInstance, block_id: str):
    """compete 블록 모니터링. 1등 완료 시 나머지 취소."""
    POLL_INTERVAL = 5  # compete는 더 빈번하게

    while True:
        await asyncio.sleep(POLL_INTERVAL)

        instance = self.checkpoint.load(instance.id)
        if not instance:
            break
        block_inst = instance.blocks.get(block_id)
        if not block_inst or block_inst.status != BlockStatus.RUNNING:
            break

        group_data = block_inst.block.metadata.get("compete_group")
        if not group_data:
            break
        group = CompeteGroup(**group_data)

        winner = None
        for comp_exec in group.executions:
            if comp_exec.status != "running" or not comp_exec.execution_id:
                continue

            adapter = self.adapter_pool.get(comp_exec.adapter)
            if not adapter:
                continue

            try:
                status = await adapter.check_status(comp_exec.execution_id)
                if status.status == "completed":
                    winner = comp_exec
                    break
                elif status.status == "failed":
                    comp_exec.status = "failed"
            except Exception:
                pass

        if winner:
            # 승자 결정 → 나머지 취소
            group.winner = winner.adapter
            for comp_exec in group.executions:
                if comp_exec != winner and comp_exec.status == "running":
                    adapter = self.adapter_pool.get(comp_exec.adapter)
                    if adapter and comp_exec.execution_id:
                        try:
                            await adapter.cancel(comp_exec.execution_id)
                        except Exception:
                            pass
                    comp_exec.status = "cancelled"

            winner.status = "completed"
            block_inst.block.metadata["compete_group"] = asdict(group)
            block_inst.execution_id = winner.execution_id

            # complete_block으로 gate 실행 → 다음 블록 진행
            try:
                async with self._checkpoint_lock:
                    await self.complete_block(instance.id, block_id)
            except Exception:
                pass
            break

        # 전부 실패?
        all_done = all(e.status != "running" for e in group.executions)
        if all_done:
            event = Event(type="block.failed", data={
                "block_id": block_id,
                "error": "Compete: 모든 팀 실패",
            })
            async with self._checkpoint_lock:
                instance, cmds = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
            await self._execute_commands(instance, cmds)
            break

        # group 상태 저장
        block_inst.block.metadata["compete_group"] = asdict(group)
        async with self._checkpoint_lock:
            self.checkpoint.save(instance.id, instance)
```

### 7.6 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-23 | `test_g1_23_compete_starts_multiple` | compete link teams=3 | 3개 adapter.start_block 호출 |
| G1-24 | `test_g1_24_compete_first_wins` | 팀 A 완료, 팀 B/C 실행 중 | 팀 A=winner, B/C cancel 호출 |
| G1-25 | `test_g1_25_compete_all_fail` | 3팀 모두 실패 | block.failed 이벤트 |
| G1-26 | `test_g1_26_compete_no_teams_fallback` | teams=[] | sequential과 동일 동작 |
| G1-27 | `test_g1_27_compete_group_in_metadata` | compete 실행 중 | block.metadata에 CompeteGroup 저장 |

---

## 8. 프리셋 스키마 검증 (P1)

### 8.1 현재 문제

`PresetLoader._parse_preset()`이 YAML을 파싱하지만 검증을 하지 않는다:
- 블록 ID 중복 → 나중 블록이 덮어쓰기
- `link.from`/`link.to`가 존재하지 않는 블록 참조 → 런타임 KeyError
- 팀 없는 블록 → adapter_pool에서 빈 문자열 조회 → silent no-op
- `link.type`이 오타 → `_find_next_blocks`에서 아무 케이스도 안 걸림
- `condition` 파싱 불가 문자열 → `evaluate_condition`이 True 반환 (위험)

### 8.2 설계: PresetValidator

**brick/brick/engine/preset_validator.py** (신규):

```python
from dataclasses import dataclass

VALID_LINK_TYPES = {"sequential", "parallel", "compete", "loop", "cron", "branch"}
VALID_GATE_TYPES = {"command", "http", "prompt", "agent", "review", "metric", "approval"}
VALID_ADAPTERS = {"claude_agent_teams", "claude_code", "codex", "human",
                  "human_management", "management", "mcp_bridge", "webhook"}

@dataclass
class ValidationError:
    field: str
    message: str
    severity: str = "error"  # error | warning

class PresetValidator:
    """프리셋 로드 시 스키마 검증. 에러가 있으면 워크플로우 시작을 차단."""

    def validate(self, definition: 'WorkflowDefinition') -> list[ValidationError]:
        errors: list[ValidationError] = []

        block_ids = set()
        for block in definition.blocks:
            # 블록 ID 중복 검사
            if block.id in block_ids:
                errors.append(ValidationError(
                    field=f"blocks[{block.id}]",
                    message=f"블록 ID '{block.id}' 중복",
                ))
            block_ids.add(block.id)

            # what 필드 존재 확인
            if not block.what:
                errors.append(ValidationError(
                    field=f"blocks[{block.id}].what",
                    message=f"블록 '{block.id}'에 what 필드 없음",
                ))

        # 링크 검증
        for i, link in enumerate(definition.links):
            # from/to 블록 존재 확인
            if link.from_block not in block_ids:
                errors.append(ValidationError(
                    field=f"links[{i}].from",
                    message=f"링크 from '{link.from_block}'이 존재하지 않는 블록",
                ))
            if link.to_block not in block_ids:
                errors.append(ValidationError(
                    field=f"links[{i}].to",
                    message=f"링크 to '{link.to_block}'이 존재하지 않는 블록",
                ))

            # 링크 타입 유효성
            if link.type not in VALID_LINK_TYPES:
                errors.append(ValidationError(
                    field=f"links[{i}].type",
                    message=f"알 수 없는 링크 타입: '{link.type}'",
                ))

            # cron 링크에 schedule 필수
            if link.type == "cron" and not link.schedule:
                errors.append(ValidationError(
                    field=f"links[{i}].schedule",
                    message=f"cron 링크에 schedule 필드 없음",
                ))

            # compete 링크에 teams 경고
            if link.type == "compete" and not link.teams:
                errors.append(ValidationError(
                    field=f"links[{i}].teams",
                    message=f"compete 링크에 teams 없음 — sequential로 동작",
                    severity="warning",
                ))

            # condition 파싱 검증
            if link.condition and isinstance(link.condition, str):
                if not self._validate_condition_syntax(link.condition):
                    errors.append(ValidationError(
                        field=f"links[{i}].condition",
                        message=f"조건식 파싱 불가: '{link.condition}'",
                    ))

        # 팀 검증
        for block in definition.blocks:
            if block.id not in definition.teams:
                errors.append(ValidationError(
                    field=f"teams[{block.id}]",
                    message=f"블록 '{block.id}'에 팀 미할당",
                ))
            else:
                team = definition.teams[block.id]
                if team.adapter not in VALID_ADAPTERS:
                    errors.append(ValidationError(
                        field=f"teams[{block.id}].adapter",
                        message=f"알 수 없는 어댑터: '{team.adapter}'",
                        severity="warning",
                    ))

        # gate handler 타입 검증
        for block in definition.blocks:
            if block.gate:
                for j, handler in enumerate(block.gate.handlers):
                    if handler.type not in VALID_GATE_TYPES:
                        errors.append(ValidationError(
                            field=f"blocks[{block.id}].gate.handlers[{j}].type",
                            message=f"알 수 없는 게이트 타입: '{handler.type}'",
                        ))

        return errors

    def _validate_condition_syntax(self, condition: str) -> bool:
        """조건식 문법 검증 (평가하지 않고 파싱만)."""
        import re
        pattern = r'^\s*\w+\s*(>=|<=|>|<|==|!=)\s*.+\s*$'
        return bool(re.match(pattern, condition.strip()))
```

### 8.3 설계: executor에서 검증 호출

**executor.py** — `start()` 메서드:

```python
from brick.engine.preset_validator import PresetValidator

async def start(self, preset_name, feature, task, ...):
    definition = self.preset_loader.load(preset_name)

    # 프리셋 검증 (신규)
    validator = PresetValidator()
    errors = validator.validate(definition)
    real_errors = [e for e in errors if e.severity == "error"]
    if real_errors:
        error_msg = "; ".join(f"{e.field}: {e.message}" for e in real_errors)
        raise ValueError(f"프리셋 검증 실패: {error_msg}")

    warnings = [e for e in errors if e.severity == "warning"]
    for w in warnings:
        self.event_bus.emit("preset.validation_warning", {
            "field": w.field, "message": w.message,
        })

    # 이후 기존 워크플로우 시작 로직...
```

### 8.4 설계: condition_evaluator 파싱 실패 수정

현재 `_evaluate_str_condition`의 line 46: `if not match: return True` — 파싱 실패 시 **True**는 위험. False로 변경.

**condition_evaluator.py**:

```python
# AS-IS (line 46)
if not match:
    return True  # ← 위험: 오타 조건이 항상 통과

# TO-BE
if not match:
    return False  # 파싱 불가 조건은 차단 (안전한 기본값)
```

### 8.5 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| G1-28 | `test_g1_28_validate_duplicate_block_id` | 블록 ID 중복 | ValidationError |
| G1-29 | `test_g1_29_validate_broken_link_ref` | link.to가 없는 블록 | ValidationError |
| G1-30 | `test_g1_30_validate_unknown_link_type` | link.type="magic" | ValidationError |
| G1-31 | `test_g1_31_validate_missing_team` | 블록에 팀 미할당 | ValidationError |
| G1-32 | `test_g1_32_condition_parse_fail_returns_false` | "match_rate lt 90" | evaluate_condition → False |

---

## 9. 파일 변경 목록

| 파일 | 변경 유형 | 섹션 | 내용 |
|------|----------|------|------|
| `brick/brick/adapters/webhook.py` | 수정 | 2 | 콜백+인증+상태파일+재시도 |
| `brick/brick/adapters/human.py` | 수정 | 3 | 타임아웃+상태파일+대시보드 연동 |
| `brick/brick/adapters/claude_code.py` | 수정 | 4 | MCP/tmux 실연결 전면 재작성 |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | 5 | adapter_pool 4종 등록 |
| `brick/brick/engine/executor.py` | 수정 | 5,6,7 | team_config context + cron + compete |
| `brick/brick/engine/state_machine.py` | 수정 | 6,7 | cron→scheduler + compete→CompeteStartCommand |
| `brick/brick/engine/condition_evaluator.py` | 수정 | 8 | 파싱 실패 → False |
| `brick/brick/engine/cron_scheduler.py` | **신규** | 6 | asyncio 기반 cron 스케줄러 |
| `brick/brick/engine/preset_validator.py` | **신규** | 8 | 프리셋 스키마 검증 |
| `dashboard/server/routes/brick/human-tasks.ts` | **신규** | 3 | 수동 완료 API |
| `dashboard/server/routes/brick/index.ts` | 수정 | 3 | human-tasks 라우트 등록 |
| `dashboard/requirements.txt` 또는 `pyproject.toml` | 수정 | 6 | croniter 의존성 추가 |

---

## 10. TDD 총괄

| 섹션 | TDD ID | 건수 |
|------|--------|------|
| webhook adapter | G1-01 ~ G1-05 | 5건 |
| human adapter | G1-06 ~ G1-10 | 5건 |
| claude_code adapter | G1-11 ~ G1-15 | 5건 |
| adapter pool 등록 | G1-16 ~ G1-17 | 2건 |
| cron 링크 | G1-18 ~ G1-22 | 5건 |
| compete finalize | G1-23 ~ G1-27 | 5건 |
| 프리셋 검증 | G1-28 ~ G1-32 | 5건 |
| **합계** | | **32건** |

---

## 11. 불변식

| ID | 규칙 | 검증 TDD |
|----|------|----------|
| INV-G1-1 | webhook adapter는 retry_on_status(502/503/504)에서 RuntimeError를 발생시켜 adapter_failed 재시도를 타야 함 | G1-03 |
| INV-G1-2 | webhook 콜백 수신 시 상태 파일이 즉시 업데이트돼야 함 | G1-04 |
| INV-G1-3 | human adapter는 timeout_seconds 초과 시 failed를 반환해야 함 | G1-08 |
| INV-G1-4 | human 수동 완료 시 eventBus로 알림이 발행돼야 함 | G1-10 |
| INV-G1-5 | claude_code adapter는 MCP 실패 시 tmux로 폴백해야 함 | G1-12 |
| INV-G1-6 | 모든 adapter는 execution_id에 타임스탬프를 포함해야 함 (staleness 감지용) | G1-01, G1-06, G1-11 |
| INV-G1-7 | cron 링크는 _find_next_blocks에서 next_ids에 추가하면 안 됨 (스케줄러만) | G1-18 |
| INV-G1-8 | cron job은 워크플로우 완료 시 전부 unregister돼야 함 | G1-21 |
| INV-G1-9 | compete는 1등 완료 시 나머지 실행을 cancel해야 함 | G1-24 |
| INV-G1-10 | compete 팀 미지정 시 sequential 동작으로 폴백해야 함 | G1-26 |
| INV-G1-11 | 프리셋 검증 에러가 있으면 워크플로우 시작을 차단해야 함 | G1-28, G1-29 |
| INV-G1-12 | condition 파싱 실패 시 False를 반환해야 함 (True 금지) | G1-32 |

---

## 12. 구현 순서 (Phase)

```
Phase A: 프리셋 검증 (독립 — 다른 3개의 안전망)
├── PresetValidator (preset_validator.py)
├── executor.start()에서 검증 호출
├── condition_evaluator 파싱 실패 → False
└── PresetLoader에서 link.teams/schedule/judge 파싱

Phase B-1: Adapter 확장 (Phase A 완료 후, B-2와 병렬)
├── webhook.py 강화
├── human.py 강화 + human-tasks.ts
├── claude_code.py 재작성
└── adapter_pool 4종 등록

Phase B-2: cron 링크 (Phase A 완료 후, B-1과 병렬)
├── cron_scheduler.py (신규)
├── state_machine.py cron 케이스
└── executor.py cron 연동

Phase C: compete finalize (Phase B-1 완료 후)
├── CompeteGroup 모델
├── state_machine.py compete 케이스
├── executor.py CompeteStartCommand + _monitor_compete
└── 통합 테스트
```

---

## 13. engine-100pct.design.md와의 충돌 확인

| engine-100pct 설계 | 이 Design | 충돌 |
|-------------------|----------|------|
| block.adapter_failed 이벤트 | 새 adapter에서도 동일 이벤트 사용 | ✅ 호환 |
| _checkpoint_lock | compete/cron에서도 Lock 사용 | ✅ 호환 |
| RetryAdapterCommand | 새 adapter 실패 시 동일 재시도 경로 | ✅ 호환 |
| ProcessManager | Python 엔진 기동에 영향 없음 | ✅ 호환 |
| API Auth (requireBrickAuth) | human-tasks.ts에도 적용 | ✅ 호환 |
| Shell Injection allowlist | adapter와 무관 (gate 전용) | ✅ 호환 |

**충돌 0건.**

---

*Design 끝 — 3×3 Gap Fill: Adapter 3종 + cron 링크 + compete finalize + 프리셋 검증*
