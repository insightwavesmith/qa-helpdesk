# collect-daily v2 전환 계획서

> 작성: Leader | 2026-03-20
> TASK: TASK-phase2-execution.md STEP 1

---

## 1. 이게 뭔지

collect-daily 크론이 `ad_creative_embeddings`(v1 통합 테이블)에 UPSERT하던 것을
정규화된 v2 테이블(`creatives`, `creative_media`, `landing_pages`)에 직접 INSERT/UPDATE하도록 전환.

## 2. 왜 필요한지

- **v1 문제**: `ad_creative_embeddings`는 77개 컬럼 통합 테이블. 소재 메타, 성과, LP, 임베딩이 뒤섞임
- **이중 크론**: collect-daily와 embed-creatives가 같은 테이블에 UPSERT → 경쟁/덮어쓰기
- **v2 테이블 이미 존재**: creatives 3,096건, creative_media 2,883건, landing_pages 166건 seed 완료
- **v2 테이블 갱신 안 됨**: 현재 크론은 v1만 업데이트 → v2 테이블이 점점 stale해짐
- 기획서(mozzi-reports) 1순위 개선안: "collect-daily를 v2 테이블로 전환 (이중화 해소)"

## 3. 범위

### IN SCOPE
- `runCollectDaily()` 내 creativeRows 구성 후 UPSERT 대상에 `creatives` + `creative_media` 추가
- LP URL 추출 → `landing_pages` UPSERT → `creatives.lp_id` FK 연결
- `ad_creative_embeddings` UPSERT는 **그대로 유지** (호환성, 크론/프론트 참조)
- embed-creatives 크론도 `creative_media.embedding` 컬럼 사용으로 전환

### OUT OF SCOPE
- `ad_creative_embeddings` 테이블 삭제 (아직 프론트/다른 크론이 참조)
- 기존 L1/L2/L4 테이블 구조 변경
- analysis_json 통합 (STEP 5에서 처리)

## 4. 성공 기준

- [ ] collect-daily 실행 후 `creatives` 테이블에 신규/갱신 건수 로깅
- [ ] collect-daily 실행 후 `creative_media` 테이블에 media_url 있는 건 UPSERT
- [ ] LP URL 있는 광고 → `landing_pages` UPSERT + `creatives.lp_id` FK 연결
- [ ] `ad_creative_embeddings` UPSERT도 여전히 동작 (호환)
- [ ] tsc + lint + build 통과
- [ ] dry-run 가능한 테스트 모드

## 5. 의존성

- `creatives` 테이블: 이미 존재 (ad_id UNIQUE, account_id FK)
- `creative_media` 테이블: 이미 존재 (ad_id FK to creatives)
- `landing_pages` 테이블: 이미 존재 (canonical_url UNIQUE)
- `normalize-lps.mjs`의 URL 정규화 로직 재사용

## 6. 위험요소

| 위험 | 영향 | 완화 |
|------|------|------|
| creatives UPSERT 실패 시 daily_ad_insights도 영향 | 중 | v2 UPSERT를 별도 try-catch, v1 먼저 실행 |
| LP URL 정규화 비용 (리다이렉트 해소) | 중 | surl만 리다이렉트, 나머지는 인메모리 정규화 |
| creative_media ad_id FK가 creatives에 없는 경우 | 중 | creatives UPSERT 먼저, 그 다음 creative_media |

## 7. 구현 순서

1. **Design 문서 작성** — 데이터 흐름, UPSERT 순서, LP 정규화 로직
2. **collect-daily/route.ts 수정** — creativeRows 빌드 후 v2 테이블 UPSERT 추가
3. **LP URL 추출 + 정규화 모듈** — normalize-lps.mjs 로직을 TypeScript 모듈로 분리
4. **embed-creatives 전환** — creative_media.embedding 컬럼으로 UPSERT
5. **검증** — dry-run + 실 실행 후 건수 비교
6. **Gap 분석**

## 8. 관련 파일

- `src/app/api/cron/collect-daily/route.ts` — 수정 대상 (533줄)
- `src/lib/protractor/creative-image-fetcher.ts` — 이미 사용 중 (media_url 해소)
- `src/lib/protractor/creative-type.ts` — 이미 사용 중 (getCreativeType)
- `scripts/normalize-lps.mjs` — LP URL 정규화 로직 참조
- `src/app/api/cron/embed-creatives/route.ts` — v2 전환 대상
