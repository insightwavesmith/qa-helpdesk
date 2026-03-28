---
team: CTO
created: 2026-03-28
status: pending
owner: leader
assignees:
  - role: backend-dev
    tasks: [W1-1, W1-2, W1-3, W2-1]
  - role: qa-engineer
    tasks: [W3-1, W3-2]
---
# TASK: PDCA 체인 자동화 (PDCA Chain Automation)

## 타입
개발 (L2 — hooks/scripts)

## 배경
**이게 뭔지**: CTO 개발 완료 → PM 검수 → COO 보고 흐름을 MCP 메시지로 자동 체이닝.
**왜 필요한지**: 현재 각 단계 핸드오프가 수동. 지연+누락 발생. Smith님이 진행 상황 파악 어려움.
**구현 내용**: TaskCompleted hook에 pdca-chain-handoff.sh 추가. Match Rate 95% 게이트 + MCP send_message 자동 발송.

## 설계서
- Plan: `docs/01-plan/features/pdca-chain-automation.plan.md`
- Design: `docs/02-design/features/pdca-chain-automation.design.md` (작성 예정)

**설계서를 반드시 읽고 시작해라. 설계에 없는 기능 임의 추가 금지.**

## 전체 흐름

```
CTO 완료 → hook 자체 QA(95%) → [pass] MCP → PM 검수 → [pass] MCP+wake → COO → Smith님 대화형 보고
                                 [fail] exit 2 → CTO 자체 수정
                                                  PM [fail] → MCP FEEDBACK → CTO 수정
                                                  Smith님 반려 → COO → PM → CTO
```

## Wave 1: 핵심 스크립트 (의존성 없음)

- [ ] W1-1: match-rate-parser.sh 헬퍼 — `.claude/hooks/helpers/match-rate-parser.sh`
- [ ] W1-2: pdca-chain-handoff.sh 신규 작성 — `.claude/hooks/pdca-chain-handoff.sh`
- [ ] W1-3: TDD 작성 + 실행 (11건: H-1~H-4, E-1~E-7)

## Wave 2: 설정 + 규칙 (Wave 1 완료 후)

- [ ] W2-1: settings.local.json TaskCompleted 배열에 pdca-chain-handoff.sh 추가
- [ ] W2-2: CLAUDE.md PM 검수 프로토콜 규칙 추가 (leader)
- [ ] W2-3: CLAUDE.md COO 보고 프로토콜 규칙 추가 (leader)

## Wave 3: 통합 검증

- [ ] W3-1: 3자 통신 체인 테스트 (CTO→PM→COO)
- [ ] W3-2: Gap 분석 → `docs/03-analysis/pdca-chain-automation.analysis.md` (95%+)

## 파일 경계

### backend-dev
```
.claude/hooks/helpers/match-rate-parser.sh (신규)
.claude/hooks/pdca-chain-handoff.sh (신규)
__tests__/hooks/pdca-chain-handoff.test.ts (신규)
__tests__/hooks/fixtures/analysis_pass.md (신규)
__tests__/hooks/fixtures/analysis_fail.md (신규)
__tests__/hooks/fixtures/analysis_malformed.md (신규)
__tests__/hooks/fixtures/team_context_cto.json (신규)
__tests__/hooks/fixtures/team_context_pm.json (신규)
```

### leader
```
.claude/settings.local.json (수정 — hook 추가)
CLAUDE.md (수정 — 프로토콜 규칙 추가)
```

### qa-engineer
```
docs/03-analysis/pdca-chain-automation.analysis.md (신규)
```

## 절대 주의

**COO(mozzi)는 Match Rate 검증 안 함.**
- PM이 검수 완료한 결과를 신뢰
- COO는 Smith님에게 요약+맥락+대화형 보고만 담당
- Smith님 피드백을 팀에 전달하는 인터페이스 역할

**Match Rate 성공 기준: 95% (Smith님 확정)**
- 94% 이하 → CTO 자체 수정 (MCP 메시지 발송 안 함)
- 95% 이상 → PM에 자동 핸드오프

## 하지 말 것
- src/ 코드 수정 (hooks/scripts만)
- task-quality-gate.sh 수정 (기존 게이트 유지)
- COO에 Match Rate 검증 로직 추가
- 자동 배포 트리거 (Smith님 수동 판단)
- Slack 연동 (별도 TASK)

## 완료 후 QA
1. tsc + build 통과 (hooks만 수정이라 빌드 영향 없어야 함)
2. TDD 11건 전부 pass
3. 실제 3자 통신 테스트 (CTO→PM→COO 체인 동작)
4. Gap 분석 Match Rate 95%+
