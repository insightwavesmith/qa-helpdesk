# TASK: GCP Phase 6 마무리 (보안+환경변수)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
GCP 이관 Phase 1-5 완료. Phase 6 보안 강화 + Vercel 환경변수 정리가 남음.
현재 Cloud SQL이 0.0.0.0/0으로 열려 있어서 보안 취약.

## 선행 조건
- ⚠️ TASK-P1-BACKFILL.md 완료 후 실행 (backfill이 DB 접근 필요하므로 네트워크 제한은 그 후)

## 해야 할 것

### STEP 1: Cloud SQL 네트워크 제한
- 현재: 0.0.0.0/0 (전체 허용) → 보안 위험
- 변경: 허용 IP만 등록
  - Vercel Edge Network IP 대역 (Vercel docs 참고)
  - GCP Cloud Run → Cloud SQL은 VPC Connector 또는 Cloud SQL Auth Proxy 사용
  - Smith님 로컬 IP (필요 시)
- gcloud sql instances patch로 authorized-networks 변경

### STEP 2: Vercel 프로덕션 env 설정
- DATABASE_URL → Cloud SQL 연결 문자열로 변경
- USE_CLOUD_SQL=true 설정
- 기존 Supabase URL은 폴백으로 유지

### STEP 3: Storage 업로드 GCS 직접 전환
- 현재: 일부 업로드가 Supabase Storage 경유
- 변경: GCS(gs://bscamp-storage) 직접 업로드로 통일
- 영향 범위: 미디어 업로드 관련 코드 확인 필요

## 검증
- Cloud SQL에 Vercel/Cloud Run에서만 접속 가능 확인
- 외부 IP에서 접속 차단 확인
- Vercel 프론트에서 DB 정상 조회 확인
- Storage 업로드 정상 동작 확인

## 완료 기준
- 0.0.0.0/0 제거됨
- Vercel env에 Cloud SQL 연결 설정됨
- 프론트+크론 모두 정상 동작
