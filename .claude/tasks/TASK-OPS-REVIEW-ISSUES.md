---
feature: agent-ops-review-issues
type: 개발
status: completed
level: L2
team: CTO-2
dependsOn: []
createdAt: 2026-03-29
---

# Agent Ops Review Issues 구현 (리뷰 이슈 3건)

## 이게 뭔지
Agent Ops Platform 리뷰에서 나온 3건의 개선사항 구현:
1. pdca-chain-handoff.sh v2: curl로 broker 직접 전송 + 위험도 게이트(L0~L3)
2. session-resume-check.sh: 세션 재시작 시 미완료 TASK 자동 감지

## 왜 필요한지
- 현재 chain-handoff는 stdout ACTION_REQUIRED만 출력 → 리더가 수동 MCP 호출 필요 (병목)
- 위험도(L0~L3) 무관하게 일괄 PM 라우팅 → 긴급 핫픽스도 불필요한 대기
- 세션 크래시 후 복구 시 이전 상태 수동 확인 필요 → 자동 감지 없음

## 설계 문서
- **Plan**: `docs/01-plan/features/agent-ops-review-issues.plan.md`
- **Design**: `docs/02-design/features/agent-ops-review-issues.design.md`

## Wave 구조

### Wave 1: 핵심 스크립트 + TDD (의존성 없음)

- [x] W1-1: pdca-chain-handoff.sh v2 작성 (기존 파일 교체)
  - 파일: `.claude/hooks/pdca-chain-handoff.sh`
  - 설계서 2-1 절의 코드 그대로 구현
  - 핵심: curl 직접 전송 + L0/L1→MOZZI, L2→PM(30분 타임아웃), L2 고위험/L3→PM(수동 필수)
  - HIGH_RISK_PATTERN: `(auth|middleware\.ts|migration|\.sql|payment|\.env|firebase|supabase)`

- [x] W1-2: session-resume-check.sh 신규 작성
  - 파일: `.claude/hooks/session-resume-check.sh`
  - 설계서 2-2 절의 코드 그대로 구현
  - 정보 제공만 (차단 안 함, exit 0)
  - 4가지 감지: 미완료 피처, 좀비 팀원, 미착수 TASK, pdca-status 노후

- [x] W1-3: TDD 작성 + 실행
  - 파일: `__tests__/hooks/pdca-chain-handoff-v2.test.ts` (신규)
  - 파일: `__tests__/hooks/session-resume-check.test.ts` (신규)
  - 35건: RV-1~RV-23 (chain handoff) + SR-1~SR-12 (session resume)
  - 테스트 헬퍼: `__tests__/hooks/helpers.ts`에 7개 함수 추가
  - fixtures 5개 신규 작성

### Wave 2: 설정 + 규칙

- [x] W2-1: CLAUDE.md에 세션 복구 프로토콜 규칙 추가
  - "세션 시작 시 `bash .claude/hooks/session-resume-check.sh` 실행" 규칙

### Wave 3: 통합 검증

- [x] W3-1: 기존 PC-1~PC-25 테스트 호환성 확인 (v2 교체 후 깨지면 수정)
- [x] W3-2: 전체 `npx vitest run __tests__/hooks/` → 0 fail (186/187, QG-10 기존 설계의도Red)
- [x] W3-3: Gap 분석 → `docs/03-analysis/agent-ops-review-issues.analysis.md`

## 파일 경계

| 역할 | 담당 파일 |
|------|----------|
| **backend-dev** | `.claude/hooks/pdca-chain-handoff.sh`, `.claude/hooks/session-resume-check.sh`, `__tests__/hooks/pdca-chain-handoff-v2.test.ts`, `__tests__/hooks/session-resume-check.test.ts`, `__tests__/hooks/helpers.ts`, `__tests__/hooks/fixtures/` |
| **leader** | `CLAUDE.md` (W2-1 규칙 추가) |
| **qa-engineer** | `docs/03-analysis/agent-ops-review-issues.analysis.md` |

## 핵심 참조 (상류 계약)

### Broker HTTP API
```
POST http://localhost:7899/list-peers
  Body: { "scope": "repo", "cwd": "/Users/smith/projects/bscamp", "git_root": "/Users/smith/projects/bscamp" }
  Response: [{ "id": "abc12345", "pid": 1234, "summary": "PM_LEADER | bscamp", ... }]

POST http://localhost:7899/send-message
  Body: { "from_id": "sender_id", "to_id": "target_id", "text": "<JSON payload>" }
  Response: { "ok": true }

GET http://localhost:7899/health
  Response: { "peers": 5 }
```

### Peer ID 매칭
- Peer ID는 8자리 랜덤값 (역할명 아님)
- `/list-peers` 결과에서 `.summary` 필드로 역할 매칭
- 예: `PM_LEADER`를 찾으려면 `summary | test("PM_LEADER")` 으로 검색

### 테스트 헬퍼 추가 항목 (helpers.ts에 추가)
설계서 6-3 절 참조. 7개 함수:
- `writeAnalysisFile(tmpDir, rate)` — Match Rate 포함 analysis.md 생성
- `writeTeamContext(tmpDir, team)` — team-context.json 생성
- `writePdcaStatus(tmpDir, features)` — pdca-status.json 생성
- `writeTaskFile(tmpDir, name, status)` — TASK-*.md 생성
- `writeRegistry(tmpDir, data)` — teammate-registry.json 생성
- `prepareChainHandoffV2(env, options)` — v2 스크립트 + mock curl 조합
- `prepareSessionResumeCheck(env)` — resume 스크립트 준비

## 하지 말 것
- `is-teammate.sh` 수정 (별도 TASK)
- settings.local.json hook 배열 변경 (기존 위치 유지, 코드만 교체)
- 기존 PC-1~PC-25 테스트 삭제 (호환성 확인 후 필요시 수정만)

## 완료 기준
- [x] pdca-chain-handoff.sh v2 동작 확인 (curl 직접 전송)
- [x] session-resume-check.sh 동작 확인
- [x] TDD 35건 전부 Green
- [x] 기존 hooks 테스트 0 regression
- [x] Gap 분석 Match Rate 90%+
