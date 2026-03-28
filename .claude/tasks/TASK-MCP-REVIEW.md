---
team: PM
session: sdk-pm
created: 2026-03-28
status: completed
owner: leader
---

# TASK: claude-peers-mcp 기획 검토 — 우려사항 반영 + 기능 완전성 확인

> COO(모찌) → PM팀 검토 요청
> 관련 문서: docs/01-plan/features/agent-team-operations.plan.md, docs/02-design/features/agent-team-operations.design.md

---

## 배경
Smith님이 에이전트팀 프로세스 디자인 승인했고, claude-peers-mcp 크로스팀 통신도 포함 확정됐다.
아래 우려사항을 검토하고, **모든 기능이 전부 동작하는지** 판단해라.
정답을 주는 게 아니라 **너가 판단**하라는 거다.

---

## T1. 실행 커맨드 통합 확인

### 이게 뭔지
현재 기획서에 `--dangerously-skip-permissions`와 `--dangerously-load-development-channels`가 분리되어 있다.
에이전트팀은 둘 다 동시에 필요함. 통합 실행 커맨드가 기획서에 명확히 있어야 한다.

### 검증 기준
- 기획서/디자인에 에이전트팀 실행 커맨드가 모든 플래그 포함해서 하나로 정리되어 있는지
- 실제로 두 플래그 동시 사용이 CC에서 동작하는지 확인 (테스트 or 문서 근거)

---

## T2. 자동 요약(auto-summary) 모델 변경

### 이게 뭔지
claude-peers-mcp의 auto-summary가 `gpt-5.4-nano` (OPENAI_API_KEY 필요)로 되어있다.
우리는 OpenAI 안 쓴다. **Gemini**를 써야 한다.

### 검토 사항
- auto-summary 없이 `set_summary` 수동으로 충분한지
- Gemini로 교체하려면 `shared/summarize.ts` 수정이 필요한지
- 아니면 CLAUDE.md 규칙으로 "세션 시작 시 set_summary 호출" 강제가 더 나은지
- 비용/복잡도 판단

---

## T3. channel mode vs MCP tool mode

### 이게 뭔지
- channel mode (`--dangerously-load-development-channels`): 메시지 즉시 push. 에이전트가 하던 작업 중단하고 응답.
- MCP tool mode (`.mcp.json` 등록만): 도구는 동작하지만 push 없음. `check_messages` 수동 호출 필요.

### 검토 사항
- channel mode가 에이전트팀(Agent Teams) 환경에서 정상 동작하는지 — 리더가 팀원 관리하면서 동시에 channel notification 받을 수 있는지
- channel push가 리더의 현재 작업을 중단시키면 팀원 지시가 끊기지 않는지
- tool mode만으로도 충분한 시나리오는 없는지 (폴백 계획)

---

## T4. OpenClaw MCP 연동

### 이게 뭔지  
디자인에서 OpenClaw mozzi도 claude-peers-mcp에 참여한다고 했다.
openclaw.json에 MCP 서버 추가하는 방식.

### 검토 사항
- OpenClaw의 MCP 지원이 claude-peers-mcp의 stdio 방식과 호환되는지
- channel notification이 OpenClaw에서도 동작하는지, 아니면 tool mode(check_messages)만 가능한지
- 호환 안 되면 대안 (예: OpenClaw은 broker HTTP API 직접 호출)

---

## T5. at-most-once 전달 + 메시지 유실

### 이게 뭔지
broker가 poll 시 delivered=1로 마킹. 수신 에이전트가 처리 전 크래시하면 메시지 유실.

### 검토 사항
- 디자인의 ACK 프로토콜이 이걸 충분히 보완하는지
- 크리티컬 메시지(TASK_HANDOFF, URGENT)에 ACK 필수 + 30초 재전송이 실제로 동작 가능한 구조인지
- 아니면 delivered 마킹을 수신 확인 후로 변경하는 게 맞는지 (broker 수정)

---

## 하지 말 것
- 코드 수정 하지 마라 — 검토+판단만
- "문제없습니다"로 넘어가지 마라 — 각 항목에 대해 근거 있는 판단을 내려라
- 정답을 줄 필요 없다 — 옵션 + 추천 + 이유를 제시해라

## 검증 기준
- T1~T5 각각에 대해 판단 결과 + 근거가 있는 검토서 작성
- 기획서/디자인 수정이 필요한 부분 명시
- 최종: "이대로 CTO팀 Do 진행 가능" 또는 "이 부분 수정 후 진행"
