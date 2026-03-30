---
team: PM
session: sdk-pm
created: 2026-03-30
status: completed
owner: leader
priority: P0-URGENT
type: Design
completedAt: 2026-03-30
---

# TASK: 에이전트팀 프로세스 V2 — 전체 플로우 재설계

> Smith님 직접 지시: "전체적으로 기획팀에 넘기고 디자인 + TDD + 실전테스트까지 준비해서 프로세스 잡아놓으라고해"

---

## 현재 상황: 조각은 있는데 연결이 안 됨

TDD 479건 Green. hook 수십 개. 근데 **실전에서 한 번도 자동으로 돌아간 적 없음.**
오늘 하루 동안 발견된 문제 전부 아래에 정리.

---

## 오늘 발견된 문제 (2026-03-30, 전부 실전)

### 1. 체인이 안 탐 — peer summary 비어있음
- broker 살아있고 peer 3개 등록됨
- **근데 summary가 전부 비어있어서** `select(.summary | test("MOZZI"))` 매칭 실패
- CTO 개발 완료 → PM 보고 안 감 → COO 보고 안 감 → Smith님이 직접 물어봐야 알 수 있음
- **근본**: 세션 시작 시 자기 역할(CTO_LEADER, PM_LEADER, MOZZI)을 summary에 등록하는 구조 없음

### 2. TeammateIdle hook이 리더 지시를 방해
- 팀원이 잠깐 idle → hook이 TASK 파일 스캔 → "미완료 있다" → exit 2
- 리더가 직접 "@frontend-dev 이거 해라" 지시했는데 hook이 끼어들어서 다른 TASK 시킴
- 100번+ 수정했지만 **근본 구조가 잘못됨**: hook이 리더보다 권한이 높음
- settings.local.json에서 TeammateIdle 제거해도 현재 세션에 안 먹힘 (Claude Code 한계)

### 3. 배포를 아무도 못 함
- validate-delegate.sh: 리더는 src/ 수정 차단
- validate-deploy-authority.sh: 팀원은 배포 차단, 리더만 허용
- **근데 리더가 배포를 안 함** — L0 핫픽스인데도 "PM 검수 후 배포" 플로우로 처리
- CLAUDE.md L0 규칙에 "배포" 단계가 명시 안 돼있음
- 결과: 오늘 3번 연속 push만 하고 배포 안 됨 → 수강생이 계속 에러

### 4. 대시보드 동기화 안 됨
- teammate-registry.json이 새 세션에서 업데이트 안 됨
- TeamCreate hook에 registry 업데이트 로직 없음
- 팀원 생성해도 대시보드에 안 보임

### 5. 승인 요청 알림 안 감
- 팀원이 위험 파일 수정 → pending 파일 생성 → 리더가 모름
- Slack 알림도 안 감, 리더 화면에도 안 뜸
- 팀원 stuck → 수동 확인해야 알 수 있음

### 6. TDD가 실전을 못 잡음
- 479건 전부 mock 환경 (tmpDir + 환경변수 주입)
- broker를 mock으로 대체 → "전송 성공" → Green
- 실전에서 summary 비어있는 건 TDD에서 안 봄
- **"TDD 통과 = 실전 동작" 아님** — 이게 반복되는 핵심 교훈

### 7. dashboard-sync-loop 무한 커밋 (해결됨, 재발 방지 필요)
- state.json 업데이트를 git commit+push로 → 6일간 7396건 커밋
- 프로세스 kill + 스크립트 삭제 완료
- GCS 직접 업로드로 전환 필요

---

## 필요한 Design

### A. 전체 플로우 (끊기는 구간 0개)

> **Smith님 확정 (2026-03-30)**: PM 검수 단계 제거. Gap 95%+ 통과하면 바로 배포.
> PM이 다시 검토받는 건 너무 복잡. 초기에는 단순하게 간다.

```
세션 시작 (spawn.sh)
→ 자동: peer summary 등록 (역할 매칭 가능)
→ 자동: team-context 생성 (팀별 독립)
→ 자동: 대시보드 registry 업데이트

PM: Plan + Design
→ 체인: PM 완료 → COO 보고 → CTO한테 자동 전달

CTO: 개발
→ Gap 분석 (Match Rate 95%+)
→ 통과 → 리더 배포 → COO → Smith님 보고
→ 미통과 → 리더가 팀원한테 수정 지시 → 재분석

L0 핫픽스: 개발 → push → 리더 바로 배포 → COO 보고 (Gap 스킵)

배포 후:
→ 자동: 런타임 검증 (health check)
→ 자동: COO → Smith님 Slack 보고
```

### B. hook 정리 (불필요한 거 제거, 필요한 거 추가)

현재 hook이 너무 많고 서로 충돌함. 정리 필요:
- **제거 대상**: TeammateIdle (리더 지시와 충돌)
- **수정 대상**: pdca-chain-handoff (peer summary 의존 제거 or summary 자동 등록)
- **추가 대상**: 세션 시작 시 summary 등록, push 후 배포 트리거, registry 자동 업데이트

### C. TDD 실전 환경 포함

- mock만 쓰는 TDD 외에 **실전 환경 조건 테스트** 추가
- peer summary 등록 여부, broker 실제 상태, 배포 완료 여부
- REALWORLD-TEST-CASES.md 14건 기반

### D. CLAUDE.md L0~L3 배포 규칙 명시

- L0: 개발 → push → **리더 바로 배포** → COO 보고 (Gap 스킵)
- L1: 문서만 → push → COO 보고 (배포 없음)
- L2: 개발 → push → **Gap 95%+** → **리더 배포** → COO 보고
- L3: 개발 → push → **Gap 95%+** → **리더 배포** → COO 보고 (Smith님 최종 승인은 COO가 판단)

---

## 산출물

1. `docs/02-design/features/agent-process-v2.design.md` — 전체 플로우 Design
2. TDD 케이스 목록 (실전 환경 포함)
3. 실전 테스트 시나리오 (Smith님 검증용)
4. CLAUDE.md 수정안 (L0~L3 배포 규칙)

## 검증 기준

- [ ] 전체 플로우에 끊기는 구간 0개
- [ ] 오늘 발견된 7개 문제 전부 해결 방안 포함
- [ ] TDD에 실전 환경 조건 포함
- [ ] L0~L3 배포 규칙 명시
- [ ] 실전 테스트 시나리오에서 체인 자동 발동 확인 가능

## COO 의견
위 내용은 COO 의견일 뿐이다. 참고하되 최고의 방법을 찾아라.
조각조각 고치지 말고 전체를 한 번에 잡아라.
