# SEO 기초 인프라 + 오가닉 채널 보강 Plan

## 요약
오가닉 채널 Phase 1 완성 후, SEO 기초 인프라를 신규 파일 추가 위주로 구축한다.

## 범위
1. sitemap.xml 동적 생성 (Next.js 내장)
2. robots.txt (Next.js 내장)
3. OG 메타태그 + Twitter Card (layout.tsx metadata 확장)
4. JSON-LD 구조화 데이터 (Organization, WebSite)
5. GSC API 클라이언트 + API 라우트
6. 네이버 서치어드바이저 API 클라이언트

## 제약사항
- 기존 파일 수정: layout.tsx metadata 확장만 허용
- DB 변경 없음
- 환경변수 없어도 graceful fallback
- tsc + lint + build 통과 필수

## 성공 기준
- `npm run build` 성공
- sitemap.xml, robots.txt 생성 확인
- OG + JSON-LD 포함
- GSC/서치어드바이저 클라이언트 에러 없이 동작
