# TASK: 소재 분석 탭 UI 업데이트

## 배경
현재 `/creatives` 페이지는 임베딩 기반 유사 소재 검색만 있는 목업 상태.
L1~L4 + LP 일관성 + 경쟁사 비교까지 반영한 실제 분석 UI로 업데이트 필요.

## 현재 상태
- `/creatives/page.tsx` — 텍스트 검색 → 유사 소재 카드 그리드 + 상세 모달 (ROAS/CTR/LP 스크린샷)
- L1~L4 분석 결과, LP 일관성 점수, 벤치마크 비교 등은 DB에 있지만 UI에 노출 안 됨

## 기대하는 결과 (고객 관점)
수강생이 소재 분석 탭에 들어왔을 때:
1. **"내 소재 전체가 어떤 상태인지"** 한눈에 파악 (포트폴리오 뷰)
2. **"이 소재가 몇 점이고 뭘 고쳐야 하는지"** 구체적으로 확인 (개별 뷰)
3. **"경쟁사는 어떻게 하고 있는지"** 비교 (비교 뷰)

## 화면 구성 (3개 뷰)

### 뷰 1: 포트폴리오 (전체 단위)
> "내 소재 전체가 어떤 상태인지"

- **상단 요약 카드**: 평균 점수(L4 overall), 총 소재 수, 활성 광고 수
- **요소 분포 차트**: 훅 타입별 비율(pie/bar), 스타일별 비율, CTA 유무 비율
- **벤치마크 하이라이트**: "hook=problem이 ROAS 1위", "UGC 스타일이 CTR 최고" — L3 데이터
- **점수 분포**: L4 overall_score 히스토그램 (몇 건이 90+, 70~89, 50~69, 50↓)
- **데이터 소스**: `creative_element_analysis`, `creative_intelligence_scores`, `creative_element_performance`

### 뷰 2: 개별 소재 (광고 단위)
> "이 소재가 몇 점이고 뭘 고쳐야 하는지"

- **소재 그리드**: 카드에 이미지 + L4 점수 배지 + ROAS 표시 (점수순/ROAS순 정렬)
- **소재 클릭 → 상세 패널**:
  - 소재 이미지 + 광고 카피
  - **L4 점수**: 5개 영역 레이더 차트 (visual_impact, message_clarity, cta_effectiveness, social_proof, lp_consistency)
  - **L1 태그**: 훅 유형, 스타일, CTA, 색감, 인물 유무 등 태그 칩
  - **벤치마크 비교**: "당신의 hook=question ROAS X → 벤치마크 평균 Y" (상위 몇 %)
  - **LP 일관성**: visual/semantic/cross 점수 + LP 스크린샷 나란히
  - **개선 제안**: L4 suggestions 리스트 (priority 색상, 현재→개선 방향)
  - 성과 지표: ROAS, CTR, 전환율
- **데이터 소스**: `creative_element_analysis`, `creative_intelligence_scores`, `creative_lp_consistency`, `daily_ad_insights`, `creative_element_performance`

### 뷰 3: 경쟁사 비교
> "경쟁사는 어떻게 하고 있는지"

- **3단계 비교 레벨**:
  - 광고 ↔ 광고: 내 소재 L1 태그 vs 경쟁사 소재 L1 태그 나란히
  - 전체 ↔ 전체: 내 포트폴리오 요소 분포 vs 경쟁사 분포 (차트 비교)
  - 〈광고+LP〉 ↔ 〈광고+LP〉: 소재+LP 구조를 묶어서 비교
- **주의**: 경쟁사는 성과 데이터(ROAS/CTR) 없음 → 구조 비교만. "좋고 나쁨"이 아닌 "차이점" 표시
- **간접 지표**: 게재 기간(duration) — 오래 돌리는 광고 = 효과 있을 가능성
- **데이터 소스**: `competitor_ad_cache` + 경쟁사 L1 분석 (추후), `ad_creative_embeddings`

## 기술 참고
- 프로젝트: `/Users/smith/projects/bscamp`
- 기존 파일: `src/app/(main)/creatives/page.tsx`
- API 패턴: `/api/creative/search`, `/api/creative/[id]` (기존)
- DB 테이블:
  - `creative_element_analysis` — L1 태그
  - `creative_intelligence_scores` — L4 점수 + suggestions
  - `creative_element_performance` — L3 벤치마크 (30개 조합)
  - `creative_lp_consistency` — LP 일관성 점수
  - `ad_creative_embeddings` — 소재 메타 + 임베딩
  - `daily_ad_insights` — 광고 성과
  - `competitor_ad_cache` — 경쟁사 광고

## 구현 순서
1. 뷰 2 (개별 소재) — 기존 목업 확장, 가장 빠르게 가치 전달
2. 뷰 1 (포트폴리오) — 전체 요약
3. 뷰 3 (경쟁사 비교) — 경쟁사 L1 분석 구현 후

## 제약
- 경쟁사는 L3(벤치마크)/L4(점수) 적용 불가 — 성과 데이터 없음
- media_url 누락 223건 — 이미지 없는 소재는 placeholder 표시
- LP 스크린샷 37/689건 — 없는 경우 "LP 미수집" 표시
