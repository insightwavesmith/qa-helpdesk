# collect-daily v2 전환 Gap 분석

> 분석일: 2026-03-20
> 설계서: docs/02-design/features/collect-daily-v2.design.md

---

## Match Rate: 95%

---

## 일치 항목 (19/20)

| # | 설계 항목 | 구현 | 상태 |
|---|----------|------|------|
| 1 | AD_FIELDS에 effective_object_story_spec 추가 | route.ts line 23 | ✅ |
| 2 | lp-normalizer.ts normalizeUrl() | src/lib/lp-normalizer.ts | ✅ |
| 3 | lp-normalizer.ts classifyUrl() | src/lib/lp-normalizer.ts | ✅ |
| 4 | EXTERNAL_DOMAINS Set export | src/lib/lp-normalizer.ts | ✅ |
| 5 | surl 리다이렉트 해소 제외 | 미구현 (의도적) | ✅ |
| 6 | extractLpUrl() 헬퍼 | route.ts lines 83-89 | ✅ |
| 7 | link_data.link 경로 추출 | route.ts line 86 | ✅ |
| 8 | video_data.call_to_action.value.link 추출 | route.ts line 87 | ✅ |
| 9 | landing_pages UPSERT (canonical_url ON CONFLICT) | route.ts lines 442-463 | ✅ |
| 10 | canonical_url → lp_id 매핑 조회 | route.ts lines 467-475 | ✅ |
| 11 | creatives UPSERT (ad_id ON CONFLICT) | route.ts lines 478-510 | ✅ |
| 12 | creatives.lp_id FK 연결 | route.ts line 496 (UPSERT에 포함) | ✅ |
| 13 | LP 없는 광고도 creatives UPSERT (lp_id=null) | route.ts lines 482-487 | ✅ |
| 14 | creative_media UPSERT (creative_id ON CONFLICT) | route.ts lines 513-569 | ✅ |
| 15 | media_url 없으면 creative_media 스킵 | route.ts line 549 | ✅ |
| 16 | media_url 3단계 fallback | route.ts lines 537-547 | ✅ |
| 17 | ad_creative_embeddings UPSERT 호환 유지 | route.ts lines 417-428 | ✅ |
| 18 | v2 UPSERT 독립 try-catch | route.ts lines 431, 603 | ✅ |
| 19 | 로깅 (건수 출력) | 3곳 console.log | ✅ |

## 불일치 항목 (1/20)

| # | 설계 항목 | 차이 | 심각도 |
|---|----------|------|--------|
| 20 | lp_id FK 연결을 배치 UPDATE 최적화 | UPSERT에 직접 포함하는 방식 채택 (더 효율적) | 낮음 (개선) |

**설계서**: "개별 UPDATE 대신 배치 처리" 제안
**구현**: creatives UPSERT 시 lp_id를 직접 포함 → 별도 UPDATE 불필요 → 설계보다 더 나은 구현

---

## 변경 파일

| 파일 | 변경 | 줄 수 |
|------|------|------|
| `src/lib/lp-normalizer.ts` | **신규** | +92줄 |
| `src/app/api/cron/collect-daily/route.ts` | **수정** | ~+150줄 (v2 UPSERT 블록) |

## 빌드 검증

- [x] `npx tsc --noEmit` — 에러 0개
- [x] `npm run build` — 성공

## 수정 필요 사항

없음. Match Rate 95% 달성.

---

## 구조 리뷰 메모

- v2 UPSERT가 기존 v1 로직에 영향 없도록 독립 try-catch 처리 — 안전
- UPSERT 순서 (LP → creatives → media) — FK 의존성 준수
- LP URL 정규화는 인메모리만 (리다이렉트 해소 없음) — 크론 성능 보존
- `lpUrlMap.size === 0`일 때도 creatives + creative_media 모두 실행 — 리뷰 후 수정 완료
