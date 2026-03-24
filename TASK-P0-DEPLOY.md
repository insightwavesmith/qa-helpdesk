# TASK: GCP Cloud Run 재배포 (bscamp-cron)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
main 브랜치에 수집 구조 리팩토링(Wave 1-3) merge 완료됨.
그런데 Cloud Run은 자동 배포가 아니라 Docker 이미지 빌드 → 배포 별도 필요.
**새 코드(CAROUSEL 수집, raw JSONB, backfill 엔드포인트)가 Cloud Run에 반영 안 된 상태.**

## 현재 인프라
- GCP 프로젝트: modified-shape-477110-h8
- Cloud Run 서비스: bscamp-cron (asia-northeast3)
- Docker: Dockerfile은 프로젝트 루트에 있음
- gcloud CLI: /opt/homebrew/share/google-cloud-sdk/bin/gcloud

## 해야 할 것
1. 프로젝트 루트에서 Docker 이미지 빌드 (Cloud Build 또는 로컬)
2. Artifact Registry에 push
3. bscamp-cron Cloud Run 서비스 업데이트
4. 배포 후 health check 확인
5. 주요 엔드포인트 동작 확인:
   - `/api/cron/collect-daily` 응답 확인
   - `/api/cron/backfill-accounts` 응답 확인

## 주의
- 환경변수(env)는 이미 Cloud Run에 설정되어 있음. 코드만 업데이트.
- 배포 중 다운타임 최소화 (--no-traffic 옵션 고려)
- 기존 Cloud Scheduler 크론 21개가 이 서비스를 호출하고 있음

## 완료 기준
- Cloud Run에 최신 main 코드 반영됨
- health check 정상
- 엔드포인트 200 응답
