---
team: unassigned
created: 2026-03-28
status: pending
owner: leader
---
# TASK: DeepGaze → Gemini 결합 분석 파이프라인

## CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라

## 배경
현재 5축 분석(analyze-five-axis.mjs)은 Gemini가 소재를 직접 보고 혼자 판단한다.
DeepGaze 시선 데이터를 안 쓴다.

실측 비교 결과 (에어무드 영상 분석):
- Gemini 단독: "인물 50%, 텍스트 40%" → 부정확
- DeepGaze → Gemini 결합: "텍스트 65% 지배, 인물은 0초 훅에서만 70%" → 훨씬 정확

**DeepGaze가 "어디를 보는지" 객관적 데이터를 주고, Gemini가 "그래서 이게 효과적인가"를 판단하는 구조가 맞다.**

참고 목업: https://mozzi-reports.vercel.app/reports/plan/2026-03-23-video-mockup-v3

## Smith님 확정 파이프라인 (8단계)
```
① 수집(Meta API→Storage)
② DeepGaze III 프레임별 시선 ← 여기로 이동 (기존 3번에서 2번으로)
③ DeepGaze 시선 + 소재 원본 → Gemini 3 Pro (5축+Audio+Structure 결합 분석)
④ 임베딩(3072D)
⑤ 피로도/유사도
⑥ 벤치마크 백분위
⑦ 소재↔LP 일관성(4축)
⑧ AI 처방(impact순)
```

## 핵심 변경: DeepGaze를 Gemini 앞으로
```
기존: ① 수집 → ② Gemini(혼자) → ③ DeepGaze(별도) → ...
변경: ① 수집 → ② DeepGaze → ③ DeepGaze결과+소재 → Gemini(결합) → ...
```

DeepGaze가 먼저 "어디를 보는지" 뽑고, 그 데이터를 소재 원본과 함께 Gemini한테 넘긴다.
Gemini는 시선 데이터를 참고해서 5축+Audio+Structure를 판단한다.

## 구현 사항

### 1. 소재에 DeepGaze 적용 (신규)
- creative_media에 대해 DeepGaze 시선 분석 실행
- 결과: saliency_url (히트맵 이미지) + saliency_data (좌표/비율 JSON)
- 이미지: creative-pipeline `/saliency` 엔드포인트 활용
- 영상: 프레임 추출(0초, 3초, 6초...) → 각 프레임 DeepGaze → 시간대별 시선 데이터

### 2. 5축 분석에 DeepGaze 데이터 주입
- analyze-five-axis.mjs 수정
- Gemini 프롬프트에 DeepGaze 결과를 추가 컨텍스트로 전달:
  ```
  [시선 분석 데이터 (DeepGaze III)]
  - 주목 영역: 텍스트 65%, 인물 얼굴 20%, 제품 10%, 기타 5%
  - 최고 주목점: (x=0.5, y=0.3) — 중앙 상단 텍스트
  - 히트맵: {첨부 이미지}
  
  위 시선 데이터를 참고해서 이 소재의 5축을 분석해라.
  시선이 집중되는 곳과 핵심 메시지가 일치하는지도 판단해라.
  ```
- 영상: 시간대별 시선 데이터를 함께 전달

### 3. LP 분석에도 동일 적용
- analyze-lps-v2.mjs 수정
- LP DeepGaze 히트맵 + LP HTML/스크린샷 → Gemini 결합 분석
- "CTA 버튼에 시선이 가는가", "핵심 오퍼에 주목하는가" 판단

### 4. DB 스키마
- creative_media: saliency_url (이미 있음, 현재 NULL) + saliency_data (JSONB, 신규)
- 영상: video_saliency_frames (JSONB, 프레임별 시선 데이터)

## 크론 순서 (변경)
```
18:00 collect-daily          ① 소재 수집
19:00 creative-saliency(신규) ② 소재 DeepGaze 시선
01:00 analyze-five-axis      ③ DeepGaze+소재 → Gemini 결합 분석
22:00 embed-creatives        ④ 임베딩
02:00 fatigue-risk           ⑤ 피로도
03:00 andromeda-similarity   ⑤ 유사도
02:00 score-percentiles      ⑥ 벤치마크 백분위
03:30 lp-alignment           ⑦ 소재↔LP 일관성
       (처방은 프론트에서 on-demand) ⑧ AI 처방
```

## 우선순위
수집+임베딩 TASK와 병렬 진행 가능 (코드 수정 부분)

## 계정 종속 체크
- [x] creative_media: creative_id 기반, ad_accounts 연결
- [x] landing_pages: account_id FK 있음
