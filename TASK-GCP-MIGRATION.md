# TASK: Supabase → GCP 전체 이관 (대작업)

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## ⚠️ 핵심 원칙
- **서비스 중단 없이 이관한다.** Supabase 바로 끄지 마라.
- 이중 운영하면서 GCP 쪽 테스트 → 문제없으면 전환 → 1주일 모니터링 → Supabase 종료
- 단계별로 쪼개서 하나씩 순차 진행. 한꺼번에 하지 마라.

## 현재 Supabase 사용 현황
- **DB**: PostgreSQL + pgvector (임베딩 3072차원)
- **Storage**: 소재 이미지/영상 3,000건+, LP 스크린샷, 히트맵
- **Auth**: Supabase Auth (수강생 로그인 + RLS)
- **URL**: https://symvlrsmkjlztoopbnht.supabase.co

## GCP 프로젝트
- 프로젝트 ID: modified-shape-477110-h8
- 리전: asia-northeast3 (서울)
- 권한: 풀 액세스

## 이관 단계 (순차 진행)

### Phase 1: Cloud SQL 인스턴스 생성 + 스키마 이관
1. Cloud SQL PostgreSQL 15 인스턴스 생성 (서울 리전)
   - pgvector 확장 활성화 필수
   - 스펙: 적절히 (vCPU 2, RAM 8GB 정도로 시작)
2. Supabase에서 스키마 DDL export (pg_dump --schema-only)
3. Cloud SQL에 스키마 import
4. RLS 정책 → 애플리케이션 레벨로 전환 방법 검토
5. **테스트**: 빈 DB에 테이블 구조 확인

### Phase 2: 데이터 마이그레이션
1. pg_dump로 전체 데이터 export (Supabase → 로컬)
2. pg_restore로 Cloud SQL에 import
3. 임베딩 벡터(pgvector 3072차원) 정상 이관 확인
4. 레코드 수 검증 (테이블별 COUNT 비교)
5. **테스트**: 주요 쿼리 Cloud SQL에서 실행 확인

### Phase 3: Storage 이관
1. Cloud Storage 버킷 생성 (서울 리전)
2. Supabase Storage에서 전체 파일 다운로드
3. Cloud Storage에 동일 경로 구조로 업로드
4. URL 매핑 테이블 또는 환경변수로 base URL 전환 준비
5. **테스트**: 이미지/영상 URL 접근 확인

### Phase 4: 코드 변경 (DB 연결)
1. Supabase client → pg 직접 연결 or Prisma/Drizzle ORM
2. 환경변수: SUPABASE_URL/KEY → CLOUD_SQL 연결 정보
3. RLS 대체: 미들웨어 or 쿼리 레벨 필터링
4. Storage URL 참조 전부 변경
5. **테스트**: 로컬에서 Cloud SQL 연결해서 기존 기능 전체 동작 확인

### Phase 5: Auth 이관
1. Firebase Auth 설정 or 자체 JWT 구현
2. 기존 사용자 데이터 마이그레이션 (이메일/비밀번호)
3. 로그인/회원가입 플로우 전환
4. **테스트**: 로그인 → 대시보드 → 데이터 조회 전체 플로우

### Phase 6: 이중 운영 + 전환
1. GCP 쪽으로 트래픽 전환 (환경변수 변경)
2. 1주일 이중 운영 모니터링
3. 문제없으면 Supabase 종료

## 지금 하는 것
**TASK-RAILWAY.md 먼저 완료 → Phase 1부터 순차 진행**

## 주의사항
- Supabase 절대 바로 끄지 마라
- 각 Phase 끝날 때마다 테스트 결과 보고
- Phase 4(코드 변경)가 가장 큰 작업 — 파일 수 많음
- pgvector 3072차원 인덱스 성능 확인 필수
