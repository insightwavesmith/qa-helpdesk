# Vercel 의존 제거 설계서

## 1. 데이터 모델
변경 없음. 코드 레벨 의존성 제거만.

## 2. API 설계
변경 없음. 기존 API route 동작 유지.

## 3. 수정 대상 파일 목록

### 3-A: maxDuration 제거 (33파일)
`export const maxDuration = N;` 라인 삭제:

**cron 라우트 (26파일):**
- src/app/api/cron/collect-daily/route.ts
- src/app/api/cron/collect-daily-2/route.ts
- src/app/api/cron/collect-daily-3/route.ts
- src/app/api/cron/collect-daily-4/route.ts
- src/app/api/cron/collect-benchmarks/route.ts
- src/app/api/cron/collect-mixpanel/route.ts
- src/app/api/cron/collect-content/route.ts
- src/app/api/cron/collect-youtube/route.ts
- src/app/api/cron/collect-clicks/route.ts
- src/app/api/cron/process-media/route.ts
- src/app/api/cron/crawl-lps/route.ts
- src/app/api/cron/embed-creatives/route.ts
- src/app/api/cron/creative-saliency/route.ts
- src/app/api/cron/video-saliency/route.ts
- src/app/api/cron/analyze-competitors/route.ts
- src/app/api/cron/analyze-lp-saliency/route.ts
- src/app/api/cron/sync-notion/route.ts
- src/app/api/cron/cleanup-deleted/route.ts
- src/app/api/cron/organic-benchmark/route.ts
- src/app/api/cron/precompute/route.ts
- src/app/api/cron/track-performance/route.ts
- 기타 cron 라우트

**일반 API 라우트:**
- src/app/api/admin/backfill/route.ts
- src/app/api/admin/embed/route.ts
- src/app/api/admin/reembed/route.ts
- src/app/api/qa-chatbot/route.ts
- 기타 maxDuration 사용 라우트

### 3-B: vercel.json 정리
- `vercel.json`: `{"regions": ["icn1"]}` → 삭제 또는 `{}` 으로

### 3-C: CDN 캐시 헤더 (변경 불필요, 확인만)
- s-maxage 사용 파일 3개: 표준 HTTP 헤더이므로 Cloud CDN에서도 동작
- 변경 없음

## 4. 에러 처리
- maxDuration 제거는 기능에 영향 없음 (Next.js standalone에서 무시되는 설정)
- build 깨지면 해당 파일만 원복

## 5. 구현 순서
1. `grep -r "maxDuration" src/app/api/` 로 전체 파일 확인
2. 각 파일에서 `export const maxDuration = N;` 라인 삭제
3. vercel.json 정리
4. tsc + build 확인
5. 커밋
