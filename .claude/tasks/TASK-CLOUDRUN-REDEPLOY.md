---
team: CTO
created: 2026-03-28
status: pending
owner: leader
---

# TASK: 권한 스킵 로직 Cloud Run 재배포

## 타입
개발 (L0 — 배포만)

## T1: Cloud Run 재빌드 + 배포

### 이게 뭔지
process-media의 권한 없는 계정 스킵 로직(TASK-VIDEO-PERMISSION-SKIP)이 코드로는 완료됐지만 Cloud Run에 아직 배포 안 됨. 현재 프로덕션에서는 권한 없는 계정에서 에러 발생 중.

### 왜 필요한지
permission 에러가 크론 실행 때마다 로그에 쌓이고, 해당 계정 이후 처리가 멈출 수 있음. 코드는 이미 main에 있으므로 배포만 하면 됨.

### 구현 내용
```bash
# 1. 빌드 + 배포
cd /Users/smith/projects/bscamp
gcloud builds submit --tag gcr.io/bscamp-prod/bscamp-cron
gcloud run deploy bscamp-cron \
  --image gcr.io/bscamp-prod/bscamp-cron \
  --region asia-northeast3

# 2. 배포 확인
gcloud run services describe bscamp-cron --region asia-northeast3 --format='value(status.url)'

# 3. process-media 수동 트리거 → 로그에서 permission 스킵 메시지 확인
# "Skipping account {id} — insufficient permissions" 로그 출력되면 성공
```

### 검증 기준
- Cloud Run 배포 성공
- process-media 실행 → 권한 없는 계정 스킵 + 나머지 정상 처리
- 에러 로그 0건 (스킵 로그는 info 레벨)

## 하지 말 것
- 코드 수정 (이미 완료됨)
- 다른 서비스 재배포
