# TASK: 에이전트팀 실행 환경 tmux 전환 (A-Z 재구성)

## 타입
개발

## 이게 뭔지
SDK `query()` API → tmux CLI 방식으로 에이전트팀 실행 환경을 전면 교체하는 것.
현재 에이전트팀 기능이 한 번도 작동하지 않았음 (SDK API에 팀 기능 미포함).

## 왜 필요한지
- SDK `query()` API에는 Agent Teams 코드 자체가 없어서 그동안 모든 실행이 단일 에이전트로 돌았음
- CLI에만 TeamCreate, SendMessage, TmuxBackend 등 팀 기능이 존재
- tmux 안에서 CLI를 실행해야 팀원별 pane 분리 + 병렬 작업 가능

## 구현 내용

### T1: `agent-sdk-run.js` → `agent-team-run.js` 전면 재작성
**이게 뭔지**: SDK query() 호출을 tmux + CLI spawn 방식으로 교체
**왜 필요한지**: SDK API에는 에이전트팀 기능이 없음
**구현 내용**:
- `child_process.spawn`으로 tmux 세션 생성 → `claude -p` 실행
- 환경변수: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- CLI 옵션: `--permission-mode bypassPermissions --model claude-opus-4-6`
- tmux 세션명: `agent-team-{timestamp}`
- 완료 감지: tmux pane 출력에서 프로세스 종료 감지 (exit code)
- settings.json / settings.local.json 백업+교체+복구 로직 유지
- Slack DM 양쪽 전송 (dev-lead + mozzi) 유지
- OpenClaw wake (message send + HTTP) 유지
- Post-completion validation (tsc + lint + build + leader memory + stage markers) 유지
- 모드 유지: plan / dev / full

### T2: settings.json 정리
**이게 뭔지**: SDK 실행 시 교체하던 settings를 CLI 실행에 맞게 조정
**왜 필요한지**: CLI는 SDK와 다르게 settings.json을 직접 읽음
**구현 내용**:
- `settings.json`: env vars + agentTeamDisplay: "tmux" 유지
- `settings.local.json`: 모든 hooks 보존 (Stop hooks 포함 — CLI에서는 파이프 안 끊김)
- SDK에서 제거하던 Stop hooks를 다시 활성화

### T3: 에이전트팀 실제 작동 검증 로직
**이게 뭔지**: 팀이 실제로 spawn 됐는지 로그에서 확인하는 검증
**왜 필요한지**: 다시는 "설정만 되어있고 실제 안 돌았다"는 상황 방지
**구현 내용**:
- 완료 후 로그에서 `TeamCreate`, `delegate`, `teammate`, `SendMessage` 키워드 검색
- 하나도 없으면 `⚠️ 에이전트팀 미활성화 — 단일 에이전트로 실행됨` 경고
- Slack DM에 팀 활성화 여부 포함

### T4: tmux 세션 관리
**이게 뭔지**: tmux 세션 생성/정리/모니터링
**왜 필요한지**: 세션 쌓임 방지 + 모니터링 편의
**구현 내용**:
- 실행 전 이전 `agent-team-*` 세션 정리 (kill)
- 완료 후 세션 유지 (수동 확인용) — 다음 실행 시 자동 정리
- `tmux list-sessions` 로 상태 확인 가능

## 관련 파일
- `.claude/scripts/agent-sdk-run.js` (현재 — 교체 대상)
- `.claude/scripts/agent-team-run.js` (신규 — 생성)
- `.claude/settings.json`
- `.claude/settings.local.json`

## 검증 기준
1. `node .claude/scripts/agent-team-run.js dev "테스트"` 실행 시 tmux 세션 생성됨
2. tmux 세션 안에서 claude CLI가 에이전트팀과 함께 실행됨
3. 로그에 TeamCreate 또는 teammate 관련 키워드 존재
4. 완료 시 Slack DM + OpenClaw wake 정상 작동
5. settings.json / settings.local.json 정상 복구
6. Post-completion validation (tsc + lint + build) 정상 실행

## 완료 후 QA
- `npm run build` 성공 확인
- tmux 세션 목록 확인 (`tmux list-sessions`)
- `/tmp/agent-sdk-result.json` 결과 확인
- Slack DM 수신 확인
