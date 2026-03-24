# Wave 2-3: 수집 입구 변경 + 하류 수정 설계서

## 1. 데이터 모델

### creative_media (Wave 1 완료)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| position | INT DEFAULT 0 | 카드 순서 (0-based) |
| card_total | INT DEFAULT 1 | CAROUSEL 총 카드 수 |
| lp_id | UUID FK | 카드별 LP (nullable) |
- UNIQUE(creative_id, position)

## 2. T3: creative-type.ts CAROUSEL 분류

### getCreativeType() 수정
```
우선순위 (위→아래):
1. oss.template_data 존재 → CAROUSEL
2. afs.images 2개이상 + product_set_id 없음 → CAROUSEL
3. SHARE + video 존재 → VIDEO
4. productSetId → CATALOG
5. videoId → VIDEO
6. oss.video_data → VIDEO
7. afs.videos → VIDEO
8. imageHash + !productSetId → IMAGE
9. fallback → IMAGE
```

TypeScript 타입에 `template_data`, `images` 필드 추가 필요.

### carousel-cards.ts (신규)
```typescript
export function extractCarouselCards(ad: Record<string, unknown>): Array<{
  imageHash: string | null;
  imageUrl: string | null;
  videoId: string | null;
  lpUrl: string | null;
  position: number;
}>
```
- `oss.template_data.elements` 우선 순회
- fallback: `afs.images` 배열 순회
- 빈 배열 반환 시 단일 미디어로 처리 (position=0)

## 3. T4: collect-daily CAROUSEL 저장

### Step 3 수정 (creative_media UPSERT)
```
기존: ads.map → 1광고=1미디어 (position=0)
변경:
  if CAROUSEL:
    cards = extractCarouselCards(ad)
    for card in cards:
      mediaRow = { creative_id, position: card.position, card_total: cards.length, ... }
  else:
    mediaRow = { creative_id, position: 0, card_total: 1, ... } (기존)
```

CAROUSEL 카드 이미지 URL:
- imageHash → hashToUrl 매핑 사용 (기존 fetchImageUrlsByHash 재사용)
- videoId → videoThumbMap 사용 (기존 fetchVideoThumbnails 재사용)

## 4. T5: collect-benchmark 통일

### 변경사항
1. `creativeType = storyVideoId ? "VIDEO" : "IMAGE"` → `getCreativeType(adData)` 사용
   - `.mjs` 파일이므로 직접 import 불가 → 인라인 CAROUSEL 감지 로직 추가
2. LP URL 추출: `extractLpUrl()` 3단계 fallback 동일하게 적용
   - 기존: oss.link_data + oss.video_data 2단계만
   - 추가: asset_feed_spec.link_urls / call_to_actions fallback
3. CAROUSEL일 때 카드별 creative_media N행 저장
   - template_data.elements 순회 → position별 INSERT

## 5. T6: backfill 크론

### API 변경
```
POST /api/admin/protractor/collect
Body: { mode: "backfill", accountId: "xxx", days: 90 }
```

### 로직
```
1. mode=backfill 파라미터 감지
2. 90일 범위 날짜 배열 생성 [today-90, ..., yesterday]
3. for each date:
   a. runCollectDaily(date, undefined, accountId) 호출
   b. await delay(1000) — rate limit
4. SSE로 진행 상황 스트리밍
```

runCollectDaily()를 collect-daily/route.ts에서 export하여 재사용.

## 6. T7: reach 합산 버그 수정

### 3곳 수정
| 파일 | 현재 | 수정 |
|------|------|------|
| overlap/route.ts:176 | reach 합산 | MAX(reach) |
| backfill/route.ts:377 | reach 합산 | MAX(reach) |
| insights-precompute.ts:188 | acc.reach += row.reach | acc.reach = Math.max(acc.reach, row.reach) |

## 7. T8: embed-creatives 카드별 임베딩

### ad-creative-embedder.ts 수정
- `maybeSingle()` → `.eq("position", position)` 추가
- CAROUSEL: 각 카드(position)별 독립 임베딩 생성
- IMAGE/VIDEO: 기존대로 position=0

### embed-creatives/route.ts 수정
- creative_media 쿼리: 단일 → N행 대응
- 루프: position별 순회하며 임베딩

## 8. T9: analyze-five-axis 카드별 5축

### analyze-five-axis.mjs 수정
- creative_media 쿼리: `limit=1` 제거 → 전체 position 조회
- CAROUSEL: 카드별 5축 분석 결과 저장
  - analysis_json에 position 포함: `{ position: 0, axes: {...} }`
- IMAGE/VIDEO: 기존대로 (position=0)

## 9. T10: creative-saliency 카드별 DeepGaze

### creative-saliency/route.ts 수정
- creative_media N행 조회
- CAROUSEL: 이미지 카드만 DeepGaze 실행 (video 카드 스킵)
- 카드별 saliency_map 저장

## 10. 에러 처리
| 상황 | 처리 |
|------|------|
| CAROUSEL인데 카드 0개 | position=0 단일 미디어로 fallback |
| 카드 이미지 URL 없음 | 해당 카드 스킵, 나머지 계속 |
| backfill 중간 실패 | 실패 날짜 로깅 후 계속 |
| reach MAX 결과 0 | null 반환 |

## 11. 구현 순서
```
1. T3: creative-type.ts + carousel-cards.ts (공용 모듈)
2. T4 + T5: collect-daily + collect-benchmark (병렬)
3. T6: backfill 크론
4. T7: reach 버그 수정
5. T8 + T9 + T10: 하류 파이프라인 (병렬)
6. tsc + build + Gap 분석
```
