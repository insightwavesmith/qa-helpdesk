# PDCA 체인 자동화 (PDCA Chain Automation) Plan

> 작성일: 2026-03-28
> 프로세스 레벨: L2 (hooks/scripts 수정, src/ 미수정)
> Match Rate 기준: **95%** (Smith님 확정)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | PDCA 체인 자동화 — CTO 완료 → PM 검수 → COO 보고 MCP 메시지 자동 체이닝 |
| **작성일** | 2026-03-28 |
| **핵심** | TaskCompleted hook에서 품질 게이트 통과 시 MCP send_message 자동 발송. 수동 핸드오프 제거 |
| **대상 팀** | CTO(개발) → PM(검수) → COO(Smith님 보고) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | CTO 완료 후 PM/COO에 수동 전달 → 지연 + 누락. Smith님이 진행 상황 파악 어려움 |
| **Solution** | hook이 Match Rate 95%+ 확인 → MCP로 PM 자동 통보 → PM 검수 후 COO에 자동 통보 → COO가 Smith님에게 대화형 보고 |
| **Function UX Effect** | 개발 완료 즉시 검수 체인 자동 시작. Smith님은 COO를 통해 맥락 있는 보고 수신 |
| **Core Value** | 핸드오프 지연 0 + 검수 누락 방지 + Smith님 의사결정 지원 |

---

## 1. 배경

### 현재 문제

1. **수동 핸드오프**: CTO가 개발 완료 → PM에게 구두/메시지로 "완료" 전달 → PM이 직접 Gap 확인 → COO에게 전달 → Smith님에게 보고. 각 단계 수동.
2. **품질 게이트 분산**: tsc/build 체크는 `task-quality-gate.sh`에, Gap 분석 확인은 `gap-analysis.sh`에, PDCA 상태는 `pdca-sync-monitor.sh`에 분산. Match Rate 기준 통합 판정 없음.
3. **COO 알림 지연**: OpenClaw mozzi는 tool mode라 push 수신 불가. 능동적 check_messages 또는 webhook wake 필요한데 현재 자동 트리거 없음.

### 해결 방향

TaskCompleted hook 체인 마지막에 `pdca-chain-handoff.sh` 추가. 선행 hook들(quality-gate, gap-analysis 등)이 전부 통과한 경우에만 실행. Match Rate 95%+ 확인 후 MCP send_message로 PM에 COMPLETION_REPORT 자동 발송.

---

## 2. 전체 흐름

```
CTO 팀원 TaskCompleted
    │
    ▼
[기존 hook 체인] task-completed → task-quality-gate → gap-analysis → pdca-update → pdca-sync-monitor → auto-team-cleanup → notify-completion
    │
    │ 전부 exit 0 (통과)
    ▼
[신규] pdca-chain-handoff.sh
    │
    ├─ Match Rate < 95% → exit 2 (피드백: "Match Rate XX%. 95% 이상 달성 후 재시도")
    │                       → CTO 자체 수정 루프 (MCP 메시지 없음)
    │
    └─ Match Rate ≥ 95% → MCP send_message(PM, COMPLETION_REPORT)
                            → PM 세션에서 channel push로 즉시 수신
                            │
                            ▼
                       [PM 검수]
                       PM이 Gap 분석 재검증 + 기획 의도 부합 확인
                            │
                            ├─ 불합격 → MCP send_message(CTO, FEEDBACK) → CTO 수정 후 재제출
                            │
                            └─ 합격 → MCP send_message(COO, COMPLETION_REPORT) + webhook wake
                                        │
                                        ▼
                                   [COO 보고]
                                   mozzi가 Smith님에게 대화형 보고
                                   (요약 + 맥락 + 변경 내용)
                                        │
                                        ├─ Smith님 OK → 배포 진행
                                        │
                                        └─ Smith님 반려 → COO가 FEEDBACK을 PM에 전달
                                                          → PM이 CTO에 전달
```

---

## 3. 구현 범위

### 3-1. In Scope

| # | 항목 | 설명 |
|---|------|------|
| 1 | `pdca-chain-handoff.sh` 신규 작성 | Match Rate 95% 게이트 + MCP send_message(PM) |
| 2 | `settings.local.json` 수정 | TaskCompleted hooks 체인에 pdca-chain-handoff.sh 추가 |
| 3 | PM 수신 핸들러 가이드 | PM CLAUDE.md에 COMPLETION_REPORT 수신 시 검수 프로토콜 명시 |
| 4 | COO 수신 핸들러 가이드 | COO(mozzi) 설정에 COMPLETION_REPORT 수신 → Smith님 대화형 보고 프로토콜 |
| 5 | Match Rate 파서 | `docs/03-analysis/*.analysis.md`에서 Match Rate 숫자 추출 |
| 6 | 메시지 payload 규격 | COMPLETION_REPORT/FEEDBACK 메시지 payload 표준화 |

### 3-2. Out of Scope

- src/ 코드 수정 (hooks/scripts만)
- 배포 자동화 (Smith님 수동 판단)
- Slack 연동 (별도 TASK)
- COO의 Match Rate 재검증 (PM이 검수 완료한 결과를 신뢰)
- 자동 배포 트리거 (Smith님 OK 후에도 수동 배포)

---

## 4. 상세 스펙

### 4-1. Match Rate 파싱 로직

```bash
# docs/03-analysis/ 에서 가장 최근 analysis.md의 Match Rate 추출
# 패턴: "Match Rate: XX%" 또는 "## Match Rate: XX%"
MATCH_RATE=$(grep -rh "Match Rate.*[0-9]" docs/03-analysis/*.analysis.md 2>/dev/null \
  | tail -1 \
  | grep -oE '[0-9]+' \
  | head -1)
```

- 파일 없음 → 0% 간주 (exit 2)
- 숫자 파싱 실패 → 0% 간주 (exit 2)
- 여러 analysis.md 존재 → 가장 최근 수정된 파일 사용 (`-mtime -1`)

### 4-2. MCP 메시지 payload

#### COMPLETION_REPORT (CTO → PM)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "CTO_LEADER",
  "to_role": "PM_LEADER",
  "payload": {
    "task_file": "TASK-{NAME}.md",
    "match_rate": 97,
    "analysis_file": "docs/03-analysis/{feature}.analysis.md",
    "commit_hash": "abc1234",
    "changed_files": 5,
    "summary": "Wave 1-3 구현 완료. Match Rate 97%."
  },
  "ts": "2026-03-28T15:30:00+09:00",
  "msg_id": "chain-cto-{timestamp}"
}
```

#### COMPLETION_REPORT (PM → COO)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "COMPLETION_REPORT",
  "from_role": "PM_LEADER",
  "to_role": "MOZZI",
  "payload": {
    "task_file": "TASK-{NAME}.md",
    "match_rate": 97,
    "pm_verdict": "pass",
    "pm_notes": "Gap 분석 확인 완료. 기획 의도 부합.",
    "original_cto_report": { ... },
    "summary": "CTO 개발+PM 검수 완료. Smith님 보고 요청."
  },
  "ts": "2026-03-28T15:45:00+09:00",
  "msg_id": "chain-pm-{timestamp}"
}
```

#### FEEDBACK (반려 시)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "FEEDBACK",
  "from_role": "PM_LEADER",
  "to_role": "CTO_LEADER",
  "payload": {
    "task_file": "TASK-{NAME}.md",
    "verdict": "reject",
    "issues": [
      "Gap 항목 3건 미반영",
      "API 엔드포인트 설계 불일치"
    ],
    "action_required": "issues 수정 후 재제출"
  },
  "ts": "...",
  "msg_id": "chain-fb-{timestamp}"
}
```

### 4-3. pdca-chain-handoff.sh 동작

```
입력: TaskCompleted hook stdin (JSON)
전제: 선행 hook들(quality-gate 등) 전부 통과

1. IS_TEAMMATE=true → exit 0 (팀원 통과)
2. team-context.json에서 team 확인 → CTO가 아니면 exit 0 (PM/마케팅은 이 체인 비대상)
3. docs/03-analysis/ 에서 최근 analysis.md 찾기
4. Match Rate 파싱
5. < 95% → stderr에 피드백 + exit 2 (차단)
6. ≥ 95% → PM peer ID 찾기 (list_peers → summary에 "PM_LEADER" 포함)
7. send_message(PM_peer_id, COMPLETION_REPORT)
8. exit 0
```

### 4-4. PM 검수 프로토콜

PM이 COMPLETION_REPORT 수신 시:

1. payload.analysis_file 읽기 → Match Rate 재확인
2. payload.task_file 읽기 → 체크박스 완료 상태 확인
3. Plan/Design vs 구현 일치 여부 판단
4. 기획 의도 부합 여부 판단
5. 판정:
   - **합격**: send_message(COO, COMPLETION_REPORT) + webhook wake
   - **불합격**: send_message(CTO, FEEDBACK) + 수정 항목 명시

### 4-5. COO 보고 프로토콜

COO(mozzi)가 COMPLETION_REPORT 수신 시:

1. payload에서 핵심 정보 추출 (TASK명, Match Rate, 변경 요약)
2. Smith님에게 **대화형 보고**:
   - 무엇이 완료됐는지 (요약)
   - 왜 이 작업을 했는지 (맥락)
   - 변경된 핵심 내용 (기술적 상세 X, 비즈니스 임팩트 중심)
   - 배포 필요 여부
3. Smith님 판단 대기:
   - **OK** → CTO에 배포 지시 (또는 Smith님 직접 배포)
   - **반려** → FEEDBACK 작성 → PM에 전달 → PM이 CTO에 전달

> COO는 Match Rate 검증 안 함. PM 검수 완료를 신뢰. Smith님과의 인터페이스 역할.

### 4-6. Webhook Wake (COO 알림)

PM → COO 메시지 전송 후 webhook wake로 mozzi 세션 깨우기:

```bash
# peers-wake-watcher가 자동 감지 (1초 폴링)
# 또는 PM이 직접 호출:
curl -s -X POST http://localhost:18789/hooks/wake \
  -H "Content-Type: application/json" \
  -d '{"text": "COMPLETION_REPORT from PM", "mode": "now"}'
```

---

## 5. 파일 경계

### 신규

| 파일 | 담당 | 설명 |
|------|------|------|
| `.claude/hooks/pdca-chain-handoff.sh` | backend-dev | Match Rate 게이트 + MCP 핸드오프 |
| `.claude/hooks/helpers/match-rate-parser.sh` | backend-dev | analysis.md에서 Match Rate 추출 헬퍼 |

### 수정

| 파일 | 담당 | 변경 내용 |
|------|------|----------|
| `.claude/settings.local.json` | leader | TaskCompleted hooks 배열에 pdca-chain-handoff.sh 추가 |
| `CLAUDE.md` | leader | PM 검수 프로토콜 + COO 보고 프로토콜 규칙 추가 |

### 참조 (수정 없음)

| 파일 | 용도 |
|------|------|
| `.claude/hooks/task-quality-gate.sh` | 선행 게이트 (tsc/build) — 변경 없음 |
| `.claude/hooks/is-teammate.sh` | 팀원 bypass — 변경 없음 |
| `.claude/runtime/team-context.json` | 팀 식별 — 변경 없음 |

---

## 6. 의존성

| 선행 | 후행 | 이유 |
|------|------|------|
| agent-team-operations (완료) | 이 TASK | team-context.json, frontmatter-parser, MCP 인프라 사용 |
| claude-peers-mcp 설치 (Wave 0 완료) | 이 TASK | send_message, list_peers MCP 도구 필요 |
| peers-wake-watcher (Wave 0-7 완료) | COO 알림 | mozzi webhook wake 필요 |

---

## 7. 성공 기준

### P0 (필수)

- [ ] `pdca-chain-handoff.sh` 실행 → Match Rate < 95% → exit 2 (차단 + 피드백 메시지)
- [ ] Match Rate ≥ 95% → MCP send_message(PM) 성공
- [ ] PM 수신 → COMPLETION_REPORT 메시지 파싱 + analysis.md 읽기 가능
- [ ] PM 합격 판정 → send_message(COO) + webhook wake 성공
- [ ] PM 불합격 → send_message(CTO, FEEDBACK) 성공
- [ ] COO 수신 → Smith님에게 보고 가능
- [ ] 팀원(IS_TEAMMATE=true) → 즉시 exit 0 (bypass)
- [ ] CTO 팀이 아닌 경우 → exit 0 (PM/마케팅 비대상)

### P1 (권장)

- [ ] Match Rate 파싱 실패(파일 없음, 형식 불일치) → 0% 간주 → exit 2
- [ ] PM peer 미발견 → 에러 로그 + exit 0 (차단하지 않음, 수동 핸드오프 fallback)
- [ ] broker 미기동 → 에러 로그 + exit 0 (수동 fallback)
- [ ] 반려→수정→재제출 루프가 무한 반복하지 않음 (피드백에 구체적 수정 사항 포함)

### P2 (차후)

- [ ] BOARD.json에 체인 상태 반영 (chain_status: pending/pm_review/coo_report/deployed)
- [ ] 체인 완료까지 걸린 시간 로깅

---

## 8. 테스트 시나리오

### Happy Path

| # | 시나리오 | 입력 | 기대 결과 |
|---|---------|------|----------|
| H-1 | Match Rate 97% → PM 핸드오프 | analysis.md에 "Match Rate: 97%" | send_message(PM) 호출, exit 0 |
| H-2 | Match Rate 95% (경계값) → 통과 | "Match Rate: 95%" | send_message(PM) 호출, exit 0 |
| H-3 | 팀원 실행 → bypass | IS_TEAMMATE=true | exit 0, send_message 미호출 |
| H-4 | PM팀 실행 → skip | team-context.json team="PM" | exit 0, send_message 미호출 |

### Edge Cases

| # | 시나리오 | 입력 | 기대 결과 |
|---|---------|------|----------|
| E-1 | Match Rate 94% → 차단 | "Match Rate: 94%" | exit 2, 피드백 메시지 출력 |
| E-2 | Match Rate 0% (분석 파일 없음) | analysis 디렉토리 비어있음 | exit 2, "Gap 분석 문서 없음" |
| E-3 | Match Rate 형식 불일치 | "Match Rate: high" | 0% 간주, exit 2 |
| E-4 | PM peer 미발견 | list_peers에 PM_LEADER 없음 | 에러 로그, exit 0 (수동 fallback) |
| E-5 | broker 다운 | localhost:7899 연결 불가 | 에러 로그, exit 0 (수동 fallback) |
| E-6 | analysis.md 여러 개 | 3개 파일에 각각 다른 Match Rate | 가장 최근 수정 파일의 값 사용 |
| E-7 | team-context.json 없음 | 파일 미존재 | exit 0 (체인 비대상) |

### Mock Data

- `__tests__/hooks/fixtures/analysis_pass.md` — Match Rate: 97%
- `__tests__/hooks/fixtures/analysis_fail.md` — Match Rate: 85%
- `__tests__/hooks/fixtures/analysis_malformed.md` — Match Rate: (형식 오류)
- `__tests__/hooks/fixtures/team_context_cto.json` — team: "CTO"
- `__tests__/hooks/fixtures/team_context_pm.json` — team: "PM"

---

## 9. 리스크

| 리스크 | 확률 | 영향 | 대응 |
|--------|:----:|:----:|------|
| broker 미기동으로 MCP 실패 | 중 | 중 | exit 0 fallback (수동 핸드오프) |
| PM 세션 부재 (channel push 수신 불가) | 중 | 저 | 메시지 broker에 저장, PM 세션 시작 시 check_messages로 수신 |
| Match Rate 파싱 버그 | 저 | 고 | TDD로 사전 검증 + 실패 시 0% 안전 처리 |
| 반려 루프 무한 반복 | 저 | 중 | 피드백에 구체적 수정 항목 필수 + TASK 파일에 이력 기록 |

---

## 10. 구현 순서

### Wave 1: 핵심 스크립트 (의존성 없음)
- W1-1: `match-rate-parser.sh` 헬퍼 작성
- W1-2: `pdca-chain-handoff.sh` 작성 (Match Rate 게이트 + MCP 호출)
- W1-3: TDD 작성 + 실행 (H-1~H-4, E-1~E-7)

### Wave 2: 설정 + 규칙 (Wave 1 완료 후)
- W2-1: `settings.local.json` TaskCompleted 배열에 추가
- W2-2: CLAUDE.md PM 검수 프로토콜 추가
- W2-3: CLAUDE.md COO 보고 프로토콜 추가

### Wave 3: 통합 검증
- W3-1: 실제 3자 통신 테스트 (CTO→PM→COO 체인)
- W3-2: Gap 분석 → `docs/03-analysis/pdca-chain-automation.analysis.md`

---

## 하지 말 것

- src/ 코드 수정
- task-quality-gate.sh 수정 (기존 게이트는 그대로 유지)
- COO에 Match Rate 검증 로직 추가 (COO는 보고 역할만)
- 자동 배포 트리거 (Smith님 수동 판단)
- Slack 연동 (별도 TASK)
