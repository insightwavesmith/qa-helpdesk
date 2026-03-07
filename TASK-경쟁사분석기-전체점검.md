# TASK: 경쟁사 분석기 전체 점검 — 코드리뷰 + 테스트

## 목표
경쟁사 분석기가 로컬 + Vercel 배포 환경에서 완전히 작동하도록 모든 문제를 찾아 수정

## 빌드/테스트
- npm run build 성공 필수
- 로컬 dev 서버에서 전체 기능 테스트 필수 (npm run dev → 브라우저 또는 curl)

## 배경
- Meta Ad Library API 토큰은 작동함 (curl로 직접 호출 확인 완료)
- `.env.local`에 `META_AD_LIBRARY_TOKEN` 설정됨
- Vercel production에도 환경변수 설정됨 (vercel env pull로 확인)
- `runtime = "nodejs"` + `dynamic = "force-dynamic"` 이미 추가됨
- 그런데도 배포 환경에서 "META_AD_LIBRARY_TOKEN이 설정되지 않았습니다" 에러 발생
- 이미 2번 수정 시도했으나 실패

## T1. 코드리뷰 — 환경변수가 안 읽히는 근본 원인 찾기

### 파일 (전부 읽어라)
- `next.config.ts` — env, serverExternalPackages, 기타 설정
- `middleware.ts` — API route 가로채기 여부
- `src/lib/competitor/meta-ad-library.ts` — 토큰 읽는 코드
- `src/app/api/competitor/search/route.ts` — API route
- `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — 클라이언트
- `vercel.json` (있으면) — Vercel 설정
- `package.json` — Next.js 버전

### 확인할 것
1. middleware.ts가 `/api/competitor/*` 경로를 가로채서 redirect하는지
2. next.config.ts에 env 관련 설정이 있는지
3. API route가 실제로 실행되는지 아니면 middleware에서 차단되는지
4. 클라이언트에서 API 호출 시 인증(Supabase auth) 체크가 있는지 — 미인증이면 redirect될 수 있음
5. Vercel Function 로그를 확인할 수 있도록 적절한 console.log 배치

### 수정
- 근본 원인 찾아서 수정
- 환경변수 접근이 안 되는 게 아니라 다른 문제(인증, middleware 등)일 수 있음

## T2. 로컬 테스트 — 전체 기능 동작 확인

### 테스트 항목
1. `npm run dev` 실행
2. `curl http://localhost:3000/api/competitor/search?q=쇼핑몰&country=KR&limit=3` — 200 + 데이터 반환 확인
3. 브라우저에서 `/protractor/competitor` 접속 → 검색 바에 "쇼핑몰" 입력 → 광고 카드 표시 확인
4. AI 인사이트 분석 버튼 동작 확인 (있으면)
5. 모니터링 등록 동작 확인 (있으면)

### 검증 기준
- API가 Meta Ad Library 데이터를 정상 반환
- 클라이언트에서 에러 없이 광고 카드 리스트 표시
- 빌드 성공

## T3. 수정 사항 정리
- 변경한 파일 목록
- 근본 원인 설명
- 로컬 테스트 결과 (curl 응답 포함)
