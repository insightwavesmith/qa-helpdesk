# TASK: SEO 기초 인프라 + 오가닉 채널 보강

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
오가닉 채널 Phase 1 기반 코드는 이미 완성됨. 이제 SEO 기초 인프라를 추가해야 함.
**기존 기능을 건드리지 않는 신규 파일 추가 위주** 작업이다.

## Task 1: sitemap.xml 동적 생성
- `src/app/sitemap.ts` 생성 (Next.js 내장 sitemap 기능)
- 정적 페이지 + 발행된 블로그 글(organic_posts where status='published') URL 포함
- changeFrequency, priority 적절히 설정
- 참고: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap

## Task 2: robots.txt
- `src/app/robots.ts` 생성 (Next.js 내장)
- Allow: / (전체 허용)
- Disallow: /admin (관리자 페이지 차단)
- Disallow: /api (API 라우트 차단)
- Sitemap: https://bscamp.vercel.app/sitemap.xml
- 참고: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots

## Task 3: OG 메타태그 강화
- `src/app/layout.tsx`의 metadata에 openGraph 설정 추가
- title, description, url, siteName, locale, type
- twitter card 메타도 추가
- 이미 있는 verification 설정 건드리지 말 것

## Task 4: JSON-LD 구조화 데이터
- `src/components/seo/json-ld.tsx` 생성
- Organization 스키마 (자사몰사관학교)
- WebSite 스키마
- layout.tsx에서 import해서 body 안에 배치
- 기존 레이아웃 구조 변경 최소화

## Task 5: GSC API 연동 준비
- `src/lib/gsc.ts` 생성 — Google Search Console API 클라이언트
- 환경변수: GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
- 함수: getSearchAnalytics(startDate, endDate, dimensions)
- 반환: 키워드별 clicks, impressions, ctr, position
- API 엔드포인트: `src/app/api/admin/gsc/route.ts` (GET)
- 실제 API 호출은 환경변수 없으면 빈 배열 반환 (graceful fallback)

## Task 6: 네이버 서치어드바이저 API 준비
- `src/lib/naver-searchadvisor.ts` 생성
- 환경변수: NAVER_SEARCHADVISOR_API_KEY
- 함수: getSiteAnalytics(startDate, endDate)
- 실제 API 호출은 환경변수 없으면 빈 배열 반환

## 제약사항
- **기존 파일 수정 최소화**: layout.tsx 메타데이터 추가만 허용
- **새 파일 추가 위주**: sitemap.ts, robots.ts, json-ld.tsx, gsc.ts, naver-searchadvisor.ts, route.ts
- **DB 변경 없음**: 기존 테이블 그대로
- **빌드 깨지면 안 됨**: tsc + lint + build 전부 통과해야 함
- **테스트**: 각 Task 완료 후 `npx next build` 확인

## 완료 기준
1. `npx next build` 성공
2. sitemap.xml, robots.txt 접근 가능
3. OG 메타태그 + JSON-LD head/body에 포함
4. GSC/서치어드바이저 API 클라이언트 코드 존재 (환경변수 없어도 에러 안 남)
