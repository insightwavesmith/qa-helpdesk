# TASK: collect-content 크론 수집 실패 수정 + 재발 방지

## 증상
- 큐레이션 탭에 새 콘텐츠가 2주 넘게 안 들어옴
- collect-content 크론: 3일 연속 records: 0 + "일부 소스 실패"
- 마지막 정상 수집: 3/6 (56건)

## 원인 (확인됨)

### 1. YouTube 소스 6개 — 쿼리에서 누락
- `collect-content/route.ts`에서 `.in("feed_type", ["rss", "html"])`로 조회
- YouTube 소스는 `feed_type: "youtube"` → 쿼리에서 아예 빠짐
- `parseYouTubeRSS` 함수는 `content-crawler.ts`에 존재하지만 사용 안 됨

### 2. 정상 RSS 소스 4개도 수집 안 됨
- Jon Loomer (3/17), Neil Patel (3/17), 모비인사이드 (3/19) — 새 글 있음
- 그런데 3/4 이후 수집 0건 → 크론 실행 흐름 자체에 문제 있을 수 있음
- 가능성: fetchAndParseUrl 타임아웃, 에러 핸들링에서 조용히 실패, 중복 체크 로직 오류

### 3. CXL Blog — Cloudflare 봇 차단 (403)
- 3월 초부터 차단. User-Agent 추가로 우회 가능할 수 있음

### 4. Shopify Blog — 피드 URL 변경 (404)
- `https://www.shopify.com/blog/feed` → 404
- 새 URL 찾아서 DB 업데이트 필요

### 5. AdEspresso — 2023년 이후 업데이트 없음
- 비활성 처리하거나 제거

## 수정 요구사항

### A. 즉시 수정
1. **YouTube 피드 수집 활성화**: feed_type 필터에 "youtube" 추가, `parseYouTubeRSS` 함수 연결
2. **정상 RSS 소스 수집 복구**: fetchAndParseUrl 에러 로깅 강화, 타임아웃 확인, 실패해도 다음 소스로 넘어가는지 확인
3. **Shopify 새 RSS URL 찾아서 content_sources 테이블 업데이트**
4. **CXL Bot 차단 우회**: User-Agent 헤더 추가 시도, 안 되면 is_active=false
5. **AdEspresso**: is_active=false로 변경

### B. 재발 방지 (핵심)
1. **소스별 상세 에러 로깅**: 현재 "일부 소스 실패"만 남김 → 어떤 소스가 왜 실패했는지 상세 기록
   - cron_runs 테이블에 `details` JSONB 컬럼 추가 (또는 별도 테이블)
   - 소스별 { name, status, records, error } 배열로 저장
2. **수집 0건 알림**: records_count = 0이 2일 연속이면 경고 (크론 응답에 warning 포함)
3. **피드 헬스체크**: 각 소스 URL의 HTTP 상태를 주기적으로 체크
   - content_sources 테이블에 `last_success_at`, `consecutive_failures` 컬럼 추가
   - 3회 연속 실패 시 자동으로 is_active=false + 로그 남기기
4. **새 feed_type 추가 시 자동 포함**: feed_type 필터를 화이트리스트가 아닌, `is_active=true`만으로 조회하도록 변경

## 코드 위치
- 크론: `src/app/api/cron/collect-content/route.ts`
- RSS 파서: `src/lib/content-crawler.ts` (parseRSSFeed, parseYouTubeRSS, fetchAndParseUrl)
- DB: content_sources 테이블, cron_runs 테이블

### C. ROAS 벤치마크 계산 수정 (L3)
1. **가중 평균 ROAS로 변경**: 현재 일별 ROAS 단순 평균 → `총 매출 ÷ 총 광고비`로 변경
   - 현재: ad_id별로 일별 ROAS를 수집 → 평균 → 문제: spend=11원에 ROAS=4,454 같은 이상치가 평균을 왜곡
   - 수정: ad_id별 `SUM(revenue) / SUM(spend)` = 진짜 ROAS
2. **최소 광고비 기준**: 총 광고비가 너무 적은 광고는 벤치마크에서 제외 (예: total spend < 10,000원)
3. **코드 위치**: `services/creative-pipeline/benchmark.mjs` — `avg(entry.roasValues)` 부분
4. **수정 후 L3 재계산 실행**

### D. 콘텐츠 URL 중복 수집 방지 강화
1. **URL 정규화**: 수집 시 쿼리파라미터(utm 등) 제거 후 비교
   - `new URL(link)` → pathname만 추출 또는 utm_* 파라미터 제거
2. **제목 유사도 체크**: 같은 소스에서 동일 제목 글이 이미 있으면 skip
3. **코드 위치**: `src/app/api/cron/collect-content/route.ts` line 93~101

## 검증
- 수정 후 로컬에서 collect-content API 호출 → 12개 소스 전부 처리 확인
- 정상 소스에서 최소 1건 이상 새 콘텐츠 수집
- 에러 소스는 상세 로그에 실패 원인 기록
- tsc + lint 통과
