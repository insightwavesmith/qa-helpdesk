---
team: PM
session: sdk-pm
created: 2026-03-30
status: pending
owner: leader
priority: P0-URGENT
type: Design
---

# TASK: 에이전트팀 체인 구조 100% — 남은 문제 전부 해결

> COO(모찌) → PM팀 Design
> Smith님 직접 지시: "에이전트팀 체인구조의 100% 문제없이 돌아가는거 진행해"

---

## 현재 상태 (완료된 것)
- team-context 병렬 분리 완료 (e4c41dc)
- requireApproval 승인 게이트 기본 구현 (861acfb)
- 방탄 TDD 38건 + hook 방어 코드 (4d95107)
- TDD 433건 전부 Green

## 남은 문제 5건 — 전부 Design 잡아라

---

### 1. 리더가 승인 대기 자동 감지

**현재**: 팀원이 위험 파일 수정 → pending 파일 생성 → 리더가 모름 → 팀원 stuck
**필요**: 리더가 자동으로 pending 감지 → 승인/거부

방향:
- 리더의 매 턴에서 pending 폴더 체크
- 또는 팀원이 리더한테 직접 send-keys로 "승인 요청있다" 전달
- COO 의견: 후자가 단순. 팀원이 차단되면 리더한테 직접 알리는 게 자연스러움.

---

### 2. 체인 실전 테스트 시나리오

**현재**: TDD 433건 Green이지만 실전에서 체인이 타는지 미검증
**필요**: 새 세션에서 실제 TASK 돌렸을 때 체인이 자동으로 타는 e2e 검증

방향:
- 간단한 TASK를 CTO-2한테 줌
- 팀원이 코드 수정 → 완료 → TeamDelete
- TaskCompleted → pdca-chain-handoff 발동 → PM한테 전달 → COO한테 보고
- 이 전체가 자동으로 타는지 확인하는 시나리오 설계

---

### 3. 리더 역할 제한 + 배포 화이트리스트

**현재**: 리더가 src/ 수정하면 exit 2 차단. 근데 gcloud deploy 같은 배포 명령어도 차단됨.
**필요**: 리더가 코드(src/) 쓰는 건 차단 유지, 배포/인프라 명령어는 허용

방향:
- validate-delegate.sh에 리더 배포 명령어 화이트리스트 추가
- gcloud run deploy, gcloud storage cp 등 인프라 명령어 = 리더만 가능
- 팀원은 여전히 차단 (배포는 리더 권한)

---

### 4. 대시보드 동기화 근본 수정

**현재**: dashboard-sync-loop.sh가 매분 git commit+push → 7396건 커밋 + GitHub Actions 메일 폭탄. 프로세스 kill + 스크립트 삭제 완료.
**필요**: state.json 업데이트를 git 안 거치고 GCS 직접 업로드

방향:
- `gcloud storage cp state.json gs://mozzi-reports/dashboard/state.json`
- 간격: 10분 or 변경 있을 때만
- git commit 안 함, GitHub Actions 안 탐
- 리포트(reports/) 배포는 기존 git push → GitHub Actions → GCS 유지

---

### 5. heartbeat patrol 실전 검증

**현재**: heartbeat every: "5m" 켰지만 실제 동작 확인 안 됨. Gemini 2.0 Flash.
**필요**: heartbeat가 실제로 5분마다 돌면서 팀 상태 감지하는지 TDD

방향:
- heartbeat 트리거 → HEARTBEAT.md 체크리스트 실행 확인
- 팀 상태 이상 감지 시 Smith님 Slack 보고 확인
- heartbeat 미발동 시 알림 (watchdog)

---

## COO 의견
위 내용은 COO 의견일 뿐이다. 참고하되 최고의 방법을 찾아라.
특히 내가 빠뜨린 엣지케이스 있으면 추가해라.

## 하지 말 것
- 코드 수정 금지 — Design만
- 기존 TDD 수정 금지

## 산출물
- `docs/02-design/features/chain-100-percent.design.md`
- 각 문제별 TDD 케이스 목록
- Smith님 실전 검증 체크리스트 (이전 TASK에서 미완성된 것 포함)

## 검증 기준
- 5건 전부 Design에 반영
- 각 건별 수정 파일 + TDD 케이스 명시
- 실전 테스트 시나리오 포함
