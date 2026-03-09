# TASK: 경쟁사 분석기 환경변수 문제 수정

## 목표
경쟁사 분석기가 Vercel 배포 환경에서 `META_AD_LIBRARY_TOKEN` 환경변수를 정상적으로 읽도록 수정

## 빌드/테스트
- npm run build 성공 필수
- 로컬 테스트: `curl http://localhost:3000/api/competitor/search?q=shopping&country=KR&limit=1`

## 현상
- Vercel에 `META_AD_LIBRARY_TOKEN` 환경변수 설정 완료 (vercel env pull로 확인됨)
- Vercel 수동 배포 완료 (npx vercel --prod)
- 그런데 페이지에서 "META_AD_LIBRARY_TOKEN이 설정되지 않았습니다" 에러 발생
- 로컬(.env.local)에서는 토큰 동작 확인됨

## T1. 환경변수 접근 문제 진단 및 수정

### 파일
- `src/lib/competitor/meta-ad-library.ts` (line 69: `process.env.META_AD_LIBRARY_TOKEN`)
- `src/app/api/competitor/search/route.ts` (API route)
- `next.config.ts` (환경변수 노출 설정 확인)

### 확인할 것
1. `next.config.ts`에서 `META_AD_LIBRARY_TOKEN`이 서버사이드에서 접근 가능한지 확인
2. Edge Runtime vs Node.js Runtime 설정 확인 — Edge에서는 process.env 접근 제한될 수 있음
3. API route에 `export const runtime = "nodejs"` 명시 필요할 수 있음
4. Vercel의 serverless function이 환경변수를 제대로 주입받는지 확인
5. `.env.local`에 있는 다른 환경변수(SUPABASE 등)는 Vercel에서 작동하는지 비교

### 검증
- `npm run build` 성공
- 로컬 `npm run dev`에서 `/api/competitor/search?q=test&country=KR&limit=1` 호출 시 데이터 반환
- API route에서 환경변수 디버그 로그 추가하여 Vercel Function Logs에서 확인 가능하게

## T2. 경쟁사 분석기 전체 동작 검증

### 파일  
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx`
- `src/app/api/competitor/search/route.ts`
- `src/app/api/competitor/insights/route.ts`
- `src/app/api/competitor/monitors/route.ts`

### 확인할 것
1. 검색 → 결과 표시 흐름 정상 동작
2. AI 인사이트 분석 호출 정상 동작
3. 모니터링 등록/조회 정상 동작
4. 에러 처리 (토큰 만료, rate limit 등) 정상 표시

### 검증
- 검색어 "쇼핑몰"로 검색 시 광고 카드 리스트 표시
- 빌드 성공
