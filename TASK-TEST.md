# TASK: 오늘 작업분 사용성 테스트 + 코드 리뷰 + 검수

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
오늘 대규모 작업이 진행됐다. 사용성 테스트 없이 커밋된 것들이 있으니 전부 검수해라.

## 오늘 커밋 목록
```
a5625cb PDCA 상태 업데이트 — GCP 이관 Phase 1-5 완료
0eba4f3 스크립트 22개 DB 헬퍼 공유 모듈 전환 (23파일 -1060줄)
3e719a4 GCP 이관 Phase 4+5 — Cloud SQL DB 전환 + Auth 이관 (11파일 +1360줄)
d0fda7c 5축 VIDEO_PROMPT_V3 씬별 오디오+텍스트 상세 추가
603d720 Railway→GCP Cloud Run URL 전환
e363cad collect-benchmark-creatives.mjs 벤치마크 소재 수집
66d4968 crawl-all-lps title→product_name 컬럼 수정
cc94a29 crawl-all-lps Cloud Run Job 대응 + VIDEO 100MB
```

## 검수 항목

### 1. 빌드 검증
- `tsc --noEmit` 타입 체크
- `next build` 빌드 성공
- 린트 에러 없는지

### 2. Cloud SQL 연결 테스트
- src/lib/cloud-sql.ts 연결 풀이 정상 동작하는지
- 로컬에서 Cloud SQL 연결해서 SELECT 쿼리 테스트
- 주요 API 엔드포인트 테스트:
  - /api/protractor (대시보드 데이터)
  - /api/creatives (소재 목록)
  - /api/cron/collect-daily (수집 크론)
  - /api/cron/embed-creatives (임베딩 크론)

### 3. 코드 리뷰
- Supabase client → Cloud SQL 전환이 누락된 파일 없는지
- DB 헬퍼 공유 모듈이 모든 스크립트에서 정상 import 되는지
- 환경변수 누락 체크 (CLOUD_SQL_* 등)

### 4. API 엔드포인트 테스트
- 각 크론 엔드포인트 curl로 health check
- Cloud Run 서비스들 정상 응답 확인
- Railway URL이 아직 참조되는 곳 없는지

### 5. 프롬프트 수정 확인
- VIDEO_PROMPT_V3에 씬별 오디오+텍스트 추가된 것 확인
- 기존 분석 로직에 영향 없는지

## 보고
- 각 항목별 pass/fail 정리
- 실패한 것은 원인 + 수정 방안
- 전부 pass면 "프로덕션 전환 준비 완료" 보고
