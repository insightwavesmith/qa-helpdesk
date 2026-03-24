# TASK: 수집→저장→분석 구조 코드리뷰 + 변경점 도출

> CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
수집 구조의 첫 물길을 바꿨다 (raw JSONB, is_member/is_benchmark 플래그).
이제 저장→분석까지 하류 전체를 점검해서 **변경해야 할 것**과 **변경 순서**를 도출해야 한다.

## 확정된 결정 (Smith님)

### 수집 프로세스
1. **신규 계정 초기 수집**: 숫자 최근 3개월 일별 전부 + active 광고 콘텐츠만
2. **일일 수집 (collect-daily)**: yesterday 1일치 + active 광고 콘텐츠만
3. **기간별 수집 불필요**: 일별 데이터 합산으로 계산 (reach만 주의 — 유니크 수치라 합산 불가)
4. **raw JSONB 저장**: Meta API 응답 원본 통째로 저장 (이미 구현됨)
5. **is_member/is_benchmark 플래그**: source 컬럼 대신 플래그 2개 (이미 구현됨)

### 콘텐츠 저장
6. **슬라이드(CAROUSEL) 타입 추가**: 현재 IMAGE/VIDEO/CATALOG만 → CAROUSEL 추가
7. **슬라이드 카드별 1행**: creative_media에 position 컬럼 추가, 카드별 개별 저장
8. **Storage 경로**: `{ad_id}_0.jpg`, `{ad_id}_1.jpg` 형태로 카드별 구분
9. **카드별 분석**: DeepGaze, 5축, 임베딩 각각 카드별로 실행

## 코드리뷰 범위

### A. 수집 (입구) — 이미 변경됨, 누락 확인
파일 목록:
- `src/app/api/cron/collect-daily/route.ts` (730줄, 핵심)
- `scripts/collect-benchmark-creatives.mjs`
- `src/lib/protractor/creative-type.ts` (CAROUSEL 분류 없음)
- `src/lib/protractor/creative-image-fetcher.ts`

확인할 것:
- [ ] raw_insight, raw_ad, raw_creative 저장이 모든 경로에서 되는지
- [ ] is_member/is_benchmark 플래그가 제대로 세팅되는지
- [ ] CAROUSEL 타입 분류 누락 — asset_feed_spec에 images 여러 개면 CAROUSEL
- [ ] 슬라이드 카드 여러 장 creative_media 저장 누락
- [ ] active 광고만 수집하는지 (effective_status 필터)

### B. 저장 (DB 스키마) — 변경 필요한 것 도출
테이블 목록:
- `daily_ad_insights` — raw_insight JSONB 추가됨 ✅
- `creatives` — raw_creative, is_member, is_benchmark 추가됨 ✅
- `creative_media` — position 컬럼 필요 ❌
- `landing_pages` — 변경 필요한 것?

확인할 것:
- [ ] creative_media에 position 컬럼 있는지
- [ ] creative_media unique constraint가 (creative_id, position)인지
- [ ] creatives에 creative_type 'CAROUSEL' 들어갈 수 있는지 (enum? text?)
- [ ] source 컬럼이 아직 쓰이는 곳 전부 나열

### C. 하류 — 읽기 (SELECT) 경로 전수조사
API 엔드포인트 (daily_ad_insights SELECT):
- `src/app/api/diagnose/route.ts`
- `src/app/api/protractor/insights/route.ts`
- `src/app/api/protractor/overlap/route.ts`
- `src/app/api/protractor/total-value/route.ts`
- `src/app/api/cron/track-performance/route.ts`
- `src/app/api/admin/creative-intelligence/route.ts`
- `src/app/api/admin/backfill/route.ts`
- `src/app/api/admin/protractor/collect/route.ts`
- `src/app/api/admin/protractor/status/route.ts`

Precompute 모듈:
- `src/lib/precompute/*.ts` (10개)

Actions:
- `src/actions/performance.ts`

확인할 것:
- [ ] source='member' / source='benchmark' 직접 비교하는 곳 → is_member/is_benchmark로 전환 필요
- [ ] daily_ad_insights 컬럼을 직접 SELECT하는 곳 → 트리거가 채워주니까 OK지만, 새 필드(raw에만 있는 것) 활용 가능한 곳
- [ ] reach 합산하는 곳 → 유니크 수치 합산 버그 없는지
- [ ] creative_media를 1광고=1미디어로 가정하는 곳 → 슬라이드 대응 필요

### D. 하류 — 분석 파이프라인
- `src/app/api/cron/embed-creatives/route.ts` — 임베딩
- `src/lib/ad-creative-embedder.ts` — 임베딩 로직
- `src/lib/creative-analyzer.ts` — 5축 분석
- `scripts/analyze-five-axis.mjs` — 5축 배치
- `src/app/api/cron/analyze-lp-saliency/route.ts` — LP DeepGaze
- `src/app/api/cron/creative-saliency/route.ts` — 소재 DeepGaze
- `scripts/compute-andromeda-similarity.mjs` — 타겟 중복률

확인할 것:
- [ ] 임베딩이 creative_media 1행 = 1임베딩인지 (슬라이드 카드별 임베딩 가능한지)
- [ ] 5축 분석이 creative_media 기준인지 creatives 기준인지
- [ ] DeepGaze가 이미지만인지 영상도 되는지
- [ ] 슬라이드 전체를 하나로 분석하는 곳 vs 카드별 분석해야 하는 곳

## 산출물 (이 TASK의 결과)

1. **변경 목록** (파일별): 뭘 왜 바꿔야 하는지, 우선순위
2. **Migration SQL 초안**: creative_media position 컬럼 등
3. **CAROUSEL 분류 로직 초안**: creative-type.ts 수정안
4. **초기 수집 크론 설계**: 신규 계정 3개월 backfill
5. **영향도 매트릭스**: 변경 시 깨질 수 있는 곳

코드 수정은 하지 마라. **리뷰 + 분석 + 설계만.** 수정은 다음 TASK.
