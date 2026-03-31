# TASK: 소재 분석 UI 데이터 연결 + 목업 매칭 수정

## 우선순위: 🔴 긴급 (Smith님 지시)

## 배경
현재 소재 분석 탭에서 엔젤앤비(angelbeebaby.kr) 소재를 열면:
- "성과 데이터 없음" 표시
- 씬별 시선 히트맵 "프레임 없음" 
- 시선 분석 "unknown 집중"
- 목업과 디자인이 다름 (텍스트 나열형)

## 수정 사항 (순서대로)

### 1. creative-detail API 버그 2개 수정
파일: `src/app/api/protractor/creative-detail/route.ts`

#### 버그 1: creative_saliency 조회 키가 틀림
- **현재**: `.eq("creative_media_id", id)` — ❌ creative_saliency 테이블에 `creative_media_id` 컬럼 없음
- **수정**: `.eq("ad_id", adId)` — creative_saliency 테이블은 ad_id 기준
- 주의: adId가 null이면 saliency 조회 스킵

#### 버그 2: daily_ad_insights 날짜 컬럼명
- **현재**: `.gte("date_start", sinceDateStr)` — ❌ 컬럼명이 `date_start`가 아님
- **수정**: `.gte("date", sinceDateStr)` — 실제 컬럼명은 `date`

#### 버그 3: website_purchase_value 컬럼 없음
- **현재**: `website_purchase_value` select
- **수정**: `purchase_value`로 변경 (실제 컬럼명)

#### 버그 4: video_saliency_frames 테이블 없음  
- 이 테이블은 존재하지 않음. 해당 쿼리 제거하거나, creative_saliency에서 target_type='video'인 것으로 대체

### 2. 성과 3대축 지표 (three-axis-score)
확정된 지표 (analysis_json 아닌 daily_ad_insights에서):

🟢 **기반 지표**:
- 3초시청률(%) — `video_p3s_rate` 평균
- 25/50/75/100% 재생률 — `video_p25/p50/p75/p100` (명수) / `reach` × 100

🟡 **참여 지표**:
- 공유/만노출 — `shares_per_10k` (이미 만노출 기준)
- 저장/만노출 — `saves_per_10k`

🔴 **전환 지표**:
- CTR(%) — `ctr`

기간: **최근 7일** (30일 아님!)

### 3. 시선 히트맵 연결
- creative_saliency의 `attention_map_url`이 null인 경우 → "시선 데이터 수집 중" 표기
- null이 아닌 경우 → 이미지 표시 (GCS URL)
- video의 경우: video_analysis.attention_timeline 데이터로 타임라인 차트 그리기

### 4. 목업 디자인 매칭
참조 목업: `docs/02-design/mockups/creative-analysis-v2.html`

현재 텍스트 나열형 → 목업의 카드/그리드 구조로:
- 광고축: 컬러 태그칩 스타일
- 씬별 분석: 타임라인 카드 (프레임 이미지 | 봤다/들었다/느꼈다 + 시선 히트맵)
- 오디오 분석: 감정 흐름 그래프
- 처방 Top3: 난이도/카테고리 뱃지 카드

## 검증 방법
1. `http://localhost:3000/protractor/creatives?account_id=1112351559994391` 접속
2. 첫 번째 소재 클릭
3. 확인:
   - [ ] 성과 3대축 숫자가 표시됨 (0이 아닌 실제 값)
   - [ ] 씬별 분석에 히트맵 이미지 또는 "수집 중" 표시
   - [ ] 시선 분석에 "unknown" 아닌 실제 영역 표시
   - [ ] 카드형 레이아웃 (텍스트 나열 X)
4. `npx tsc --noEmit` 에러 0개
5. `npm run build` 성공

## DB 스키마 참고
```
creative_saliency: id, ad_id, account_id, target_type, attention_map_url, top_fixations, cta_attention_score, cognitive_load, model_version, analyzed_at

daily_ad_insights: id, date, account_id, ad_id, spend, reach, impressions, clicks, ctr, cpc, cpm, roas, purchases, purchase_value, video_p3s_rate, thruplay_rate, video_p25, video_p50, video_p75, video_p100, shares_per_10k, saves_per_10k, ...

video_analysis (creative_media JSON): attention_timeline[{sec, dominant_region}], duration_sec, total_frames, avg_cta_attention, attention_transitions, dominant_cognitive_load, cognitive_load_distribution

video_saliency_frames: ❌ 존재하지 않음
```

## 절대 금지
- Supabase 사용 X (Cloud SQL 직접)
- 새 API 만들기 X (기존 creative-detail API만 수정)
- 데이터 없으면 "데이터 없음" 표기하되 디자인은 유지
