---
team: PM
session: sdk-pm
created: 2026-03-30
status: pending
owner: leader
priority: P0-URGENT
---

# TASK: 체인 자동화 근본 수정 — team-context.json 병렬 팀 지원 + TDD

> COO(모찌) → PM팀 긴급 기획 요청
> 관련: pdca-chain-handoff.sh, validate-pdca-before-teamdelete.sh, team-context.json

---

## 배경 (실전 장애)

체인 자동화 구축 완료했다고 했는데 **실전에서 한 번도 자동으로 안 탔다.**

### 직접 원인
`validate-pdca-before-teamdelete.sh`가 TeamDelete 시 **team-context.json을 삭제**한다.
→ 직후 TaskCompleted가 발동해도 pdca-chain-handoff.sh가 team-context.json 없어서 exit 0.
→ 체인 시작 안 됨. 아무 알림 없음.

### 구조적 원인
**team-context.json이 프로젝트에 1개만 존재.** 3개 팀(CTO, CTO-2, PM)이 동시에 돌아가는데:
- CTO가 세팅하면 team: "CTO"
- PM이 세팅하면 team: "PM" (CTO 것 덮어씀)
- 아무 팀이 TeamDelete하면 파일 삭제 → 다른 팀 체인도 전부 끊김

**병렬 팀 운영을 아예 지원 안 하는 구조.**

---

## 요구사항

### 1. team-context 팀별 분리
- 팀별 독립 context 파일: `team-context-{session}.json` 또는 `team-context-{team}.json`
- 각 팀의 TeamDelete가 다른 팀 context에 영향 안 미침
- 모든 hook(33개)에서 context 파일 참조 방식 통일

### 2. TeamDelete 순서 문제 해결
- TeamDelete 시 context 삭제 타이밍을 TaskCompleted 체인 완료 **이후**로 변경
- 또는 삭제 대신 archived 상태로 전환 (체인이 참조할 수 있게)

### 3. 기존 hook 전부 호환
- pdca-chain-handoff.sh, auto-team-cleanup.sh, task-quality-gate.sh 등 team-context.json 참조하는 모든 hook
- context 파일 경로 변경에 따른 전체 수정

### 4. TDD 빡세게
- 병렬 팀 시나리오 TDD (CTO + PM 동시 작업 → 각각 체인 독립 동작)
- TeamDelete 후 다른 팀 체인 정상 동작 확인
- context 없는 세션에서 silent exit 0 유지
- 기존 OFR-1~35, EC-1~12, CDR-1~6 회귀 없음 (53건 전부)

---

## 추가: OpenClaw 3.29 신기능으로 개선 가능한 부분

Phase 2 Plan(agent-ops-phase2.plan.md)에서 기획한 B1~B4 중 이 버그와 관련되는 것:
- **B2(runHeartbeatOnce)**: 체인 이벤트 시 즉시 patrol → 지금처럼 안 타는 걸 즉시 감지 가능
- **B3(Memory flush)**: team-context를 compaction 전 보존 → TeamDelete로 삭제돼도 flush에서 복원

이것들도 고려해서 기획해라.

## COO 의견
위 내용은 COO 의견일 뿐이다. 참고하되 최고의 방법을 찾아라.
특히 "팀별 분리"가 최선인지, 다른 구조(예: 단일 JSON에 팀 배열)가 나은지도 판단해라.

## 하지 말 것
- 코드 수정하지 마라 — 기획(Plan)만
- 기존 TDD 53건 수정하지 마라
- Phase 2(agent-ops-phase2.plan.md) 내용을 수정하지 마라 — 이 TASK는 별도 긴급건

## 검증 기준
- 병렬 팀 시나리오에서 체인이 **실제로** 독립 동작하는 구조
- TeamDelete 후 다른 팀 체인 영향 0
- TDD 커버리지: 병렬 시나리오 최소 10건
- 기존 53건 TDD 회귀 없음
