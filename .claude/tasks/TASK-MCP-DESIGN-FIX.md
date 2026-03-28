---
team: PM
session: sdk-pm
created: 2026-03-28
status: completed
owner: leader
---

# TASK: 에이전트팀 운영 디자인 수정 — 검토 결과 반영 4건

> COO(모찌) → PM팀 디자인 수정 지시
> 대상: docs/02-design/features/agent-team-operations.design.md

---

## T1. 통합 실행 커맨드 명시

### 이게 뭔지
디자인에 에이전트팀 실행 시 모든 플래그 포함한 통합 커맨드가 누락.

### 수정 내용
섹션 4-3-6 (Installation)에 아래 추가:
```bash
# 에이전트팀 세션 시작 (permissions bypass는 settings.local.json에서 처리)
CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-load-development-channels server:claude-peers --model claude-opus-4-6
```

---

## T2. CC=channel mode, OpenClaw=tool mode + webhook wake 혼합 구조

### 이게 뭔지
OpenClaw은 MCP channel push(`notifications/claude/channel`) 미지원. CC 전용 프로토콜이라 어떤 MCP 서버 붙여도 OpenClaw에서 push 안 됨.

### 해결: OpenClaw webhook wake

OpenClaw에는 `/hooks/wake` 엔드포인트가 있음. 외부에서 HTTP POST로 세션을 즉시 깨울 수 있음.

```bash
curl -X POST http://127.0.0.1:18789/hooks/wake \
  -H 'Authorization: Bearer {HOOKS_TOKEN}' \
  -H 'Content-Type: application/json' \
  -d '{"text":"[claude-peers] CTO: 구현 완료 — TASK-XXX", "mode":"now"}'
```

### 디자인에 추가할 구조

```
[CC PM 리더] ──channel push──→ 즉시 수신
[CC CTO 리더] ──channel push──→ 즉시 수신
[OpenClaw COO] ──webhook wake──→ 즉시 깨움 → check_messages
```

구현 방안 (판단해서 선택):

**A) broker 수정**: broker.ts의 `/send-message`에서 to_id가 OpenClaw peer면 → webhook 호출 추가. broker 포크 필요.

**B) 중간 스크립트**: 별도 watcher가 broker DB를 1초 폴링 → OpenClaw 대상 미배달 메시지 감지 → `/hooks/wake` 호출. broker 수정 불필요.

**C) MCP server.ts 수정**: server.ts의 pollAndPushMessages()에서 channel push 실패 시 → webhook 폴백. server.ts 포크 필요.

### 레퍼런스
- OpenClaw webhook 문서: hooks.enabled=true, 포트 18789, `/hooks/wake` (mode: "now")
- 우리 config: hooks.enabled=true, token 설정됨, defaultSessionKey: "agent:main:main"
- xihe-jianmu-ipc (GitHub #55872) — 참고만. WebSocket 기반이지만 OpenClaw push 문제는 동일.

---

## T3. 메시지 타입별 ACK 구분표

### 이게 뭔지
디자인의 ACK 프로토콜에 어떤 메시지가 ACK 필수/선택인지 명시 없음.

### 디자인에 추가할 표

| 메시지 타입 | ACK 필수 | 재전송 | 이유 |
|---|---|---|---|
| TASK_HANDOFF | ✅ | 30초 1회 | 핸드오프 유실 = 작업 멈춤 |
| COMPLETION_REPORT | ✅ | 30초 1회 | 완료 기록 유실 |
| URGENT | ✅ | 30초 1회 | 긴급 상황 유실 위험 |
| FEEDBACK | ❌ | 없음 | 다음 메시지로 자연 갱신 |
| STATUS_UPDATE | ❌ | 없음 | 정보성, 유실돼도 무방 |
| PING | ❌ | 없음 | 생존 확인용 |
| ACK | ❌ | 없음 | ACK의 ACK는 불필요 |

---

## T4. auto-summary 제거 확인

### 이게 뭔지
검토 결과 T2: auto-summary(gpt-5.4-nano) 수정 불필요. OPENAI_API_KEY 없으면 자동 스킵. set_summary 수동으로 충분.

### 디자인에 명시
- auto-summary 비활성 (OPENAI_API_KEY 미설정)
- CLAUDE.md 규칙: "세션 시작 시 set_summary('[역할] bscamp {설명}') 호출"
- Gemini 교체 불필요

---

## 하지 말 것
- broker.ts / server.ts 코드 수정하지 마라 — 디자인 문서만 수정
- 새로운 기능 추가하지 마라 — 기존 디자인에 위 4건 반영만

## 검증 기준
- 디자인 문서에 T1~T4 전부 반영
- 특히 T2의 OpenClaw webhook wake 구조가 섹션 4-3에 명확히 추가
- 구현 방안 A/B/C 중 추천안 포함
