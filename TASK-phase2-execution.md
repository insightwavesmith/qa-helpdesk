# TASK: Phase 2 실행 — 기획서 기반 개발

## ⚠️ 필수 선행
1. `docs/adr/ADR-001-account-ownership.md` 읽어라
2. `~/.openclaw/workspace/SERVICE-VISION.md` 읽어라
3. 기획서: mozzi-reports.vercel.app/reports/plan/2026-03-20-full-architecture.html (병목·개선 탭)

## 실행 순서 (우선순위대로)

### STEP 1: collect-daily v2 전환 (최우선)
현재 collect-daily가 ad_creative_embeddings(v1)에 UPSERT하고 있음.
→ creatives + creative_media + daily_ad_insights에 직접 INSERT/UPDATE하도록 수정.

구체적 변경:
- `runCollectDaily()` 함수에서 `ad_creative_embeddings` UPSERT 부분을:
  1. `creatives` UPSERT (ad_id, account_id, creative_type, brand_name, is_active)
  2. `creative_media` UPSERT (media_url, media_type, media_hash)
  3. LP URL 있으면 `landing_pages` UPSERT (canonical_url, account_id)
  4. `creatives.lp_id` 연결
- 기존 ad_creative_embeddings UPSERT는 **그대로 유지** (호환성, 당분간 양쪽에 넣기)
- embed-creatives도 creative_media.embedding으로 전환

### STEP 2: creative_media.analysis_json 컬럼 추가
```sql
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analysis_json jsonb;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analyzed_at timestamptz;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS analysis_model text;
```

### STEP 3: 영상 mp4 다운로드 재개
download-videos.mjs 수정사항:
- Storage 경로: `creatives/{account_id}/video/{ad_id}.mp4` (ADR-001)
- Meta API: `/act_{account_id}/advideos?fields=id,source,length` 방식 (video_id 직접 조회 아님)
- 현재 136/225건 완료 → 나머지 89건 다운로드

### STEP 4: 이미지 Storage 경로 이동
기존 `creatives/media/{ad_id}.jpg` → `creatives/{account_id}/media/{ad_id}.jpg`
- 2,709건 이동 스크립트
- creative_media.storage_url 업데이트
- ad_creative_embeddings.storage_url도 같이 업데이트 (호환)

### STEP 5: 5축 분석 배치 스크립트
Gemini 3.1 Pro Preview로 전체 소재 분석:
- 이미지: 원본 이미지 → 5축 JSON → creative_media.analysis_json
- 영상: mp4 → File API 업로드 → 5축 JSON → creative_media.analysis_json
- JSON 스키마: ~/.openclaw/workspace/memory/2026-03-20-video-analysis.md 참조
- 배치 처리: Rate Limit 준수, 야간 실행
- 기존 L1/L2/L4 테이블은 건드리지 마 (deprecated 마킹만)

### STEP 6: lp_structure_analysis → lp_analysis 이관
90건 변환 이관. lp_url → landing_pages.id FK 매칭.

### STEP 7: creative_lp_consistency → creative_lp_map 이관
170건 변환 이관. ad_id → creatives.id, lp_url → landing_pages.id FK 매칭.

## 하지 말 것
- 기존 ad_creative_embeddings 삭제 금지 (아직 크론이 참조)
- 기존 L1/L2/L4 테이블 삭제 금지 (deprecated 마킹만)
- v1 크론을 한번에 전환하지 마 — collect-daily부터 하나씩
- PDCA 건너뛰지 마 — Plan 문서 먼저 작성

## 빌드 통과 필수
tsc + lint + build 전부 통과해야 커밋 가능.
