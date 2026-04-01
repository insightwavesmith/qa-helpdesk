# CTO-2 구현 누락 수정 Design (coo-pane-restriction-fix)

> 작성일: 2026-04-01
> 프로세스 레벨: L1 (수정 패치)
> 작성자: PM 리더 (CTO-1)
> 원본 Design: `docs/02-design/features/coo-pane-restriction.design.md`

---

## 1. Gap 분석 결과

CTO-2 shell 테스트 63/63 PASS. 하지만 3가지 누락 확인.

| # | 항목 | 현재 상태 | 문제 |
|---|------|----------|------|
| G-1 | settings.local.json hook 순서 | 신규 5개가 기존 hook **뒤에** 배치 | Plan 순서와 불일치 — 보안/역할 hook이 QA/PDCA hook보다 늦게 실행 |
| G-2 | PRINCIPLES A0-8 + L0/L1 테이블 | A0-8 미추가, L0/L1 "CTO 직행" 그대로 | Smith님 지시(L0/L1 프로세스 변경) 미반영 |
| G-3 | vitest hook-enforcement.test.ts | 7/63 fail (filter-completion-dm) | PM 테스트 fixture 환경 격리 버그 미수정 |

---

## 2. G-1: settings.local.json hook 순서 수정

### 현재 순서 (잘못됨)
```
PreToolUse:Bash:
  ① destructive-detector.sh
  ② pane-access-guard.sh
  ③ validate-qa.sh              ← 기존
  ④ validate-pdca.sh            ← 기존
  ⑤ validate-task.sh            ← 기존
  ⑥ enforce-qa-before-merge.sh  ← 기존
  ⑦ validate-deploy-authority.sh← 기존
  ⑧ postmortem-review-gate.sh   ← 기존
  ⑨ enforce-spawn.sh            ← 신규 (잘못된 위치)
  ⑩ prevent-tmux-kill.sh        ← 신규 (잘못된 위치)
  ⑪ validate-coo-approval.sh    ← 신규 (잘못된 위치)
  ⑫ validate-task-fields.sh     ← 신규 (잘못된 위치)
  ⑬ validate-slack-payload.sh   ← 신규 (잘못된 위치)
```

### 수정 순서 (Plan 기준)
```
PreToolUse:Bash:
  ① destructive-detector.sh       ← 위험 명령 차단 (최우선)
  ② pane-access-guard.sh          ← 팀원 pane 접근 차단
  ③ enforce-spawn.sh              ← spawn.sh 미사용 차단
  ④ prevent-tmux-kill.sh          ← tmux kill 차단
  ⑤ validate-coo-approval.sh      ← coo_approved 게이팅
  ⑥ validate-task-fields.sh       ← 레벨/담당팀 게이팅
  ⑦ validate-slack-payload.sh     ← 슬랙 알림 필터
  ⑧ validate-qa.sh                ← QA 전 merge 차단 (기존)
  ⑨ validate-pdca.sh              ← PDCA 준수 (기존)
  ⑩ validate-task.sh              ← TASK 유효성 (기존)
  ⑪ enforce-qa-before-merge.sh    ← QA 없이 merge 차단 (기존)
  ⑫ validate-deploy-authority.sh  ← 배포 권한 (기존)
  ⑬ postmortem-review-gate.sh     ← 회고 필독 (기존)
```

### 이유
역할 경계/보안 hook(②~⑦)이 프로세스 hook(⑧~⑬)보다 먼저 실행돼야 함.
TASK 승인 안 된 명령이 validate-pdca까지 도달하면 불필요한 연산.

### 수정 방법
`.claude/settings.local.json`의 `PreToolUse > matcher: "Bash" > hooks` 배열에서
⑨~⑬ 항목을 ② 뒤로 이동 (②~⑦ 순서로 재배치).

---

## 3. G-2: TEAM-ABSOLUTE-PRINCIPLES.md 수정

### 3.1 A0-8 추가 (A0-7 뒤에)

```markdown
### [A0-8] spawn.sh 강제
- 에이전트가 `claude` 바이너리를 직접 실행 금지
- 반드시 `spawn.sh`를 경유해야 팀 구조(tmux pane, registry)가 올바르게 구성됨
- `claude --resume`, `claude -p` 등 bare 실행 → hook이 자동 차단
- 예외: `claude --version`, `claude-peers` 등 유틸리티 명령은 허용
```

### 3.2 프로세스 레벨 테이블 수정

**파일**: `/Users/smith/.openclaw/workspace/docs/TEAM-ABSOLUTE-PRINCIPLES.md` 99~100행

현재:
```
| **L0** | 프로덕션 장애 | **CA** | CTO 직행. Plan/Design 스킵 |
| **L1** | 버그 원인 명확 | **DCA** | CTO 직행. Design 스킵 |
```

수정:
```
| **L0** | 프로덕션 장애 | **CA** | CTO 리더 조사(범위 정의) → 팀원 구현 → 리더 배포 |
| **L1** | 버그 원인 명확 | **DCA** | CTO 리더 조사 → 팀원 구현 → QA → 리더 배포 |
```

### 3.3 A0-3 역할 경계 보강 (124행)

현재:
```
- **CTO**: Do + QA. Plan/Design 없이 구현 시작 금지 (L0/L1/L2버그 예외)
```

수정:
```
- **CTO**: Do + QA. Plan/Design 없이 구현 시작 금지 (L0/L1/L2버그 예외). **L0/L1이라도 리더 직접 코드 수정 금지 — 조사+범위정의만, 팀원이 구현**
```

---

## 4. G-3: vitest 환경 격리 수정

### 원인
`runBashHook` 헬퍼가 `env: { ...process.env, ...env }` 로 병합.
테스트 머신에 `TMUX`, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`가 이미 세팅돼 있어서
"비-tmux" / "비-TEAMS" 테스트에서도 해당 변수가 살아있음.

### 수정 대상
`__tests__/hooks/hook-enforcement.test.ts` — 항목 6 테스트 7개

### 수정 내용

**C-50 (리더 pane 0 → exit 0)**: 현재 PASS이지만 정확성을 위해 env 명시
```typescript
// 변경 없음 (FULL_ENV 사용 — 정상)
```

**C-53 (비-tmux → exit 0)**:
```typescript
// 현재 (실패)
const r = runBashHook(hook, '', { MOCK_CALLER_PANE: '1' });
// 수정
const r = runBashHook(hook, '', { TMUX: '', CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '', MOCK_CALLER_PANE: '1' });
```

**C-54 (비-TEAMS → exit 0)**:
```typescript
// 현재 (실패)
const r = runBashHook(hook, '', { ...TMUX_ENV, MOCK_CALLER_PANE: '1' });
// 수정
const r = runBashHook(hook, '', { ...TMUX_ENV, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '', MOCK_CALLER_PANE: '1' });
```

### 근본 수정: runBashHook 헬퍼 개선

현재:
```typescript
env: { ...process.env, ...env }
```

`process.env`를 전부 상속하면 모든 환경 격리 테스트가 취약.
hook 테스트에 필요한 최소 env만 전달하도록 변경:

```typescript
function runBashHook(
  hookPath: string,
  command: string,
  env: Record<string, string> = {},
): { exitCode: number; stdout: string; stderr: string } {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  // 최소 필수 env + 명시적 override
  const baseEnv: Record<string, string> = {
    PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin',
    HOME: process.env.HOME || '/tmp',
    SHELL: process.env.SHELL || '/bin/bash',
  };
  const finalEnv = { ...baseEnv, ...env };
  // ...
}
```

이렇게 하면 TMUX, CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 등이 명시하지 않으면 미존재.
기존 56개 PASS 테스트가 깨지지 않는지 검증 필수.

---

## 5. 수정 산출물 요약

| # | 파일 | 변경 유형 | 변경 내용 |
|---|------|----------|----------|
| 1 | `.claude/settings.local.json` | 수정 | hook 배열 순서 재배치 (5개를 pane-access-guard 뒤로 이동) |
| 2 | `TEAM-ABSOLUTE-PRINCIPLES.md` | 수정 | A0-8 추가 + L0/L1 테이블 수정 + A0-3 보강 |
| 3 | `__tests__/hooks/hook-enforcement.test.ts` | 수정 | runBashHook 환경 격리 + C-53/C-54 env 수정 |

---

## 6. 완료 게이트

- [ ] settings.local.json hook 순서 = Plan 순서와 일치
- [ ] PRINCIPLES A0-8 존재
- [ ] PRINCIPLES L0/L1 "CTO 리더 조사 → 팀원 구현" 반영
- [ ] vitest 63/63 PASS (0 fail)
- [ ] CTO-2 shell 테스트 63/63 유지 (regression 없음)

---

## 7. TDD 케이스 (수정 검증용)

### G-1 검증
| ID | 검증 | 방법 |
|----|------|------|
| FIX-01 | hook 순서 | settings.local.json의 Bash hook 배열에서 enforce-spawn이 validate-qa보다 앞에 있는지 확인 |

### G-2 검증
| ID | 검증 | 방법 |
|----|------|------|
| FIX-02 | A0-8 존재 | `grep "A0-8" TEAM-ABSOLUTE-PRINCIPLES.md` |
| FIX-03 | L0 테이블 | `grep "L0.*리더.*조사" TEAM-ABSOLUTE-PRINCIPLES.md` |
| FIX-04 | L1 테이블 | `grep "L1.*리더.*조사" TEAM-ABSOLUTE-PRINCIPLES.md` |

### G-3 검증
| ID | 검증 | 방법 |
|----|------|------|
| FIX-05 | vitest 전량 pass | `npx vitest run __tests__/hooks/hook-enforcement.test.ts` — 63/63 |
| FIX-06 | shell 테스트 유지 | 3개 shell test 재실행 — 63/63 유지 |
