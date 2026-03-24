# Wave 2-3 Gap 분석

**검토일**: 2026-03-24
**설계서**: docs/02-design/features/wave2-collection.design.md
**범위**: T3~T10

## Match Rate: 95%

## 일치 항목

| # | 설계 항목 | 구현 | 상태 |
|---|----------|------|:----:|
| 1 | T3: CAROUSEL 분류 (template_data + afs.images >= 2) | creative-type.ts 수정 완료 | ✅ |
| 2 | T3: carousel-cards.ts 신규 (extractCarouselCards) | carousel-cards.ts 생성 완료 | ✅ |
| 3 | T4: collect-daily CAROUSEL 카드별 N행 | route.ts Step 3 수정 완료 | ✅ |
| 4 | T4: IMAGE/VIDEO position=0 유지 | 기존 로직 보존 확인 | ✅ |
| 5 | T5: getCreativeType 인라인 (mjs) | collect-benchmark-creatives.mjs 추가 | ✅ |
| 6 | T5: extractLpUrl 3단계 fallback | afs.link_urls + call_to_actions 추가 | ✅ |
| 7 | T5: CAROUSEL 카드별 creative_media | 카드별 sbUpsert 구현 | ✅ |
| 8 | T6: backfill mode 추가 | admin/protractor/collect 수정 완료 | ✅ |
| 9 | T6: runCollectDaily 재사용 | collect-daily에서 import 확인 | ✅ |
| 10 | T7: reach 합산 → MAX | insights-precompute.ts 수정 (나머지 2곳은 이미 정상) | ✅ |
| 11 | T8: embed position별 처리 | ad-creative-embedder.ts + embed-creatives 수정 | ✅ |
| 12 | T9: 5축 분석 카드별 | analyze-five-axis.mjs position 추가 | ✅ |
| 13 | T10: DeepGaze 이미지 카드만 | creative-saliency VIDEO 스킵 | ✅ |

## 불일치 항목

| # | 항목 | 상태 | 비고 |
|---|------|:----:|------|
| 1 | T10: creative_saliency 테이블에 position 컬럼 없음 | ⚠️ | ad_id UNIQUE 제약 → 같은 ad_id의 카드별 독립 저장 불가. 향후 스키마 변경 필요 |

## 빌드 검증

| 항목 | 결과 |
|------|:----:|
| tsc --noEmit | ✅ 에러 0 |
| npm run build | ✅ 성공 |
| lint 신규 에러 | ✅ 없음 (기존 53개는 require/this-alias, 변경 무관) |

## 수정 필요

- creative_saliency 테이블에 position 컬럼 추가 (향후 Wave 4 과제)
- 현재는 position=0 기준 saliency만 저장, CAROUSEL 카드별 독립 저장은 스키마 변경 후 가능
