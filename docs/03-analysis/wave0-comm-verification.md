# Wave 0 완료 검증: 3자 통신 테스트 시나리오

> PM팀 선행 준비 — CTO-2 Wave 0 완료 시 즉시 실행
> 작성: 2026-03-28

---

## 전제조건 (Wave 0 완료 상태)

- [ ] bun 설치 확인 (`bun --version`)
- [ ] `~/claude-peers-mcp/` 에 `bun install` 완료 (node_modules 존재)
- [ ] `~/.claude/settings.json`에 claude-peers MCP 등록됨
- [ ] 브로커 프로세스 기동 상태 (`curl http://localhost:7899/health`)

---

## 검증 1: 인프라 정상성 (5건)

### V0-1: 브로커 health
```bash
curl -s http://localhost:7899/health | jq .
# 기대: { "ok": true, "peers": 0, "uptime": ... }
```
- [ ] ok: true
- [ ] peers 필드 존재

### V0-2: MCP 서버 등록 확인
```bash
grep "claude-peers" ~/.claude/settings.json
# 기대: mcpServers에 claude-peers 항목 존재
```

### V0-3: 오픈클로 MCP 설정 확인
```bash
grep "claude-peers" ~/.openclaw/openclaw.json
# 기대: agents.list[].mcp.servers에 claude-peers 항목
```

### V0-4: 브로커 자동 시작 확인
```bash
# 브로커 프로세스 강제 종료
pkill -f "broker.ts"
sleep 2
# MCP tool 호출 시 ensureBroker()로 자동 재시작되는지 확인
# CC 세션에서 list_peers 호출 → 브로커 자동 시작
curl -s http://localhost:7899/health
# 기대: 재시작 후 ok: true
```

### V0-5: 포트 충돌 없음
```bash
lsof -i :7899 | grep LISTEN
# 기대: bun 프로세스 1개만
```

---

## 검증 2: Peer 등록 + 발견 (4건)

### V0-6: PM 리더 등록 + summary 설정
CC PM 세션에서:
```
set_summary("PM_LEADER | bscamp | 기획 총괄")
list_peers(scope: "repo")
```
- [ ] 자기 자신 peer ID 발급됨 (8자리)
- [ ] summary에 "PM_LEADER" 포함

### V0-7: CTO 리더 등록 + summary 설정
CC CTO 세션에서:
```
set_summary("CTO_LEADER | bscamp | 개발 총괄")
list_peers(scope: "repo")
```
- [ ] peer ID 발급됨
- [ ] PM_LEADER + CTO_LEADER 2개 peer 보임

### V0-8: mozzi 등록 + summary 설정
OpenClaw mozzi 세션에서:
```
set_summary("MOZZI | bscamp | COO")
list_peers(scope: "repo")
```
- [ ] 3개 peer 전부 보임 (PM_LEADER, CTO_LEADER, MOZZI)

### V0-9: 역할 발견 — summary 파싱으로 peer ID 역매핑
```
list_peers(scope: "repo") 결과에서:
- summary.startsWith("PM_LEADER") → PM peer ID
- summary.startsWith("CTO_LEADER") → CTO peer ID
- summary.startsWith("MOZZI") → mozzi peer ID
```
- [ ] 3개 역할 모두 매핑 가능

---

## 검증 3: CC↔CC 메시지 (channel mode) (5건)

### V0-10: PM → CTO TASK_HANDOFF
PM 세션에서:
```
send_message(CTO_peer_id, JSON.stringify({
  protocol: "bscamp-team/v1",
  type: "TASK_HANDOFF",
  from_role: "PM_LEADER",
  to_role: "CTO_LEADER",
  payload: { task_file: "TASK-AGENT-TEAM-OPS.md", action: "Do phase ready" },
  ts: "2026-03-28T14:30:00+09:00",
  msg_id: "pm-test-001"
}))
```
CTO 세션에서:
- [ ] channel push로 **즉시** 수신 (check_messages 호출 없이)
- [ ] type이 TASK_HANDOFF
- [ ] msg_id가 "pm-test-001"

### V0-11: CTO → PM ACK
CTO 세션에서:
```
send_message(PM_peer_id, JSON.stringify({
  protocol: "bscamp-team/v1",
  type: "ACK",
  from_role: "CTO_LEADER",
  to_role: "PM_LEADER",
  payload: { ack_msg_id: "pm-test-001" },
  ts: "...",
  msg_id: "cto-test-001"
}))
```
- [ ] PM 세션에서 즉시 수신
- [ ] ack_msg_id가 원본 msg_id와 일치

### V0-12: CTO → PM STATUS_UPDATE
```
send_message(PM_peer_id, {
  type: "STATUS_UPDATE",
  payload: { wave: 1, status: "complete" }
})
```
- [ ] PM에서 수신
- [ ] ACK 불필요 (선택 메시지)

### V0-13: PM → CTO PING + 응답
```
PM: send_message(CTO, { type: "PING" })
```
- [ ] CTO에서 수신
- [ ] PING에 ACK 불필요 (설계 규약)

### V0-14: 메시지 멱등성 — 동일 msg_id 재전송
```
PM: send_message(CTO, { msg_id: "pm-test-001", type: "TASK_HANDOFF", ... })  # 재전송
```
- [ ] CTO에서 수신되나, 애플리케이션에서 msg_id 중복 감지하여 무시해야 함
- [ ] (참고: 브로커는 중복 감지 안 함 — 애플리케이션 레이어 책임)

---

## 검증 4: CC→OpenClaw 메시지 (tool mode + webhook wake) (4건)

### V0-15: PM → mozzi 메시지 전송
PM 세션에서:
```
send_message(mozzi_peer_id, JSON.stringify({
  type: "URGENT",
  from_role: "PM_LEADER",
  to_role: "MOZZI",
  payload: { request: "Wave 0 검증 테스트" },
  msg_id: "pm-test-002"
}))
```
- [ ] 브로커 DB에 저장됨 (delivered=0)
- [ ] mozzi 즉시 수신 안 됨 (tool mode — push 없음)

### V0-16: mozzi check_messages로 수신
mozzi 세션에서:
```
check_messages()
```
- [ ] PM이 보낸 메시지 수신
- [ ] type이 URGENT
- [ ] 수신 후 delivered=1로 마킹

### V0-17: peers-wake-watcher 동작 (Wave 0-7 구현 후)
```
PM: send_message(mozzi, { type: "COMPLETION_REPORT", ... })
```
watcher가:
- [ ] 1초 내 broker DB에서 미배달 메시지 감지
- [ ] `/hooks/wake` POST 호출
- [ ] mozzi 세션 깨어남 → check_messages → 수신

### V0-18: mozzi → PM 역방향 메시지
mozzi 세션에서:
```
send_message(PM_peer_id, {
  type: "FEEDBACK",
  from_role: "MOZZI",
  payload: { text: "검토 완료" }
})
```
- [ ] PM 세션에서 channel push로 즉시 수신

---

## 검증 5: 에러 케이스 (3건)

### V0-19: 존재하지 않는 peer에 전송
```
send_message("nonexist-id", { type: "PING" })
```
- [ ] ok: false 또는 에러 메시지 반환
- [ ] 크래시 안 함

### V0-20: 브로커 다운 시 send_message
```
pkill -f "broker.ts"
send_message(CTO_peer_id, { type: "PING" })
```
- [ ] connection refused 에러 (graceful)
- [ ] 세션 크래시 안 함

### V0-21: 세션 재시작 후 peer ID 변경 확인
```
# CTO 세션 재시작
set_summary("CTO_LEADER | bscamp | 개발 총괄")
list_peers(scope: "repo")
```
- [ ] 새 peer ID 발급됨 (이전과 다름)
- [ ] PM에서 list_peers 시 새 CTO peer ID 보임
- [ ] 이전 peer ID로 보낸 메시지는 도달 안 됨 (정상)

---

## 합격 기준

| 구분 | 건수 | Pass 기준 |
|------|:----:|----------|
| 인프라 정상성 | 5 | 5/5 |
| Peer 등록/발견 | 4 | 4/4 |
| CC↔CC 메시지 | 5 | 5/5 |
| CC→OpenClaw | 4 | 3/4 (V0-17은 watcher 구현 후) |
| 에러 케이스 | 3 | 3/3 |
| **합계** | **21** | **20/21 이상** |

V0-17 (watcher)은 Wave 0-7 구현 완료 시 재검증.
