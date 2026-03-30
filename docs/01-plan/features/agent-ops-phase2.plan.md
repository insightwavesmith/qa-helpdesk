# Agent Ops Phase 2 (에이전트 운영 2기) Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Agent Ops Phase 2 (에이전트 운영 2기) |
| 작성일 | 2026-03-30 |
| 프로세스 레벨 | L2 (hooks/config 수정) |
| 배경 | P0+P1 완료 (OFR-1~35 + 18건 Green, Match Rate 97~100%). 미착수 P2~P3 3건 + OpenClaw 3.29 신기능 4건 = 총 7건 기획. |
| 항목 수 | 7건 (2트랙) |
| 선행 완료 | P0: D5+D7+D8-1+D8-4 (faa1d80), P1: D3+D6+D8-5 (CTO-2) |

### Value Delivered (4관점)

| 관점 | 내용 |
|------|------|
| **Problem** | P0/P1에서 체인 자동화+에러 분류 해결했으나, (1)팀원 위험 작업 시 무조건 차단→복구불가, (2)체인 이벤트 감지 최대 5분 지연, (3)compaction 시 팀 상태 소실, (4)thinking 토큰 낭비 미해결 |
| **Solution** | OpenClaw 3.29 requireApproval로 승인형 게이트 전환 + runHeartbeatOnce로 즉시 patrol + memory flush 플러그인화 + per-agent thinking 분리 |
| **Function UX Effect** | 팀원 작업 중단 0건 (차단→승인 전환), 체인 지연 5분→즉시, compaction 후 팀 상태 100% 복원, 토큰 15~20% 절감 |
| **Core Value** | 에이전트팀 무중단 자율 운영 — Smith님 개입 최소화하면서도 위험 작업 통제 유지 |

---

## 트랙 구성

| 트랙 | 항목 | 우선순위 | 성격 |
|------|------|---------|------|
| **B** (OpenClaw 신기능) | B1 requireApproval | **P0** | 팀원 작업 중단 근본 해결 |
| **B** | B2 runHeartbeatOnce | **P1** | 체인 실시간 감지 |
| **B** | B3 Memory flush 플러그인화 | **P1** | compaction 생존율 향상 |
| **A** (기존 미착수) | A1 Per-Agent Thinking | **P2** | 토큰 최적화 |
| **B** | B4 Slack upload-file | **P2** | 리포트 자동 배포 |
| **A** | A2 ACP 전환 리서치 | **P3** | 장기 전략 (리서치만) |
| **A** | A3 Webhook agentId 라우팅 | **P3** | 외부 연동 (D3 완료 후) |

---

## 항목별 Plan + PM 의견

---

### B1. requireApproval — 팀원 권한 제어 혁신 (P0)

**이게 뭔지**: validate-delegate.sh의 `exit 2` 무조건 차단 → OpenClaw requireApproval 승인형 게이트로 전환. 팀원이 위험 파일 수정 시도 시 Slack으로 승인 요청, 승인 후 작업 재개.

**왜 필요한지**:
현재 validate-delegate.sh는 팀원이 `.claude/`, migration, `.env` 등 위험 파일 수정 시 `exit 2`로 **무조건 차단**. 문제:
1. 팀원 작업 즉시 중단 — 복구 불가 (pane이 에러 상태로 멈춤)
2. 정당한 수정도 차단 (예: 팀원이 config 수정해야 하는 TASK 받았을 때)
3. 차단 후 리더가 직접 수정해야 해서 delegate 모드 위반 발생

requireApproval이면 "멈추고 물어보기"가 가능 — 차단이 아니라 일시정지.

**현재 코드 분석**:
```
validate-delegate.sh (40줄):
- is-teammate.sh로 팀원 여부 확인
- 팀원이 .claude/ 수정 → exit 2 (차단)
- 리더가 src/ 수정 → exit 2 (차단)
- 그 외 → exit 0 (통과)
```

**구현 범위**:

1. **requireApproval API 통합**
   - OpenClaw before_tool_call hook에서 `requireApproval()` 호출 가능 여부 조사
   - `openclaw.json` hooks 섹션에 requireApproval 옵션 추가 방법 파악
   - PR #55339 기반 스펙 분석 (승인 채널, 타임아웃, 콜백 구조)

2. **승인 대상 범위 정의**
   | 대상 | 현재 | 변경 후 |
   |------|------|--------|
   | `.claude/` 디렉토리 | exit 2 차단 | requireApproval → Slack 승인 |
   | DB migration 파일 | 패스 (위험!) | requireApproval → Slack 승인 |
   | `.env`, 시크릿 파일 | 패스 | requireApproval → Slack 승인 |
   | `src/` 일반 코드 (팀원) | exit 0 (통과) | 변경 없음 |
   | `src/` (리더) | exit 2 차단 | 유지 (리더는 무조건 차단) |

3. **Slack 알림 설계**
   - 채널: `#agent-ops` (기존 agent-slack-notify.sh 재활용)
   - 메시지 포맷:
     ```
     🔐 승인 요청 | {팀원명} → {파일경로}
     작업: {tool_name} ({Edit/Write})
     TASK: {현재 TASK}
     [승인] [거부]
     ```
   - 승인자: Smith님 또는 COO(mozzi)

4. **타임아웃 정책**
   - 5분 타임아웃 → 자동 거부 (안전 우선)
   - 타임아웃 시 팀원에게 "승인 대기 시간 초과, 리더에게 보고하세요" 메시지

5. **validate-delegate.sh 리팩토링**
   - exit 2 분기 → requireApproval 호출로 변경
   - 리더 차단 로직은 유지 (exit 2 그대로)
   - fallback: requireApproval 실패 시 exit 2로 폴백 (안전 우선)

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `.claude/hooks/validate-delegate.sh` | exit 2 → requireApproval 전환 |
| `~/.openclaw/openclaw.json` | hooks.before_tool_call requireApproval 설정 |
| `.claude/hooks/helpers/approval-handler.sh` | **신규** — Slack 승인 요청/응답 처리 |

**TDD 계획**:
- APR-1: 팀원 `.claude/` 수정 → requireApproval 호출 확인
- APR-2: 팀원 migration 수정 → requireApproval 호출 확인
- APR-3: 승인 → exit 0 반환 확인
- APR-4: 거부 → exit 2 반환 확인
- APR-5: 타임아웃 → exit 2 반환 확인
- APR-6: requireApproval 실패 → exit 2 폴백 확인
- APR-7: 리더 src/ 수정 → exit 2 유지 (requireApproval 호출 안 함)
- APR-8: 기존 OFR-10~12 회귀 없음 확인

**의존성**: 없음 (P0+P1 완료 기반, 독립 구현)
**예상 공수**: 개발 1.5일 (API 조사 0.5일 + 구현 0.5일 + TDD 0.5일)

**PM 의견**:
- COO가 정확히 짚었다 — 이게 에이전트 자동화 최대 페인포인트. "차단"은 사고 방지지만 "작업 중단"이라는 부작용이 너무 크다. requireApproval이 이 딜레마를 해결한다.
- **핵심 판단**: requireApproval API가 실제로 OpenClaw 3.29에 구현되어있는지가 관건. PR #55339가 머지되었는지 확인 필요. 만약 미구현이면 **직접 구현해야 할 수 있다** — 그래도 P0 유지. before_tool_call hook에서 Slack webhook 직접 쏘고 polling으로 승인 대기하는 방식으로 자체 구현 가능.
- **리더 차단은 유지**해야 한다. 리더가 코드 쓰면 팀 구조 자체가 무너짐. 승인 옵션 줄 필요 없음.
- **B3(memory flush)과 시너지**: requireApproval 대기 중 compaction 발생하면 승인 상태 소실 가능. B3의 flush 정책에 "승인 대기 상태" 포함 필요.

---

### B2. runHeartbeatOnce — patrol 즉시 트리거 (P1)

**이게 뭔지**: 체인 이벤트(완료/실패/stuck) 발생 시 COO에게 즉시 heartbeat 전송. 현재 5분 고정 주기 대기 제거.

**왜 필요한지**:
현재 `openclaw.json`에 heartbeat 5분 주기 설정. 체인 이벤트 발생해도 COO가 최대 5분 후에야 감지. 실제 사례:
- CTO 완료 → PM 핸드오프 메시지 전송 → COO가 5분 뒤 patrol 돌려서 확인 → 5분 지연
- 에러 발생 → error-classifier가 critical 판정 → COO가 5분 후 발견 → 대응 지연

runHeartbeatOnce로 "지금 당장 patrol 돌려"를 트리거하면 이 5분 병목 제거.

**현재 인프라 분석**:
```
openclaw.json: heartbeat.intervalMinutes = 5
체인 흐름: CTO→PM→COO 각 단계에서 send_webhook_wake 호출
하지만 webhook_wake는 "세션 깨우기"일 뿐 "patrol 즉시 실행"은 아님
```

**구현 범위**:

1. **runHeartbeatOnce 플러그인 API 조사**
   - OpenClaw 플러그인에서 `runHeartbeatOnce({target: "last"})` 호출 가능한지 확인
   - PR #40299 기반 스펙 분석

2. **트리거 시점 정의**
   | 이벤트 | 트리거 | target |
   |--------|--------|--------|
   | TASK 완료 (chain handoff) | pdca-chain-handoff.sh 성공 시 | last (COO 세션) |
   | error-classifier critical | error-classifier.sh가 CRITICAL 반환 시 | last |
   | 팀 stuck (5분+ 무활동) | auto-team-cleanup.sh 감지 시 | last |
   | requireApproval 타임아웃 | approval-handler.sh 타임아웃 시 | last |

3. **기존 heartbeat과 공존 설계**
   - 5분 주기 heartbeat 유지 (기본 모니터링)
   - runHeartbeatOnce는 추가 트리거 (중복 patrol 허용)
   - 과도한 트리거 방지: 1분 내 중복 호출 무시 (debounce)

4. **Hook 연동**
   - chain-messenger.sh 전송 성공 후 runHeartbeatOnce 호출
   - error-classifier.sh CRITICAL 판정 후 runHeartbeatOnce 호출
   - auto-team-cleanup.sh stuck 감지 후 runHeartbeatOnce 호출

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `.claude/hooks/helpers/chain-messenger.sh` | 전송 성공 후 heartbeat 트리거 추가 |
| `.claude/hooks/helpers/error-classifier.sh` | CRITICAL 시 heartbeat 트리거 추가 |
| `.claude/hooks/auto-team-cleanup.sh` | stuck 감지 시 heartbeat 트리거 추가 |
| `.claude/hooks/helpers/heartbeat-trigger.sh` | **신규** — runHeartbeatOnce 래퍼 + debounce |
| `~/.openclaw/openclaw.json` | heartbeat 플러그인 설정 추가 (필요 시) |

**TDD 계획**:
- HB-1: chain-messenger 전송 성공 → heartbeat 트리거 호출 확인
- HB-2: error-classifier CRITICAL → heartbeat 트리거 호출 확인
- HB-3: stuck 감지 → heartbeat 트리거 호출 확인
- HB-4: 1분 내 중복 호출 → 두 번째 무시 (debounce) 확인
- HB-5: runHeartbeatOnce 실패 → exit 0 (체인 블로킹 없음)
- HB-6: 기존 PC-1~25 회귀 없음

**의존성**: B1(requireApproval)과 독립. 병렬 구현 가능.
**예상 공수**: 개발 1일 (API 조사 0.3일 + heartbeat-trigger.sh 0.3일 + hook 연동 0.2일 + TDD 0.2일)

**PM 의견**:
- 5분 지연은 실제로 체감된다. CTO가 완료 보고 보내고 COO가 5분 뒤 발견하면 Smith님 관점에서 "왜 이렇게 느려?"가 됨.
- **현실적 주의**: runHeartbeatOnce가 OpenClaw 플러그인 API에 실제 구현되어있는지 미확인. 미구현이면 **webhook wake를 강화**하는 방식으로 대체 가능 — 현재 `send_webhook_wake`에 `mode=now` + `target=last` 파라미터 추가하면 같은 효과.
- **debounce 필수**. 체인 이벤트가 연속 발생하면 (예: 3개 TASK 연달아 완료) patrol이 3번 연속 트리거되면 COO 컨텍스트 낭비.

---

### B3. Memory Flush 플러그인화 — compaction 생존율 향상 (P1)

**이게 뭔지**: openclaw.json에 하드코딩된 memoryFlush 프롬프트 → 팀별 커스텀 flush 정책으로 전환. 에이전트팀 상태까지 compaction 전 자동 저장.

**왜 필요한지**:
현재 `openclaw.json`의 `compaction.memoryFlush`:
```json
"memoryFlush": {
  "prompt": "SESSION-STATE.md에 현재 작업 상태를 간단히 기록하세요..."
}
```
문제:
1. 팀 상태 저장 안 됨 (팀원 ID, 진행 중 TASK, 체인 단계 등 소실)
2. context-checkpoint.sh가 있지만 수동 트리거만 가능
3. CTO/PM/COO 팀별 중요 정보가 다른데 일률적 프롬프트

**현재 인프라 분석**:
```
context-checkpoint.sh (61줄):
- save_checkpoint() → SESSION-STATE.md에 팀/TASK/팀원 상태 저장
- teammate-registry.json에서 팀원 상태 읽기
- 수동 실행 or source로 호출

openclaw.json memoryFlush:
- "SESSION-STATE.md + memory/날짜.md + SERVICE-VISION.md" 저장
- 프롬프트 기반 (에이전트가 해석해서 실행) → 불안정
```

**구현 범위**:

1. **memory-core 플러그인 계약 조사**
   - OpenClaw 3.29에서 memoryFlush가 플러그인 계약으로 이동했는지 확인
   - 플러그인에서 flush 대상/정책을 코드로 제어 가능한지 파악

2. **팀별 flush 정책 설계**
   | 팀 | flush 대상 | 이유 |
   |-----|-----------|------|
   | **CTO** | team-context.json, teammate-registry.json, 현재 Wave, 빌드 상태, 변경 파일 목록 | 구현 상태 복원 |
   | **PM** | 기획서 진행도, 분석 결과, PDCA phase, Gap Rate | 기획 맥락 복원 |
   | **COO** | 체인 진행 단계, 팀 상태, Smith님 최근 결정사항, 미처리 보고 | 보고 맥락 복원 |

3. **context-checkpoint.sh 확장 vs 대체**
   - context-checkpoint.sh의 `save_checkpoint()` 로직을 flush 정책에 통합
   - 팀 구분 로직 추가 (team-context.json 기반)
   - 프롬프트 기반 → 스크립트 기반 전환 (확정적 동작)

4. **flush 트리거**
   - 80% threshold 시 자동 (openclaw.json compaction 연동)
   - 주요 마일스톤에서도 실행 (TASK 완료, Wave 전환)
   - pdca-chain-handoff.sh 성공 시 flush (체인 상태 보존)

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `.claude/hooks/helpers/context-checkpoint.sh` | 팀별 flush 정책 추가 |
| `~/.openclaw/openclaw.json` | memoryFlush 플러그인 설정 변경 |
| `.claude/hooks/helpers/memory-flush-policy.sh` | **신규** — 팀별 flush 정책 정의 |

**TDD 계획**:
- MF-1: CTO 팀 flush → team-context.json + registry 포함 확인
- MF-2: PM 팀 flush → PDCA phase + Gap Rate 포함 확인
- MF-3: COO 팀 flush → 체인 단계 + 미처리 보고 포함 확인
- MF-4: 팀 미식별 시 기본 flush (기존 동작) 확인
- MF-5: flush 후 SESSION-STATE.md에 팀 상태 기록 확인
- MF-6: pdca-chain-handoff 성공 시 flush 트리거 확인

**의존성**: B1(requireApproval)과 시너지 — 승인 대기 상태도 flush 대상
**예상 공수**: 개발 1일 (정책 설계 0.3일 + 구현 0.5일 + TDD 0.2일)

**PM 의견**:
- 프롬프트 기반 flush의 가장 큰 문제는 **비결정성**. "SESSION-STATE.md에 기록하세요"라고 해도 에이전트가 뭘 기록할지 보장 못함. 스크립트 기반이면 확정적.
- **context-checkpoint.sh가 이미 70% 해결**해두었다. 여기에 팀 구분 + 플러그인 연동만 추가하면 됨. 신규 파일보다 기존 확장이 효율적.
- **OpenClaw 플러그인 계약이 실제로 있는지가 관건**. 없으면 openclaw.json memoryFlush.prompt를 "context-checkpoint.sh 실행하세요"로 바꾸는 것만으로도 개선 가능 (최소 구현).
- **B1과의 시너지 중요**: requireApproval 대기 중 compaction → 승인 상태 소실 → 재시작 시 팀원이 승인 안 받고 다시 시도 가능. flush에 "pending_approvals" 상태 포함 필수.

---

### A1. Per-Agent Thinking Level (P2)

**이게 뭔지**: 에이전트별 thinking level 분리. COO/리더 = high, 구현 팀원 = medium.

**왜 필요한지**:
현재 모든 에이전트가 `thinking: high`로 실행. 단순 코드 구현하는 backend-dev도 high thinking → 응답 시간 증가 + 토큰 낭비. Opus 4.6 thinking=high는 턴당 ~2000 토큰 추가 소모.

**현재 인프라 분석**:
- CLAUDE.md에 "사고 모델: thinking high, 반드시 활성화" 규칙 존재
- CC(Claude Code)에서 thinking level은 모델 설정으로 제어 — spawn 시 `--thinking` 플래그 or config
- agent-sdk 스크립트에서 `thinkingBudget: "high"` 설정 발견

**구현 범위**:

1. **CC thinking API 조사**
   - spawn 시 thinking level 주입 공식 방법 확인
   - `--thinking medium` 플래그 존재 여부
   - 없으면 프롬프트 레벨 대체: "Think step by step" vs "Answer directly"

2. **역할별 thinking 정책**
   | 역할 | thinking | 근거 |
   |------|---------|------|
   | Leader (COO/CTO/PM) | high | 전략 판단, 팀 조율 |
   | backend-dev | medium | 코드 구현 (복잡한 아키텍처 판단 불필요) |
   | frontend-dev | medium | UI 구현 |
   | qa-engineer | medium | 검증/분석 (패턴 매칭 위주) |
   | code-analyzer | high | 코드 품질 판단 필요 |

3. **pilot 테스트 계획**
   - 1개 TASK를 medium thinking 팀원으로 실행
   - high thinking 결과와 비교: 첫 시도 정확도, 수정 횟수, 총 토큰
   - 품질 저하 기준: 리더 reject 횟수 2배 이상 → medium 폐기

4. **Config 설계**
   - team-context.json에 `thinkingPolicy` 필드 추가
   - spawn 시 역할 매칭 → thinking level 자동 주입

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `.claude/runtime/team-context.json` | thinkingPolicy 필드 추가 |
| CLAUDE.md | thinking 규칙 세분화 (역할별) |
| spawn 프롬프트 | thinking level 파라미터 포함 |

**TDD 계획**:
- TH-1: leader 역할 spawn → thinking=high 설정 확인
- TH-2: backend-dev spawn → thinking=medium 설정 확인
- TH-3: thinkingPolicy 미설정 시 기본값 high 확인
- TH-4: pilot 결과 비교 (수동 — 자동 TDD 불가)

**의존성**: 없음. 완전 독립.
**예상 공수**: 리서치 0.5일 + 구현 0.5일 + pilot 1일 = 2일

**PM 의견**:
- P0/P1보다 우선순위 낮은 이유: **효과 대비 리스크**. 토큰 15~20% 절감 추정이지만 medium thinking에서 코드 품질 저하 시 "리더 재작업 증가"로 실질 비용 증가 가능.
- **pilot 필수**. pilot 없이 전체 전환하면 안 됨. 특히 복잡한 TASK (DB 마이그레이션, 에이전트 인프라)에서 medium은 위험.
- CC에서 thinking level을 spawn 시 제어하는 공식 방법이 없을 수 있다. 이 경우 프롬프트 레벨("간결하게 답변", "복잡한 추론 불필요")로 대체하는데 효과가 불확실. **리서치 결과에 따라 P2 유지 or 보류 판단**.

---

### B4. Slack upload-file — 리포트 자동 배포 (P2)

**이게 뭔지**: Slack upload-file 액션으로 리포트 파일을 직접 채널에 업로드. 현재 텍스트 전송 or URL 공유 → 파일 직접 첨부.

**왜 필요한지**:
현재 방식:
1. coo-chain-report.sh → Slack에 텍스트 보고 (길면 잘림)
2. agent-ops-dashboard HTML 리포트 → localhost:3847 URL 공유 (외부 접근 불가)
3. Gap 분석/Match Rate 리포트 → docs/ 폴더에만 존재

파일 직접 업로드하면 Smith님이 Slack에서 바로 열어볼 수 있음.

**구현 범위**:

1. **upload-file 액션 스펙 조사**
   - OpenClaw Slack upload-file API 확인
   - 파일 크기 제한, 지원 포맷, 스레드 지정 가능 여부

2. **적용 대상**
   | 리포트 | 현재 | upload-file 적용 후 |
   |--------|------|-------------------|
   | COO→Smith 보고 | 텍스트 메시지 | .md 파일 첨부 + 요약 텍스트 |
   | Gap 분석 | docs/ 폴더만 | .md 업로드 → #agent-ops |
   | Match Rate 리포트 | 텍스트 | .json 업로드 |
   | Dashboard HTML | localhost URL | .html 업로드 |

3. **채널 + 스레드 설계**
   - #agent-ops 채널 메인 스레드에 요약
   - 파일은 스레드 reply로 첨부 (채널 스팸 방지)

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `.claude/hooks/coo-chain-report.sh` | 보고 시 파일 업로드 추가 |
| `.claude/hooks/helpers/slack-uploader.sh` | **신규** — upload-file 래퍼 |

**TDD 계획**:
- SU-1: .md 파일 업로드 → Slack API 호출 확인 (mock)
- SU-2: 파일 미존재 → 텍스트 fallback 확인
- SU-3: Slack API 실패 → exit 0 (체인 블로킹 없음)
- SU-4: 기존 coo-chain-report 동작 회귀 없음

**의존성**: B2(heartbeat)와 조합 가능 — 보고 시 파일 업로드 + 즉시 patrol
**예상 공수**: 0.5일

**PM 의견**:
- 기능 자체는 단순하고 유용. 하지만 P0/P1 뒤 순서가 맞다.
- **핵심 가치**: Smith님이 Slack에서 바로 리포트를 열어볼 수 있다는 UX 개선. 현재 "docs/ 파일 확인하세요"는 개발 환경 접근이 필요해서 비개발자에게 불편.
- upload-file API가 없으면 `files.upload` Slack Web API를 직접 호출하면 됨. 이건 표준 Slack API라 확실히 동작.

---

### A2. ACP 전환 리서치 (P3 — 리서치만)

**이게 뭔지**: tmux 기반 에이전트팀 → ACP(Agent Communication Protocol) 전환 가능성 검토.

**왜 필요한지**:
tmux 기반의 구조적 한계:
- 좀비 pane (force-team-kill.sh로 대응 중이지만 근본 해결 아님)
- capture-pane 파싱 불안정 (peer-resolver.sh 3전략 필요)
- 팀원 상태 모니터링이 tmux 캡처 기반 → 지연 + 부정확
- CC Agent Teams 자체가 실험 플래그 뒤에 있음 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)

**리서치 범위 (구현 X)**:

1. **ACP SDK 문서 파악**
   - ACP 메시지 프로토콜 (요청/응답/이벤트)
   - 에이전트 등록/해제 라이프사이클
   - 메시지 라우팅 방식

2. **현재 구조 ↔ ACP 호환성 매핑**
   | 현재 (tmux 기반) | ACP 대응 | 호환성 |
   |------------------|---------|--------|
   | tmux send-keys | ACP send_message | 높음 |
   | tmux capture-pane | ACP check_messages | 높음 |
   | teammate-registry.json | ACP agent registry | 높음 |
   | peer-resolver.sh 3전략 | ACP native routing | **대체 가능** |
   | force-team-kill.sh | ACP agent lifecycle | **대체 가능** |
   | chain-messenger.sh | ACP structured messages | 높음 |
   | validate-delegate.sh | ACP policy hooks | 중간 |

3. **전환 시 깨지는 것 / 유지되는 것**
   - 깨지는 것: tmux 직접 제어 코드, is-teammate.sh의 pane_index 판별, zombie-pane-detector.sh
   - 유지되는 것: 메시지 프로토콜 (bscamp-team/v1), PDCA hook 체인, error-classifier, context-checkpoint
   - 회색 지대: validate-delegate.sh (ACP에서 before_tool_call hook 형태 유지 가능?)

4. **CC Agent Teams 정식 출시 로드맵 확인**
   - 실험 플래그 제거 시점
   - ACP와 Agent Teams의 관계 (통합 vs 별개)

5. **결론 도출**: "전환 시점 제안" or "아직 시기상조 근거"

**산출물**: `docs/research/acp-migration-assessment.md`

**TDD 계획**: 없음 (리서치 문서만, 코드 변경 없음)

**의존성**: 없음
**예상 공수**: 리서치 1일

**PM 의견**:
- COO가 미리 말한 대로 "시기상조"가 나와도 정상. 하지만 **매핑만 해두면 가치 있다**. ACP 정식 출시 시 "뭘 포팅해야 하는지" 목록이 있으면 전환 속도가 빨라짐.
- acp-plugin-sdk-research (2026-03-29, 이미 완료)에서 ACP 시기상조 결론 나옴. 이번 리서치는 그때보다 구체적으로 — **파일별 포팅 계획**까지 나오면 이상적.
- P3이지만 다른 P0/P1 작업 대기 시간에 병렬 실행 가능 (L1 리서치니까 1명이 독립 수행).

---

### A3. Webhook agentId 라우팅 (P3)

**이게 뭔지**: 외부 시스템(CI/CD 등)에서 webhook으로 특정 에이전트에 직접 메시지 전달. agent-ops-dashboard에 라우팅 핸들러 추가.

**왜 필요한지**:
현재 체인은 내부 통신만 가능 (peer-resolver → 역할명 → peer ID). 외부 시스템(CI/CD, Slack 봇, 모니터링 도구)이 특정 에이전트에 직접 메시지를 보낼 수 없음. D3(에러 분류) 완료로 에러 유형별 자동 배정이 가능해졌으니, 외부에서 "이 에러를 이 에이전트가 처리해라"를 트리거할 수 있음.

**구현 범위**:

1. **사용 시나리오 정의**
   | 외부 이벤트 | 대상 에이전트 | 메시지 |
   |------------|-------------|--------|
   | CI/CD 빌드 실패 | CTO 리더 | BUILD_FAILED + 에러 로그 |
   | Slack /command | 대상 역할 | COMMAND + payload |
   | 모니터링 알림 | COO | ALERT + metric |
   | error-classifier CRITICAL (외부) | 해당 전문가 에이전트 | ERROR_REPORT + 분류 코드 |

2. **dashboard 라우팅 핸들러 설계**
   - agent-ops-dashboard (localhost:3847, Bun+Hono) 에 POST 엔드포인트 추가
   - `POST /api/route` — body: `{ agentId: "string" | role: "string", message: {...} }`
   - agentId 직접 지정 or role 지정 → peer-resolver로 변환
   - 인증: webhook token (기존 `mz-hook-Kx9mP4vR7nWqZj2026` 재활용)

3. **D3(에러 분류) 연동**
   - error-classifier CRITICAL → webhook → 전문가 에이전트 자동 배정
   - 예: AUTH 에러 → security-architect, DEPENDENCY → backend-dev

**수정 파일**:
| 파일 | 변경 |
|------|------|
| `docs/mockup/agent-ops-dashboard.html` | 라우팅 UI 패널 추가 (목업) |
| agent-ops-dashboard 서버 코드 | `/api/route` 엔드포인트 추가 |
| `.claude/hooks/helpers/webhook-router.sh` | **신규** — 라우팅 로직 |

**TDD 계획**:
- WR-1: POST /api/route agentId 지정 → 해당 에이전트에 메시지 전달 확인
- WR-2: POST /api/route role 지정 → peer-resolver 변환 후 전달 확인
- WR-3: 인증 토큰 불일치 → 401 반환 확인
- WR-4: 대상 에이전트 미존재 → 404 + 에러 메시지 확인
- WR-5: D3 에러 분류 → 자동 라우팅 확인

**의존성**: D3(에러 분류) 완료 — **이미 P1에서 완료됨** (CTO-2). agent-ops-dashboard 완료 — **이미 완료됨** (Match Rate 95%).
**예상 공수**: 개발 1일

**PM 의견**:
- P3이지만 의존성이 모두 해소되었으므로 **P2로 올려도 무방**. D3 + dashboard 모두 완료 상태.
- 하지만 현재 외부 시스템 연동 니즈가 구체적이지 않음. CI/CD는 Vercel 자동 배포라 빌드 실패 알림이 이미 Slack으로 옴. 실질적 사용 시나리오가 "error-classifier 연동" 하나뿐.
- **Wave 3에 넣되, 시나리오가 구체화되면 P2로 상향** 판단.

---

## 의존성 그래프

```
B1 (requireApproval) ──────── 독립 (P0)
B2 (heartbeat)       ──────── 독립 (P1), B1과 병렬 가능
B3 (memory flush)    ──┬───── B1 시너지 (승인 대기 상태 flush)
                       └───── 독립 구현 가능
A1 (thinking)        ──────── 독립 (P2), pilot 필요
B4 (upload-file)     ──────── 독립 (P2)
A2 (ACP research)    ──────── 독립 (P3), L1 리서치
A3 (webhook route)   ──┬───── D3 완료 ✅
                       └───── dashboard 완료 ✅ → 독립 구현 가능
```

### 트랙 A ↔ B 시너지

| 조합 | 시너지 |
|------|--------|
| **B1 + B3** | requireApproval 승인 대기 상태를 memory flush에 포함 → compaction 후에도 승인 흐름 유지 |
| **B1 + A3** | requireApproval 거부 시 webhook으로 리더에게 자동 알림 → 외부 연동 시나리오 확장 |
| **B2 + B1** | requireApproval 타임아웃 → heartbeat 즉시 트리거 → COO가 즉시 인지 |
| **B2 + B3** | flush 완료 후 heartbeat → COO가 compaction 발생 즉시 인지 |
| **A1 + B3** | thinking level도 flush 대상 (compaction 후 팀원 thinking 정책 복원) |
| **A2 + 전체** | ACP 전환 시 B1~B4의 구현 방식이 바뀔 수 있음 → A2 리서치에서 "영향도" 포함 |

---

## Wave 분배

### Wave 1: P0 (필수, 즉시 착수)
| 항목 | 담당 | 공수 |
|------|------|------|
| **B1** requireApproval | CTO 팀 | 1.5일 |

> B1 단독 Wave. 이게 해결 안 되면 나머지 다 의미 없음. 팀원 작업 중단 사고 근본 해결이 최우선.

### Wave 2: P1 (B1 완료 후)
| 항목 | 담당 | 공수 | 비고 |
|------|------|------|------|
| **B2** runHeartbeatOnce | CTO 팀 | 1일 | B1과 병렬 가능하지만 B1에 집중 후 순차 권장 |
| **B3** Memory flush | CTO 팀 | 1일 | B1 시너지 반영 필요 → B1 이후 |

> Wave 2 총 2일. B2와 B3는 독립적이므로 팀원 2명이면 병렬 가능.

### Wave 3: P2 (여유 시)
| 항목 | 담당 | 공수 | 비고 |
|------|------|------|------|
| **A1** Per-Agent Thinking | CTO 팀 | 2일 (pilot 포함) | 리서치 결과 따라 보류 가능 |
| **B4** Slack upload-file | CTO 팀 | 0.5일 | 단순 구현 |
| **A3** Webhook 라우팅 | CTO 팀 | 1일 | 시나리오 구체화 후 |

### Wave 4: P3 (장기)
| 항목 | 담당 | 공수 |
|------|------|------|
| **A2** ACP 리서치 | PM 팀 | 1일 |

> A2는 L1 리서치. Wave 1~3 대기 시간에 PM이 병렬 수행 가능.

---

## 총 공수 추정

| Wave | 항목 | 공수 | 누적 |
|------|------|------|------|
| W1 | B1 | 1.5일 | 1.5일 |
| W2 | B2 + B3 | 2일 (병렬 시 1일) | 2.5~3.5일 |
| W3 | A1 + B4 + A3 | 3.5일 (병렬 시 2일) | 4.5~5.5일 |
| W4 | A2 | 1일 (병렬) | 5.5~6.5일 |

**전체 공수**: 5.5~6.5일 (팀원 2명 병렬 가정)

---

## 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| requireApproval API 미구현 | B1 구현 방식 변경 | 자체 구현 (Slack webhook + polling) |
| runHeartbeatOnce API 미구현 | B2 구현 방식 변경 | webhook wake 강화로 대체 |
| memory flush 플러그인 계약 미존재 | B3 구현 방식 변경 | memoryFlush prompt를 checkpoint.sh 호출로 변경 |
| thinking=medium 품질 저하 | A1 폐기 | pilot 결과로 Go/No-Go 판단 |
| ACP 정식 출시 지연 | A2 무기한 보류 | 현재 tmux 방식 유지 + 점진 개선 |

---

## 검증 기준

- [ ] 7개 항목 전부 Plan에 포함 (A1~A3 + B1~B4) ✅
- [ ] 각 항목: 구현 범위 + 수정 파일 + TDD 계획 + 의존성 + 예상 공수 ✅
- [ ] 우선순위 순서 (P0→P1→P2→P3) ✅
- [ ] Wave 분배 (W1~W4) ✅
- [ ] 트랙 A ↔ B 의존성/시너지 분석 ✅
- [ ] OpenClaw 3.29 기능별 "실제 구현 여부 불확실" 리스크 명시 ✅

---

## PM 총평

1. **B1(requireApproval)이 이 Phase의 핵심이자 유일한 P0**. 나머지는 B1이 안 되어도 시스템이 돌아간다. B1이 안 되면 팀원 작업 중단 사고가 계속 발생한다.

2. **OpenClaw 3.29 기능의 "실제 구현 여부"가 최대 리스크**. requireApproval, runHeartbeatOnce, memory flush 플러그인 — 세 가지 모두 PR 레벨에서 확인했지만 릴리즈에 실제 포함됐는지는 Design 단계에서 API 검증 필수. 각각 자체 구현 fallback 방안을 Plan에 포함해두었다.

3. **A2(ACP 리서치)는 이미 acp-plugin-sdk-research에서 "시기상조" 결론**. 이번엔 파일별 포팅 계획까지 구체화하면 미래 전환 시 즉시 활용 가능. 급하지 않으니 Wave 4.

4. **트랙 A와 B의 조합 중 가장 중요한 시너지는 B1+B3**. requireApproval 승인 대기 중 compaction 발생 → 상태 소실 시나리오. Design에서 반드시 다뤄야 함.

5. **A3(webhook 라우팅)의 의존성이 모두 해소**됐으므로 실질적으로 P2 수준이지만, 외부 연동 시나리오가 아직 구체적이지 않아 P3 유지. Smith님이 외부 연동 니즈를 구체화하면 즉시 상향.
