---
team: CTO-2
session: sdk-cto-2
created: 2026-03-30
status: pending
owner: leader
priority: P0-URGENT
---

# TASK: 체인 자동화 실전 TDD — 다시는 이런 이슈 안 생기게

> COO(모찌) → CTO-2팀 긴급 지시
> Smith님 직접 지시: "절대 이런 이슈가 다신 안생기게 TDD 다 잡아"

---

## 배경

체인 자동화 구축했는데 실전에서 한 번도 안 탔음. team-context.json 병렬 버그 수정했지만 (e4c41dc), **실전과 동일한 시나리오 TDD가 부족**해서 또 터질 수 있음.

현재: 374 passed / 1 failed (CH-5 broker 미기동)

---

## 요구사항

### 1. 기존 실패 1건 수정
- CH-5: L1→MOZZI 라우팅 — broker 미기동 시 fallback 테스트 수정

### 2. 실전 시나리오 TDD 추가 (최소 15건)

#### 병렬 팀 실전 e2e
- RW-1: CTO + PM 동시 TASK → 각각 독립 체인 발동 확인
- RW-2: CTO TeamDelete → PM 체인 영향 0 확인
- RW-3: 3팀 동시 context 세팅 → 각각 별도 파일 확인
- RW-4: 한 팀 TeamDelete → 아카이브 생성 + 다른 팀 context 무사 확인

#### TeamDelete → TaskCompleted 타이밍
- RW-5: TeamDelete 직후 TaskCompleted → 아카이브에서 context 읽어서 체인 발동
- RW-6: 아카이브 없고 활성 context도 없으면 → silent exit 0

#### 체인 풀플로우 e2e
- RW-7: CTO 완료 → pdca-chain-handoff → PM한테 자동 전달 (stdout에 ACTION_REQUIRED 또는 자동 전송)
- RW-8: PM 검수 pass → pm-chain-forward → COO한테 자동 전달
- RW-9: PM 검수 reject → CTO한테 FEEDBACK 전달
- RW-10: COO 보고서 생성 → webhook wake 호출 확인

#### requireApproval 통합
- RW-11: 팀원 .claude/ 수정 → requireApproval 호출 확인 (exit 2 아님)
- RW-12: 팀원 migration 수정 → requireApproval 호출 확인
- RW-13: 승인 후 → exit 0 (작업 재개)
- RW-14: 거부 후 → exit 2 (차단)
- RW-15: 타임아웃 → exit 2 (안전 폴백)

#### 보고 도달 검증
- RW-16: 체인 끝에 coo-smith-report.json 생성 확인
- RW-17: webhook wake curl 호출 시 Authorization Bearer 포함 확인
- RW-18: 중복 보고 방지 (같은 msg_id 2회 → dedup)

#### context resolver 엣지케이스
- RW-19: tmux 없는 환경 → team-context-local.json fallback
- RW-20: 레거시 team-context.json만 존재 → 하위 호환 읽기

### 3. 기존 374건 회귀 절대 0

---

## 역할 경계
- 이 TASK는 **Design + Do + QA** 전부 CTO-2 담당 (PM 거치지 않음 — 긴급)
- Plan은 이 TASK 파일이 Plan임

## 하지 말 것
- 기존 테스트 파일 삭제/대량 수정 금지 — 신규 파일로 추가
- hook 비즈니스 로직 변경 금지 — TDD 추가만
- CH-5 외 기존 테스트 assertion 변경 금지

## 검증 기준
- 전체 TDD: 기존 374건 + 신규 20건 = **394건+ 전부 Green**
- 실패 0건
- 병렬 팀 시나리오 완전 커버
