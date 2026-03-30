---
team: CTO
session: cto-2
created: 2026-03-30
status: pending
owner: leader
priority: P0-URGENT
type: Implementation
dependsOn: TASK-AGENT-PROCESS-V2.md
designDoc: docs/02-design/features/agent-process-v2.design.md
---

# TASK: 에이전트팀 프로세스 V2 — 구현

> PM Design 완료. CTO-2에서 구현.
> 설계서: `docs/02-design/features/agent-process-v2.design.md`
> Smith님 확정: PM 검수 단계 제거. 단순한 플로우.

---

## 배경

오늘 발견된 실전 문제 7건을 한 번에 해결하는 프로세스 V2.
설계서 Section 8 구현 순서를 따를 것.

---

## Wave 1: 신규 Hook 작성 (병렬 가능)

### W1-1: pdca-chain-handoff.sh v4 업그레이드
- **담당**: backend-dev
- **파일**: `.claude/hooks/pdca-chain-handoff.sh`
- **변경 내용**:
  - L2/L3 분기에서 `TO_ROLE="PM_LEADER"` → `TO_ROLE="MOZZI"` 변경
  - `CHAIN_STEP="cto_to_pm"` → `CHAIN_STEP="cto_to_coo"` 변경
  - peer summary 매칭 실패 시 `peer-roles.json` fallback 추가
  - 설계서 Section 2.5, 2.6 참조
- [ ] L2/L3 → MOZZI 직통 변경
- [ ] peer-roles.json fallback 로직 추가
- [ ] 기존 테스트 수정 (PM_LEADER 참조 제거)

### W1-2: deploy-trigger.sh 신규 작성
- **담당**: backend-dev
- **파일**: `.claude/hooks/deploy-trigger.sh` (신규)
- **변경 내용**:
  - TaskCompleted 체인 5번째 hook (gap-analysis 후, chain-handoff 전)
  - L0: 즉시 배포 안내 출력
  - L1: 스킵 (배포 없음)
  - L2/L3: Gap 95%+ 통과 시 배포 안내 출력
  - 설계서 Section 4.2 코드 참조
- [ ] deploy-trigger.sh 작성
- [ ] IS_TEAMMATE bypass 포함
- [ ] L0/L1/L2 분기 동작

### W1-3: registry-update.sh 신규 작성
- **담당**: backend-dev
- **파일**: `.claude/hooks/registry-update.sh` (신규)
- **변경 내용**:
  - PostToolUse/TeamCreate hook
  - TeamCreate 결과에서 name, model 추출
  - teammate-registry.json 자동 업데이트
  - 설계서 Section 4.1 코드 참조
- [ ] registry-update.sh 작성
- [ ] registry 없을 때 새로 생성
- [ ] 기존 registry 있을 때 멤버 추가

---

## Wave 2: settings.local.json + Hook 정리 (W1 완료 후)

### W2-1: settings.local.json V2 적용
- **담당**: backend-dev
- **파일**: `.claude/settings.local.json`
- **변경 내용**:
  - PreToolUse/Bash: pdca-single-source.sh, pre-read-context.sh 제거
  - PreToolUse/Edit|Write: enforce-plan-before-do.sh 제거
  - PostToolUse/TeamCreate: registry-update.sh 추가 (신규 이벤트)
  - TaskCompleted: pdca-sync-monitor.sh, auto-team-cleanup.sh 제거 + deploy-trigger.sh 추가
  - TeammateIdle, Stop 키 제거
  - 설계서 Section 5 전체 설정 참조
- [ ] PreToolUse 정리 (16 → 12)
- [ ] PostToolUse 추가
- [ ] TaskCompleted 정리 (8 → 6)
- [ ] TeammateIdle/Stop 키 삭제

### W2-2: 불필요 스크립트 삭제
- **담당**: backend-dev
- **파일**: 아래 7개 삭제
  - `.claude/hooks/teammate-idle.sh`
  - `.claude/hooks/pdca-single-source.sh`
  - `.claude/hooks/pre-read-context.sh`
  - `.claude/hooks/enforce-plan-before-do.sh`
  - `.claude/hooks/pdca-sync-monitor.sh`
  - `.claude/hooks/pm-chain-forward.sh`
  - `.claude/hooks/coo-chain-report.sh`
- [ ] 7개 파일 삭제
- [ ] 삭제 후 settings.local.json에서 참조 0건 확인

---

## Wave 3: CLAUDE.md 수정 + TDD (W2 완료 후)

### W3-1: CLAUDE.md 배포 규칙 추가
- **담당**: backend-dev
- **파일**: `CLAUDE.md`
- **변경 내용**:
  - "배포 규칙" 섹션 추가 (설계서 Section 7.1)
  - "PDCA 체인 핸드오프 프로토콜" 섹션 수정 — PM 우회 반영 (설계서 Section 7.2)
  - "세션 시작 필수 읽기" 섹션에 set_summary 추가 (설계서 Section 7.3)
  - pm_review, cto_to_pm 참조 제거 (설계서 Section 7.4)
- [ ] 배포 규칙 섹션 추가
- [ ] 체인 프로토콜 수정 (PM 우회)
- [ ] 세션 시작에 set_summary 추가
- [ ] PM 검수 관련 문구 제거

### W3-2: CLAUDE-DETAIL.md 수정
- **담당**: backend-dev
- **파일**: `CLAUDE-DETAIL.md`
- **변경 내용**:
  - "PDCA 체인 핸드오프 상세 프로토콜" 섹션에서 pm_review 단계 제거
  - chain_step 목록에서 cto_to_pm, pm_review 삭제
  - PM Review Protocol (W2-2) 섹션 삭제 또는 "V2에서 제거됨" 명시
- [ ] pm_review 단계 제거
- [ ] chain_step 목록 업데이트
- [ ] PM 검수 프로토콜 정리

### W3-3: TDD 작성
- **담당**: qa-engineer (또는 backend-dev)
- **파일**: `__tests__/hooks/` 하위
- **변경 내용**:
  - 설계서 Section 6.2 기반
  - 단위 테스트 10건 (U1~U10): deploy-trigger, registry-update, chain-handoff-v4, approval-notify
  - 통합 테스트 4건 (I1~I4): 전체 체인, L0 체인, summary fallback, registry lifecycle
  - 실전 조건 테스트 10건 (R1~R10): 7개 문제 각각 검증 + 안전성
- [ ] `__tests__/hooks/deploy-trigger.test.ts` 작성 (U1~U4)
- [ ] `__tests__/hooks/registry-update.test.ts` 작성 (U5~U6)
- [ ] `__tests__/hooks/chain-handoff-v4.test.ts` 작성 (U7~U9)
- [ ] `__tests__/hooks/approval-notify.test.ts` 작성 (U10)
- [ ] `__tests__/hooks/chain-e2e-v2.test.ts` 작성 (I1~I4)
- [ ] `__tests__/hooks/realworld-v2.test.ts` 작성 (R1~R10)

---

## Wave 4: 검증 (W3 완료 후)

### W4-1: 테스트 실행 + 빌드 확인
- **담당**: leader
- [ ] `npx vitest run` — 전체 통과
- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npm run build` — 빌드 성공
- [ ] 기존 테스트 깨지지 않음 확인

### W4-2: Gap 분석
- **담당**: leader
- [ ] 설계서 vs 구현 비교 (Match Rate 95%+ 목표)
- [ ] 7개 문제 전부 해결 확인
- [ ] 끊기는 구간 0개 확인

---

## 파일 경계 (팀원 간 충돌 방지)

| 담당 | 수정 가능 파일 |
|------|--------------|
| backend-dev | `.claude/hooks/*.sh`, `.claude/settings.local.json`, `CLAUDE.md`, `CLAUDE-DETAIL.md` |
| qa-engineer | `__tests__/hooks/*.test.ts` |
| leader | `docs/`, `.claude/tasks/`, Gap 분석 |

**같은 파일 2명 동시 수정 금지.**

---

## 주의사항

1. **설계서 필독**: 구현 전 `docs/02-design/features/agent-process-v2.design.md` 전체 읽을 것
2. **PM 검수 없음**: chain-handoff에서 PM_LEADER로 보내는 코드 남기면 안 됨
3. **hook 삭제 순서**: settings.local.json에서 먼저 제거 → 파일 삭제 (역순 시 에러)
4. **새 세션 필요**: settings.local.json 변경은 현재 세션에 반영 안 됨. 변경 후 새 세션 시작
5. **postmortem 확인**: `docs/postmortem/index.json` — PM-005(무한 커밋), PM-002(context 충돌) 필독
