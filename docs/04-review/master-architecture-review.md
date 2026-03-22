# 마스터 설계서 리뷰

> 기획서: mozzi-reports.vercel.app/reports/plan/2026-03-21-master-architecture.html (6탭, 1,955줄)
> 리뷰 기준: 현재 코드베이스 (2026-03-22 main 브랜치)
> 비교 범위: DB 마이그레이션 77개, API 라우트 96개, 서버 액션 18개, lib 90+개, services/ 4개

---

## 전체 요약

| 탭 | 기획서 항목 수 | 구현 완료 | 부분 구현 | 미구현 | Match Rate |
|----|-------------|----------|----------|--------|-----------|
| 1. 전체 아키텍처 | 12 | 5 | 3 | 4 | ~50% |
| 2. 수집 | 18 | 8 | 4 | 6 | ~55% |
| 3. 저장 | 14 | 7 | 3 | 4 | ~60% |
| 4. LP 분석 | 16 | 3 | 2 | 11 | ~25% |
| 5. 광고 소재 분석 | 15 | 5 | 3 | 7 | ~40% |
| 6. 순환 학습 | 8 | 1 | 1 | 6 | ~15% |
| **전체** | **83** | **29** | **16** | **38** | **~42%** |

---

## 탭 1: 전체 아키텍처

### 구현 가능성

| 기획서 항목 | 현재 상태 | 바꿔야 할 것 |
|-----------|----------|------------|
| 수집: Daily 40계정 | ✅ collect-daily 4배치 분할 (route.ts 705줄) | 없음 |
| 수집: Benchmark 51계정 | ✅ collect-benchmarks (664줄), 주간 | 콘텐츠 수집 추가 필요 |
| 수집: 경쟁사 64브랜드 | ✅ competitor-check + analyze-competitors | 5축 스키마 통합 필요 (T11) |
| 수집: LP 119개 전체 다운로드 | ❌ 스크린샷만 (crawl-lps 291줄) | 전면 재설계 (T4) |
| 수집: Mixpanel 클릭 | ❌ 스크롤/체류만 (collect-mixpanel 155줄) | 신규 크론 + lp_click_data 테이블 |
| 저장: 3계층 (member/benchmark/competitor) | 🟡 creatives 테이블에 source 컬럼 없음 | ALTER TABLE creatives ADD source TEXT |
| 분석: 4축/5축 Gemini | 🟡 L1(analyze.mjs) 5축 있으나 기획서 스키마와 다름 | T2에서 스키마 재설계 |
| 분석: DeepGaze 시선 | ✅ creative_saliency 2,711건, predict.py | 영상 프레임별 확장 필요 |
| 분석: 총가치각도기 3축 매핑 | 🟡 metric-groups.ts에 3축 정의 있으나 소재 속성과 매핑 없음 | Phase 2 데이터 축적 후 |
| 순환 학습: change_log | ❌ 테이블 없음 | 신규 테이블 + 변화 감지 로직 |
| Phase 로드맵 | — | 기획서 Phase 1/2/3 구분 합리적 |
| 실행 환경: M4 Max 로컬 | ❌ 현재 Railway + Vercel | **아래 별도 분석** |

### 🔴 핵심 차이: 실행 환경 전환

기획서: "M4 Max 32GB RAM 로컬. Railway 불필요. DeepGaze(MPS), Gemini(API), ffmpeg, Playwright 전부 로컬."

현재:
- DeepGaze: Railway 서비스 (`services/creative-pipeline/saliency/predict.py`)
- Gemini 분석: Railway 서비스 (`services/creative-pipeline/analyze.mjs`)
- 크론: Vercel Cron → API 라우트

**영향**:
- Railway → 로컬 전환 시 cron 트리거 방식 변경 필요 (Vercel Cron → launchd/crontab)
- 또는 Vercel Cron은 유지하되 Railway 대신 로컬 스크립트 직접 실행
- DeepGaze MPS 가속은 Apple Silicon에서만 → 로컬 전용 (배포 환경 불가)
- **제안**: 크론 트리거는 Vercel 유지, 무거운 분석(DeepGaze/ffmpeg)만 로컬 스크립트로 분리

---

## 탭 2: 수집

### 구현 가능성

| 기획서 항목 | 현재 상태 | 변경 필요 |
|-----------|----------|----------|
| Daily 28개 지표 수집 | ✅ collect-daily/route.ts + calculateMetrics | — |
| AD_FIELDS (creative detail) | ✅ object_type, video_id, image_hash, asset_feed_spec 수집 | — |
| INSIGHT_FIELDS (28개) | ✅ 3초시청률, 완시청률, 잔존율, CTR 등 | 일부 필드 누락 확인 필요 |
| creatives + creative_media UPSERT | ✅ dual write (v1+v2) | — |
| landing_pages URL 정규화 | ✅ lp-normalizer.ts | — |
| 이미지 Storage 다운로드 | ✅ 2,709건 완료 | — |
| 영상 mp4 다운로드 | 🟡 150/261건 (58%). 별도 스크립트 | **collect-daily에서 즉시 다운** |
| Benchmark 성과 수집 | ✅ collect-benchmarks, 주간 | — |
| Benchmark 콘텐츠 수집 | ❌ 숫자만. 이미지/영상/LP 미수집 | **신규 기능** (아래 상세) |
| 경쟁사 Ad Library 수집 | ✅ competitor-check 192줄 | — |
| LP 전체 다운로드 | ❌ 스크린샷만 | **T4 전면 재설계** |
| Mixpanel 클릭 수집 | ❌ 미구현 | **신규 크론** |
| 벤치마크 수치 체크 → 콘텐츠 풀 자동 추가 | ❌ 미구현 | **신규 로직** |
| UNKNOWN 포함 성과 기반 선별 | ❌ ABOVE_AVERAGE만 사용 | collect-benchmarks 로직 수정 |

### 🔴 빠진 것 #1: 벤치마크 콘텐츠 수집

기획서 핵심: "벤치마크 수치 넘는 광고의 콘텐츠(이미지/영상/LP) 수집 → 5축 분석"

현재 `collect-benchmarks/route.ts`:
- `ad_insights_classified`에 ad_id + 13개 성과 지표만 저장
- 이미지/영상 URL 미저장, Storage 미다운로드
- ad_id는 있으므로 Marketing API로 creative detail 가져올 수 있음

**구현 방법**:
```
collect-benchmarks 크론 확장:
1. ad_insights_classified 저장 (기존)
2. 각 지표별 벤치마크 수치와 비교
3. 넘는 광고의 ad_id 추출
4. Marketing API /ads?fields=creative{image_url,video_id,...}
5. 이미지/영상 다운로드 → Storage benchmark/{account_id}/
6. creatives UPSERT (source='benchmark')
7. 임베딩 + 5축 분석 큐에 등록
```

**비회원 ad_accounts 처리** (기획서 명시):
- 비회원 33개 계정은 현재 `ad_accounts`에 없음
- 기획서: "ad_accounts에 user_id=NULL로 INSERT" → FK 정상 작동 + Storage 경로 통일
- **구현**: collect-benchmarks에서 새 계정 발견 시 자동 INSERT

### 🔴 빠진 것 #2: 영상 mp4 즉시 다운로드

기획서: "collect-daily에서 즉시 다운해야 Meta URL 만료 전에 잡을 수 있음"
현재: 별도 스크립트(`scripts/download-videos.mjs`)로 나중에 → URL 만료 문제

**구현**: collect-daily/route.ts의 미디어 처리 단계에서 video_id 있으면 즉시 `/advideos?fields=source` → mp4 다운로드 → Storage

### 🔴 빠진 것 #3: Mixpanel Autocapture 클릭 수집

기획서: "Mixpanel Query API로 $mp_click 수집 → lp_click_data 테이블"

현재 `collect-mixpanel/route.ts` (155줄):
- scroll_depth, time_on_page, page_exit만 수집
- $mp_click (Autocapture 클릭) 미수집

**필요 사항**:
- `lp_click_data` 신규 테이블 (마이그레이션)
- 신규 크론: `collect-mixpanel-clicks` (Rate Limit 60/hour → 119개 LP = ~2시간)
- Mixpanel Service Account 인증 (Basic Auth)
- **⚠️ Autocapture 과금 확인 필요** (record_heatmap_data vs Autocapture)

### 🟡 빠진 것 #4: collect-daily + embed-creatives 역할 중복

기획서 지적: "둘 다 같은 테이블에 UPSERT. 하나로 통합 필요."

현재:
- collect-daily: creatives/creative_media UPSERT (메타데이터만, 임베딩 없음)
- embed-creatives: ad_creative_embeddings에 임베딩 추가

**제안**: 당장 통합보다, v2 안정화 후 통합. 지금은 dual write 유지가 안전.

---

## 탭 3: 저장

### 구현 가능성

| 기획서 항목 | 현재 상태 | 변경 필요 |
|-----------|----------|----------|
| 계정 종속 (account_id) | ✅ creatives, creative_media, landing_pages 모두 account_id FK | — |
| ADR-001 Storage 경로 | ✅ `creatives/{account_id}/media/`, `lp/{account_id}/` | — |
| v1/v2 이중 저장 | ✅ collect-daily에서 dual write | — |
| analysis_json 통합 | 🟡 creative_media.analysis_json 컬럼 있으나 데이터 0건 | T2에서 채움 |
| LP 변경 감지 (content_hash) | 🟡 landing_pages.content_hash 컬럼 있으나 데이터 비어있음 | T4에서 구현 |
| source 필드 (member/benchmark/competitor) | ❌ creatives 테이블에 source 없음 | ALTER TABLE 필요 |
| 비회원 ad_accounts 등록 | ❌ 비회원 33개 계정 미등록 | collect-benchmarks 수정 |
| 회원 탈퇴 → benchmark 이관 | ❌ 삭제 로직 없음 (탈퇴 자체가 미구현) | 신규 로직 |
| benchmark/ Storage 경로 | ❌ 미존재 | Storage 버킷 구조 추가 |
| competitor/ Storage 경로 | ❌ 일부만 | 통일 필요 |
| lp_click_data 테이블 | ❌ 미존재 | 신규 마이그레이션 |
| change_log 테이블 | ❌ 미존재 | 신규 마이그레이션 |
| creative_performance 캐시 | ✅ 테이블 존재 + UNIQUE(creative_id) | 데이터 채우기 필요 |
| t3_scores_precomputed | ✅ precompute 파이프라인 가동 중 | — |

### 🔴 빠진 것: source 필드

기획서: "같은 creatives 테이블에 source 필드로 구분: member / benchmark / competitor"

현재 `creatives` 테이블 (20260320_db_v2_normalized.sql):
- source 컬럼 없음
- competitor_ad_cache는 완전 별도 테이블

**구현 방법**:
```sql
ALTER TABLE creatives ADD COLUMN IF NOT EXISTS source text DEFAULT 'member'
  CHECK (source IN ('member', 'benchmark', 'competitor'));

-- 경쟁사 소재도 creatives에 넣을지, 별도 유지할지 결정 필요
-- 기획서는 "같은 테이블에 source로 구분" → 통합 방향
-- BUT: competitor_ad_cache 9,553건을 creatives로 이관하면 account_id FK 문제
```

**⚠️ 설계 결정 필요**: 경쟁사 소재를 creatives 테이블에 통합할지, 별도 유지할지.
- 통합하면: 같은 5축 분석 + 임베딩 비교가 자연스러움
- 별도 유지하면: FK 문제 없음 (competitor에는 account_id가 Meta 광고 계정 아님)
- **제안**: competitor_ad_cache는 유지하되, analysis_json_v3 컬럼 추가 (T11 방식). 쿼리 시 UNION ALL.

### 🔴 빠진 것: 신규 테이블 2개

**lp_click_data**:
```sql
CREATE TABLE lp_click_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_id uuid REFERENCES landing_pages(id),
  click_x float NOT NULL,
  click_y float NOT NULL,
  page_width int,
  page_height int,
  element_tag text,
  element_text text,
  element_selector text,
  section text,  -- Gemini 구조와 매칭
  device text,
  referrer text,
  user_id text,  -- Mixpanel user ID
  clicked_at timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_lp_click_lp_id ON lp_click_data(lp_id);
```

**change_log**:
```sql
CREATE TABLE change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('creative', 'lp')),
  entity_id uuid NOT NULL,
  account_id text NOT NULL,
  change_detected_at timestamptz DEFAULT now(),
  change_type text CHECK (change_type IN ('element_added', 'element_removed', 'element_modified')),
  element_diff jsonb,
  performance_before jsonb,
  performance_after jsonb,
  performance_change jsonb,
  confidence text CHECK (confidence IN ('low', 'medium', 'high'))
);
CREATE INDEX idx_change_log_entity ON change_log(entity_type, entity_id);
```

---

## 탭 4: LP 분석

### 구현 가능성

| 기획서 항목 | 현재 상태 | 변경 필요 | 난이도 |
|-----------|----------|----------|--------|
| LP 전체 다운로드 (HTML/이미지/GIF/영상) | ❌ 스크린샷만 | Playwright + fetch 파이프라인 신규 | 🔴 높음 |
| Gemini DOM 구조화 (섹션 자동 분해) | ❌ | 신규 스크립트 | 🟡 중간 |
| 8개 카테고리 레퍼런스 분석 | ❌ lp_analysis에 flat 컬럼만 | reference_based JSONB (T5) | 🟡 중간 |
| LP 데이터 기반 분석 | ❌ | data_based JSONB (T10) | 🟡 중간 |
| 👁 눈: DeepGaze LP 시선 | ❌ | 풀페이지 스크린샷 → DeepGaze | 🟡 중간 |
| 🧠 뇌: Gemini 구조 분석 | ❌ | 위 레퍼런스 분석과 동일 | 🟡 중간 |
| 📜 탐색: Mixpanel 스크롤 | 🟡 collect-mixpanel에서 수집 중 | LP별 매핑 필요 | 🟢 낮음 |
| 🖱 결정: Mixpanel 클릭 | ❌ | lp_click_data + 수집 크론 | 🔴 높음 |
| 4축 교차 매트릭스 | ❌ | 4개 축 모두 필요 | 🔴 높음 |
| lp_analysis.eye_tracking JSONB | ❌ 컬럼 없음 | ALTER TABLE 필요 | 🟢 낮음 |
| 소재↔LP 일관성 3중 비교 | 🟡 creative_lp_consistency 있으나 기획서 스키마와 다름 | creative_lp_map 리뉴얼 (T9) | 🟡 중간 |
| LP 변경 감지 + 재분석 | 🟡 content_hash 컬럼 있으나 미사용 | T4에서 구현 | 🟡 중간 |
| LP 임베딩 | 🟡 lp_analysis.embedding 컬럼 있으나 데이터 0건 | 크롤링 후 임베딩 생성 | 🟢 낮음 |
| Mixpanel 세션 리플레이 연동 | ❌ | Mixpanel에서 직접 확인 (API 연동 불요) | — |
| 시선 기반 행동 추론 (3층 합산) | ❌ | Phase 2-3 (데이터 축적 후) | 🔴 높음 |
| GIF/영상 요소별 DeepGaze | ❌ | 프레임 추출 + 개별 분석 | 🟡 중간 |

### 🔴 빠진 것: LP 전체 다운로드 파이프라인

기획서의 LP 수집은 **스크린샷 수준이 아닌 "전체 다운로드"**:
- HTML DOM 전체
- CSS (인라인 + 외부)
- 이미지 전부 (원본)
- GIF 전부 (자동재생 여부)
- 영상 전부 (mp4 + poster + 자동재생)
- metadata.json (요소 목록 + 위치 + 유형)

현재 `crawl-lps/route.ts` + `railway-crawler.ts`:
- Playwright로 풀페이지 스크린샷만 캡처
- HTML/이미지/GIF/영상 다운로드 없음
- metadata.json 없음

**구현 규모**: T4 (3-5일) + 추가 1-2일 (기획서 범위가 T4보다 큼)

### 🔴 빠진 것: lp_analysis.eye_tracking

기획서의 LP 시선 분석 출력:
```json
{
  "fullpage_heatmap_url": "saliency/.../fullpage.png",
  "section_attention": [{ "section": "hero", "weight": 0.95 }],
  "media_attention": [{ "type": "gif", "weight": 0.85, "boosted": true }],
  "cta_attention_score": 0.30
}
```

현재 `lp_analysis` 테이블: eye_tracking 컬럼 없음.

**필요**:
```sql
ALTER TABLE lp_analysis ADD COLUMN IF NOT EXISTS eye_tracking jsonb;
```

### 🔴 빠진 것: 4축 교차 매트릭스

기획서의 핵심 차별점: 4축(눈/뇌/탐색/결정)을 섹션별로 합산하여 인사이트 도출.

| 현재 | 기획서 |
|------|--------|
| 스크린샷 캡처만 | HTML/미디어 전체 다운로드 |
| 시선 분석 없음 (LP) | DeepGaze 풀페이지 + 요소별 |
| 구조 분석 flat 컬럼 | Gemini 8개 카테고리 JSONB |
| Mixpanel 스크롤만 | 스크롤 + 클릭 + 퍼널 |
| 교차 분석 없음 | 4축 매트릭스 |

**현실적 접근**:
- Phase 1: LP 전체 다운로드 + Gemini 구조 분석 + DeepGaze 시선 (눈+뇌 2축)
- Phase 2: Mixpanel 클릭 수집 연동 (탐색+결정 2축 추가)
- Phase 3: 4축 교차 매트릭스 + 시선 기반 행동 추론

---

## 탭 5: 광고 소재 분석

### 구현 가능성

| 기획서 항목 | 현재 상태 | 변경 필요 |
|-----------|----------|----------|
| Layer 1: Gemini 4축 (Visual/Text/Psychology/Quality) | 🟡 L1 analyze.mjs가 다른 스키마 (hook/product/color/text/composition) | T2에서 스키마 재설계 |
| Layer 2: DeepGaze 이미지 시선 | ✅ creative_saliency 2,711건, predict.py | — |
| Layer 3: Gemini Embedding 3072D | ✅ ad_creative_embedder.ts, 2,881건 | — |
| 영상 5축 (4축 + Audio + Structure) | ❌ L1이 영상도 같은 스키마 사용 | T6(Audio) + T7(Eye Tracking) |
| 영상 시선: DeepGaze 프레임별 | ❌ | ffmpeg 1fps 추출 + 프레임별 DeepGaze |
| 영상 시선: Gemini 하이브리드 | ❌ | T7 구현 |
| Canvas 오버레이 (영상 히트맵) | ❌ | 프론트엔드 컴포넌트 신규 |
| Scores: 총가치 3축 기반 점수 | ❌ | T2-C (벤치마크 상대값) |
| 속성값 3단계 (자유태깅→클러스터→확정) | ❌ | T2-A |
| creative_fatigue_risk (임베딩 유사도) | 🟡 creative-analyzer.ts에 detectFatigue() 있으나 analysis_json에 미저장 | T2-B |
| Andromeda PDA 분류 | ❌ | T8 |
| 벤치마크 콘텐츠와 비교 | ❌ 콘텐츠 미수집 | 벤치마크 콘텐츠 수집 후 |
| 소재↔LP 일관성 3중 비교 | 🟡 creative_lp_consistency 존재 | T9 리뉴얼 |
| M4 Max 로컬 실행 | ❌ Railway 배포 | 환경 전환 필요 |
| 비용 $15 (전체 3,096건) | — | Gemini API 비용 합리적 |

### 🔴 빠진 것: 영상 하이브리드 시선 분석

기획서: "DeepGaze(프레임별 정밀) + Gemini(오디오 맥락) 가중 합산"

현재:
- DeepGaze: 이미지 전용 (`predict.py`). 영상 미지원.
- Gemini: eye_tracking 프롬프트 없음

**구현 파이프라인**:
```
mp4 → ffmpeg -vf fps=1 → N장 프레임
  ├→ 각 프레임 DeepGaze → N개 히트맵 + fixation 좌표
  └→ mp4 통째로 Gemini → eye_tracking.frames[] 초별 좌표
→ 가중 합산 or 토글 표시
→ Storage: saliency/{account_id}/{ad_id}/frame_001.png ...
```

**난이도**: 🟡 중간. ffmpeg + DeepGaze는 이미 있음. 파이프라인 연결만 필요.
**비용**: DeepGaze $0 + Gemini $0 (5축 분석에 포함) = 추가 비용 없음.

### 🔴 빠진 것: 총가치각도기 3축 매핑 공식

기획서: "4축 속성이 총가치 3축(기반/참여/전환) 중 어디에 영향을 주는지" 상세 매핑.

예시:
```
🟢 기반_score = hook_type 매칭 + readability + color.contrast + 첫 3초 fixation
🟡 참여_score = emotion 매칭 + psychological_trigger + narration
🔴 전환_score = cta_text + offer_type + urgency_level + cta_attention_score
```

현재 `protractor/metric-groups.ts`:
- 3축 지표 정의 있음 (기반: 3초시청률/CTR, 참여: 반응/댓글, 전환: ROAS/구매율)
- BUT 소재 속성(hook_type 등)과 연결하는 매핑 없음

**기획서도 인정**: "매핑과 가중치는 지금 확정 안 함. 데이터가 결정." → Phase 2.

### 🟡 기획서 vs 현재 스키마 차이 (상세)

| 속성 | 기획서 | 현재 L1 (analyze.mjs) | 차이 |
|------|--------|---------------------|------|
| hook_type | 3단계로 도출된 enum | hook_type (하드코딩 선택지) | 재설계 필요 |
| visual_style | professional/ugc/minimal/bold/lifestyle/graphic | 없음 | 신규 |
| composition | center/thirds/full_bleed/text_overlay/split | composition (다른 선택지) | 재설계 |
| product_visibility | {position, size_pct} 객체 | product_position (단일 값) | 확장 |
| human_element | {face, body, expression} 객체 | human_presence (boolean) | 확장 |
| color | {dominant, palette, tone, contrast} 객체 | color_tone (단일 값) | 확장 |
| text_overlay_ratio | 퍼센트 수치 | 없음 | 신규 |
| headline_type | benefit/discount/question 등 | 없음 | 신규 |
| key_message | 자유 텍스트 | 없음 | 신규 |
| cta_text | 문구 + 위치 | cta_type (유형만) | 확장 |
| emotion | trust/excitement/fear 등 | 없음 | 신규 |
| psychological_trigger | Cialdini 6원칙 | 없음 | 신규 |
| offer_type | discount/bundle/free_shipping 등 | 없음 | 신규 |
| urgency_level | high/medium/low | 없음 | 신규 |
| social_proof_type | review_count/star_rating 등 | 없음 | 신규 |
| production_quality | professional/semi/ugc/low | 없음 | 신규 |
| readability | high/medium/low | 없음 | 신규 |
| creative_fatigue_risk | high/medium/low + most_similar_ad_id | detectFatigue() 있으나 별도 | 통합 필요 |
| scores.overall | 0-100 + percentile | creative_intelligence_scores.overall | 리뉴얼 |

**결론**: 기획서 스키마와 현재 L1 스키마는 **완전히 다름**. T2에서 전면 재설계 불가피.

---

## 탭 6: 순환 학습

### 구현 가능성

| 기획서 항목 | 현재 상태 | 변경 필요 |
|-----------|----------|----------|
| LP 변화 감지 (content_hash) | 🟡 컬럼 있으나 데이터 없음 | T4에서 hash 생성 로직 구현 |
| 소재 변화 감지 (새 소재 감지) | ✅ collect-daily에서 새 소재 자동 수집 | 이전 소재와의 diff 로직 없음 |
| 요소 diff (5축 속성 비교) | ❌ | analysis_json 비교 로직 신규 |
| 성과 변화 추적 (before/after) | 🟡 daily_ad_insights에 데이터 있으나 diff 안 함 | 변경 전후 7일 평균 비교 로직 |
| change_log 테이블 | ❌ | 신규 마이그레이션 |
| 데이터화 ("리뷰 추가 = +44%") | ❌ | change_log 축적 후 통계 |
| 제안→결과 추적 | ❌ | Phase 3 |
| "다음 수강생 제안에 활용" | ❌ | 충분한 change_log 축적 후 |

### 🔴 빠진 것: 순환 학습 전체

탭 6은 **거의 전부 미구현**. 현재 시스템은 일방향(수집→분석→끝).

하지만 기획서도 Phase 접근:
- Phase 1 (지금): 변화 감지 인프라만 (content_hash, 소재 diff)
- Phase 2: 변화→성과 연결 시작
- Phase 3: 예측 모델

**Phase 1 구현 범위** (현실적):
1. `change_log` 테이블 생성
2. LP content_hash 생성 + 비교 로직 (crawl-lps v2에서)
3. 소재 analysis_json diff 로직 (analyze 배치에서 이전 값과 비교)
4. daily_ad_insights 7일 평균 before/after 계산

**예상 작업량**: 1-2일 (인프라만)

---

## 불가능한 것 (기술적 제약)

### 1. 경쟁사 LP 수집 ❌
기획서에도 명시: "경쟁사: ❌ LP 없음 (Ad Library에 LP URL 없음)"
- Meta Ad Library API는 광고 이미지/영상만 제공, LP URL 미포함
- 기술적으로 불가

### 2. 타사 계정 성과 데이터 ❌
- Marketing API 토큰은 자사 연결 계정만 접근 가능
- "업종 전체 벤치마크 소재 패턴"은 **자사 계정 내 분류 기반**으로 한정
- 기획서도 이를 인지하고 있음 (벤치마크 = 51개 연결 계정 범위)

### 3. DeepGaze GIF 움직임 weight 부스트 — 제한적
기획서: "GIF 영역: 움직임 → 시선 끌어당김 → weight 부스트"
- DeepGaze IIE는 정지 이미지 모델. 움직임 인지 불가.
- **대안**: GIF 영역을 사전 마킹 → 해당 영역 weight에 고정 배수(1.3x) 적용. DeepGaze 자체가 아닌 후처리에서 부스트.
- 영상 자동재생도 동일: DeepGaze 결과에 후처리 부스트.

### 4. 3072차원 HNSW 인덱스 ❌
- pgvector HNSW는 2000차원까지만 안정 지원
- 3072D는 sequential scan 또는 IVFFlat만 가능
- 현재 ~3,000건이라 성능 문제 없음. 10K+ 넘으면 IVFFlat 필요.

### 5. Mixpanel Autocapture 과금 ⚠️
기획서: "record_heatmap_data 옵션이면 무료. Autocapture면 과금. 수강생 설정 확인 필요."
- 수강생 Mixpanel 플랜에 따라 Autocapture 클릭 수집이 과금될 수 있음
- **확인 필요**: 각 수강생 Mixpanel 계정의 Autocapture 설정 상태

### 6. 시선→클릭 직접 보정 ❌
기획서에도 명시: "시선(눈) = 무의식적 주의, 클릭(손) = 의식적 결정. 다른 인지 과정이라 직접 보정 불가."
- DeepGaze는 고정 모델. Mixpanel 클릭 데이터로 보정하지 않음.
- 학습은 "요소→성과" 축에서만.

---

## 추가 제안 (개발자 관점)

### 1. LP 전체 다운로드 범위 조정

기획서: "HTML/CSS/이미지/GIF/영상 전부 다운로드"
- cafe24 상세페이지는 이미지가 수백 장일 수 있음 (상세 설명이 이미지 나열)
- Storage 용량: LP 1개당 50-200MB 예상 × 119개 = 6-24GB
- **제안**:
  - Phase 1: 풀페이지 스크린샷(모바일+PC) + HTML텍스트 + metadata.json
  - Phase 2: 이미지/GIF/영상 선택적 다운로드 (히어로+리뷰 섹션만)
  - 전체 다운로드는 분석 필요성 확인 후

### 2. Gemini DOM 구조화 → 섹션 타입 표준화

기획서: "하드코딩 아님. Gemini가 실제 HTML 보고 섹션 판단."
- 자유 판단이면 LP마다 섹션 이름이 다를 수 있음 → 교차분석 불가
- **제안**: 가이드라인 섹션 타입 리스트를 프롬프트에 포함하되, "이 외 타입도 자유롭게 추가 가능"
- 표준 타입: hero, price_option, review_summary, detail_description, detail_review, faq_shipping, bottom_cta, brand_story, certification

### 3. 벤치마크 콘텐츠 수집 시 Meta API Rate Limit

기획서: "벤치마크 수치 넘는 광고의 이미지/영상 다운로드"
- 현재 벤치마크 ~260건 중 수치 초과 광고 수 불명
- Marketing API /adimages, /advideos 호출 추가 → Rate Limit 주의
- **제안**: collect-benchmarks 크론 내에서가 아닌, 별도 크론(`collect-benchmark-creatives`)으로 분리. Rate Limit 분산.

### 4. change_log confidence 계산 기준 명시

기획서: "confidence: low/medium/high — 데이터 양 기반"
- 구체적 기준 없음
- **제안**:
  - high: 변경 후 14일+ 데이터, clicks 100+
  - medium: 7-13일 데이터, clicks 30+
  - low: 7일 미만 또는 clicks 30 미만

### 5. content_hash 생성 범위 명시

기획서: "content_hash(SHA-256) 비교"
- DOM 전체? 텍스트만? 이미지 URL 포함?
- **제안**: `innerText + 가격 + 리뷰 수 + CTA 문구` 조합의 SHA-256
  - DOM 전체는 광고 트래커/시간 등 노이즈 많음
  - 텍스트 + 핵심 요소만 해싱해야 의미 있는 변경 감지

### 6. 실행 환경 전환 전략 추가

기획서: "M4 Max 로컬. Railway 불필요."
현재: Railway 배포 + Vercel Cron.

**전환 시 고려사항**:
- Railway 서비스 3개(analyze, score, saliency) 중단 → 로컬 스크립트 전환
- Vercel Cron은 유지 가능 (트리거만) — BUT 로컬 스크립트를 어떻게 호출?
  - 옵션 A: Vercel Cron → 로컬 Tailscale/ngrok 웹훅
  - 옵션 B: 로컬 crontab/launchd 직접 스케줄링
  - 옵션 C: Vercel Cron은 경량 작업(collect-daily, precompute)만, 무거운 분석은 로컬 crontab
- **제안**: 옵션 C가 가장 현실적. 수집/전처리는 Vercel, 분석(DeepGaze/Gemini)은 로컬.

### 7. Scores raw → percentile 변환 타이밍

기획서: "Gemini 절대값 1-10 → 이후 벤치마크 대비 백분위 변환"
- "이후"가 언제인지 불명확
- **제안**:
  - 분석 시점: raw score만 저장 (analysis_json.scores.visual_impact_raw)
  - 별도 배치(compute-scores 크론): 카테고리별 percentile 계산 → overall_percentile 갱신
  - 이미 실행 플랜 T2-C에 반영되어 있음 → 기획서에도 명시하면 좋음

### 8. 기획서에 추가하면 좋은 항목

| 항목 | 이유 |
|------|------|
| **에러 처리 전략** | Gemini 429/500, Meta API 실패, Mixpanel 타임아웃 시 재시도/스킵 정책 |
| **데이터 보존 정책** | daily_ad_insights 무한 축적? N일 후 아카이브? lp_click_data 보존 기간? |
| **모니터링/알림** | 크론 실패 시 알림 (현재 cron_runs 로깅만, 알림 없음) |
| **벤치마크 콘텐츠 풀 갱신 주기** | 매주? 벤치마크 수치 변경 시? |
| **임베딩 모델 버전 관리** | 모델 업그레이드 시 전체 재임베딩 전략 |
| **LP 다운로드 실패 처리** | cafe24 봇 차단, Cloudflare 보호 등 |
| **프론트엔드 UI 명세** | 4축 교차 매트릭스를 어떤 UI로 보여줄지 |

---

## 우선순위별 실행 순서

기획서 6탭의 미구현 항목을 우선순위로 정렬:

### P0: 즉시 (기존 architecture-v3-execution-plan의 T1-T3)
1. DB 스키마 보강 (T1) + `source` 컬럼 + `lp_click_data` + `change_log` 테이블
2. 5축 스키마 확정 + 프롬프트 (T2)
3. embed-creatives 듀얼 라이트 (T3)

### P1: 핵심 기능 (1-2주)
4. LP 전체 다운로드 + 구조화 (T4 확장)
5. LP 8개 카테고리 레퍼런스 분석 (T5)
6. 벤치마크 콘텐츠 수집 (신규)
7. 비회원 ad_accounts 등록 (collect-benchmarks 수정)

### P2: 분석 심화 (2-3주)
8. 영상 Audio + Structure 축 (T6)
9. 영상 하이브리드 시선 (T7)
10. LP DeepGaze 시선 분석 (신규)
11. Andromeda + 유사도 (T8)
12. creative_lp_map 리뉴얼 (T9)
13. 경쟁사 5축 분석 (T11)

### P3: 데이터 기반 (데이터 축적 후)
14. LP 데이터 기반 교차분석 (T10)
15. Mixpanel 클릭 수집 + 4축 교차 매트릭스
16. 총가치 3축 매핑 확정 (Phase 2)
17. 벤치마크 콘텐츠 비교 분석

### P4: 순환 학습 (Phase 3)
18. change_log 축적 + 요소 diff
19. 변화→성과 데이터화
20. 제안→결과 추적 루프

---

## 기획서 품질 평가

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| **완성도** | 9/10 | 6탭 1,955줄. 수집→저장→분석→학습 전체 커버. |
| **구체성** | 8/10 | JSON 스키마, SQL, API 필드까지 명시. 일부 미상세 (content_hash 범위, confidence 기준). |
| **현실성** | 7/10 | Phase 구분이 합리적. BUT LP 전체 다운로드/4축 교차는 규모가 큼. |
| **기술 이해** | 9/10 | Gemini API, DeepGaze, 임베딩, pgvector 한계 등 정확히 파악. |
| **실행 가능성** | 7/10 | M4 Max 로컬 전환 전략 + 벤치마크 콘텐츠 수집 규모 추가 검토 필요. |
| **빠진 것** | 6/10 | 에러 처리, 데이터 보존, 모니터링, 프론트엔드 UI 명세 부재. |
