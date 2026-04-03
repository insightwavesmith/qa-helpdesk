# TASK: brick-agent-abstraction

**담당**: PM (sdk-pm)
**산출물**: docs/02-design/features/brick-agent-abstraction.design.md
**레벨**: L2 Design (Plan 생략 — COO가 방향 확정)
**우선순위**: P0 — 이 없으면 브릭이 Smith님 Mac에서만 동작

---

## 배경 (COO 의사결정)

브릭의 비전: "세상 모든 사람이 쓰는 워크플로우 도구"
현재 문제: `claude_agent_teams`, `claude_code` 어댑터가 tmux 로컬 의존.
→ Smith님 Mac에서만 동작. 다른 사람은 못 씀.

**고쳐야 할 것은 어댑터 2개뿐. 엔진 코어/Link/Brick 축은 손댈 필요 없다.**

---

## 레퍼런스: Paperclip 오픈소스

`/Users/smith/projects/paperclip` — 로컬에 설치돼있음.

반드시 이 코드를 읽고 설계에 반영해라:

| Paperclip 파일 | 브릭에 적용할 패턴 |
|---|---|
| `packages/adapter-utils/src/types.ts` | `ServerAdapterModule` 인터페이스 → `TeamAdapter` ABC 확장 기준 |
| `packages/adapters/claude-local/src/server/execute.ts` | `claude_agent_teams` + `claude_code` 어댑터 재작성 기준 |
| `packages/adapter-utils/src/server-utils.ts` | `runChildProcess`, `buildPaperclipEnv` 유틸 참고 |
| `packages/adapters/claude-local/src/server/skills.ts` | `.bkit/skills` 관리 로직 참고 |

---

## 목표

tmux 없이 Claude 단일 에이전트 + Claude Agent Teams 둘 다 실행 가능한 어댑터 구조.

### 핵심: Agent Teams 지원

Paperclip `config.env`에 환경변수 주입 패턴 참고:
```typescript
// execute.ts line 232-234
for (const [key, value] of Object.entries(envConfig)) {
    if (typeof value === "string") env[key] = value;
}
```

프리셋 YAML에서 이렇게 쓰면 Agent Teams 모드 동작:
```yaml
# 단일 에이전트
do:
  adapter: claude_local
  config:
    model: claude-opus-4-6
    dangerouslySkipPermissions: true

# Agent Teams 모드 (팀원 자동 spawn)
do:
  adapter: claude_local
  config:
    model: claude-opus-4-6
    dangerouslySkipPermissions: true
    env:
      CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

---

## 설계 범위

### 1. `claude_local` 어댑터 (신규, Python)

Paperclip `claude-local` 패턴을 Python으로 포팅:
- tmux 없이 `asyncio.create_subprocess_exec`으로 Claude Code CLI 직접 실행
- `config.env` → 환경변수 주입 (Agent Teams 포함)
- `config.dangerouslySkipPermissions` → `--dangerously-skip-permissions`
- `config.model` → `--model`
- `config.cwd` → 작업 디렉토리
- stdout 스트리밍 → 상태 파일 업데이트

### 2. 기존 어댑터 하위호환

- `claude_agent_teams` — tmux 방식 그대로 유지 (현재 Smith님 팀 운영 유지)
- `claude_code` — `claude_local`로 대체 가능하도록 alias
- 프리셋 YAML 기존 7개 regression 없음

### 3. 프리셋 YAML `adapter: claude_local` 지원

- `engine_bridge.py` adapter_pool에 `claude_local` 추가
- `PresetValidator`에 `claude_local` 허용 목록 추가

---

## 설계 시 반드시 확인할 것

1. Paperclip execute.ts 전체 읽고 패턴 이해할 것
2. Agent Teams + 단일 에이전트 두 모드 모두 config으로 전환 가능해야 함
3. `TeamAdapter` ABC (`start_block`, `check_status`, `cancel`) 인터페이스 변경 금지
4. 기존 tmux 어댑터 건드리지 말 것 (하위호환)

---

## TDD 기준 (최소)

- `claude_local` start_block → subprocess 실행 + execution_id 반환
- `config.env: {CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"}` → 환경변수 주입 확인
- tmux 없는 환경에서 엔진 시작 가능
- 기존 프리셋 7개 regression 없음

---

## 완료 기준

- Design 문서 작성 완료
- COO 검토 후 Smith님 보고

**COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.**
