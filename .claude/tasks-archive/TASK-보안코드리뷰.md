# TASK: 보안 코드리뷰 + 보고서

> Plan 인터뷰 스킵

## 목표
QA 헬프데스크 전체 코드베이스 보안 점검. 보고서를 mozzi-reports에 HTML로 작성.

## T1. Supabase 보안 점검

- RLS(Row Level Security) 정책 확인: 모든 테이블에 적절한 RLS 있는지
- Service Role Key 노출 여부: 클라이언트 코드에 서비스키 없는지
- anon key 권한 범위: 불필요한 테이블 접근 가능한지
- API 엔드포인트 인증: 크론 API에 CRON_SECRET 검증 있는지
- SQL 인젝션 가능성: raw query 사용처 확인

## T2. 환경변수 / 시크릿 노출 점검

- .env.local 파일이 .gitignore에 있는지
- 코드에 하드코딩된 토큰/키 없는지
- NEXT_PUBLIC_ 접두사로 노출되면 안 되는 값 있는지
- META_ACCESS_TOKEN, NOTION_TOKEN 등 서버 전용 키 클라이언트 번들 포함 여부
- Supabase URL/Key 외 민감정보 클라이언트 노출 여부

## T3. API 엔드포인트 보안

- 인증 없이 접근 가능한 API 목록
- 관리자 전용 API에 권한 체크 있는지
- rate limiting 여부
- CORS 설정 확인

## T4. 코드 난독화 / 빌드 보안

- Next.js 빌드 시 소스맵 노출 여부 (next.config.js productionBrowserSourceMaps)
- 클라이언트 번들에 서버 로직 포함 여부
- API route에서 민감한 에러 메시지 노출 여부

## T5. 보고서 작성

- /Users/smith/projects/mozzi-reports/public/reports/security/ 디렉토리에 HTML 보고서 작성
- 파일명: 2026-02-28-security-audit.html
- 내용: 발견된 이슈 (심각도: Critical/High/Medium/Low), 권장 수정사항, 현재 상태
- 스타일: 기존 mozzi-reports HTML과 동일 (깔끔한 테이블 형식)

## 완료 기준

- [ ] T1~T4 보안 점검 완료
- [ ] 보고서 HTML 작성 + mozzi-reports 커밋+푸시
- [ ] 발견된 Critical/High 이슈 목록 정리
- [ ] report-stage.sh로 REVIEW_DONE 보고

## 리뷰 결과

(코드리뷰 후 작성)
