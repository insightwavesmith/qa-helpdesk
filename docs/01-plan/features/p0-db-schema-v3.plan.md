# P0-1: DB 스키마 v3 보강 Plan

> 작성일: 2026-03-22
> 근거: docs/04-review/master-architecture-review.md + 마스터 설계서 6탭
> 결정사항: project_master_architecture_decisions.md (Smith님 2026-03-22 확정)

---

## 이게 뭔지

마스터 설계서 기반으로 v2 테이블에 누락된 컬럼 추가 + 신규 테이블 2개 생성.
모든 후속 TASK(5축 분석, LP 다운로드, Mixpanel 클릭, 순환 학습)의 전제 조건.

## 왜 필요한지

마스터 설계서 리뷰 결과 현재 DB에 다음이 없음:
- creative_media: saliency_url, is_active, updated_at (분석 파이프라인 필수)
- landing_pages: content_hash, last_crawled_at (LP 변경 감지 필수)
- lp_analysis: reference_based, data_based, eye_tracking (LP 2축+시선 분석 필수)
- creative_lp_map: 기획서 스키마 컬럼 (소재↔LP 일관성 리뉴얼)
- lp_click_data: Mixpanel 클릭 데이터 저장 (신규 테이블)
- change_log: 변화→성과 추적 (신규 테이블)
- competitor_ad_cache: analysis_json (경쟁사 5축 분석 저장)
- creatives.source: 기존값 'bscamp' → 'member'로 통일 (3계층 구분)

## 현재 상태 (기존 컬럼 확인 완료)

### creatives (20260320_db_v2_normalized.sql)
```
source text DEFAULT 'bscamp'  -- 이미 존재. 'bscamp'→'member' 값 변경 + CHECK 추가 필요
```

### creative_media (20260320 + 20260321_analysis_columns)
```
존재: id, creative_id, media_type, media_url, storage_url, thumbnail_url,
      media_hash, file_size, duration_seconds, width, height, ad_copy,
      video_analysis, embedding, text_embedding, embedding_model, embedded_at,
      analysis_json, analyzed_at, analysis_model, created_at
없음: saliency_url, is_active, updated_at  ← 추가 필요
```

### landing_pages (20260320_landing_pages.sql)
```
존재: id, account_id, canonical_url, original_urls, domain, product_id,
      product_name, page_type, platform, is_active, ad_count, created_at, updated_at
없음: content_hash, last_crawled_at  ← 추가 필요
```

### lp_analysis (20260320_db_v2_normalized.sql)
```
존재: id, lp_id, viewport, conversion_score, hero_type, price_position, ... (flat 컬럼 20+개),
      dominant_color, color_palette, ..., raw_analysis, model_version,
      embedding, text_embedding, embedded_at, analyzed_at
없음: reference_based, data_based, eye_tracking  ← 추가 필요
```

### creative_lp_map (20260320_db_v2_normalized.sql)
```
존재: id, creative_id, lp_id, visual_score, video_score, semantic_score,
      cross_vt_score, cross_tv_score, holistic_score, total_score, analyzed_at
없음: message_alignment, cta_alignment, offer_alignment, overall_score, issues  ← 추가 필요
```

### lp_click_data — 테이블 없음 ← 신규 생성
### change_log — 테이블 없음 ← 신규 생성
### competitor_ad_cache — analysis_json 컬럼 없음 ← 추가 필요

---

## 구현 내용

**마이그레이션 파일**: `supabase/migrations/20260322_v3_schema_additions.sql`

### 1. creatives.source 값 통일

```sql
-- 기존 'bscamp' → 'member'로 변경 (3계층 구분: member/benchmark/competitor)
UPDATE creatives SET source = 'member' WHERE source = 'bscamp';
ALTER TABLE creatives ALTER COLUMN source SET DEFAULT 'member';

-- CHECK 제약 추가 (source 값 제한)
ALTER TABLE creatives DROP CONSTRAINT IF EXISTS chk_creatives_source;
ALTER TABLE creatives ADD CONSTRAINT chk_creatives_source
  CHECK (source IN ('member', 'benchmark', 'competitor'));
```

**⚠️ 영향 범위 확인 필요**: 기존 코드에서 `source = 'bscamp'` 조건으로 쿼리하는 곳

### 2. creative_media 컬럼 추가

```sql
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS saliency_url text;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE creative_media ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- updated_at 자동 갱신 트리거
CREATE TRIGGER update_creative_media_updated_at
  BEFORE UPDATE ON creative_media
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN creative_media.saliency_url IS 'DeepGaze 시선 히트맵 URL (saliency/{account_id}/{ad_id}.png)';
COMMENT ON COLUMN creative_media.is_active IS '활성 상태 (creatives.is_active와 연동)';
```

### 3. landing_pages 컬럼 추가

```sql
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS content_hash text;
ALTER TABLE landing_pages ADD COLUMN IF NOT EXISTS last_crawled_at timestamptz;

COMMENT ON COLUMN landing_pages.content_hash IS 'LP 콘텐츠 SHA-256 해시 (변경 감지용)';
COMMENT ON COLUMN landing_pages.last_crawled_at IS '마지막 크롤링 시각';
```

### 4. lp_analysis 컬럼 추가

```sql
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS reference_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS data_based jsonb;
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS eye_tracking jsonb;

COMMENT ON COLUMN lp_analysis.reference_based IS '레퍼런스 기반 분석 (8개 카테고리 JSONB)';
COMMENT ON COLUMN lp_analysis.data_based IS '데이터 기반 분석 (전환율 교차 JSONB, Phase 2)';
COMMENT ON COLUMN lp_analysis.eye_tracking IS 'DeepGaze LP 시선 분석 (섹션별 weight + fixation)';
```

### 5. creative_lp_map 컬럼 추가

```sql
-- 기획서 스키마 컬럼 (기존 v1 컬럼 유지 + 신규 병행)
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS message_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS cta_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS offer_alignment float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS overall_score float;
ALTER TABLE creative_lp_map ADD COLUMN IF NOT EXISTS issues jsonb;

COMMENT ON COLUMN creative_lp_map.message_alignment IS '메시지 일관성 점수 0-100';
COMMENT ON COLUMN creative_lp_map.issues IS '불일치 이슈 배열 [{type, severity, description, action}]';
```

### 6. lp_click_data 신규 테이블

```sql
CREATE TABLE IF NOT EXISTS lp_click_data (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id           uuid NOT NULL REFERENCES landing_pages(id) ON DELETE CASCADE,
  click_x         float NOT NULL,
  click_y         float NOT NULL,
  page_width      int,
  page_height     int,
  element_tag     text,                     -- a, button, div, img
  element_text    text,                     -- "구매하기", "리뷰 더보기"
  element_selector text,                    -- CSS selector (DOM 계층)
  section         text,                     -- Gemini 구조와 매칭된 섹션명
  device          text,                     -- mobile / desktop
  referrer        text,                     -- UTM 등 유입 경로
  mixpanel_user_id text,                    -- Mixpanel distinct_id
  clicked_at      timestamptz NOT NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_lcd_lp_id ON lp_click_data(lp_id);
CREATE INDEX idx_lcd_section ON lp_click_data(section);
CREATE INDEX idx_lcd_clicked_at ON lp_click_data(clicked_at DESC);

-- RLS
ALTER TABLE lp_click_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lcd" ON lp_click_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_lcd" ON lp_click_data
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE lp_click_data IS 'Mixpanel Autocapture 클릭 데이터. LP별 실제 클릭 좌표+요소 저장.';
```

### 7. change_log 신규 테이블

```sql
CREATE TABLE IF NOT EXISTS change_log (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type         text NOT NULL CHECK (entity_type IN ('creative', 'lp')),
  entity_id           uuid NOT NULL,
  account_id          text NOT NULL,
  change_detected_at  timestamptz DEFAULT now(),
  change_type         text CHECK (change_type IN ('element_added', 'element_removed', 'element_modified', 'new_version')),
  element_diff        jsonb,                  -- 변경 전후 속성 diff
  performance_before  jsonb,                  -- 변경 전 7일 평균 성과
  performance_after   jsonb,                  -- 변경 후 7일 평균 성과
  performance_change  jsonb,                  -- 차이 (절대값 + %)
  confidence          text CHECK (confidence IN ('low', 'medium', 'high')),
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_cl_entity ON change_log(entity_type, entity_id);
CREATE INDEX idx_cl_account ON change_log(account_id);
CREATE INDEX idx_cl_detected ON change_log(change_detected_at DESC);

-- RLS
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cl" ON change_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read_cl" ON change_log
  FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE change_log IS '소재/LP 변화 이력. 변경 감지 → 요소 diff → 성과 변화 추적 (순환 학습).';
```

### 8. competitor_ad_cache.analysis_json 추가

```sql
-- Smith님 결정: competitor_ad_cache 별도 유지. analysis_json 컬럼만 추가.
ALTER TABLE competitor_ad_cache ADD COLUMN IF NOT EXISTS analysis_json jsonb;

COMMENT ON COLUMN competitor_ad_cache.analysis_json IS '5축 분석 결과 (creative_media.analysis_json과 동일 스키마)';
```

---

## 영향 범위 사전 조사

### creatives.source = 'bscamp' 참조 코드

확인해야 할 파일:
- `src/app/api/cron/collect-daily/route.ts` — creatives UPSERT 시 source 값
- `supabase/migrations/20260320_db_v2_normalized.sql` — DEFAULT 'bscamp'
- `search_similar_creatives_v2()` RPC — `filter_source` 파라미터
- `get_student_creative_summary()` RPC — `c.source = 'bscamp'` 조건
- `creatives_compat_v1` VIEW — source 컬럼 노출

**필수 변경**: RPC 2개 + VIEW 1개 + route.ts에서 'bscamp' → 'member' 변경

### competitor_ad_cache 현재 구조

확인해야 할 파일:
- `src/app/api/cron/analyze-competitors/route.ts` — element_analysis 컬럼 사용
- 마이그레이션 파일에서 competitor_ad_cache 정의

---

## 변경 파일 목록

| 파일 | 변경 | 설명 |
|------|------|------|
| `supabase/migrations/20260322_v3_schema_additions.sql` | **신규** | 위 SQL 전부 |
| `src/app/api/cron/collect-daily/route.ts` | **수정** | source: 'bscamp' → 'member' |
| `supabase/migrations/20260320_db_v2_normalized.sql` | **수정 불가** (이미 실행됨) | — |

**⚠️ RPC/VIEW 수정**: 마이그레이션 파일 안에서 CREATE OR REPLACE로 재정의
- `search_similar_creatives_v2()`: filter_source 'bscamp' 대응 (하위 호환 OR 일괄 변경)
- `get_student_creative_summary()`: `c.source = 'bscamp'` → `c.source = 'member'`
- `creatives_compat_v1` VIEW: 변경 불필요 (source 그대로 노출)

---

## 실행 순서

```
1. 코드에서 'bscamp' 참조 전부 탐색 (grep)
2. 마이그레이션 SQL 작성
3. Supabase Dashboard에서 SQL 실행 (또는 CLI)
4. collect-daily/route.ts에서 source 값 변경
5. RPC 2개 재정의 (마이그레이션에 포함)
6. tsc + build 통과 확인
```

## 리스크

| 리스크 | 대응 |
|--------|------|
| source 'bscamp'→'member' 변경 시 기존 쿼리 깨짐 | 변경 전 grep으로 모든 참조 확인 |
| competitor_ad_cache 테이블 구조 모름 (마이그레이션에서 확인 필요) | 실행 전 현재 컬럼 확인 |
| lp_click_data 대량 INSERT 성능 | 인덱스 3개면 충분. 파티셔닝은 데이터 10만건 넘으면 고려 |
| change_log entity_id FK 없음 (creative/lp 둘 다 가능) | 의도적 소프트 FK. entity_type으로 구분 |

## 완료 조건

- [ ] SQL 실행 성공 (에러 0)
- [ ] `creative_media` 컬럼 확인: saliency_url, is_active, updated_at
- [ ] `landing_pages` 컬럼 확인: content_hash, last_crawled_at
- [ ] `lp_analysis` 컬럼 확인: reference_based, data_based, eye_tracking
- [ ] `creative_lp_map` 컬럼 확인: message_alignment, cta_alignment, offer_alignment, overall_score, issues
- [ ] `lp_click_data` 테이블 생성 확인
- [ ] `change_log` 테이블 생성 확인
- [ ] `competitor_ad_cache.analysis_json` 컬럼 확인
- [ ] `creatives.source` 기존 데이터 'bscamp' → 'member' 변경 확인
- [ ] RPC `get_student_creative_summary` 'member' 조건 확인
- [ ] `tsc + build` 통과
- [ ] 기존 기능 깨지지 않음 (collect-daily, creatives 페이지 등)

## 예상 작업량

- SQL 작성 + 실행: 30분
- source 'bscamp' → 'member' 코드 변경: 30분
- 검증: 30분
- **합계: ~1.5시간**
