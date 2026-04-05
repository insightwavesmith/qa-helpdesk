# QA 결과 — CTO-2 담당

> 실행일: 2026-04-05
> 기준: QA-brick-full-3axis.md (232건 중 CTO-2 담당 68건)
> pytest: 469 passed, 0 failed

---

## 요약

| 영역 | 항목 수 | ✅ PASS | ⚠️ WARN | ❌ FAIL | 🔍 SKIP |
|---|---|---|---|---|---|
| P1-팀 어댑터 | 40 | 39 | 1 | 0 | 0 |
| P4 DB/API/인프라 | 28 | 28 | 0 | 0 | 0 |
| **합계** | **68** | **67** | **1** | **0** | **0** |

WARN 1건: MCPBridge cache_dir 타입 버그 → 즉시 수정 완료 (PASS 전환)

---

## P1-팀: 어댑터 전종 (40건)

### T-CL: ClaudeLocalAdapter (18건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-CL-001 | ✅ PASS | subprocess 생성: `--print - --output-format stream-json --verbose` |
| T-CL-002 | ✅ PASS | stdin 프롬프트: `TASK: {what}\nCONTEXT: {json}` |
| T-CL-003 | ✅ PASS | reject_reason 주입: `⚠️ 반려됨` + 사유 + 시도 횟수 |
| T-CL-004 | ✅ PASS | session-id 파싱: stream-json `type=="system"` → session_id 추출 |
| T-CL-005 | ✅ PASS | session-id 복원: `context["session_ids"]` → `--continue --session-id` |
| T-CL-006 | ✅ PASS | nesting guard: CLAUDECODE 등 4개 env.pop() 제거 |
| T-CL-007 | ✅ PASS | BRICK_* env: BRICK_EXECUTION_ID, BRICK_BLOCK_ID 주입 |
| T-CL-008 | ✅ PASS | config.env 병합: isinstance(value, str) 체크 후 string만 |
| T-CL-009 | ✅ PASS | --agent 분기: project agents/ 존재 → --system-prompt-file |
| T-CL-010 | ✅ PASS | role path traversal: ".." → warning + 무시 |
| T-CL-011 | ✅ PASS | --dangerously-skip-permissions: config → 인자 추가 |
| T-CL-012 | ✅ PASS | 타임아웃: terminate → grace → kill |
| T-CL-013 | ✅ PASS | stdout 32KB cap: _MAX_OUTPUT_BYTES 초과 → truncate |
| T-CL-014 | ✅ PASS | check_status(): task-state-{eid}.json 읽기 |
| T-CL-015 | ✅ PASS | 10분 staleness: elapsed > 600 → failed |
| T-CL-016 | ✅ PASS | cancel(): terminate + grace + kill |
| T-CL-017 | ✅ PASS | _notify_complete(): executor.complete_block() 호출 |
| T-CL-018 | ✅ PASS | command not found: FileNotFoundError → failed |

### T-AT: ClaudeAgentTeamsAdapter (6건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-AT-001 | ✅ PASS | MCP 전달: mcp.find_peer() → mcp.send_task() |
| T-AT-002 | ✅ PASS | MCP→tmux fallback: fallback_to_tmux=True → send-keys |
| T-AT-003 | ✅ PASS | staleness 10분: elapsed > 600 → failed |
| T-AT-004 | ✅ PASS | cancel(): tmux send-keys C-c |
| T-AT-005 | ✅ PASS | TeamManagement: list_members/skills/mcp/model 전부 구현 |
| T-AT-006 | ✅ PASS | suspend/terminate/resume: registry 상태 변경 |

### T-CC: ClaudeCode (2건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-CC-001 | ✅ PASS | MCP→tmux: has-session 체크 → new-session → send-keys |
| T-CC-002 | ✅ PASS | staleness: 10분 → failed |

### T-HU: Human (3건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-HU-001 | ✅ PASS | waiting_human 상태: 상태파일 + assignee + timeout_at |
| T-HU-002 | ✅ PASS | 완료 파일 감지: completions/{eid} → completed |
| T-HU-003 | ✅ PASS | 타임아웃: timeout_at 초과 → failed |

### T-WH: Webhook (5건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-WH-001 | ✅ PASS | HTTP POST: url + payload + auth 헤더 |
| T-WH-002 | ✅ PASS | auth: bearer → Authorization, api_key → X-API-Key |
| T-WH-003 | ✅ PASS | callback 수신: receive_callback() → 상태 업데이트 |
| T-WH-004 | ✅ PASS | retry_on_status: 502/503/504 → RuntimeError |
| T-WH-005 | ✅ PASS | 3단계 status: 상태파일 → status_url → staleness |

### T-CX: Codex (1건) — PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-CX-001 | ✅ PASS | stub: 4개 메서드 NotImplementedError("Phase 2 stub") |

### T-MC: MCP (2건) — PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-MC-001 | ✅ PASS | peer 탐색 3단계: cache → peer-map.json → broker API |
| T-MC-002 | ✅ PASS | ACK 대기: accepted/(True,eid), rejected/(False,reason), timeout/(False,msg) |

### T-AR: AdapterRegistry (4건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| T-AR-001 | ✅ PASS | register/get: 이름 → 인스턴스 |
| T-AR-002 | ✅ PASS | dict 호환: [], in, items() |
| T-AR-003 | ✅ PASS | registered_adapter_types(): set 반환 |
| T-AR-004 | ✅ PASS | 미등록 get: KeyError |

---

## P4: DB/API/인프라 (28건)

### D-DB: DB 스키마 (8건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| D-DB-001 | ✅ PASS | workspaces 기본 id=1 생성 (INSERT OR IGNORE) |
| D-DB-002 | ✅ PASS | users: username UNIQUE + scrypt 해싱 (n=2^14, r=8, p=1) |
| D-DB-003 | ✅ PASS | user_sessions: token_hex(32) → SHA-256, 7일 만료 |
| D-DB-004 | ✅ PASS | api_keys: owner_type(user/agent), scopes JSON |
| D-DB-005 | ✅ PASS | agents: name+workspace UNIQUE, heartbeat |
| D-DB-006 | ✅ PASS | notifications: recipient FK + read_at 인덱스 |
| D-DB-007 | ✅ PASS | FK ON DELETE CASCADE: sessions + notifications |
| D-DB-008 | ✅ PASS | WAL 모드: PRAGMA journal_mode=WAL |

### D-AU: 인증/인가 (5건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| D-AU-001 | ✅ PASS | 세션 생성: token_hex(32) → SHA-256 → DB |
| D-AU-002 | ✅ PASS | 세션 검증: token → hash → DB JOIN users |
| D-AU-003 | ✅ PASS | 세션 만료: expires_at 체크 |
| D-AU-004 | ✅ PASS | RBAC: viewer/operator/admin 3단계 |
| D-AU-005 | ✅ PASS | 엔진 API 권한: start=operator, status=viewer |

### D-API: API 엔드포인트 (10건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| D-API-001 | ✅ PASS | /engine/start: POST → 워크플로우 생성 (404/422/400 에러 처리) |
| D-API-002 | ✅ PASS | /engine/complete-block: POST → Gate 실행 + 다음 블록 |
| D-API-003 | ✅ PASS | /engine/status/{id}: GET → 상태+이벤트 (404) |
| D-API-004 | ✅ PASS | /engine/suspend/{id}: POST → SUSPENDED (404) |
| D-API-005 | ✅ PASS | /engine/resume/{id}: POST → RUNNING (404) |
| D-API-006 | ✅ PASS | /engine/cancel/{id}: POST → FAILED (404) |
| D-API-007 | ✅ PASS | /engine/health: GET → ok + 통계 (인증 불필요) |
| D-API-008 | ✅ PASS | /engine/retry-adapter: POST → 재시도 (409) |
| D-API-009 | ✅ PASS | /engine/hook/{wf}/{link}: POST → hook 발동 (404/409) |
| D-API-010 | ✅ PASS | /engine/human/tasks: GET → admin=전체, 일반=자기것만 |

### D-FS: 파일 스토리지 (5건) — 전체 PASS

| ID | 판정 | 비고 |
|---|---|---|
| D-FS-001 | ✅ PASS | state.json: 생성/읽기/원자적 쓰기 (tmp→rename) |
| D-FS-002 | ✅ PASS | events.jsonl: append 추가기록 + 전체 복원 |
| D-FS-003 | ✅ PASS | task-state-{eid}.json: 어댑터별 독립 상태 |
| D-FS-004 | ✅ PASS | session-ids.json: team_key별 저장/로드 |
| D-FS-005 | ✅ PASS | human-completions/{eid}: 파일 존재 → completed |

---

## 수정 사항 (1건)

| 파일 | 문제 | 수정 |
|---|---|---|
| `brick/brick/adapters/mcp_bridge.py` | `cache_dir`가 `str`로 전달 시 `/` 연산자 TypeError | `Path(cache_dir)` 방어 코드 추가 |

---

## 테스트 결과

```
pytest: 469 passed, 2 warnings, 0 failed (4.17s)
```

기존 테스트 전체 Green 유지.
