# TASK: brick-3axis-plugin

**담당**: PM (sdk-pm)
**산출물**: docs/02-design/features/brick-3axis-plugin.design.md
**레벨**: L2 Design (Plan 생략 — COO가 방향 확정)
**우선순위**: P0 — 이 없으면 브릭을 남이 못 씀

---

## 배경 (COO 6단계 사고 결과)

### Step 1. 재해석
브릭 3×3축을 오픈소스로 만들어서 **누구든 자기만의 Gate/Link/Adapter를 추가**할 수 있게 한다.
현재는 3축 모두 코드 직접 수정 없이는 확장 불가능 → 오픈소스로 배포해도 포크해야만 커스텀 가능.

### Step 2. 영향범위
| 파일 | 변경 내용 |
|------|----------|
| `brick/brick/gates/base.py` | `match handler.type` → dict 레지스트리 |
| `brick/brick/engine/state_machine.py` | `elif link.type ==` → dict 레지스트리 |
| `brick/brick/engine/preset_validator.py` | `VALID_*` 셋 → 레지스트리 기반 동적 검증 |
| `brick/brick/dashboard/routes/engine_bridge.py` | `adapter_pool` dict → 자동 발견/등록 |

### Step 3. 선행 확인
- 3×3 자유도 100% 달성 (engine-100pct + 3x3-gap-fill 완료)
- Paperclip 오픈소스 코드 검토 완료 (`/Users/smith/projects/paperclip`)

### Step 4. 과거 결정
- Smith님: "3축 자체를 누구든 쓸 수 있게 하고 싶다"
- Smith님: "Paperclip 코드 읽고 우리가 직접 구현할 때 편하게"
- 3축 = Brick(제어) / Team(자유) / Link(자유)

### Step 5. 옵션 검토 결과
Paperclip `definePlugin`은 이벤트/Job 구독용 — Gate/Link 등록 구조가 아님.
→ Gate/Link 레지스트리는 직접 만들어야 함.
→ Team 어댑터 실행은 Paperclip `claude-local/execute.ts` 패턴을 Python으로 포팅.

### Step 6. 판단
3축 각각 플러그인 레지스트리 패턴으로 전환. 기존 빌트인은 그대로 동작(하위호환).

---

## 3축 현황 (코드 직접 확인 기준)

### 🧱 Brick 축 (Gate) — 플러그인 등록 없음
```python
# gate/base.py — 현재
match handler.type:
    case "command": return await self._run_command(...)
    case "http": return await self._run_http(...)
    # 7개 하드코딩
```
→ 외부에서 새 Gate 타입 추가 불가

### 🔗 Link 축 — 플러그인 등록 없음
```python
# state_machine.py — 현재
if link.type == "sequential": ...
elif link.type == "loop": ...
# 6개 elif 체인
```
→ 외부에서 새 Link 타입 추가 불가

### 👥 Team 축 (Adapter) — ABC는 있으나 자동 발견 없음
```python
# engine_bridge.py — 현재
adapter_pool = {
    "claude_agent_teams": ClaudeAgentTeamsAdapter({}),
    "claude_code": ClaudeCodeAdapter({}),
    # 하드코딩
}
```
→ TeamAdapter 상속하면 되지만, pool에 수동 등록 필요

---

## 설계 범위

### 1. Gate Registry (Brick 축)
`match` → `dict` 기반 레지스트리:
```python
# 목표
gate_registry.register("my-custom-gate", MyGateHandler)
```
- 빌트인 7종 자동 등록
- 외부 Gate 핸들러: `GateHandler` 프로토콜 구현 → `register()` 호출
- `PresetValidator`가 레지스트리에서 동적으로 유효 타입 조회

### 2. Link Registry (Link 축)
`elif` 체인 → `dict` 기반 레지스트리:
```python
# 목표
link_registry.register("my-custom-link", MyLinkHandler)
```
- 빌트인 6종 자동 등록
- 외부 Link 핸들러: `LinkHandler` 프로토콜 구현 → `register()` 호출
- `PresetValidator`가 레지스트리에서 동적으로 유효 타입 조회

### 3. Adapter Registry (Team 축)
수동 dict → 자동 발견 + 등록:
```python
# 목표
adapter_registry.register("my-agent", MyAdapter)
# 또는 설정 기반 자동 발견
```
- 빌트인 4종 자동 등록
- 외부 Adapter: `TeamAdapter` ABC 상속 → `register()` 호출

### 4. claude_local 어댑터 (신규, Team 축)
Paperclip `claude-local/execute.ts` 패턴을 Python으로 포팅:
- tmux 없이 `asyncio.create_subprocess_exec`로 Claude Code CLI 직접 실행
- `config.env` → 환경변수 주입 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`로 Agent Teams 전환)
- `config.dangerouslySkipPermissions` → `--dangerously-skip-permissions`
- stdout 스트리밍 → 상태 업데이트

**레퍼런스 코드 (반드시 읽을 것):**
| Paperclip 파일 | 참고 내용 |
|---|---|
| `packages/adapter-utils/src/types.ts` | `ServerAdapterModule` 인터페이스 |
| `packages/adapters/claude-local/src/server/execute.ts` | subprocess 실행 + env 주입 전체 패턴 |
| `packages/adapter-utils/src/server-utils.ts` | `runChildProcess`, `buildPaperclipEnv` |
| `packages/adapters/claude-local/src/server/skills.ts` | skills symlink 관리 |

---

## 제약

1. **TeamAdapter ABC 변경 금지** — `start_block`, `check_status`, `cancel` 계약 유지
2. **기존 어댑터 건드리지 말 것** — `claude_agent_teams.py`, `claude_code.py` 그대로 (하위호환)
3. **기존 프리셋 7개 regression 금지**
4. **엔진 코어 로직 변경 최소화** — 레지스트리 전환만, 동작 변경 X

---

## TDD 기준 (최소)

### Gate Registry
- 빌트인 7종 자동 등록 확인
- 커스텀 Gate 등록 → 프리셋에서 사용 → 실행 성공
- 미등록 Gate 타입 → PresetValidator 거부

### Link Registry
- 빌트인 6종 자동 등록 확인
- 커스텀 Link 등록 → state_machine에서 라우팅 성공
- 미등록 Link 타입 → PresetValidator 거부

### Adapter Registry
- 빌트인 4종 자동 등록 확인
- 커스텀 Adapter 등록 → adapter_pool에서 조회 성공
- `claude_local` 어댑터 → subprocess 실행 + exit code 0

### claude_local
- `config.env: {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"}` → 환경변수 주입 확인
- tmux 없는 환경에서 실행 가능
- 기존 프리셋 7개 regression 없음

---

## 완료 기준

- Design 문서 작성 완료
- COO 검토 후 Smith님 보고

**COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.**
