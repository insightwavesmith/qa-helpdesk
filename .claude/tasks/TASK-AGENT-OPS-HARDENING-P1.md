---
team: CTO
status: ready
---
# TASK: Agent Ops Hardening P1 (에이전트 운영 강화 2차)

## 타입
개발

## 프로세스 레벨
L2

## 문서
- Plan: `docs/01-plan/features/agent-ops-hardening.plan.md`
- Design (P0, 참고용): `docs/02-design/features/agent-ops-hardening.design.md`
- P0 분석: `docs/03-analysis/agent-ops-hardening.analysis.md`

## 배경
P0 (D5+D7+D8-1+D8-4) 완료됨 (커밋 faa1d80, Match Rate 97%, OFR-1~35 Green).
이제 P1 3건을 구현한다.

## 구현 범위 — P1 3건

### D3. 에러 분류 룰북
**이게 뭔지**: HTTP 400, lock file, 권한 에러 등 반복 에러를 패턴화 → 자동 분류
**왜 필요한지**: 에러마다 사람이 로그 읽고 판단하는 시간 낭비. 같은 유형 에러 반복 시 자동 분류

**구현 내용**:
- `docs/ops/error-rulebook.md` — 에러 패턴 + 분류 + 대응 매뉴얼
- `.claude/hooks/helpers/error-classifier.sh` — stderr/stdout 패턴 매칭 → 분류 코드 반환
- 분류만 자동, TASK 생성은 수동 (stdout에 제안만 출력)

**에러 패턴 (Plan에서 발췌)**:
| 패턴 | 분류 | 자동 대응 |
|------|------|----------|
| `HTTP 4[0-9]{2}` | AUTH/RATE_LIMIT | 429→백오프, 401→토큰 갱신 |
| `ENOENT.*lock` / `lock file` | LOCK_CONFLICT | lock 소유 프로세스 확인 |
| `Permission denied` / `EACCES` | PERMISSION | 파일 권한 확인 |
| `ETIMEOUT` / `ECONNREFUSED` | NETWORK | health check → 재시작 |
| `Cannot find module` | DEPENDENCY | npm install |
| `exit code 2` (hook 차단) | HOOK_GATE | 차단 사유 파싱 |
| `context.*compact` | CONTEXT_OVERFLOW | 로그 기록 + 재로드 |

### D6. 중복 보고 방지
**이게 뭔지**: 같은 COMPLETION_REPORT 2번 전송 차단
**왜 필요한지**: COO가 같은 보고 2번 받으면 Smith님에게 중복 보고 → 혼란

**구현 내용**:
- 이미 P0에서 chain-messenger.sh에 dedup 로직(sent-log) 추가됨 (OFR-7~9)
- P1에서 할 것: **수신 측에도 dedup 추가**
  - `pm-chain-forward.sh` — received-log 기반 msg_id dedup
  - `coo-chain-report.sh` — received-log 기반 msg_id dedup

### D8-5. CLAUDE.md 슬림화
**이게 뭔지**: CLAUDE.md 500줄 → 300줄 이하. 중복/불필요 규칙 아카이빙
**왜 필요한지**: 매 턴마다 ~7500 토큰이 컨텍스트 점유. 줄이면 토큰 절감

**구현 내용**:
- CLAUDE.md에서 중복 규칙 제거 (global CLAUDE.md와 겹치는 부분)
- 상세 설명을 별도 파일로 분리 (예: CLAUDE-DETAIL.md)
- 핵심 규칙만 CLAUDE.md에 남기기
- **절대 규칙**: 기존 규칙 삭제 금지. 아카이빙(다른 파일로 이동)만 허용.

## 구현 순서

### Wave 1: Design 작성
- [ ] W1-1: D3+D6+D8-5 Design 섹션 작성 → `docs/02-design/features/agent-ops-hardening-p1.design.md`
- [ ] W1-2: TDD 테스트 시나리오 설계 (Design 6번 섹션)

### Wave 2: TDD Red
- [ ] W2-1: `__tests__/hooks/error-classifier.test.ts` — 에러 분류 TDD
- [ ] W2-2: `__tests__/hooks/chain-dedup-receiver.test.ts` — 수신 측 dedup TDD
- [ ] W2-3: 전부 Red 확인

### Wave 3: 코드 수정 Green
- [ ] W3-1: `.claude/hooks/helpers/error-classifier.sh` — 신규
- [ ] W3-2: `docs/ops/error-rulebook.md` — 신규
- [ ] W3-3: `.claude/hooks/pm-chain-forward.sh` — received-log dedup 추가
- [ ] W3-4: `.claude/hooks/coo-chain-report.sh` — received-log dedup 추가
- [ ] W3-5: `CLAUDE.md` 슬림화 (CLAUDE-DETAIL.md 분리)
- [ ] W3-6: TDD Green 확인

### Wave 4: 검증
- [ ] W4-1: 전체 TDD Green (기존 + 신규)
- [ ] W4-2: Gap 분석 → `docs/03-analysis/agent-ops-hardening-p1.analysis.md`
- [ ] W4-3: `.pdca-status.json` 업데이트

## 수정 파일

| 파일 | 변경 | 담당 |
|------|------|------|
| `.claude/hooks/helpers/error-classifier.sh` | **신규** | backend-dev |
| `.claude/hooks/pm-chain-forward.sh` | received-log dedup 추가 | backend-dev |
| `.claude/hooks/coo-chain-report.sh` | received-log dedup 추가 | backend-dev |
| `docs/ops/error-rulebook.md` | **신규** | backend-dev |
| `CLAUDE.md` | 슬림화 (300줄 이하) | leader 직접 |
| `CLAUDE-DETAIL.md` | **신규** (분리된 상세 규칙) | leader 직접 |

## 의존성
- P0 완료 (faa1d80) — chain-messenger dedup 이미 구현됨
- D6 수신측 dedup은 D3(에러 분류)와 독립

## 하지 말 것
- P0 테스트 (OFR-1~35) 수정 금지
- 기존 chain-e2e.test.ts 수정 금지
- CLAUDE.md에서 규칙 삭제 금지 — 다른 파일로 이동만
- error-classifier에서 TASK 자동 생성 켜지 말 것 — 분류 + stdout 제안만
- Plan 문서 (agent-ops-hardening.plan.md) 수정 금지

## 완료 후 QA
1. `npx vitest run __tests__/hooks/` — 전체 Green
2. Gap 분석 Match Rate 90%+
3. `.pdca-status.json` 업데이트
