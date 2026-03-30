# 실전 테스트 케이스 — 오늘 터진 문제 기반

> 2026-03-30 실전에서 발견된 모든 문제를 테스트 케이스로 변환
> Smith님이 직접 검증하는 체크리스트

---

## A. 체인 자동 발동 (오늘 핵심 장애)

### A1. PM 작업 완료 → COO한테 자동 보고
- PM이 Plan/Design 끝냄 → TaskCompleted 발동 → 체인이 타서 COO(모찌)한테 자동 알림
- **오늘 실패**: PM이 Plan 끝냈는데 보고 안 옴. 체인 안 탔음.
- **검증**: PM한테 간단한 TASK 줌 → 완료 → Smith님 Slack에 알림 오는지

### A2. CTO 작업 완료 → PM 검수 → COO 보고
- CTO 구현 완료 → PM한테 자동 전달 → PM 검수 → COO한테 보고
- **오늘 실패**: CTO가 비디오 이슈 분석, QA탭 수정 다 끝냈는데 체인 안 탐.
- **검증**: CTO한테 간단한 수정 TASK → 완료 → PM한테 자동 전달 → COO 보고

### A3. 3팀 동시 작업 → 각각 독립 체인
- CTO, CTO-2, PM 동시에 다른 TASK → 한 팀 완료 → 다른 팀 체인 영향 0
- **오늘 실패**: team-context 1개 파일이라 덮어쓰기/삭제 충돌
- **검증**: 3팀 동시 TASK → CTO 먼저 완료 → CTO 체인만 타고 PM/CTO-2 영향 없음

### A4. TeamDelete 후 체인 타는지
- 팀원 작업 끝 → TeamDelete → TaskCompleted → 체인 발동
- **오늘 실패**: TeamDelete가 context 삭제해서 체인 시작 안 됨
- **검증**: 팀원이 코드 수정 → 완료 → TeamDelete → 체인 자동 발동 확인

---

## B. 승인 게이트

### B1. 팀원 위험 파일 수정 → 리더 자동 감지
- 팀원이 .claude/ 수정 시도 → "승인 필요" → 리더한테 알림 감
- **오늘 실패**: 차단만 되고 리더/COO/Smith님 아무도 모름
- **검증**: 팀원이 .claude/config 수정 시도 → 리더 화면에 승인 요청 표시

### B2. 리더 승인 → 팀원 재시도 → 통과
- 리더가 승인 → 팀원이 같은 파일 다시 수정 → 이번엔 통과
- **오늘 미검증**
- **검증**: B1 이후 → 리더 승인 → 팀원 재시도 → exit 0

### B3. 배포 명령어는 리더만 가능
- 팀원이 gcloud deploy → 차단. 리더가 gcloud deploy → 통과.
- **오늘 실패**: @deployer 팀원이 gcloud deploy 시도 → hook이 차단 → 배포 안 됨 → 수강생 계속 에러
- **검증**: 리더가 gcloud run deploy → 정상 실행

---

## C. 보고 도달

### C1. 체인 끝에 COO한테 실제 도달
- 체인 마지막에 COO 세션에 메시지 도착하는지
- **오늘 실패**: broker 미기동 + fallback 미동작
- **검증**: 체인 완료 → COO 세션에 보고 메시지 확인

### C2. COO가 Smith님한테 Slack 보고
- COO가 체인으로 받은 결과를 Smith님 DM으로 보고
- **오늘 실패**: 체인 안 타서 COO가 감지 못 함 → Smith님이 직접 물어봐야 알 수 있었음
- **검증**: 체인 완료 → COO 자동 보고 → Smith님 Slack DM 수신

---

## D. 인프라 실수 방지

### D1. dashboard-sync 같은 무한 루프 방지
- 매분 git commit+push 같은 스크립트가 돌면 감지
- **오늘 실패**: 6일간 7396건 커밋 + 메일 폭탄 방치
- **검증**: heartbeat patrol에서 비정상 프로세스 감지하는지

### D2. 배포 안 된 상태 감지
- 코드 push 했는데 Cloud Run 배포 안 됨
- **오늘 실패**: CTO가 push까지 했는데 배포 안 해서 프로덕션에 옛날 코드
- **검증**: push 후 배포 여부 자동 체크 (git HEAD vs Cloud Run revision)

### D3. COO 인프라 최신화
- 배포 위치(Vercel→GCS), DB 변경 등을 COO가 알고 있는지
- **오늘 실패**: Vercel 배포라고 잘못 지시
- **검증**: SERVICE-STATUS.md 자동 갱신 + COO 일일 sync

---

## E. heartbeat patrol

### E1. 5분마다 팀 상태 체크
- heartbeat가 실제로 5분마다 돌면서 팀 상태 감지
- **오늘 미검증**: heartbeat 켰지만 실전 동작 확인 안 함
- **검증**: 5분 대기 → heartbeat 로그 확인

### E2. stuck 팀 감지 → Smith님 보고
- 팀이 10분+ 무활동이면 감지해서 보고
- **오늘 실패**: CTO 23분 thinking을 "stuck"으로 보고 — 실제로는 정상이었음
- **검증**: 정상 thinking vs 실제 stuck 구분

---

## 테스트 순서 (Smith님 실전 검증)

1. **A4** — TeamDelete 후 체인 (가장 중요, 오늘 핵심 장애)
2. **A1** — PM 완료 → COO 보고
3. **B1+B2** — 승인 요청 → 리더 감지 → 승인
4. **B3** — 리더 배포
5. **A2** — CTO→PM→COO 풀체인
6. **C1+C2** — 보고 도달 + Smith님 Slack
7. **A3** — 3팀 동시 (시간 있으면)
8. **E1** — heartbeat
