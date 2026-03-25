# TASK: CTO팀 정리된 작업 목록

## 현재 상황
1. 광고계정ID 버그 수정 - 완료 ✅
2. 모델 변경 - Opus 4.6 + thinking high 적용 필요
3. 남은 작업 2개 - 깔끔하게 진행

## TASK A: 크론 파이프라인 마무리 (운영 작업)

### 목표
모든 배치가 정상 돌아가는지 확인하고 누락된 것 시작

### 체크할 것
- backfill 90일: 41/90일 진행 상태
- 임베딩: 3166/3355 완료율
- 영상 saliency: 크론 동작 확인
- DeepGaze 배치: 실행 여부

### 명령어
```bash
# GCP 크론 상태 확인
gcloud scheduler jobs list --filter="location:asia-northeast3"

# 백필 진행 확인
ps aux | grep backfill | grep -v grep

# 임베딩 상태
curl -s https://bscamp-cron-906295665279.asia-northeast3.run.app/api/status/embedding
```

## TASK B: collect-daily 효율화 (개발 작업)

### 현재 문제
- runCollectDaily 함수: 382줄 (너무 큼)
- 계정별 순차처리 (병렬화 없음)
- 수집/후처리 혼재

### 목표
- Promise.all로 계정 병렬 처리
- collectAccount() 함수 분리
- incremental 수집 로직 추가

### 파일
src/app/api/cron/collect-daily/route.ts

## 진행 방식
CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 A, B 병렬 진행하기