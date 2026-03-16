# 콘텐츠 자동 수집 크론 API 계획서

> 작성: 2026-03-16

## 1. 배경
- 기존 OpenClaw 로컬 스크립트(`content_crawler.mjs`, `youtube_subtitle_collector.mjs`)가 유실되어 3/5부터 12일간 수집 중단
- Vercel cron API로 이관하여 git 관리 + 자동 실행 보장

## 2. 범위

### 2-1. 블로그/뉴스 크롤링 크론 (`/api/cron/collect-content`)
- 매일 UTC 20:00 (KST 05:00) 실행
- 6개 소스(mobiinside, jonloomer, cxl, shopify, neilpatel, adespresso) RSS/HTML 크롤링
- `content_sources` 테이블에서 is_active=true 소스 읽어서 수집
- 기존 `crawlUrl()` 로직 재사용 (cheerio + turndown)
- INSERT 후 `embedContentToChunks()` 자동 임베딩

### 2-2. 유튜브 자막 수집 크론 (`/api/cron/collect-youtube`)
- 매일 UTC 21:00 (KST 06:00) 실행
- 6개 채널(Sam Piliero, CTtheDisrupter, Nick Theriot, Ben Heath, Jon Loomer, Dara Denney)
- YouTube Data API v3 대신 RSS 피드 사용 (API key 불필요)
- 자막: TranscriptAPI.com 사용 (기존 크레딧 보유)
- `content_sources` 테이블에서 feed_type='youtube' 읽어서 수집

### 2-3. content_sources 초기 데이터 마이그레이션
- feed_type 제약조건에 'youtube' 추가
- 12개 소스(6 blog + 6 youtube) INSERT

### 2-4. vercel.json 업데이트
- 크론 2개 추가

## 3. 성공 기준
- [ ] tsc 통과
- [ ] lint 통과
- [ ] build 통과
- [ ] content_sources migration SQL 문법 정상
- [ ] vercel.json에 크론 2개 추가
- [ ] 기존 크론 영향 없음

## 4. 관련 파일
- `src/app/api/cron/collect-daily/route.ts` — verifyCron, startCronRun/completeCronRun 패턴
- `src/actions/contents.ts` — crawlUrl() 재사용
- `src/actions/embed-pipeline.ts` — embedContentToChunks()
- `src/lib/cron-logger.ts` — startCronRun/completeCronRun
- `supabase/migrations/00009_content_sources.sql` — content_sources 테이블 정의
- `vercel.json` — 크론 스케줄
