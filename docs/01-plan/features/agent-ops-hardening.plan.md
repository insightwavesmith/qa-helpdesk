# Agent Ops Hardening (에이전트 운영 강화) Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Agent Ops Hardening (에이전트 운영 강화) |
| 작성일 | 2026-03-30 |
| 프로세스 레벨 | L2 (hooks/config 수정 포함) |
| 배경 | 2일간 실전 운영에서 COO 실패 5건 + 팀 실패 6건 + 체인 실패 4건 발생. 반복 방지 + 근본 개선 필요. |
| 항목 수 | 8건 (개발팀 구현 대상) |

---

## 항목별 Plan + 의견

### D1. Per-Agent Thinking Level

**이게 뭔지**: openclaw.json에 에이전트별 thinkingLevel 설정 (COO=high, 팀원=medium)

**왜 필요한지**: COO(mozzi)는 전략 판단이 필요해서 thinking=high가 맞지만, backend-dev 같은 구현 팀원은 medium으로도 충분. 토큰 비용 절감 + thinking 시간 단축.

**구현 내용**:
- openclaw.json (또는 team-context.json)에 `thinkingLevel` 필드 추가
- spawn 시 해당 값을 환경변수나 설정으로 주입
- 기본값: leader=high, teammate=medium

**내 의견**:
- CC(Claude Code)에서 thinkingLevel을 spawn 시 주입하는 공식 API가 있는지 먼저 확인 필요. `--thinking` 플래그가 SDK/CLI에 있으면 바로 구현, 없으면 프롬프트 레벨에서 "Think step by step" vs "Answer directly" 패턴으로 대체.
- **구현 난이도: 낮음** — config 읽기 + spawn 프롬프트 분기.
- **효과: 중간** — 토큰 절감은 체감되지만, thinking=medium이 코드 품질 떨어뜨릴 위험. 특히 복잡한 구현에서 medium이면 첫 시도 정확도 하락 가능.
- **리스크**: medium thinking 팀원이 잘못된 코드 작성 → 리더 재작업 증가. pilot 테스트 후 적용 권장.

**우선순위: P2 (낮음)**
**의존성**: 없음. 독립 구현 가능.

---

### D2. ACP 전환 검토

**이게 뭔지**: tmux 기반 에이전트팀 → ACP(Agent Communication Protocol)로 전환. 좀비 pane, 승인 블로킹 근본 해결.

**왜 필요한지**: tmux 기반의 구조적 한계:
- 좀비 pane (TeamDelete 후에도 프로세스 잔존)
- 승인 블로킹 (leader pane에서 Enter 안 치면 팀원 무한대기)
- pane 간 통신이 tmux capture-pane 파싱 → 불안정
- 팀원 상태 모니터링이 수동 (tmux 캡처 기반)

**구현 내용**:
- Phase 1: acpx 설치 + 로컬 테스트 (ACP 서버 기동, 에이전트 등록)
- Phase 2: 기존 hooks를 ACP 메시지 핸들러로 포팅
- Phase 3: 실전 전환 (tmux fallback 유지)

**내 의견**:
- **시기상조**. ACP는 2026-03 기준 아직 실험 단계. CC의 Agent Teams 자체가 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 플래그 뒤에 있음.
- 현재 tmux 방식이 불편하지만 **동작은 한다**. 좀비 pane → force-team-kill.sh로 해결. 승인 블로킹 → D5에서 해결.
- ACP 전환은 **CC가 Agent Teams를 정식 출시**한 후에 재검토하는 게 맞음. 지금 포팅하면 CC 업데이트마다 깨질 위험.
- **대신 할 것**: ACP SDK 문서 읽고, 현재 hooks/chain 구조가 ACP 메시지 패턴과 얼마나 호환되는지 매핑만 해두기 (L1 리서치).

**우선순위: P3 (보류) — L1 리서치만 P2**
**의존성**: CC Agent Teams 정식 출시 (외부 의존)

---

### D3. 에러 분류 룰북

**이게 뭔지**: HTTP 400, lock file 충돌, 권한 에러 등 반복 에러 패턴을 룰북화 → 자동 분류 → TASK 자동 생성.

**왜 필요한지**: 현재 에러 발생 시 사람이 로그 읽고 판단 → TASK 수동 생성. 같은 유형 에러가 반복되면 매번 같은 판단 과정. 룰북으로 자동화하면 트리아지 시간 절감.

**구현 내용**:
- `docs/ops/error-rulebook.md` — 에러 패턴 + 분류 + 대응 매뉴얼
- `.claude/hooks/helpers/error-classifier.sh` — stderr/stdout 패턴 매칭 → 분류 코드 반환
- 분류 코드별 자동 TASK 생성 로직 (hook에서 TASK-*.md 자동 생성)

**에러 패턴 초안** (실전 2일 역추출):

| 패턴 | 분류 | 자동 대응 |
|------|------|----------|
| `HTTP 4[0-9]{2}` (400/401/403/429) | AUTH/RATE_LIMIT | 429→백오프, 401→토큰 갱신, 403→권한 TASK |
| `ENOENT.*lock` / `lock file` | LOCK_CONFLICT | lock 소유 프로세스 확인 → 종료 or 대기 |
| `Permission denied` / `EACCES` | PERMISSION | 파일 권한 + 실행자 확인 TASK |
| `ETIMEOUT` / `ECONNREFUSED` | NETWORK | broker/서비스 health check → 재시작 |
| `Cannot find module` | DEPENDENCY | npm install 자동 실행 |
| `exit code 2` (hook 차단) | HOOK_GATE | 차단 사유 파싱 → 해당 게이트 조건 해결 TASK |
| `context.*compact` / `auto-compact` | CONTEXT_OVERFLOW | compaction 로그 기록 + 핵심 파일 재로드 |

**내 의견**:
- **가치 높음**. 에러 분류 룰북 자체가 운영 지식 자산. TDD와 시너지 — 룰북 패턴 = 테스트 assertion.
- 단, **TASK 자동 생성은 신중해야**. 잘못 분류되면 불필요한 TASK가 쏟아짐. 초기에는 **분류만 자동, 생성은 수동 승인** (stdout에 제안만 출력).
- D7(실전 실패 TDD)과 같이 진행하면 시너지 큼 — TDD 시나리오에서 에러 패턴 추출 → 룰북 항목으로 정리.

**우선순위: P1 (높음)**
**의존성**: D7과 병행 (에러 패턴 공유)

---

### D4. Webhook Hooks agentId 라우팅

**이게 뭔지**: 체인 메시지를 특정 에이전트에 직접 라우팅. CI/CD 파이프라인이 완료 시 해당 에이전트에 webhook으로 결과 전달.

**왜 필요한지**: 현재 체인 메시지는 peer-resolver.sh가 역할명(PM_LEADER, CTO_LEADER)으로 peer를 찾아서 전송. 하지만:
- broker peer ID가 세션마다 변경
- CI/CD 외부 시스템은 peer ID를 모름
- webhook으로 "CTO팀에 빌드 결과 전달" 같은 시나리오 불가

**구현 내용**:
- webhook endpoint에 `agentId` 또는 `role` 파라미터 추가
- agent-ops-dashboard 서버(localhost:3847)에 `/api/webhook/route` 핸들러
- role → peer-resolver → send_message 체인

**내 의견**:
- **유용하지만 지금은 아님**. CI/CD 연동이 아직 구체적 시나리오가 없음. Vercel 빌드 결과를 에이전트에 전달하려면 Vercel webhook → localhost 터널도 필요.
- **먼저 할 것**: D3(에러 분류)가 완성되면 webhook으로 에러 알림 → 에이전트 라우팅 시나리오가 자연스럽게 나옴.
- 현재 체인은 hooks → stdout → 리더 파싱 → MCP send_message로 충분히 동작 중.

**우선순위: P3 (나중에)**
**의존성**: D3 (에러 분류가 webhook 트리거의 주요 소스)

---

### D5. 승인 블로킹 자동 감지 + 해제

**이게 뭔지**: 팀원이 `.claude/` 파일 수정 시 leader pane에서 승인 대기 → 22분간 Thinking 멈춤 사고 발생. 자동 감지 + pane kill로 해결.

**왜 필요한지**: bypassPermissions 모드에서도 `.claude/` 디렉토리 수정은 추가 승인 필요. 팀원이 hooks 파일을 수정하면 leader pane에 승인 프롬프트 → Enter 안 치면 팀원 무한 대기 → thinking 멈춤으로 오인.

**구현 내용**:
- `.claude/hooks/helpers/approval-watchdog.sh` — 주기적으로 tmux pane 상태 감시
- 패턴 감지: "Allow edit to .claude/" 또는 "approve this write" 류 프롬프트가 N분 이상 방치
- 자동 Enter 전송 (bypassPermissions 모드에서만) 또는 pane kill + 재시작
- 대안: spawn 프롬프트에 `.claude/` 파일 수정 금지 명시 → 근본 차단

**내 의견**:
- **P0 긴급**. 오늘 22분 프리즈 사고의 직접 원인. 재발 확실.
- **근본 해결은 2가지**:
  1. **예방**: 팀원 spawn 시 "`.claude/` 디렉토리 파일은 절대 직접 수정하지 마라. 수정 내용을 리더에게 보고하면 리더가 처리한다" 명시. hooks 수정이 필요한 TASK는 리더가 직접 Write 도구로 처리.
  2. **감지+해제**: approval-watchdog가 tmux pane에서 "approve" 패턴 감지 → 자동 Enter 또는 경고.
- 1번이 더 깔끔. 2번은 tmux 캡처 파싱의 불안정성 있음.
- **즉시 적용 가능**: TASK 파일의 "하지 말 것"에 `.claude/ 직접 수정 금지` 추가 + spawn 프롬프트 표준화.

**우선순위: P0 (즉시)**
**의존성**: 없음. 독립 구현.

---

### D6. 중복 보고 방지

**이게 뭔지**: 같은 COMPLETION_REPORT 또는 ANALYSIS_REPORT가 2번 전송되는 문제 차단.

**왜 필요한지**: COO가 같은 보고를 2번 받으면 Smith님에게 중복 보고 → 혼란. chain-messenger.sh의 retry 로직이 ACK 수신 전에 재전송하면서 발생.

**구현 내용**:
- chain-messenger.sh에 **전송 이력 파일** 추가: `.claude/runtime/chain-sent.log`
- 전송 전 `{msg_id}:{to_id}:{timestamp}` 해시로 최근 5분 내 동일 메시지 여부 확인
- 중복이면 전송 스킵 + 로그 기록
- 수신 측에도 `chain-received.log`로 dedup (방어적)

**내 의견**:
- **간단하고 확실한 개선**. chain-messenger.sh에 5줄 추가 수준.
- 단, 진짜 재전송이 필요한 케이스(첫 전송 실패 → retry)와 구분해야 함. `msg_id`가 같으면 중복, 다르면 정상 retry.
- 현재 `MSG_ID="chain-$(date +%s)-$$"`로 생성 — PID+timestamp 기반이라 같은 hook 실행에서 retry는 같은 MSG_ID. 다른 실행이면 다른 MSG_ID → 자연스럽게 구분됨.
- **추가**: 수신 측(coo-chain-report.sh, pm-chain-forward.sh)에서도 `msg_id` 기반 dedup 추가하면 완벽.

**우선순위: P1 (중간)**
**의존성**: 없음. chain-messenger.sh만 수정.

---

### D7. 실전 실패 15건 TDD

**이게 뭔지**: 2일간 실전 운영에서 발생한 모든 실패 케이스를 TDD 시나리오로 작성. 재발 시 테스트가 잡아내는 구조.

**왜 필요한지**: COO 실패 5건 + 팀 실패 6건 + 체인 실패 4건 = 15건이 문서화 없이 기억에만 의존. 같은 실수 반복 확실. regression.test.ts 패턴(REG-1~10)처럼 실패 케이스를 테스트로 영구 기록.

**실패 케이스 목록**:

#### COO 실패 (5건)
| ID | 실패 | 테스트 전략 |
|----|------|------------|
| COO-1 | 지시모드 빠짐 — COO가 질문만 하고 지시 안 함 | SOUL.md 패턴 검증 (COO 영역, TDD 대상 아님) |
| COO-2 | 물어보기병 — 매 단계 Smith님에게 확인 질문 | COO 행동 패턴 (TDD 대상 아님) |
| COO-3 | PM 건너뛰기 — CTO 결과를 PM 검수 없이 Smith님 보고 | chain-handoff에서 pm_review 단계 스킵 감지 TDD |
| COO-4 | 숫자만 전달 — Match Rate만 보고, 컨텍스트 없음 | coo-chain-report 출력 포맷 검증 TDD |
| COO-5 | 중복 보고 — 같은 결과 2번 보고 | D6과 동일 (chain dedup TDD) |

#### 팀 실패 (6건)
| ID | 실패 | 테스트 전략 |
|----|------|------------|
| TF-1 | 승인 블로킹 22분 — .claude/ 수정 시 leader 승인 대기 | spawn 프롬프트에 .claude/ 수정 금지 포함 여부 TDD |
| TF-2 | sleep 폴링 54분 — 팀원이 sleep loop로 대기 | TASK 완료 판정 로직 TDD (sleep 패턴 금지 검증) |
| TF-3 | 좀비 pane — TeamDelete 후 tmux pane 잔존 | force-team-kill.sh 결과 검증 TDD (기존 테스트 확장) |
| TF-4 | TASK 미전달 — 팀원 spawn 시 TASK 파일 경로 누락 | spawn 메시지에 TASK 파일 경로 포함 여부 검증 |
| TF-5 | compaction 손실 — auto-compact 후 핵심 컨텍스트 유실 | compaction 전 필수 파일 목록 존재 여부 검증 |
| TF-6 | lock file 불일치 — 팀원 간 같은 파일 동시 수정 | 파일 경계(file boundary) 검증 TDD |

#### 체인 실패 (4건)
| ID | 실패 | 테스트 전략 |
|----|------|------------|
| CF-1 | Bearer 토큰 누락 — webhook 인증 헤더 빠짐 | chain-messenger 헤더 검증 TDD |
| CF-2 | peer scope 불일치 — list-peers에서 상대방 안 보임 | peer-resolver 3전략 fallback TDD |
| CF-3 | PM→COO 미도착 — pm-chain-forward 전송 실패 무시 | pm-chain-forward exit code + retry TDD |
| CF-4 | TaskCompleted 미발동 — hook 조건 미충족으로 chain 시작 안 됨 | task-completed.sh 조건 분기 TDD |

**내 의견**:
- **P0 핵심 항목**. 이 15건 중 TDD로 잡을 수 있는 건 **10건** (COO-3,4,5 + TF-1,3,4,6 + CF-1,2,3,4). 나머지 5건(COO-1,2 + TF-2,5 + 일부)은 행동/프로세스 이슈라 TDD보다 가이드/SOUL.md로 해결.
- 기존 테스트 인프라 활용: regression.test.ts 패턴 + chain-e2e.test.ts 패턴 + helpers.ts 헬퍼.
- **새 테스트 파일**: `__tests__/hooks/ops-failure-regression.test.ts` (OFR-1~OFR-15)
- 예상 테스트 수: **약 25건** (일부 실패는 여러 assertion 필요)

**우선순위: P0 (즉시)**
**의존성**: 없음. 기존 테스트 인프라 위에 추가.

---

### D8. 토큰 최적화 (Token Optimization)

**이게 뭔지**: Opus 4.6 100만 토큰 세션에서 하루 64%+ 소모 → compaction 리스크. 5가지 방안으로 토큰 수명 연장.

**왜 필요한지**: 현재 하루 풀타임 운영하면 64% 이상 소모. 70% 이후 품질 저하, 90%에서 auto-compaction 발생하면 핵심 컨텍스트 유실 위험. 특히 CTO 리더 세션은 팀원 조율 + PDCA 기록 + 체인 메시지로 토큰 소모가 가장 큼.

**5가지 방안**:

#### D8-1. Hook 출력 최소화

**현재 문제**: hook stdout/stderr가 전부 대화 컨텍스트에 주입됨. task-quality-gate.sh가 50줄 출력하면 50줄이 토큰으로 소모. 33개 hook × 평균 10줄 = 매 도구 호출마다 수백 토큰 낭비.

**구현**:
- 모든 hook stdout를 **1줄 요약 + exit code**로 제한
- 상세 로그는 `.claude/runtime/hook-logs/{hook명}-{timestamp}.log`에 저장
- hook 공통 래퍼: `hook_summary "PASS: task-quality-gate L2, tsc OK" >&1; hook_detail "..." >> "$LOG_FILE"`
- 기존 hook 33개에 적용 (helpers/hook-output.sh로 공통화)

**내 의견**:
- **가성비 최고**. 구현 쉽고 효과 확실. hook 1개당 평균 10줄 → 1줄로 줄이면 **hook 당 ~90% 토큰 절감**.
- 하루 hook 실행 횟수가 수백 건이라 누적 효과 큼.
- 디버깅 필요 시 log 파일 참조하면 되니 정보 손실도 없음.
- **즉시 적용 가능**.

**우선순위: P0 (즉시)**

#### D8-2. Compaction 자동 대비 (SESSION-STATE.md)

**현재 문제**: auto-compaction(90%)이 발동하면 이전 대화 맥락 유실. 어떤 TASK를 하고 있었는지, 팀원 상태가 뭔지, 체인 진행 단계가 어딘지 날아감. TF-5(compaction 손실) 사고의 근본 원인.

**구현**:
- `.claude/hooks/helpers/context-checkpoint.sh` — 토큰 사용량 체크 + 상태 저장
- **Threshold 80%**: `.claude/runtime/SESSION-STATE.md` 자동 생성
  ```
  ## Session State (auto-saved at 80% context)
  - Current TASK: TASK-VIDEO-PIPELINE-DEDUP-FIX.md
  - Phase: Do (Wave 3)
  - Teammates: backend-dev (active, W3 hooks 수정중)
  - Chain state: CTO_QA pending
  - Key files: [목록]
  - Next action: LR 테스트 fix → W4 검증
  ```
- compaction 후 SessionStart에서 SESSION-STATE.md 자동 로드
- **문제**: CC에서 현재 토큰 사용량을 프로그래밍적으로 가져오는 API가 없음. `5% until auto-compact` 같은 UI 표시는 있지만 hook에서 접근 불가.
- **대안**: 시간 기반 (2시간마다) 또는 도구 호출 횟수 기반 (매 50회) 체크포인트

**내 의견**:
- **가치 매우 높음**. compaction 후 복구 시간을 **10분 → 30초**로 단축.
- 토큰 사용량 API 부재가 걸림. 시간 기반(2시간마다)이 현실적 대안.
- session-resume-check.sh와 통합 가능 — 세션 시작 시 SESSION-STATE.md 있으면 자동 로드.
- **리스크**: SESSION-STATE.md가 outdated 상태로 로드되면 오히려 혼란. 저장 시 timestamp + "이 파일은 자동 생성됨, 현재 상태와 다를 수 있음" 경고 포함.

**우선순위: P0 (즉시)**

#### D8-3. Per-Agent Thinking (D1 확장)

D1에서 다룬 per-agent thinking의 확장. 2단계가 아닌 3단계 분류:

| 역할 | Thinking Level | 근거 |
|------|---------------|------|
| COO (mozzi) | high | 전략 판단, Smith님 보고 품질 |
| CTO Leader | high | 아키텍처 결정, 팀 조율 |
| PM Leader | high | 기획/분석 판단 |
| backend-dev | medium | 구현은 medium으로 충분. 복잡한 건 high로 승격 |
| qa-engineer | medium | 검증 로직은 medium |
| 단순 조회/리서치 | low | 파일 읽기, grep, 상태 확인 등 |

**내 의견**: D1과 통합. "단순 조회=low"는 서브에이전트(D8-4)로 위임하는 게 더 효과적. thinking level보다 **모델 선택**(Opus vs Sonnet)이 토큰 절감 효과가 큼.

**우선순위: P2 (D1과 통합)**

#### D8-4. 서브에이전트 위임 (Sonnet 분산)

**현재 문제**: 리더가 코드 탐색, 파일 읽기, grep 검색을 직접 수행 → 결과가 전부 리더의 1M 컨텍스트에 쌓임. 탐색 10회 × 평균 200줄 = 2000줄이 리더 컨텍스트 소모.

**구현**:
- 리더가 **조사/리서치 성격 작업**을 Agent 도구로 Sonnet 서브에이전트에 위임
- 서브에이전트는 자체 컨텍스트에서 탐색 → 요약만 리더에게 반환
- 리더 컨텍스트에는 **요약 결과만** 들어옴 (2000줄 → 20줄)

**위임 대상 작업**:
| 작업 유형 | 현재 | 최적화 후 |
|----------|------|----------|
| 코드 탐색 (Glob+Grep+Read) | 리더 직접 | Agent(Explore, sonnet) |
| 기존 테스트 패턴 조사 | 리더 직접 | Agent(Explore, sonnet) |
| 문서 검색/요약 | 리더 직접 | Agent(general, sonnet) |
| 팀원 결과 검증 | 리더가 파일 Read | Agent(code-analyzer, sonnet) |
| Gap 분석 | 리더가 직접 대조 | Agent(gap-detector, sonnet) |

**내 의견**:
- **효과 가장 큼**. 리더 토큰의 30~40%가 탐색/읽기에 소모. 이걸 서브에이전트로 빼면 리더 세션 수명 1.5~2배 연장.
- CC의 Agent 도구가 이미 `model: "sonnet"` 파라미터 지원. 추가 구현 없이 **행동 패턴 변경**만으로 적용 가능.
- Sonnet은 Opus 대비 토큰 비용 1/5. 탐색 품질도 충분.
- **리스크**: 서브에이전트가 중요 정보를 누락해서 요약할 수 있음. 핵심 판단이 필요한 탐색은 리더가 직접.
- **즉시 적용 가능** — 코드 변경 없이 리더 프롬프트에 "탐색은 Agent(Explore, sonnet)으로" 규칙 추가.

**우선순위: P0 (즉시, 코드 변경 없음)**

#### D8-5. Progressive Disclosure (지연 로드)

**현재 문제**: 세션 시작 시 로드되는 컨텍스트:
- CLAUDE.md (~500줄) — 항상 로드
- MEMORY.md (~50줄) — 항상 로드
- bkit SessionStart hook 출력 (~200줄) — 항상 로드
- ADR 문서들 (~300줄) — CLAUDE.md 규칙으로 필독
- 합계: **~1000줄이 세션 시작부터 컨텍스트 점유** (~15,000 토큰)

**구현**:
- **Phase 1**: CLAUDE.md를 core(100줄) + extended(400줄)로 분리. core만 항상 로드, extended는 해당 상황에서만 참조.
- **Phase 2**: bkit hook 출력을 요약 모드로 변경 (D8-1과 연계). 현재 200줄 → 30줄.
- **Phase 3**: 스킬/메모리를 필요할 때만 ToolSearch로 로드 (CC Skills 2.0의 context:fork 활용).
- **Phase 4**: ADR 문서는 관련 TASK 시작 시에만 읽기 (세션 시작 시 전부 읽기 → 필요 시 읽기로 변경).

**내 의견**:
- **효과는 있지만 CC 구조적 제약이 큼**.
- CLAUDE.md는 CC가 매 턴마다 자동 로드 — 우리가 제어 불가. 줄이려면 CLAUDE.md 자체를 짧게 쓰는 수밖에 없음.
- MEMORY.md도 자동 로드 — 엔트리 수를 50개 이하로 관리하는 게 현실적.
- bkit hook 출력 축소는 D8-1에서 이미 커버.
- **가장 현실적인 것**: CLAUDE.md 슬림화 (중복 제거, 불필요 규칙 아카이빙) + MEMORY.md 정기 정리.
- Skills 2.0 context:fork는 이미 동작 중이라 추가 구현 불필요.

**우선순위: P2 (CLAUDE.md 슬림화만 P1)**

---

### D8 종합 판단

| 방안 | 절감 효과 | 구현 난이도 | 우선순위 |
|------|----------|-----------|---------|
| D8-1 Hook 출력 최소화 | 높음 (hook당 90%) | 낮음 | **P0** |
| D8-2 Compaction 대비 | 매우 높음 (복구 시간 95% 단축) | 중간 | **P0** |
| D8-3 Per-Agent Thinking | 중간 | 낮음 | P2 (D1 통합) |
| D8-4 서브에이전트 위임 | **가장 높음** (리더 토큰 30-40% 절감) | 없음 (행동 변경) | **P0** |
| D8-5 Progressive Disclosure | 중간 (시작 토큰 50% 절감) | 높음 (CC 제약) | P2 |

**핵심 판단**: D8-4(서브에이전트)가 **코드 변경 0, 효과 최대**. 오늘부터 리더 프롬프트에 규칙 추가만으로 적용 가능. D8-1(hook 출력)은 공통 래퍼 1개 만들면 33개 hook에 점진 적용. D8-2(compaction 대비)는 TF-5 사고 재발 방지의 근본 해결.

---

## 우선순위 + 의존성 종합

```
P0 (즉시)
├── D5. 승인 블로킹 자동 감지     ← 오늘 사고 재발 방지
├── D7. 실전 실패 15건 TDD        ← 운영 안정성 핵심
├── D8-1. Hook 출력 최소화        ← 가성비 최고, hook당 90% 절감
├── D8-2. Compaction 자동 대비    ← TF-5 근본 해결
├── D8-4. 서브에이전트 위임       ← 코드 변경 0, 리더 토큰 30-40% 절감
│
P1 (이번 주)
├── D3. 에러 분류 룰북             ← D7과 병행, 패턴 공유
├── D6. 중복 보고 방지             ← chain-messenger 5줄 수정
├── D8-5. CLAUDE.md 슬림화        ← 시작 토큰 절감 (Progressive Disclosure 중 현실적 부분)
│
P2 (다음 주)
├── D1+D8-3. per-agent thinking   ← pilot 테스트 필요. D8-3 통합.
│
P3 (보류/리서치)
├── D2. ACP 전환 검토              ← CC 정식 출시 대기, 리서치만
├── D4. Webhook agentId            ← CI/CD 시나리오 구체화 후
├── D8-5(나머지). Progressive Disclosure 풀 구현 ← CC 구조 제약
```

### 의존성 그래프

```
D7 (실패 TDD) ──→ D3 (에러 룰북) ──→ D4 (Webhook agentId)
                                        ↑
D5 (승인 블로킹) ─── 독립                │
D6 (중복 방지) ──── 독립                 │
D1+D8-3 (thinking) ── 독립              │
D2 (ACP 리서치) ──────────────────────────┘

D8-1 (Hook 출력) ──→ D8-5 (Progressive Disclosure)
D8-2 (Compaction 대비) ── 독립
D8-4 (서브에이전트) ── 독립 (행동 변경만)
```

### 추천 실행 순서

| 순서 | 항목 | 예상 | Wave |
|------|------|------|------|
| 1 | D8-4 서브에이전트 위임 | 즉시 (프롬프트 규칙만) | Wave 0 |
| 2 | D5 승인 블로킹 예방 | 0.5일 | Wave 1 |
| 3 | D7 실전 실패 TDD | 1일 | Wave 1 (병렬) |
| 4 | D8-1 Hook 출력 최소화 | 0.5일 | Wave 1 (병렬) |
| 5 | D8-2 Compaction 대비 | 0.5일 | Wave 2 |
| 6 | D6 중복 보고 방지 | 0.5일 | Wave 2 (병렬) |
| 7 | D3 에러 분류 룰북 | 1일 | Wave 2 (병렬) |
| 8 | D8-5 CLAUDE.md 슬림화 | 0.5일 | Wave 2 (병렬) |
| 9 | D1+D8-3 per-agent thinking | 0.5일 | Wave 3 |
| 10 | D2 ACP 리서치 | 0.5일 | Wave 3 (병렬) |
| 11 | D4 Webhook agentId | 1일 | Wave 4 (D3 완료 후) |

---

## 성공 기준

| 항목 | 기준 |
|------|------|
| D5 | 승인 블로킹 재발 0건 (spawn 프롬프트 검증 TDD 통과) |
| D7 | 15건 실패 케이스 TDD 작성, 전부 Green |
| D6 | 동일 msg_id 2회 전송 시 두 번째 스킵 확인 |
| D3 | 에러 패턴 7개 이상 분류 + 자동 분류 정확도 80%+ |
| D1+D8-3 | openclaw.json에 thinkingLevel 반영 + 팀원 spawn 시 적용 확인 |
| D2 | ACP 호환성 매핑 문서 작성 완료 |
| D4 | webhook → agent 라우팅 e2e 테스트 1건 통과 |
| D8-1 | hook 출력 평균 2줄 이하 (현재 평균 10줄+) |
| D8-2 | 80% threshold에서 SESSION-STATE.md 자동 생성 + compaction 후 자동 복구 |
| D8-4 | 리더 탐색 작업의 80%가 서브에이전트로 위임 (행동 기준) |
| D8-5 | CLAUDE.md 500줄 → 300줄 이하 슬림화 |

---

## 토큰 절감 예상치

| 방안 | 현재 소모 | 최적화 후 | 절감률 |
|------|----------|----------|--------|
| D8-1 Hook 출력 | ~330줄/세션 (33hook × 10줄) | ~66줄 (33 × 2줄) | **80%** |
| D8-2 Compaction 복구 | 재탐색 10분 (~5000 토큰) | SESSION-STATE.md 30초 (~200 토큰) | **96%** |
| D8-4 서브에이전트 | 탐색 결과 전부 리더 컨텍스트 | 요약만 유입 (1/10) | **30-40% (리더 전체)** |
| D8-5 CLAUDE.md | ~7500 토큰 (500줄) | ~4500 토큰 (300줄) | **40% (시작 비용)** |
| **합산** | 하루 64%+ 소모 | **추정 40-45%** | **~30% 세션 수명 연장** |

---

## 하지 말 것

- tmux 기반 팀 운영 자체를 폐기하지 말 것 (ACP 전환 전까지 유지)
- 에러 분류에서 TASK 자동 생성을 바로 켜지 말 것 (분류만 먼저)
- per-agent thinking을 전체 적용하지 말 것 (pilot 후 확대)
- 기존 chain-e2e.test.ts (38건) 수정하지 말 것 (신규 파일로 추가)
- CLAUDE.md 슬림화 시 핵심 규칙 삭제 금지 (아카이빙으로 이동만)
- compaction checkpoint를 너무 자주 저장하지 말 것 (2시간 간격 또는 주요 마일스톤에서만)
- 서브에이전트에 아키텍처 판단을 위임하지 말 것 (탐색/조사만 위임, 결정은 리더)
