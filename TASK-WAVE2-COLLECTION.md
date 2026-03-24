# TASK: Wave 2 — 수집 입구 변경 (CAROUSEL + backfill)

> CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라
> 코드리뷰 보고서: docs/03-analysis/collection-review.analysis.md 참조
> Wave 1 완료 전제 (스키마 변경 완료)

## T3: creative-type.ts CAROUSEL 분류

`src/lib/protractor/creative-type.ts` 수정:
- object_story_spec.template_data 존재 → CAROUSEL
- asset_feed_spec.images 2개 이상 (product_set_id 없음) → CAROUSEL
- 기존 IMAGE/VIDEO/CATALOG 분기 유지

### CAROUSEL 카드 추출 함수 신규 생성
`src/lib/protractor/carousel-cards.ts` (신규):
- extractCarouselCards(ad) → Array<{imageHash, imageUrl, videoId, lpUrl, position}>
- template_data.elements 우선, fallback으로 asset_feed_spec.images

## T4: collect-daily CAROUSEL 다중 슬라이드 저장

`src/app/api/cron/collect-daily/route.ts` 수정:
- Step 3 (creative_media UPSERT) 에서:
  - CAROUSEL이면 extractCarouselCards()로 카드 배열 추출
  - 각 카드를 creative_media에 position별로 INSERT
  - card_total 설정
  - onConflict → "creative_id,position" (Wave 1에서 UNIQUE 변경됨)
- IMAGE/VIDEO는 기존대로 position=0, card_total=1

## T5: collect-benchmark getCreativeType 통일 + LP fallback

`scripts/collect-benchmark-creatives.mjs` 수정:
- 하드코딩 VIDEO/IMAGE → getCreativeType() 공용 함수 import
- LP URL 추출: extractLpUrl() 사용 (asset_feed_spec fallback 포함)
- CAROUSEL 카드별 creative_media 저장 대응

## T6: 초기 수집 backfill 크론

기존 `src/app/api/admin/protractor/collect/route.ts` 또는 신규 엔드포인트:
- mode=backfill&account_id=xxx 파라미터
- 최근 90일 일별 데이터 수집
- collect-daily의 runCollectDaily() 재사용 (날짜 파라미터 전달)
- rate limit 고려: 1초 간격
- 콘텐츠: active 광고만

## 검증
1. tsc + build 통과
2. 기존 IMAGE/VIDEO 수집 로직 영향 없음 확인
3. CAROUSEL 광고가 있는 계정으로 테스트 가능하면 실행
