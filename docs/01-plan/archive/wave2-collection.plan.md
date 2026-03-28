# Wave 2-3: 수집 입구 변경 + 하류 수정 Plan

## 개요
creative_media 1:N 전환 (Wave 1 완료) 후, 수집 로직과 하류 파이프라인을 CAROUSEL 다중 슬라이드에 대응시킴.

## 선행 조건
- Wave 1 스키마 변경 완료 (position, card_total 컬럼 추가, UNIQUE(creative_id,position))
- Migration 적용 완료

## 범위

### Wave 2: 수집 입구 (T3~T6)
| TASK | 내용 | 파일 |
|------|------|------|
| T3 | CAROUSEL 분류 + 카드 추출 | creative-type.ts, carousel-cards.ts (신규) |
| T4 | collect-daily CAROUSEL 저장 | collect-daily/route.ts |
| T5 | collect-benchmark 통일 | collect-benchmark-creatives.mjs |
| T6 | backfill 크론 (90일) | admin/protractor/collect/route.ts |

### Wave 3: 하류 수정 (T7~T10)
| TASK | 내용 | 파일 |
|------|------|------|
| T7 | reach 합산 버그 수정 | overlap/route.ts, backfill/route.ts, insights-precompute.ts |
| T8 | embed-creatives 카드별 | embed-creatives/route.ts, ad-creative-embedder.ts |
| T9 | analyze-five-axis 카드별 | analyze-five-axis.mjs |
| T10 | creative-saliency 카드별 | creative-saliency/route.ts |

## 성공 기준
1. tsc + build 통과
2. 기존 IMAGE/VIDEO 수집 로직 영향 없음
3. CAROUSEL 광고 → creative_media N행 저장 정상
4. reach 합산 → MAX(reach) 전환
5. 하류 파이프라인 카드별 처리 대응

## 의존성
```
T3 → T4, T5 (CAROUSEL 분류/추출 필요)
T4 → T6 (runCollectDaily 재사용)
T3 → T7~T10 (creative_media N행 전제)
```

## 팀 배정
- backend-dev: T3, T4, T5, T6, T7, T8, T9, T10
- qa-engineer: tsc + build + Gap 분석
