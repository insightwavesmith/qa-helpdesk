# Hook 강제 + COO Pane 제한 (coo-pane-restriction) Plan

> 작성일: 2026-04-01
> 프로세스 레벨: L2 (src/ 미수정, .bkit/hooks/ 수정)
> 작성자: PM팀
> TASK 원본: `/Users/smith/.openclaw/workspace/tasks/TASK-COO-PANE-RESTRICTION.md`

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 7개 hook 강제 항목으로 에이전트팀 운영 규율을 시스템으로 완전 강제 |
| **작성일** | 2026-04-01 |
| **핵심** | 역할 경계(A0-3), T-PDCA 프로세스(A0-1), 단일 소스(A0-2) 원칙을 hook으로 100% 강제 |
| **배경** | COO 팀원 pane 직접 개입, spawn.sh 미사용, tmux kill 남용, 미승인 TASK 착수 등 반복 위반 |
| **선행** | destructive-detector.sh(완료), is-teammate.sh(완료), notify-completion.sh(완료) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 운영 규칙이 문서에만 존재 → LLM이 무시/망각 → 반복 위반 |
| **Solution** | 7개 hook으로 PreToolUse/PostToolUse/TaskCompleted 레벨에서 패턴 매칭 차단 |
| **Function UX Effect** | 위반 시 즉시 차단 + 올바른 경로 안내 메시지 |
| **Core Value** | LLM 판단 0, 패턴 매칭으로 게이트. 규칙 = 코드 |

---

## 7개 항목 총괄

| # | 항목 | hook 파일 | hook 이벤트 | 원칙 |
|---|------|----------|------------|------|
| 1 | pane 접근 차단 | `pane-access-guard.sh` | PreToolUse:Bash | A0-7 |
| 2 | spawn.sh 강제 | `enforce-spawn.sh` | PreToolUse:Bash | A0-8 |
| 3 | kill 차단 | `prevent-tmux-kill.sh` | PreToolUse:Bash | A0-4 |
| 4 | coo_approved 게이팅 | `validate-coo-approval.sh` | PreToolUse:Bash(팀 위임 시) | A0-1 |
| 5 | 레벨/담당팀 게이팅 | `validate-task-fields.sh` | PreToolUse:Bash(팀 위임 시) | A0-1 |
| 6 | DM 차단 | `filter-completion-dm.sh` | TaskCompleted | A0-3 |
| 7 | 슬랙 알림 필터 | `validate-slack-payload.sh` | PreToolUse:Bash(curl 시) | A0-2 |

---

## 항목 1: pane 접근 차단 (pane-access-guard.sh)

### 설계 원칙 — 범용 설계 (COO 전용 → 비리더 전체)

TASK는 COO 전용 차단을 요청하지만, 더 강건한 원칙은:
**"특정 팀의 리더(pane 0)만 해당 팀의 팀원(pane 1+)에 send-keys 가능"**

| 케이스 | 판정 | 이유 |
|--------|------|------|
| COO → sdk-cto.0 | ✅ 허용 | 리더 pane 통신 |
| COO → sdk-cto.1 | ❌ 차단 | 팀원 직접 접근 |
| sdk-cto 리더(pane 0) → sdk-cto.1 | ✅ 허용 | 자기 팀 팀원 |
| sdk-pm 리더 → sdk-cto.1 | ❌ 차단 | 타 팀 팀원 직접 접근 |
| sdk-cto 팀원(pane 1) → sdk-cto.2 | ❌ 차단 | 팀원→팀원 직접 통신 금지 |

### 판별 로직

```
1. 명령어에서 tmux send-keys -t <target> 파싱
2. target이 sdk-*.[1-9] 형태인가? (팀원 pane)
   - 아니면 → 허용 (exit 0)
   - 맞으면 → 3으로
3. 호출자가 해당 팀의 리더(pane 0)인가?
   - 맞으면 → 허용 (자기 팀 팀원)
   - 아니면 → 차단 (exit 2) + 리다이렉트 안내
```

호출자 판별: `tmux display-message -p '#{session_name}.#{pane_index}'`

---

## 항목 2: spawn.sh 강제 (enforce-spawn.sh)

### 배경
에이전트가 `claude` 바이너리를 직접 실행하면 AGENT_TEAMS 플래그 없이 단독 인스턴스가 뜸.
반드시 `spawn.sh`를 통해 실행해야 팀 구조(tmux pane, registry)가 올바르게 구성됨.

### 판별 로직

```
1. command에 `claude` 실행 패턴 감지 (claude --resume, claude -p 등)
2. spawn.sh 호출인가?
   - spawn.sh 경로 포함 → 허용 (exit 0)
3. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1이 command에 포함?
   - 포함 → 허용 (exit 0)
4. 그 외 bare claude 실행 → 차단 (exit 2)
   - "spawn.sh를 사용하세요" 안내
```

### 감지 패턴
- `claude ` (bare 실행)
- `claude --resume`
- `claude -p`
- 예외: `claude-peers`, `claude-code`, `claude --version` 등 유틸리티 명령은 허용

---

## 항목 3: kill 차단 (prevent-tmux-kill.sh)

### 배경
`tmux kill-session` / `tmux kill-pane`은 에이전트를 강제 종료시켜 registry 정리, PDCA 상태 업데이트가 누락됨.
반드시 `/exit` 명령으로 정상 종료해야 정리 hook이 실행됨.

### 판별 로직

```
1. command에 `tmux kill-session` 또는 `tmux kill-pane` 감지
2. 감지되면 → 차단 (exit 2)
   - "/exit 명령으로 정상 종료하세요" 안내
3. 예외: `tmux kill-pane -t` + 자기 자신 pane → Smith님이 A0-4에 따라 직접 실행만 허용
```

### 감지 패턴
- `tmux kill-session`
- `tmux kill-pane`
- `tmux kill-server` (전체 서버 종료 — 가장 위험)

---

## 항목 4: coo_approved 게이팅 (validate-coo-approval.sh)

### 배경
T-PDCA에서 T 단계: Smith님 승인 → `coo_approved: true` → 팀 전달.
승인 없이 팀이 착수하면 방향이 틀린 작업을 수행할 위험.

### 판별 로직

```
1. command에 팀 위임 관련 패턴 감지:
   - `spawn.sh` 실행
   - `tmux send-keys` + TASK 전달 패턴
2. 전달하려는 TASK 파일 경로 파싱
3. TASK 파일 읽기 → `coo_approved: true` 존재 확인
   - 존재 → 허용 (exit 0)
   - 미존재 → 차단 (exit 2)
   - "Smith님 승인이 필요합니다 (coo_approved: true)" 안내
```

### TASK 파일 위치
- `/Users/smith/.openclaw/workspace/tasks/TASK-*.md`
- frontmatter 또는 본문에서 `coo_approved: true` 탐색

---

## 항목 5: 레벨/담당팀 게이팅 (validate-task-fields.sh)

### 배경
TASK 파일에 레벨(L0~L3)과 담당팀이 없으면 hook 분기가 불가능하고 잘못된 프로세스로 진행될 수 있음.

### 판별 로직

```
1. 항목 4와 동일한 트리거 (팀 위임 시점)
2. TASK 파일에서 필수 필드 확인:
   - 레벨: L0, L1, L2, L3 중 하나
   - 담당팀: sdk-cto, sdk-pm 등
3. 두 필드 모두 존재 → 허용 (exit 0)
4. 하나라도 미존재 → 차단 (exit 2)
   - "TASK 파일에 레벨과 담당팀을 명시하세요" 안내
```

### 참고
- 항목 4(coo_approved)와 항목 5(레벨/담당팀)는 하나의 hook으로 합칠 수도 있으나,
  관심사 분리를 위해 별도 파일로 유지. 한 항목만 비활성화 가능.

---

## 항목 6: DM 차단 (filter-completion-dm.sh)

### 배경
팀원이 TaskCompleted 시 Smith님에게 직접 DM을 보내면 리더 컨텍스트를 우회.
완료 보고는 리더만 수행해야 함 (A0-3 역할 경계).

### 판별 로직

```
1. TaskCompleted hook 체인에서 실행
2. 호출자가 팀원(pane 1+)인가?
   - pane 0 (리더) → 허용 (exit 0)
   - pane 1+ (팀원) → DM 전송 차단 (exit 2)
3. 팀원의 완료 보고는 리더에게만 SendMessage로 전달
```

### 호출자 판별
- `tmux display-message -p '#{pane_index}'`
- pane 0 = 리더, pane 1+ = 팀원
- 비-tmux 환경 → 허용 (팀 구조 없음)

---

## 항목 7: 슬랙 알림 필터 (validate-slack-payload.sh)

### 배경
TASK_NAME/팀명 없는 슬랙 알림은 디버깅 불가 + 노이즈.
모든 슬랙 알림에 TASK_NAME과 팀명이 필수.

### 판별 로직

```
1. command에 슬랙 webhook URL로 curl 전송 감지
   - `curl` + `hooks.slack.com` 패턴
2. payload에서 TASK_NAME 필드 존재 확인
3. payload에서 팀명 필드 존재 확인
4. 둘 다 존재 → 허용 (exit 0)
5. 하나라도 미존재 → 차단 (exit 2)
   - "슬랙 알림에 TASK_NAME과 팀명을 포함하세요" 안내
```

### 감지 방법
- curl `-d` 또는 `--data` 옵션의 JSON payload 파싱
- `TASK_NAME` / `task_name` / `TASK-` 패턴 확인
- `team` / `팀명` / `sdk-` 패턴 확인

---

## 구현 산출물

| # | 산출물 | 파일 경로 | 설명 |
|---|--------|----------|------|
| 1 | pane-access-guard.sh | `.bkit/hooks/pane-access-guard.sh` | PreToolUse:Bash — 팀원 pane 직접 접근 차단 |
| 2 | enforce-spawn.sh | `.bkit/hooks/enforce-spawn.sh` | PreToolUse:Bash — spawn.sh 미사용 claude 실행 차단 |
| 3 | prevent-tmux-kill.sh | `.bkit/hooks/prevent-tmux-kill.sh` | PreToolUse:Bash — tmux kill-session/kill-pane 차단 |
| 4 | validate-coo-approval.sh | `.bkit/hooks/validate-coo-approval.sh` | PreToolUse:Bash — coo_approved 미승인 TASK 착수 차단 |
| 5 | validate-task-fields.sh | `.bkit/hooks/validate-task-fields.sh` | PreToolUse:Bash — 레벨/담당팀 미기입 TASK 전달 차단 |
| 6 | filter-completion-dm.sh | `.bkit/hooks/filter-completion-dm.sh` | TaskCompleted — 팀원 DM 차단 |
| 7 | validate-slack-payload.sh | `.bkit/hooks/validate-slack-payload.sh` | PreToolUse:Bash — 슬랙 알림 필수 필드 검증 |
| 8 | settings.local.json 등록 | `.claude/settings.local.json` | 7개 hook 등록 |
| 9 | TEAM-ABSOLUTE-PRINCIPLES.md | 외부 문서 | A0-7, A0-8 원칙 추가 |
| 10 | TEAM-PLAYBOOK.md | `docs/TEAM-PLAYBOOK.md` | hook 목록 + 원칙 카탈로그 업데이트 |

**모든 hook은 destructive-detector.sh 패턴 준수:**
- stdin JSON 파싱 (python3) → 패턴 매칭 (grep/regex) → exit 0(허용) / exit 2(차단)

---

## 완료 게이트

- [ ] 7개 hook 파일 구현 + settings.local.json 등록
- [ ] TDD 전체 케이스 PASS (항목별 최소 5개, 총 50개+)
- [ ] TEAM-ABSOLUTE-PRINCIPLES.md A0-7, A0-8 추가
- [ ] TEAM-PLAYBOOK.md hook 목록 + 원칙 카탈로그 업데이트
- [ ] 각 hook 실제 차단 테스트 확인

---

## 위험 & 대응

| 위험 | 영향 | 대응 |
|------|------|------|
| tmux 환경 외 실행 시 오판 | 차단 안 됨 | $TMUX 미존재 시 허용 (비-tmux 환경은 팀 구조 없음) |
| send-keys 변형 구문 우회 | 차단 누락 | `-t` 옵션 위치 무관 매칭 + `send-keys` 별칭(send-key) 포함 |
| 리더가 타 팀 팀원에 send-keys | 교차 팀 간섭 | 호출자 세션명 ≠ 타겟 세션명이면 차단 |
| claude 바이너리 경로 변형 | spawn 강제 우회 | `/usr/local/bin/claude`, `npx claude` 등 변형 패턴 포함 |
| TASK 파일 경로 파싱 실패 | 게이팅 무력화 | 파싱 실패 시 차단 (fail-closed) |
| 슬랙 payload JSON 파싱 실패 | 필터 무력화 | 파싱 실패 시 차단 (fail-closed) |
| hook 체인 순서 충돌 | 예상 외 차단 | destructive-detector → pane-guard → enforce-spawn → prevent-kill → 나머지 순서 고정 |

---

## hook 체인 순서 (PreToolUse:Bash)

```
① destructive-detector.sh     ← 위험 명령 차단 (최우선)
② pane-access-guard.sh        ← 팀원 pane 접근 차단
③ enforce-spawn.sh            ← spawn.sh 미사용 차단
④ prevent-tmux-kill.sh        ← tmux kill 차단
⑤ validate-coo-approval.sh    ← coo_approved 게이팅
⑥ validate-task-fields.sh     ← 레벨/담당팀 게이팅
⑦ validate-slack-payload.sh   ← 슬랙 알림 필터
⑧ validate-qa.sh              ← QA 전 merge 차단 (기존)
⑨ validate-pdca.sh            ← PDCA 준수 (기존)
⑩ validate-task.sh            ← TASK 유효성 (기존)
⑪ enforce-qa-before-merge.sh  ← QA 없이 merge 차단 (기존)
⑫ validate-deploy-authority.sh ← 배포 권한 (기존)
⑬ postmortem-review-gate.sh   ← 회고 필독 (기존)
```

TaskCompleted 체인:
```
① task-completed.sh            ← 완료 처리 (기존)
② filter-completion-dm.sh      ← [신규] 팀원 DM 차단
③ task-quality-gate.sh         ← Match Rate 체크 (기존)
④ gap-analysis.sh              ← Gap 분석 (기존)
⑤ notify-completion.sh         ← Slack + webhook (기존)
⑥ pdca-chain-handoff.sh        ← 다음 팀 자동 체인 (기존)
```
