# TASK: 소재 분석 탭 목업 업데이트 + P0~P1 개발

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 순서: 목업 → P0 → P1

---

## STEP 1: 소재 분석 탭 UI 목업 업데이트

현재 `/creatives/page.tsx`는 텍스트 검색 + 카드 그리드 + 상세 모달만 있음.
L1~L4 + LP 일관성 + 경쟁사 비교를 반영한 3개 뷰로 업데이트.

### 뷰 2: 개별 소재 (1순위)
- 소재 카드에 **L4 점수 배지** 표시 (점수순/ROAS순 정렬 가능)
- 상세 패널:
  - 소재 이미지 + 광고 카피
  - **L4 5영역 레이더 차트** (visual_impact, message_clarity, cta_effectiveness, social_proof, lp_consistency)
  - **L1 태그 칩** (훅 유형, 스타일, CTA, 색감, 인물 유무)
  - **벤치마크 비교** ("당신의 hook=question ROAS X → 벤치마크 평균 Y, 상위 몇%")
  - **LP 일관성** (visual/semantic/cross 점수 + LP 스크린샷 나란히)
  - **개선 제안** (L4 suggestions — priority 색상, 현재→개선)
  - 성과 지표: ROAS, CTR, 전환율

### 뷰 1: 포트폴리오 (전체 단위)
- 상단 요약 카드: 평균 점수, 총 소재 수, 활성 광고 수
- 요소 분포 차트: 훅 타입별/스타일별/CTA 유무 비율
- 벤치마크 하이라이트: L3에서 "hook=problem이 ROAS 1위" 같은 인사이트
- 점수 분포: L4 overall_score 히스토그램

### 뷰 3: 경쟁사 비교
- 3단계 비교: 광고↔광고 / 전체↔전체 / 〈광고+LP〉↔〈광고+LP〉
- **경쟁사는 성과 데이터(ROAS/CTR) 없음** → 구조 비교만 가능
- 간접 지표: 게재 기간(오래 돌리면 효과 있을 가능성)

### 참고 DB 테이블
- `creative_element_analysis` — L1 태그
- `creative_intelligence_scores` — L4 점수 + suggestions (JSON)
- `creative_element_performance` — L3 벤치마크 (30개 조합)
- `creative_lp_consistency` — LP 일관성 (visual/semantic/cross/total)
- `ad_creative_embeddings` — 소재 메타 + 임베딩 + media_url + lp_url
- `daily_ad_insights` — 광고 성과 (spend, roas, ctr, purchases, revenue)
- `competitor_ad_cache` — 경쟁사 광고

### 필요한 API 엔드포인트 (없으면 만들어)
- `GET /api/creative/portfolio` — 전체 요약 (점수 분포, 요소 분포, 벤치마크)
- `GET /api/creative/[id]/analysis` — 소재별 L1+L4+LP+벤치마크 통합
- `GET /api/creative/compare` — 자사 vs 경쟁사 요소 비교

---

## STEP 2: P0 — 동영상+카탈로그 media_url 수집 (223건)

파일: `src/app/api/cron/collect-daily/route.ts` (line 340 부근)

### 현재 문제
```typescript
const mediaUrl = imageHash ? (hashToUrl.get(imageHash) || null) : null;
```
- **동영상 (96건)**: `video_id`가 있지만 썸네일 URL 수집 안 함
- **카탈로그 (127건)**: `image_hash` 없이 `asset_feed_spec`으로 이미지 제공 → 매핑 불가

### 해결 방향
1. **동영상**: video_id → Meta API `GET /{video_id}?fields=thumbnails` → 썸네일 URL
2. **카탈로그**: creative의 `asset_feed_spec.images` 또는 `object_story_spec.link_data.image_hash` 활용
3. 기존 `hashToUrl` 맵 외에 `videoIdToThumb`, `catalogToImage` 매핑 추가

---

## STEP 3: P0 — L2 시선 예측 배치 처리

Railway에 DeepGaze IIE 서비스 있음: `creative-pipeline-production.up.railway.app`
59/370건만 완료. 나머지 소재 배치로 돌려야 함.

엔드포인트: `POST /analyze/saliency` (Railway 서비스)

---

## STEP 4: P1 — LP 크롤링 확대

현재 37/689 LP만 스크린샷.
크롤러: `bscamp-crawler-production.up.railway.app`
크론: `/api/cron/crawl-lps` — 매시간 20건

→ 1회성 배치 크롤링 스크립트 또는 크론 배치 사이즈 확대

---

## STEP 5: P1 — 미디어 Supabase Storage 저장

Meta CDN URL 만료 대비.
- 이미지: 원본 → `creatives/media/{ad_id}.jpg`
- 동영상: 썸네일 → `creatives/thumb/{ad_id}.jpg`
- 경쟁사: 검색 시 캐싱 → `creatives/competitor/{ad_id}.jpg`

Supabase Storage Pro 100GB, 현재 사용량 소량.

---

## STEP 6: P1 — 경쟁사 소재 L1 분석

competitor_ad_cache 8,613건에 Gemini 2.5 Pro Vision으로 L1 태깅.
→ STEP 1의 뷰3(경쟁사 비교)의 전제 조건.

---

## STEP 7: P1 — 사전계산 Phase 1

참고: `docs/precompute-audit.md`
- T3 점수 사전계산 (200ms→50ms)
- 수강생 성과 사전계산 (1~3s→100ms)
- 광고 진단 사전계산 (100ms→30ms)

---

## 제약
- 경쟁사는 성과 데이터 없음 → L3/L4 적용 불가
- media_url 없는 소재는 placeholder
- LP 스크린샷 없는 경우 "LP 미수집" 표시
- 커밋 전에 tsc + lint + build 통과 필수
